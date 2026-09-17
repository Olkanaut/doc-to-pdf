/**
 * The section builder for the Header and Footer tabs.
 *
 * A band is a list of blocks stacked inside a single Typst `header:`/`footer:`
 * argument — they are not separate bands. While it's empty, the panel shows
 * just one button: presence is derived from content, there's no switch to
 * contradict it.
 *
 * `kind` only decides which fields are shown; the stored shape is the same
 * for every kind, so switching layout never loses what was typed.
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

/** Must stay in sync with MAX_BLOCKS in backend/src/layout/layoutConfig.ts. */
const MAX_BLOCKS = 6;
/** Must stay in sync with MAX_IMAGE_BYTES in backend/src/routes/templates.ts. */
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ACCEPTED_IMAGE_TYPES = "image/png,image/jpeg,image/svg+xml";
/**
 * A new block carries stand-in text rather than nothing, so the section shows
 * up in the preview the moment a layout is picked, in its real place. Same
 * values as backend/src/layout/layoutConfig.ts.
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
 * Every keystroke used to reach the preview: the source got recomposed and
 * the PDF recompiled letter by letter. The field now keeps its value locally
 * and only pushes it up after a pause — or right away if the field loses
 * focus, so nothing is lost when switching tabs or saving.
 */
const TYPING_PAUSE_MS = 400;

function useDebouncedField<T>(value: T, commit: (next: T) => void) {
  const [local, setLocal] = useState(value);
  const timer = useRef<number | undefined>(undefined);
  // A keystroke is pending: the value coming back down is our own, not a
  // new one, and overwriting it would push the cursor back.
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

/** The kit's text field, pushed up after a pause rather than on every keystroke. */
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

/** Same, for a multi-line text area. */
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
 * A bounded number: the typed value stays as-is while typing ("1" before
 * "15"), and only gets clamped into range when it's pushed up.
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

/** Fields revealed per layout; "custom" shows them all. */
function showsImage(kind: BlockKind): boolean {
  return kind !== "centered";
}
function showsPlacement(kind: BlockKind): boolean {
  return kind === "custom";
}

/** Same shape as newBlock() on the backend: a block created here passes validation as-is. */
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
    spaceAboveMm: 0,
    spaceBelowMm: 0,
    rule: { on: false, color: ruleColor, widthPt: 1 },
  };
}

interface Props {
  kind: "header" | "footer";
  band: Band | FooterBand;
  /** Heading colour: a fresh block's rule takes it as its own. */
  ruleColor: string;
  onChange: (next: Band | FooterBand) => void;
  /** Opens the import window (PDF/DOCX crop) for the block at this index. */
  onPickImage: (index: number) => void;
  /** Drops a locally chosen file as the image of the block at this index. */
  onUploadImage: (index: number, file: File) => void;
  /**
   * Visuals already present in backend/templates/assets. The folder is shared
   * across every template: the list is the same in the header and the footer.
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
  // Whether the layout gallery is open, for adding a new section.
  const [choosing, setChoosing] = useState(false);
  // Only one block expanded at a time: at 320px, two don't fit.
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

  // Page numbering doesn't depend on any block: the footer has to be able to
  // set it even when empty, or a numbering already active by default becomes
  // impossible to turn off or change until a section is added.
  return (
    <div className="sb">
      {choosing ? (
        <div className="sb__band">
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
      ) : (
        <>
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
            {/* Separates sections above; nothing to separate in a still-empty footer. */}
            {blocks.length > 0 && <hr className="sb__hr" />}
            {kind === "footer" && (
              <NumberingFields footer={band as FooterBand} onChange={onChange} />
            )}
            {(blocks.length > 0 || (kind === "footer" && (band as FooterBand).numbering !== "none")) && (
              <SpacingFields band={band} onChange={onChange} isFooter={kind === "footer"} />
            )}
            {blocks.length < MAX_BLOCKS && <AddButton onClick={() => setChoosing(true)} />}
          </div>
        </>
      )}
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
      {/* Applies whether the rule is drawn or not: this is what lets two
          sections be pulled apart without forcing a line onto them. */}
      <div className="le-group">
        <Label>Espacement de la section</Label>
        <div className="sb__row2">
          <DebouncedNumber
            label="Espace avant (mm)"
            min={0}
            max={60}
            value={block.spaceAboveMm}
            onCommit={(spaceAboveMm) => onChange({ spaceAboveMm })}
          />
          <DebouncedNumber
            label="Espace après (mm)"
            min={0}
            max={60}
            value={block.spaceBelowMm}
            onCommit={(spaceBelowMm) => onChange({ spaceBelowMm })}
          />
        </div>
      </div>

      <Switch
        label="Filet"
        role="switch"
        fullWidth
        checked={block.rule.on}
        onChange={(e) => setRule({ on: e.target.checked })}
      />
      {block.rule.on && (
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
      )}
    </div>
  );
}

/**
 * One rectangle, with or without an image: the field doesn't change shape
 * once one is chosen. Two equal-weight actions sit below it when empty —
 * dropping a local file (PNG/JPEG/SVG), or extracting one from a PDF/DOCX for
 * when the visual isn't already an image file but a page to crop.
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
    e.target.value = ""; // same file picked twice in a row: without this, no second event fires.
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
      {/* Two equal-weight entries: neither should eclipse the other. */}
      {!block.image && (
        <div className="sb__img-actions">
          <button type="button" className="sb__img-action" onClick={() => fileInput.current?.click()}>
            Importer une image
          </button>
          <button type="button" className="sb__img-action" onClick={onPick}>
            Extraire d'un PDF/DOCX
          </button>
          {/* tabIndex -1: the "Importer une image" button alone carries focus and keyboard activation. */}
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

/**
 * The page number: independent of any block, so it shows even with no
 * section in the footer at all — otherwise a numbering already active by
 * default could no longer be turned off or changed until a section is added.
 */
function NumberingFields({
  footer,
  onChange,
}: {
  footer: FooterBand;
  onChange: (next: FooterBand) => void;
}) {
  return (
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
        <>
          <Select
            label="Position du numéro"
            fullWidth
            clearable={false}
            options={ALIGNS.map(([v, l]) => ({ value: v, label: l }))}
            value={footer.numberingAlign}
            onChange={(e) => onChange({ ...footer, numberingAlign: String(e.target.value) as Align })}
          />
          {/* No caption under this field: unlike a section, whether the number
              shows also depends on the format chosen above ("None"), so a fixed
              sentence would sometimes describe the opposite of what actually shows. */}
          <Select
            label="Pages numérotées"
            fullWidth
            clearable={false}
            options={SCOPES.map((s) => ({ value: s.value, label: s.label }))}
            value={footer.numberingScope}
            onChange={(e) => onChange({ ...footer, numberingScope: String(e.target.value) as BlockScope })}
          />
        </>
      )}
    </>
  );
}

/** Distance from the band to the page edge and to the body text: useful as soon as there is anything to place, a block or the page number alone. */
/**
 * "Haut" and "Bas" always name the edge that touches the document and the
 * edge that touches the page border — not the same stored fields depending
 * on header or footer, since it isn't the same edge that plays that role: in
 * a header, `top` (the page edge) is the top one; in a footer, it's `gap`
 * (the edge touching the body) that is. The on-screen order is always
 * Haut, Bas, Gauche, Droite.
 */
function SpacingFields({
  band,
  onChange,
  isFooter,
}: {
  band: Band | FooterBand;
  onChange: (next: Band | FooterBand) => void;
  isFooter: boolean;
}) {
  const setSpacing = (side: keyof Band["spacing"], value: number) =>
    onChange({ ...band, spacing: { ...band.spacing, [side]: value } });

  const fields = (
    isFooter
      ? [["gap", "Haut"], ["top", "Bas"]]
      : [["top", "Haut"], ["gap", "Bas"]]
  ) as [keyof Band["spacing"], string][];
  fields.push(["left", "Gauche"], ["right", "Droite"]);

  return (
    <div className="le-group" role="group" aria-label="Espacement (mm)">
      <Label>Espacement (mm)</Label>
      <div className="le-grid-4">
        {fields.map(([side, label]) => (
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
  );
}

/** Wireframe preview of a layout: what the gallery tile shows. */
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

/** The native picker fires continuously while dragging: same debounce. */
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
