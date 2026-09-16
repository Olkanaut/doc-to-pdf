import { useEffect, useId, useMemo, useState, type MouseEvent, type ReactNode } from "react";
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
import { ArrowLeft, ChevronDown, ChevronRight, Code, Upload } from "@gouvfr-lasuite/ui-components/icons";
import { assetUrl, type Align, type LayoutConfig, type Numbering, type PaperSize, type TextStyleKey } from "../../api/client";
import { ImportDocumentModal } from "../templates/ImportDocumentModal";

type Option = { value: string; label: string };

/** Même liste que backend/src/layout/layoutConfig.ts (FONTS) : hors liste, le backend retombe sur Marianne. */
const FONTS: Option[] = ["Marianne", "Arial", "Helvetica", "Libertinus Serif", "New Computer Modern", "DejaVu Sans Mono"].map(
  (f) => ({ value: f, label: f }),
);
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
const TABS = [
  { id: "format", label: "General" },
  { id: "text", label: "Text" },
  { id: "header", label: "En-tête" },
  { id: "footer", label: "Pied" },
  { id: "tables", label: "Tableaux" },
] as const;
const TEXT_STYLE_SECTIONS: { key: TextStyleKey; label: string }[] = [
  { key: "h1", label: "Heading 1" },
  { key: "h2", label: "Heading 2" },
  { key: "h3", label: "Heading 3" },
  { key: "body", label: "Text" },
];

/** Les Radio du kit alignés en ligne (le groupe est en colonne par défaut). */
const RADIO_ROW = { flexDirection: "row", flexWrap: "wrap", gap: "0 0.75rem" } as const;
type LayoutTab = (typeof TABS)[number]["id"];

interface Props {
  layout: LayoutConfig;
  templateName: string;
  isDefault?: boolean;
  /** Faux tant que le .typ n'a pas de bloc « dots:layout ». */
  managed: boolean;
  /** Fichiers de backend/templates/assets, proposés comme logo. */
  assets: string[];
  /** Vrai pendant qu'une proposition de l'assistant est en attente. */
  disabled?: boolean;
  onChange: (next: LayoutConfig) => void;
  onTemplateNameChange: (name: string) => void;
  backHref: string;
  onBack: (e: MouseEvent<HTMLElement>) => void;
  /** Un visuel vient d'être importé : la liste des assets est à relire. */
  onAssetsChanged?: () => void;
}

export function LayoutPanel({
  layout,
  templateName,
  isDefault,
  managed,
  assets,
  disabled,
  onChange,
  onTemplateNameChange,
  backHref,
  onBack,
  onAssetsChanged,
}: Props) {
  const uid = useId();
  // Section d'où la fenêtre d'import a été ouverte ; null tant qu'elle est fermée.
  const [importing, setImporting] = useState<"header" | "footer" | null>(null);
  const [activeTab, setActiveTab] = useState<LayoutTab>("format");
  const [openTextStyle, setOpenTextStyle] = useState<TextStyleKey | null>(null);
  const set = (patch: Partial<LayoutConfig>) => onChange({ ...layout, ...patch });
  const setHeader = (patch: Partial<LayoutConfig["header"]>) =>
    set({ header: { ...layout.header, ...patch } });
  const setFooter = (patch: Partial<LayoutConfig["footer"]>) =>
    set({ footer: { ...layout.footer, ...patch } });
  const setTable = (patch: Partial<LayoutConfig["table"]>) =>
    set({ table: { ...layout.table, ...patch } });
  const setTextStyle = (key: TextStyleKey, patch: Partial<LayoutConfig["textStyles"][TextStyleKey]>) => {
    const nextStyle = { ...layout.textStyles[key], ...patch };
    const next: Partial<LayoutConfig> = {
      textStyles: { ...layout.textStyles, [key]: nextStyle },
    };
    if (key === "body") {
      if (patch.font) next.font = patch.font;
      if (typeof patch.fontSize === "number") next.fontSize = patch.fontSize;
    }
    if (key === "h1" && patch.color) next.headings = { ...layout.headings, color: patch.color };
    set(next);
  };
  const setTextStyleSize = (key: TextStyleKey, raw: string) => {
    const n = Number(raw);
    if (raw === "" || !Number.isFinite(n)) return;
    setTextStyle(key, { fontSize: Math.min(72, Math.max(6, n)) });
  };
  const setMargin = (side: keyof LayoutConfig["margins"], raw: string) => {
    const n = Number(raw);
    if (raw === "" || !Number.isFinite(n)) return;
    set({ margins: { ...layout.margins, [side]: Math.min(80, Math.max(0, n)) } });
  };
  // Le navigateur traite `#tableaux` avant le rendu React : on ouvre l'onglet puis on recale le défilement.
  useEffect(() => {
    const hash = window.location.hash.slice(1);
    if (hash === "tableaux") setActiveTab("tables");
    if (hash) window.setTimeout(() => document.getElementById(hash)?.scrollIntoView(), 0);
  }, []);

  const lineHeightOptions = useMemo<Option[]>(() => {
    const list = LINE_HEIGHTS.map(([v, l]) => ({ value: String(v), label: l }));
    return LINE_HEIGHTS.some(([v]) => v === layout.lineHeight)
      ? list
      : [{ value: String(layout.lineHeight), label: String(layout.lineHeight).replace(".", ",") }, ...list];
  }, [layout.lineHeight]);

  return (
    <aside className="le-panel" aria-label="Réglages de mise en page">
      <div className="le-panel__top">
        <Button
          href={backHref}
          variant="tertiary"
          color="neutral"
          icon={<ArrowLeft aria-hidden="true" />}
          aria-label="Retour aux gabarits"
          onClick={onBack}
        />
        <input
          className="le-panel__name"
          aria-label="Nom du gabarit"
          value={templateName}
          onChange={(e) => onTemplateNameChange(e.target.value)}
        />
        {isDefault && <span className="le-panel__badge">Par défaut</span>}
      </div>

      <nav className="le-panel__tabs" aria-label="Réglages du gabarit" role="tablist">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            id={`${uid}-${tab.id}-tab`}
            className={`le-panel__tab${activeTab === tab.id ? " le-panel__tab--active" : ""}`}
            role="tab"
            aria-selected={activeTab === tab.id}
            aria-controls={`${uid}-${tab.id}-panel`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      <div className="le-panel__scroll">
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
          <TabPanel uid={uid} tab="format" activeTab={activeTab}>
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

            <Section title="Paragraphe">
              <Select
                label="Interligne"
                fullWidth
                clearable={false}
                options={lineHeightOptions}
                value={String(layout.lineHeight)}
                onChange={(e) => set({ lineHeight: Number(e.target.value) })}
              />
            </Section>
          </TabPanel>

          <TabPanel uid={uid} tab="text" activeTab={activeTab}>
            <div className="le-text-styles" aria-label="Styles de texte">
              {TEXT_STYLE_SECTIONS.map(({ key, label }) => (
                <TextStyleSection
                  key={key}
                  id={`${uid}-text-${key}`}
                  label={label}
                  style={layout.textStyles[key]}
                  open={openTextStyle === key}
                  onToggle={() => setOpenTextStyle((current) => (current === key ? null : key))}
                  onChange={(patch) => setTextStyle(key, patch)}
                  onSizeChange={(raw) => setTextStyleSize(key, raw)}
                />
              ))}
            </div>
          </TabPanel>

          <TabPanel uid={uid} tab="header" activeTab={activeTab}>
            <Section title="En-tête">
              <Switch
                label="Activer"
                role="switch"
                fullWidth
                checked={layout.header.enabled}
                onChange={(e) => setHeader({ enabled: e.target.checked })}
              />
              <Gallery
                label="Visuel"
                assets={assets}
                value={layout.header.logo}
                onPick={(logo) => setHeader({ logo })}
                onImport={() => setImporting("header")}
              />
              {layout.header.logo && (
                <Switch
                  label="Pleine largeur (bord à bord)"
                  role="switch"
                  fullWidth
                  checked={layout.header.fullBleed}
                  onChange={(e) => setHeader({ fullBleed: e.target.checked })}
                />
              )}
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
          </TabPanel>

          <TabPanel uid={uid} tab="footer" activeTab={activeTab}>
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
              <Gallery
                label="Visuel"
                assets={assets}
                value={layout.footer.logo}
                onPick={(logo) => setFooter({ logo })}
                onImport={() => setImporting("footer")}
              />
              {layout.footer.logo && (
                <Switch
                  label="Pleine largeur (bord à bord)"
                  role="switch"
                  fullWidth
                  checked={layout.footer.fullBleed}
                  onChange={(e) => setFooter({ fullBleed: e.target.checked })}
                />
              )}
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
          </TabPanel>

          <TabPanel uid={uid} tab="tables" activeTab={activeTab}>
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
          </TabPanel>
        </fieldset>

        <div className="le-panel__foot">
          <p className="le-hint">
            <Code size={16} aria-hidden="true" />
            <span>
              Chaque réglage réécrit le bloc <code>// dots:layout</code> du .typ ; le reste du code reste à la main.
            </span>
          </p>
        </div>
      </div>

      {importing && (
        <ImportDocumentModal
          target={importing}
          onClose={() => setImporting(null)}
          onFragment={(file) => {
            if (importing === "header") setHeader({ logo: file, fullBleed: true });
            else setFooter({ logo: file, fullBleed: true });
            onAssetsChanged?.();
          }}
        />
      )}

    </aside>
  );
}

function TabPanel({
  uid,
  tab,
  activeTab,
  children,
}: {
  uid: string;
  tab: LayoutTab;
  activeTab: LayoutTab;
  children: ReactNode;
}) {
  return (
    <div
      id={`${uid}-${tab}-panel`}
      role="tabpanel"
      aria-labelledby={`${uid}-${tab}-tab`}
      hidden={activeTab !== tab}
    >
      {children}
    </div>
  );
}

function TextStyleSection({
  id,
  label,
  style,
  open,
  onToggle,
  onChange,
  onSizeChange,
}: {
  id: string;
  label: string;
  style: LayoutConfig["textStyles"][TextStyleKey];
  open: boolean;
  onToggle: () => void;
  onChange: (patch: Partial<LayoutConfig["textStyles"][TextStyleKey]>) => void;
  onSizeChange: (raw: string) => void;
}) {
  return (
    <section className="le-style">
      <button
        type="button"
        className="le-style__toggle"
        aria-expanded={open}
        aria-controls={`${id}-body`}
        onClick={onToggle}
      >
        <span>{label}</span>
        {open ? <ChevronDown size={18} aria-hidden="true" /> : <ChevronRight size={18} aria-hidden="true" />}
      </button>
      {open && (
        <div id={`${id}-body`} className="le-style__body">
          <div className="le-style__row">
            <span className="le-style__label">Font</span>
            <Select
              label="Police"
              fullWidth
              clearable={false}
              options={FONTS}
              value={style.font}
              onChange={(e) => onChange({ font: String(e.target.value) })}
            />
          </div>
          <div className="le-style__row">
            <span className="le-style__label">Size</span>
            <Input
              label="Taille"
              type="number"
              min={6}
              max={72}
              step={0.5}
              fullWidth
              value={String(style.fontSize)}
              onChange={(e) => onSizeChange(e.target.value)}
            />
          </div>
          <div className="le-style__row">
            <span className="le-style__label">Color</span>
            <span className="le-style__color">
              <input
                aria-label={`Couleur ${label}`}
                type="color"
                value={style.color}
                onChange={(e) => onChange({ color: e.target.value })}
              />
              <span className="le-mono">{style.color.toUpperCase()}</span>
            </span>
          </div>
        </div>
      )}
    </section>
  );
}

/**
 * Visuels disponibles, en vignettes : les logos livrés et les fragments
 * découpés dans un PDF importé. La dernière tuile ouvre la fenêtre d'import,
 * second point d'entrée du parcours (le premier est la page des gabarits).
 */
function Gallery({
  label,
  assets,
  value,
  onPick,
  onImport,
}: {
  label: string;
  assets: string[];
  value: string | null;
  onPick: (file: string | null) => void;
  onImport: () => void;
}) {
  return (
    <div className="le-gallery">
      <Label>{label}</Label>
      <div className="le-gallery__grid">
        <button
          type="button"
          className={`le-thumb le-thumb--none${value ? "" : " le-thumb--on"}`}
          aria-pressed={!value}
          title="Aucun visuel"
          onClick={() => onPick(null)}
        >
          Aucun
        </button>
        {assets.map((file) => (
          <button
            key={file}
            type="button"
            className={`le-thumb${value === file ? " le-thumb--on" : ""}`}
            aria-pressed={value === file}
            title={file}
            onClick={() => onPick(file)}
          >
            <img src={assetUrl(file)} alt={file} loading="lazy" />
          </button>
        ))}
        <button type="button" className="le-thumb le-thumb--add" title="Importer un visuel" onClick={onImport}>
          <Upload size={16} aria-hidden="true" />
          <span className="le-sr">Importer un visuel</span>
        </button>
      </div>
      {value && <span className="le-gallery__name">{value}</span>}
    </div>
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
