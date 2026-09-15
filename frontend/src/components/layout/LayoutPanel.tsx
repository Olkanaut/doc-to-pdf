import { useEffect, useId, useMemo, useState, type ReactNode } from "react";
import {
  Alert,
  Button,
  Input,
  Label,
  Radio,
  RadioGroup,
  Select,
  Switch,
  TextArea,
  VariantType,
} from "@gouvfr-lasuite/ui-components";
import { ChevronDown, ChevronRight, Code } from "@gouvfr-lasuite/ui-components/icons";
import type { Align, LayoutConfig, Numbering, PaperSize } from "../../api/client";

type Option = { value: string; label: string };

/** Même liste que backend/src/layout/layoutConfig.ts (FONTS) : hors liste, le backend retombe sur Marianne. */
const FONTS: Option[] = ["Marianne", "Arial", "Helvetica", "Libertinus Serif", "New Computer Modern", "DejaVu Sans Mono"].map(
  (f) => ({ value: f, label: f }),
);
const FONT_SIZES = [8, 9, 10, 11, 12, 13, 14, 15, 16];
const LINE_HEIGHTS: [number, string][] = [
  [1, "1,0"],
  [1.15, "1,15"],
  [1.2, "1,2"],
  [1.5, "1,5"],
  [2, "2,0"],
];
const PAPERS: Option[] = [
  { value: "a4", label: "A4 — 210 × 297 mm" },
  { value: "a5", label: "A5 — 148 × 210 mm" },
  { value: "us-letter", label: "Lettre US — 216 × 279 mm" },
];
const ALIGNS: [Align, string][] = [
  ["left", "Gauche"],
  ["center", "Centre"],
  ["right", "Droite"],
];
const NUMBERINGS: Option[] = [
  { value: "none", label: "Aucune" },
  { value: "n", label: "1" },
  { value: "n-of-total", label: "1 / N" },
  { value: "page-n-of-total", label: "Page 1 / N" },
];
const HEADING_SCALES: Option[] = [
  { value: "compact", label: "Compacte" },
  { value: "normal", label: "Normale" },
  { value: "large", label: "Grande" },
];
/* Tableaux : mêmes listes que backend/src/layout/layoutConfig.ts (TABLE_*). */
const TABLE_STROKES: Option[] = [
  { value: "none", label: "Aucun" },
  { value: "light", label: "Fins" },
  { value: "full", label: "Complets" },
];
const TABLE_HEADER_FILLS: Option[] = [
  { value: "none", label: "Aucun" },
  { value: "grey", label: "Gris" },
  { value: "brand", label: "Couleur des titres" },
];
const TABLE_FONT_SIZES: Option[] = [
  { value: "inherit", label: "Normale" },
  { value: "small", label: "Réduite" },
];
const MARGIN_SIDES = [
  ["top", "Haut"],
  ["bottom", "Bas"],
  ["left", "Gauche"],
  ["right", "Droite"],
] as const;

/** Les Radio du kit alignés en ligne (le groupe est en colonne par défaut). */
const RADIO_ROW = { flexDirection: "row", flexWrap: "wrap", gap: "0 0.75rem" } as const;

interface Props {
  layout: LayoutConfig;
  /** Faux tant que le .typ n'a pas de bloc « dots:layout ». */
  managed: boolean;
  /** Fichiers de backend/templates/assets, proposés comme logo. */
  assets: string[];
  /** Vrai pendant qu'une proposition de l'assistant est en attente. */
  disabled?: boolean;
  onChange: (next: LayoutConfig) => void;
}

export function LayoutPanel({ layout, managed, assets, disabled, onChange }: Props) {
  const uid = useId();
  const set = (patch: Partial<LayoutConfig>) => onChange({ ...layout, ...patch });
  const setHeader = (patch: Partial<LayoutConfig["header"]>) =>
    set({ header: { ...layout.header, ...patch } });
  const setFooter = (patch: Partial<LayoutConfig["footer"]>) =>
    set({ footer: { ...layout.footer, ...patch } });
  const setTable = (patch: Partial<LayoutConfig["table"]>) =>
    set({ table: { ...layout.table, ...patch } });
  const setMargin = (side: keyof LayoutConfig["margins"], raw: string) => {
    const n = Number(raw);
    if (raw === "" || !Number.isFinite(n)) return;
    set({ margins: { ...layout.margins, [side]: Math.min(80, Math.max(0, n)) } });
  };
  // Le navigateur traite `#tableaux` avant le rendu React : on refait le défilement au montage.
  useEffect(() => {
    const hash = window.location.hash.slice(1);
    if (hash) document.getElementById(hash)?.scrollIntoView();
  }, []);

  // Valeur hors liste (écrite par l'assistant, ex. 10.5) : affichée plutôt qu'un Select vide.
  const fontSizeOptions = useMemo<Option[]>(() => {
    const list = FONT_SIZES.map((s) => ({ value: String(s), label: `${s} pt` }));
    return FONT_SIZES.includes(layout.fontSize)
      ? list
      : [{ value: String(layout.fontSize), label: `${layout.fontSize} pt` }, ...list];
  }, [layout.fontSize]);
  const lineHeightOptions = useMemo<Option[]>(() => {
    const list = LINE_HEIGHTS.map(([v, l]) => ({ value: String(v), label: l }));
    return LINE_HEIGHTS.some(([v]) => v === layout.lineHeight)
      ? list
      : [{ value: String(layout.lineHeight), label: String(layout.lineHeight).replace(".", ",") }, ...list];
  }, [layout.lineHeight]);
  const logoOptions = useMemo<Option[]>(
    () => [{ value: "", label: "Aucun" }, ...assets.map((f) => ({ value: f, label: f }))],
    [assets],
  );

  return (
    <aside className="le-panel" aria-label="Réglages de mise en page">
      {!managed && (
        <Alert type={VariantType.INFO} className="le-panel__notice">
          <span>
            Ce gabarit n'a pas encore de bloc de mise en page : le premier réglage l'ajoute avant{" "}
            <code>#include "body.typ"</code>.
          </span>
        </Alert>
      )}
      {disabled && (
        <Alert type={VariantType.WARNING} className="le-panel__notice">
          <span>
            Une proposition de l'assistant est en attente : appliquez-la ou ignorez-la pour reprendre les réglages.
          </span>
        </Alert>
      )}
      <fieldset className="le-panel__fields" disabled={disabled}>
        <Section title="Page">
          <Select
            label="Format"
            fullWidth
            clearable={false}
            options={PAPERS}
            value={layout.paper}
            onChange={(e) => set({ paper: String(e.target.value) as PaperSize })}
          />
          <fieldset className="le-radios">
            <legend>Orientation</legend>
            <RadioGroup style={RADIO_ROW}>
              {(
                [
                  ["portrait", "Portrait"],
                  ["landscape", "Paysage"],
                ] as const
              ).map(([v, l]) => (
                <Radio
                  key={v}
                  name={`${uid}-orientation`}
                  label={l}
                  value={v}
                  checked={layout.orientation === v}
                  onChange={() => set({ orientation: v })}
                />
              ))}
            </RadioGroup>
          </fieldset>
          <div className="le-group" role="group" aria-label="Marges (mm)">
            <Label>Marges (mm)</Label>
            <div className="le-grid-4">
              {MARGIN_SIDES.map(([side, label]) => (
                <Input
                  key={side}
                  type="number"
                  min={0}
                  max={80}
                  label={label}
                  fullWidth
                  value={String(layout.margins[side])}
                  onChange={(e) => setMargin(side, e.target.value)}
                />
              ))}
            </div>
          </div>
        </Section>

        <Section title="Typographie">
          <Select
            label="Police"
            fullWidth
            clearable={false}
            options={FONTS}
            value={layout.font}
            onChange={(e) => set({ font: String(e.target.value) })}
            // Repli de layoutTypst.ts (FALLBACK_FONTS) : l'aperçu ne remonte pas les avertissements typst.
            text="Si la police n'est pas installée sur le serveur, Arial la remplace (Libertinus Serif à défaut)."
          />
          <div className="le-grid-2">
            <Select
              label="Taille"
              fullWidth
              clearable={false}
              options={fontSizeOptions}
              value={String(layout.fontSize)}
              onChange={(e) => set({ fontSize: Number(e.target.value) })}
            />
            <Select
              label="Interligne"
              fullWidth
              clearable={false}
              options={lineHeightOptions}
              value={String(layout.lineHeight)}
              onChange={(e) => set({ lineHeight: Number(e.target.value) })}
            />
          </div>
        </Section>

        <Section title="En-tête">
          <Switch
            label="Activer"
            role="switch"
            fullWidth
            checked={layout.header.enabled}
            onChange={(e) => setHeader({ enabled: e.target.checked })}
          />
          <Select
            label="Logo"
            fullWidth
            clearable={false}
            options={logoOptions}
            value={layout.header.logo ?? ""}
            onChange={(e) => setHeader({ logo: String(e.target.value ?? "") || null })}
          />
          <TextArea
            label="Texte"
            fullWidth
            rows={2}
            value={layout.header.text}
            onChange={(e) => setHeader({ text: e.target.value })}
          />
          <AlignRadios
            name={`${uid}-header-align`}
            groupLabel="Alignement de l'en-tête"
            value={layout.header.align}
            onChange={(v) => setHeader({ align: v })}
          />
          <Switch
            label="Filet"
            role="switch"
            fullWidth
            checked={layout.header.rule}
            onChange={(e) => setHeader({ rule: e.target.checked })}
          />
        </Section>

        <Section title="Pied de page">
          <Switch
            label="Activer"
            role="switch"
            fullWidth
            checked={layout.footer.enabled}
            onChange={(e) => setFooter({ enabled: e.target.checked })}
          />
          <TextArea
            label="Texte"
            fullWidth
            rows={2}
            value={layout.footer.text}
            onChange={(e) => setFooter({ text: e.target.value })}
          />
          <Select
            label="Numérotation"
            fullWidth
            clearable={false}
            options={NUMBERINGS}
            value={layout.footer.numbering}
            onChange={(e) => setFooter({ numbering: String(e.target.value) as Numbering })}
          />
          <AlignRadios
            name={`${uid}-footer-align`}
            groupLabel="Alignement du pied de page"
            value={layout.footer.align}
            onChange={(v) => setFooter({ align: v })}
          />
          <Switch
            label="Numéroter la première page"
            role="switch"
            fullWidth
            checked={layout.footer.firstPage}
            onChange={(e) => setFooter({ firstPage: e.target.checked })}
          />
          <Switch
            label="Filet"
            role="switch"
            fullWidth
            checked={layout.footer.rule}
            onChange={(e) => setFooter({ rule: e.target.checked })}
          />
        </Section>

        <Section title="Titres">
          <Select
            label="Échelle"
            fullWidth
            clearable={false}
            options={HEADING_SCALES}
            value={layout.headings.scale}
            onChange={(e) =>
              set({ headings: { ...layout.headings, scale: String(e.target.value) as LayoutConfig["headings"]["scale"] } })
            }
          />
          {/* Pas de sélecteur de couleur dans le kit : champ natif, étiqueté par le Label du kit. */}
          <div className="le-color">
            <Label htmlFor={`${uid}-color`}>Couleur</Label>
            <span className="le-color__control">
              <input
                id={`${uid}-color`}
                type="color"
                value={layout.headings.color}
                onChange={(e) => set({ headings: { ...layout.headings, color: e.target.value } })}
              />
              <span className="le-mono">{layout.headings.color}</span>
            </span>
          </div>
        </Section>

        {/* Le gabarit règle l'allure des tableaux ; leurs colonnes et fusions viennent du document. */}
        <Section id="tableaux" title="Tableaux">
          <Select
            label="Filets"
            fullWidth
            clearable={false}
            options={TABLE_STROKES}
            value={layout.table.stroke}
            onChange={(e) => setTable({ stroke: String(e.target.value) as LayoutConfig["table"]["stroke"] })}
          />
          <Select
            label="Fond de l'en-tête"
            fullWidth
            clearable={false}
            options={TABLE_HEADER_FILLS}
            value={layout.table.headerFill}
            onChange={(e) => setTable({ headerFill: String(e.target.value) as LayoutConfig["table"]["headerFill"] })}
          />
          <Switch
            label="Lignes alternées"
            role="switch"
            fullWidth
            checked={layout.table.zebra}
            onChange={(e) => setTable({ zebra: e.target.checked })}
          />
          <Select
            label="Taille du texte"
            fullWidth
            clearable={false}
            options={TABLE_FONT_SIZES}
            value={layout.table.fontSize}
            onChange={(e) => setTable({ fontSize: String(e.target.value) as LayoutConfig["table"]["fontSize"] })}
          />
        </Section>
      </fieldset>

      <div className="le-panel__foot">
        <p className="le-hint">
          <Code size={16} aria-hidden="true" />
          <span>
            Chaque réglage réécrit le bloc <code>// dots:layout</code> du .typ ; le reste du code reste à la main.
          </span>
        </p>
      </div>
    </aside>
  );
}

/** `id` : ancre (`#tableaux`) pour atteindre une section sous la ligne de flottaison du panneau. */
function Section({ id, title, children }: { id?: string; title: string; children: ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <section id={id} className="le-section">
      <Button
        variant="tertiary"
        color="neutral"
        fullWidth
        className="le-section__toggle"
        aria-expanded={open}
        icon={open ? <ChevronDown size={18} aria-hidden="true" /> : <ChevronRight size={18} aria-hidden="true" />}
        iconPosition="right"
        onClick={() => setOpen(!open)}
      >
        {title}
      </Button>
      {open && <div className="le-section__body">{children}</div>}
    </section>
  );
}

function AlignRadios({
  name,
  groupLabel,
  value,
  onChange,
}: {
  name: string;
  groupLabel: string;
  value: Align;
  onChange: (v: Align) => void;
}) {
  return (
    <fieldset className="le-radios" aria-label={groupLabel}>
      <legend>Alignement</legend>
      <RadioGroup style={RADIO_ROW}>
        {ALIGNS.map(([v, l]) => (
          <Radio key={v} name={name} label={l} value={v} checked={value === v} onChange={() => onChange(v)} />
        ))}
      </RadioGroup>
    </fieldset>
  );
}
