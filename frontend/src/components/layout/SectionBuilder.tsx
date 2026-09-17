/**
 * Le constructeur de sections des onglets En-tête et Pied.
 *
 * Une bande est une liste de blocs empilés dans un seul `header:`/`footer:`
 * Typst — ce ne sont pas des bandes séparées. Tant qu'elle est vide, le panneau
 * ne montre qu'un bouton : la présence se déduit du contenu, il n'y a pas
 * d'interrupteur à contredire.
 *
 * `kind` ne fait que décider des champs montrés ; la forme stockée est la même
 * pour tous, si bien que changer de disposition ne perd jamais ce qui est saisi.
 */
import { useEffect, useRef, useState } from "react";
import { Input, Label, Select, Switch, TextArea } from "@gouvfr-lasuite/ui-components";
import { ChevronDown, ChevronRight, Trash, Upload } from "@gouvfr-lasuite/ui-components/icons";
import {
  assetUrl,
  type Align,
  type Band,
  type Block,
  type BlockKind,
  type BlockScope,
  type FooterBand,
  type ImagePosition,
  type Numbering,
} from "../../api/client";

/** Doit rester d'accord avec MAX_BLOCKS de backend/src/layout/layoutConfig.ts. */
const MAX_BLOCKS = 6;
/** Doit rester d'accord avec MAX_IMAGE_BYTES de backend/src/routes/templates.ts. */
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ACCEPTED_IMAGE_TYPES = "image/png,image/jpeg,image/svg+xml";
/**
 * Un bloc neuf porte un texte d'attente plutôt que rien : la section apparaît
 * dans l'aperçu dès qu'une disposition est choisie, à sa vraie place. Mêmes
 * valeurs que backend/src/layout/layoutConfig.ts.
 */
const PLACEHOLDER_TITLE = "Titre";
const PLACEHOLDER_SUBTITLE = "Sous-titre";

const KINDS: { id: BlockKind; label: string; hint: string }[] = [
  { id: "image-text", label: "Image + texte", hint: "image à gauche" },
  { id: "text-image", label: "Texte + image", hint: "image à droite" },
  { id: "centered", label: "Texte centré", hint: "sans image" },
  { id: "custom", label: "Personnalisé", hint: "à composer" },
];
const SCOPES: { value: BlockScope; label: string; why: string }[] = [
  { value: "all", label: "Toutes les pages", why: "Imprimé sur toutes les pages." },
  { value: "first", label: "Première page", why: "Imprimé sur la première page seulement." },
  { value: "except-first", label: "Sauf la première", why: "Imprimé partout sauf sur la première page." },
];
const POSITIONS: [ImagePosition, string][] = [
  ["left", "Gauche"],
  ["center", "Centre"],
  ["right", "Droite"],
];
const ALIGNS: [Align, string][] = [
  ["left", "Gauche"],
  ["center", "Centre"],
  ["right", "Droite"],
];
const NUMBERINGS = [
  { value: "none", label: "Aucune" },
  { value: "n", label: "1" },
  { value: "n-of-total", label: "1 / N" },
  { value: "page-n-of-total", label: "Page 1 / N" },
];

/**
 * Chaque frappe remontait jusqu'à l'aperçu : la source était recomposée et le
 * PDF recompilé lettre par lettre. Le champ garde donc sa valeur en local et ne
 * la remonte qu'après une pause — ou tout de suite si le champ perd le focus,
 * pour que rien ne soit perdu en changeant d'onglet ou en enregistrant.
 */
const TYPING_PAUSE_MS = 400;

function useDebouncedField<T>(value: T, commit: (next: T) => void) {
  const [local, setLocal] = useState(value);
  const timer = useRef<number | undefined>(undefined);
  // Une frappe est en attente : la valeur qui redescend est la nôtre, pas une
  // nouvelle, et l'écraser ferait reculer le curseur.
  const pending = useRef(false);
  const latest = useRef(commit);
  latest.current = commit;

  useEffect(() => {
    if (!pending.current) setLocal(value);
  }, [value]);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const change = (next: T) => {
    pending.current = true;
    setLocal(next);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      pending.current = false;
      latest.current(next);
    }, TYPING_PAUSE_MS);
  };

  const flush = () => {
    if (!pending.current) return;
    window.clearTimeout(timer.current);
    pending.current = false;
    latest.current(local);
  };

  return { value: local, change, flush };
}

/** Champ texte du kit, remonté après une pause plutôt qu'à chaque frappe. */
function DebouncedInput({
  label,
  value,
  onCommit,
  ...rest
}: {
  label: string;
  value: string;
  onCommit: (next: string) => void;
} & Omit<React.ComponentProps<typeof Input>, "label" | "value" | "onChange" | "onBlur">) {
  const f = useDebouncedField(value, onCommit);
  return (
    <Input
      {...rest}
      label={label}
      fullWidth
      value={f.value}
      onChange={(e) => f.change(e.target.value)}
      onBlur={f.flush}
    />
  );
}

/** Idem pour une zone de texte multiligne. */
function DebouncedTextArea({
  label,
  value,
  onCommit,
  rows,
}: {
  label: string;
  value: string;
  onCommit: (next: string) => void;
  rows?: number;
}) {
  const f = useDebouncedField(value, onCommit);
  return (
    <TextArea
      label={label}
      fullWidth
      rows={rows}
      value={f.value}
      onChange={(e) => f.change(e.target.value)}
      onBlur={f.flush}
    />
  );
}

/**
 * Nombre borné : la valeur tapée reste telle quelle le temps de la saisie
 * (« 1 » avant « 15 »), et n'est ramenée dans les bornes qu'en remontant.
 */
function DebouncedNumber({
  label,
  value,
  min,
  max,
  step,
  onCommit,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onCommit: (next: number) => void;
}) {
  const f = useDebouncedField(String(value), (raw) => {
    const n = Number(raw);
    if (raw === "" || !Number.isFinite(n)) return;
    onCommit(Math.min(max, Math.max(min, n)));
  });
  return (
    <Input
      type="number"
      min={min}
      max={max}
      step={step}
      label={label}
      fullWidth
      value={f.value}
      onChange={(e) => f.change(e.target.value)}
      onBlur={f.flush}
    />
  );
}

/** Champs révélés par disposition ; « custom » les montre tous. */
function showsImage(kind: BlockKind): boolean {
  return kind !== "centered";
}
function showsPlacement(kind: BlockKind): boolean {
  return kind === "custom";
}

/** Même valeur que newBlock() du backend : un bloc créé ici passe la validation telle quelle. */
function newBlock(kind: BlockKind, ruleColor: string): Block {
  return {
    kind,
    scope: "all",
    image: null,
    imagePosition: kind === "text-image" ? "right" : kind === "centered" ? "center" : "left",
    imageHeightMm: 12,
    title: PLACEHOLDER_TITLE,
    subtitle: PLACEHOLDER_SUBTITLE,
    align: kind === "centered" ? "center" : "left",
    rule: { on: true, color: ruleColor, widthPt: 1, aboveMm: 2, belowMm: 0 },
  };
}

interface Props {
  kind: "header" | "footer";
  band: Band | FooterBand;
  /** Couleur des titres : le filet d'un bloc neuf la reprend. */
  ruleColor: string;
  onChange: (next: Band | FooterBand) => void;
  /** Ouvre la fenêtre d'import (recadrage PDF/DOCX) pour le bloc d'indice donné. */
  onPickImage: (index: number) => void;
  /** Dépose un fichier choisi localement comme image du bloc d'indice donné. */
  onUploadImage: (index: number, file: File) => void;
  /**
   * Visuels déjà présents dans backend/templates/assets. Le dossier est commun
   * à tous les gabarits : la liste est donc la même en en-tête et en pied.
   */
  assets: string[];
  canDeleteAssets?: boolean;
  onDeleteAsset?: (file: string) => void;
}

export function SectionBuilder({
  kind,
  band,
  ruleColor,
  onChange,
  onPickImage,
  onUploadImage,
  assets,
  canDeleteAssets,
  onDeleteAsset,
}: Props) {
  // Indice du bloc dont la galerie est ouverte ; null quand on n'en ajoute pas.
  const [choosing, setChoosing] = useState(false);
  // Un seul bloc déplié à la fois : à 320 px, deux ne tiennent pas.
  const [open, setOpen] = useState(0);

  const blocks = band.blocks;
  const setBlocks = (next: Block[]) => onChange({ ...band, blocks: next });
  const patch = (i: number, p: Partial<Block>) =>
    setBlocks(blocks.map((b, j) => (j === i ? { ...b, ...p } : b)));

  function add(k: BlockKind) {
    setBlocks([...blocks, newBlock(k, ruleColor)]);
    setOpen(blocks.length);
    setChoosing(false);
  }

  function remove(i: number) {
    setBlocks(blocks.filter((_, j) => j !== i));
    setOpen(0);
  }

  // Bande vide : un seul bouton. La galerie ne s'ouvre qu'après un clic.
  if (blocks.length === 0 && !choosing) {
    return (
      <div className="sb">
        <div className="sb__band">
          <AddButton onClick={() => setChoosing(true)} />
        </div>
      </div>
    );
  }

  if (choosing) {
    return (
      <div className="sb sb__band">
        {blocks.length > 0 && (
          <button type="button" className="sb__back" onClick={() => setChoosing(false)}>
            ‹ Retour
          </button>
        )}
        <Label>Choisir une disposition</Label>
        <div className="sb__gallery">
          {KINDS.map((k) => (
            <button key={k.id} type="button" className="sb__tile" onClick={() => add(k.id)}>
              <KindArt kind={k.id} />
              <span className="sb__tile-name">
                {k.label}
                <em>{k.hint}</em>
              </span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="sb">
      {blocks.map((block, i) => {
        const expanded = i === open;
        const name = KINDS.find((k) => k.id === block.kind)?.label ?? "Bloc";
        return (
          <section key={i} className="sb__section">
            <div className="sb__section-head">
              <button
                type="button"
                className="sb__section-toggle"
                aria-expanded={expanded}
                onClick={() => setOpen(expanded ? -1 : i)}
              >
                {expanded ? <ChevronDown size={16} aria-hidden="true" /> : <ChevronRight size={16} aria-hidden="true" />}
                <span>{name}</span>
              </button>
              <button
                type="button"
                className="sb__section-del"
                aria-label={`Supprimer la section ${name}`}
                onClick={() => remove(i)}
              >
                <Trash size={15} aria-hidden="true" />
              </button>
            </div>
            {expanded && (
              <div className="sb__section-body">
                <BlockFields
                  block={block}
                  onChange={(p) => patch(i, p)}
                  onPickImage={() => onPickImage(i)}
                  onUploadImage={(file) => onUploadImage(i, file)}
                  assets={assets}
                  canDeleteAssets={canDeleteAssets}
                  onDeleteAsset={onDeleteAsset}
                />
              </div>
            )}
          </section>
        );
      })}

      <div className="sb__band">
        <BandFields band={band} onChange={onChange} isFooter={kind === "footer"} />
        {blocks.length < MAX_BLOCKS && <AddButton onClick={() => setChoosing(true)} />}
      </div>
    </div>
  );
}

function AddButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className="sb__add" onClick={onClick}>
      <span className="sb__add-plus" aria-hidden="true">
        +
      </span>
      Ajouter une section
    </button>
  );
}

function BlockFields({
  block,
  onChange,
  onPickImage,
  onUploadImage,
  assets,
  canDeleteAssets,
  onDeleteAsset,
}: {
  block: Block;
  onChange: (patch: Partial<Block>) => void;
  onPickImage: () => void;
  onUploadImage: (file: File) => void;
  assets: string[];
  canDeleteAssets?: boolean;
  onDeleteAsset?: (file: string) => void;
}) {
  const scope = SCOPES.find((s) => s.value === block.scope) ?? SCOPES[0];
  const setRule = (p: Partial<Block["rule"]>) => onChange({ rule: { ...block.rule, ...p } });

  return (
    <div className="sb__block">
      <div className="sb__scope">
        <Select
          label="Pages"
          fullWidth
          clearable={false}
          options={SCOPES.map((s) => ({ value: s.value, label: s.label }))}
          value={block.scope}
          onChange={(e) => onChange({ scope: String(e.target.value) as BlockScope })}
        />
        <p className="sb__why">{scope.why}</p>
      </div>

      {showsImage(block.kind) && (
        <ImageField
          block={block}
          onChange={onChange}
          onPick={onPickImage}
          onUpload={onUploadImage}
          assets={assets}
          canDeleteAssets={canDeleteAssets}
          onDeleteAsset={onDeleteAsset}
        />
      )}

      {showsPlacement(block.kind) && block.image && (
        <>
          <Select
            label="Position de l'image"
            fullWidth
            clearable={false}
            options={POSITIONS.map(([v, l]) => ({ value: v, label: l }))}
            value={block.imagePosition}
            onChange={(e) => onChange({ imagePosition: String(e.target.value) as ImagePosition })}
          />
          <Select
            label="Taille de l'image"
            fullWidth
            clearable={false}
            options={[
              { value: "fixed", label: "Hauteur fixe" },
              { value: "full", label: "Pleine page (bord à bord)" },
            ]}
            value={block.imageHeightMm === 0 ? "full" : "fixed"}
            onChange={(e) => onChange({ imageHeightMm: e.target.value === "full" ? 0 : 12 })}
          />
        </>
      )}
      {showsImage(block.kind) && block.image && block.imageHeightMm > 0 && (
        <DebouncedNumber
          label="Hauteur (mm)"
          min={1}
          max={120}
          value={block.imageHeightMm}
          onCommit={(imageHeightMm) => onChange({ imageHeightMm })}
        />
      )}

      <DebouncedInput label="Titre" value={block.title} onCommit={(title) => onChange({ title })} />
      <DebouncedTextArea
        label="Sous-titre"
        rows={2}
        value={block.subtitle}
        onCommit={(subtitle) => onChange({ subtitle })}
      />

      {showsPlacement(block.kind) && (
        <Select
          label="Alignement du texte"
          fullWidth
          clearable={false}
          options={ALIGNS.map(([v, l]) => ({ value: v, label: l }))}
          value={block.align}
          onChange={(e) => onChange({ align: String(e.target.value) as Align })}
        />
      )}

      <hr className="sb__hr" />
      <Switch
        label="Filet"
        role="switch"
        fullWidth
        checked={block.rule.on}
        onChange={(e) => setRule({ on: e.target.checked })}
      />
      {block.rule.on && (
        <>
          <div className="sb__row2">
            <div className="le-group">
              <Label>Couleur</Label>
              <span className="le-style__color">
                <DebouncedColor value={block.rule.color} onCommit={(color) => setRule({ color })} />
              </span>
            </div>
            <DebouncedNumber
              label="Épaisseur (pt)"
              min={0.1}
              max={10}
              step={0.1}
              value={block.rule.widthPt}
              onCommit={(widthPt) => setRule({ widthPt })}
            />
          </div>
          <div className="sb__row2">
            <DebouncedNumber
              label="Espace avant (mm)"
              min={0}
              max={40}
              value={block.rule.aboveMm}
              onCommit={(aboveMm) => setRule({ aboveMm })}
            />
            <DebouncedNumber
              label="Espace après (mm)"
              min={0}
              max={40}
              value={block.rule.belowMm}
              onCommit={(belowMm) => setRule({ belowMm })}
            />
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Un seul rectangle, avec ou sans image : le champ ne change pas de forme
 * quand on en choisit une. « Ajouter » dépose un fichier local (PNG/JPEG/SVG) ;
 * l'extraction d'un PDF/DOCX reste accessible, en second, pour le cas où le
 * visuel n'est pas déjà un fichier image mais une page à recadrer.
 */
function ImageField({
  block,
  onChange,
  onPick,
  onUpload,
  assets,
  canDeleteAssets,
  onDeleteAsset,
}: {
  block: Block;
  onChange: (patch: Partial<Block>) => void;
  onPick: () => void;
  onUpload: (file: File) => void;
  assets: string[];
  canDeleteAssets?: boolean;
  onDeleteAsset?: (file: string) => void;
}) {
  const fileInput = useRef<HTMLInputElement>(null);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // même fichier deux fois de suite : sans ça, pas de second événement.
    if (!file) return;
    if (file.size > MAX_IMAGE_BYTES) {
      window.alert(`Image trop volumineuse (${Math.round(file.size / 1024)} Ko) : 5 Mo au plus.`);
      return;
    }
    onUpload(file);
  }

  return (
    <div className="le-group">
      <Label>Image</Label>
      <div className="sb__img">
        <span className="sb__img-th" aria-hidden="true">
          {block.image ? <img src={assetUrl(block.image)} alt="" loading="lazy" /> : <Upload size={16} />}
        </span>
        {block.image ? (
          <>
            <span className="sb__img-name" title={block.image}>
              {block.image}
            </span>
            <button
              type="button"
              className="sb__img-x"
              aria-label="Retirer l'image"
              onClick={() => onChange({ image: null })}
            >
              ×
            </button>
          </>
        ) : (
          <span className="sb__img-name sb__img-none">Aucune image</span>
        )}
      </div>
      {/* Deux entrées de poids égal : l'une ne doit pas éclipser l'autre. */}
      {!block.image && (
        <div className="sb__img-actions">
          <button type="button" className="sb__img-action" onClick={() => fileInput.current?.click()}>
            Importer une image
          </button>
          <button type="button" className="sb__img-action" onClick={onPick}>
            Extraire d'un PDF/DOCX
          </button>
          {/* tabIndex -1 : le bouton « Importer une image » porte seul le focus et l'activation clavier. */}
          <input
            ref={fileInput}
            type="file"
            accept={ACCEPTED_IMAGE_TYPES}
            tabIndex={-1}
            aria-hidden="true"
            className="sb__sr-only"
            onChange={handleFile}
          />
        </div>
      )}
      {!block.image && assets.length > 0 && (
        <div className="sb__assets">
          {assets.map((file) => (
            <span key={file} className="sb__asset">
              <button
                type="button"
                className="sb__asset-btn"
                title={file}
                onClick={() => onChange({ image: file })}
              >
                <img src={assetUrl(file)} alt={file} loading="lazy" />
              </button>
              {canDeleteAssets && (
                <button
                  type="button"
                  className="sb__asset-del"
                  aria-label={`Supprimer le visuel ${file}`}
                  onClick={() => onDeleteAsset?.(file)}
                >
                  <Trash size={11} aria-hidden="true" />
                </button>
              )}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/** Espacement et, pour le pied, la numérotation : un seul jeu par bande. */
function BandFields({
  band,
  onChange,
  isFooter,
}: {
  band: Band | FooterBand;
  onChange: (next: Band | FooterBand) => void;
  isFooter: boolean;
}) {
  const footer = band as FooterBand;
  const setSpacing = (side: keyof Band["spacing"], value: number) =>
    onChange({ ...band, spacing: { ...band.spacing, [side]: value } });

  return (
    <>
      <hr className="sb__hr" />
      {isFooter && (
        <>
          <Select
            label="Numérotation"
            fullWidth
            clearable={false}
            options={NUMBERINGS}
            value={footer.numbering}
            onChange={(e) => onChange({ ...footer, numbering: String(e.target.value) as Numbering })}
          />
          {footer.numbering !== "none" && (
            <Select
              label="Position du numéro"
              fullWidth
              clearable={false}
              options={ALIGNS.map(([v, l]) => ({ value: v, label: l }))}
              value={footer.numberingAlign}
              onChange={(e) => onChange({ ...footer, numberingAlign: String(e.target.value) as Align })}
            />
          )}
        </>
      )}
      <div className="le-group" role="group" aria-label="Espacement (mm)">
        <Label>Espacement (mm)</Label>
        <div className="le-grid-4">
          {([
            ["top", "Haut"],
            ["left", "Gauche"],
            ["right", "Droite"],
            ["gap", "Texte"],
          ] as const).map(([side, label]) => (
            <DebouncedNumber
              key={side}
              label={label}
              min={0}
              max={80}
              value={band.spacing[side]}
              onCommit={(v) => setSpacing(side, v)}
            />
          ))}
        </div>
      </div>
    </>
  );
}

/** Aperçu filaire d'une disposition : ce que la tuile de la galerie montre. */
function KindArt({ kind }: { kind: BlockKind }) {
  return (
    <svg viewBox="0 0 232 48" className="sb__art" role="img" aria-hidden="true">
      {kind === "image-text" && (
        <>
          <rect x="14" y="9" width="22" height="22" rx="3" fill="currentColor" />
          <rect x="44" y="13" width="96" height="4.5" rx="2.25" fill="currentColor" opacity="0.7" />
          <rect x="44" y="22" width="60" height="3.5" rx="1.75" fill="currentColor" opacity="0.3" />
        </>
      )}
      {kind === "text-image" && (
        <>
          <rect x="14" y="13" width="96" height="4.5" rx="2.25" fill="currentColor" opacity="0.7" />
          <rect x="14" y="22" width="60" height="3.5" rx="1.75" fill="currentColor" opacity="0.3" />
          <rect x="196" y="9" width="22" height="22" rx="3" fill="currentColor" />
        </>
      )}
      {kind === "centered" && (
        <>
          <rect x="68" y="12" width="96" height="4.5" rx="2.25" fill="currentColor" opacity="0.7" />
          <rect x="86" y="21" width="60" height="3.5" rx="1.75" fill="currentColor" opacity="0.3" />
        </>
      )}
      {kind === "custom" && (
        <>
          <rect x="14" y="8" width="204" height="26" rx="4" fill="none" stroke="currentColor"
            strokeWidth="1.5" strokeDasharray="5 4" opacity="0.45" />
          <rect x="80" y="15" width="72" height="3" rx="1.5" fill="currentColor" opacity="0.3" />
          <circle cx="100" cy="16.5" r="3.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <rect x="80" y="25" width="72" height="3" rx="1.5" fill="currentColor" opacity="0.3" />
          <circle cx="132" cy="26.5" r="3.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
        </>
      )}
      {kind !== "custom" && <rect x="14" y="40" width="204" height="1.5" fill="currentColor" opacity="0.5" />}
    </svg>
  );
}

/** Le sélecteur natif émet en continu pendant le glissé : même pause. */
function DebouncedColor({ value, onCommit }: { value: string; onCommit: (next: string) => void }) {
  const f = useDebouncedField(value, onCommit);
  return (
    <>
      <input
        aria-label="Couleur du filet"
        type="color"
        value={f.value}
        onChange={(e) => f.change(e.target.value)}
        onBlur={f.flush}
      />
      <span className="le-mono">{f.value.toUpperCase()}</span>
    </>
  );
}
