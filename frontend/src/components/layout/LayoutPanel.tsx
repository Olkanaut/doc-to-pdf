import { useEffect, useId, useMemo, useState, type ReactNode } from "react";
import {
  Alert,
  Input,
  Label,
  Radio,
  RadioGroup,
  Select,
  Switch,
  TextArea,
  VariantType,
} from "@gouvfr-lasuite/ui-components";
import { ChevronDown, ChevronRight, Trash, Upload } from "@gouvfr-lasuite/ui-components/icons";
import {
  assetUrl,
  deleteTemplateAsset,
  type Align,
  type FooterContent,
  type HeaderContent,
  type LayoutConfig,
  type Numbering,
  type PageBandMode,
  type PaperSize,
  type TextStyleKey,
} from "../../api/client";
import { ImportDocumentModal } from "../templates/ImportDocumentModal";
import { TemplateNameField } from "./TemplateNameField";

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
const PAGE_BAND_MODES: Option[] = [
  { value: "all", label: "Toutes les pages" },
  { value: "except-first", label: "Pages suivantes uniquement" },
  { value: "first-only", label: "Première page uniquement" },
  { value: "different-first", label: "Première page différente" },
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
type TextSection = TextStyleKey | "table";
type BandSlot = "default" | "first";
type Importing = { kind: "header" | "footer"; slot: BandSlot };

interface Props {
  layout: LayoutConfig;
  templateName: string;
  isDefault?: boolean;
  /** Faux tant que le .typ n'a pas de bloc « dots:layout ». */
  managed: boolean;
  /** Fichiers de backend/templates/assets, proposés comme logo. */
  assets: string[];
  /** DOTS_ENABLE_ASSET_DELETE flag: shows the option to delete visuals. */
  canDeleteAssets?: boolean;
  /** Vrai pendant qu'une proposition de l'assistant est en attente. */
  disabled?: boolean;
  onChange: (next: LayoutConfig) => void;
  onTemplateNameChange: (name: string) => void;
  modeMenu: ReactNode;
  /** A visual was just imported or deleted: the assets list needs re-reading. */
  onAssetsChanged?: () => void;
}

export function LayoutPanel({
  layout,
  templateName,
  isDefault,
  managed,
  assets,
  canDeleteAssets,
  disabled,
  onChange,
  onTemplateNameChange,
  modeMenu,
  onAssetsChanged,
}: Props) {
  const uid = useId();
  // Section d'où la fenêtre d'import a été ouverte ; null tant qu'elle est fermée.
  const [importing, setImporting] = useState<Importing | null>(null);
  const [activeTab, setActiveTab] = useState<LayoutTab>("format");
  const [openTextSection, setOpenTextSection] = useState<TextSection | null>(null);
  const set = (patch: Partial<LayoutConfig>) => onChange({ ...layout, ...patch });
  const setHeader = (patch: Partial<LayoutConfig["header"]>) =>
    set({ header: { ...layout.header, ...patch } });
  const setFooter = (patch: Partial<LayoutConfig["footer"]>) =>
    set({ footer: { ...layout.footer, ...patch } });
  const setHeaderContent = (slot: BandSlot, patch: Partial<HeaderContent>) => {
    if (slot === "default") setHeader(patch);
    else setHeader({ first: { ...layout.header.first, ...patch } });
  };
  const setFooterContent = (slot: BandSlot, patch: Partial<FooterContent>) => {
    if (slot === "default") setFooter(patch);
    else setFooter({ first: { ...layout.footer.first, ...patch } });
  };
  /** The visual is shared: deleting it clears it from every slot that uses it. */
  const handleDeleteAsset = async (file: string) => {
    if (!window.confirm(`Supprimer ce visuel ? Il sera retiré de tous les gabarits qui l'utilisent.`)) return;
    try {
      await deleteTemplateAsset(file);
    } catch (e) {
      window.alert(e instanceof Error ? e.message : String(e));
      return;
    }
    set({
      header: {
        ...layout.header,
        logo: layout.header.logo === file ? null : layout.header.logo,
        first: { ...layout.header.first, logo: layout.header.first.logo === file ? null : layout.header.first.logo },
      },
      footer: {
        ...layout.footer,
        logo: layout.footer.logo === file ? null : layout.footer.logo,
        first: { ...layout.footer.first, logo: layout.footer.first.logo === file ? null : layout.footer.first.logo },
      },
    });
    onAssetsChanged?.();
  };
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
    if (hash === "tableaux") {
      setActiveTab("text");
      setOpenTextSection("table");
    }
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
        <TemplateNameField value={templateName} isDefault={isDefault} onChange={onTemplateNameChange} />
        {modeMenu}
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

          </TabPanel>

          <TabPanel uid={uid} tab="text" activeTab={activeTab}>
            <div className="le-text-styles" aria-label="Styles de texte">
              {TEXT_STYLE_SECTIONS.map(({ key, label }) => (
                <TextStyleSection
                  key={key}
                  id={`${uid}-text-${key}`}
                  label={label}
                  style={layout.textStyles[key]}
                  open={openTextSection === key}
                  onToggle={() => setOpenTextSection((current) => (current === key ? null : key))}
                  onChange={(patch) => setTextStyle(key, patch)}
                  onSizeChange={(raw) => setTextStyleSize(key, raw)}
                  lineHeight={key === "body" ? layout.lineHeight : undefined}
                  lineHeightOptions={key === "body" ? lineHeightOptions : undefined}
                  onLineHeightChange={key === "body" ? (value) => set({ lineHeight: value }) : undefined}
                />
              ))}
              <TableStyleSection
                id={`${uid}-text-table`}
                open={openTextSection === "table"}
                onToggle={() => setOpenTextSection((current) => (current === "table" ? null : "table"))}
                table={layout.table}
                onChange={setTable}
              />
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
              <Select
                label="Application"
                fullWidth
                clearable={false}
                options={PAGE_BAND_MODES}
                value={layout.header.mode}
                onChange={(e) => {
                  const mode = String(e.target.value) as PageBandMode;
                  setHeader({
                    mode,
                    ...(mode === "different-first" && layout.header.mode !== "different-first"
                      ? {
                          first: {
                            text: layout.header.text,
                            logo: layout.header.logo,
                            fullBleed: layout.header.fullBleed,
                            align: layout.header.align,
                            rule: layout.header.rule,
                          },
                        }
                      : {}),
                  });
                }}
              />
              {layout.header.mode === "different-first" ? (
                <>
                  <div className="le-group">
                    <Label>Première page</Label>
                    <HeaderFields
                      uid={`${uid}-header-first`}
                      assets={assets}
                      canDeleteAssets={canDeleteAssets}
                      onDeleteAsset={handleDeleteAsset}
                      value={layout.header.first}
                      onChange={(patch) => setHeaderContent("first", patch)}
                      onImport={() => setImporting({ kind: "header", slot: "first" })}
                    />
                  </div>
                  <div className="le-group">
                    <Label>Pages suivantes</Label>
                    <HeaderFields
                      uid={`${uid}-header-default`}
                      assets={assets}
                      canDeleteAssets={canDeleteAssets}
                      onDeleteAsset={handleDeleteAsset}
                      value={layout.header}
                      onChange={(patch) => setHeaderContent("default", patch)}
                      onImport={() => setImporting({ kind: "header", slot: "default" })}
                    />
                  </div>
                </>
              ) : (
                <HeaderFields
                  uid={`${uid}-header`}
                  assets={assets}
                  canDeleteAssets={canDeleteAssets}
                  onDeleteAsset={handleDeleteAsset}
                  value={layout.header}
                  onChange={(patch) => setHeaderContent("default", patch)}
                  onImport={() => setImporting({ kind: "header", slot: "default" })}
                />
              )}
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
              <Select
                label="Application"
                fullWidth
                clearable={false}
                options={PAGE_BAND_MODES}
                value={layout.footer.mode}
                onChange={(e) => {
                  const mode = String(e.target.value) as PageBandMode;
                  setFooter({
                    mode,
                    firstPage: mode !== "except-first",
                    ...(mode === "different-first" && layout.footer.mode !== "different-first"
                      ? {
                          first: {
                            text: layout.footer.text,
                            logo: layout.footer.logo,
                            fullBleed: layout.footer.fullBleed,
                            numbering: layout.footer.numbering,
                            align: layout.footer.align,
                            rule: layout.footer.rule,
                          },
                        }
                      : {}),
                  });
                }}
              />
              {layout.footer.mode === "different-first" ? (
                <>
                  <div className="le-group">
                    <Label>Première page</Label>
                    <FooterFields
                      uid={`${uid}-footer-first`}
                      assets={assets}
                      canDeleteAssets={canDeleteAssets}
                      onDeleteAsset={handleDeleteAsset}
                      value={layout.footer.first}
                      onChange={(patch) => setFooterContent("first", patch)}
                      onImport={() => setImporting({ kind: "footer", slot: "first" })}
                    />
                  </div>
                  <div className="le-group">
                    <Label>Pages suivantes</Label>
                    <FooterFields
                      uid={`${uid}-footer-default`}
                      assets={assets}
                      canDeleteAssets={canDeleteAssets}
                      onDeleteAsset={handleDeleteAsset}
                      value={layout.footer}
                      onChange={(patch) => setFooterContent("default", patch)}
                      onImport={() => setImporting({ kind: "footer", slot: "default" })}
                    />
                  </div>
                </>
              ) : (
                <FooterFields
                  uid={`${uid}-footer`}
                  assets={assets}
                  canDeleteAssets={canDeleteAssets}
                  onDeleteAsset={handleDeleteAsset}
                  value={layout.footer}
                  onChange={(patch) => setFooterContent("default", patch)}
                  onImport={() => setImporting({ kind: "footer", slot: "default" })}
                />
              )}
            </Section>
          </TabPanel>
        </fieldset>

      </div>

      {importing && (
        <ImportDocumentModal
          target={importing.kind}
          onClose={() => setImporting(null)}
          onFragment={(file) => {
            if (importing.kind === "header") setHeaderContent(importing.slot, { logo: file, fullBleed: true });
            else setFooterContent(importing.slot, { logo: file, fullBleed: true });
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
  lineHeight,
  lineHeightOptions,
  onLineHeightChange,
}: {
  id: string;
  label: string;
  style: LayoutConfig["textStyles"][TextStyleKey];
  open: boolean;
  onToggle: () => void;
  onChange: (patch: Partial<LayoutConfig["textStyles"][TextStyleKey]>) => void;
  onSizeChange: (raw: string) => void;
  lineHeight?: number;
  lineHeightOptions?: Option[];
  onLineHeightChange?: (value: number) => void;
}) {
  return (
    <section className="le-style">
      <SectionToggle open={open} controls={`${id}-body`} onToggle={onToggle}>
        {label}
      </SectionToggle>
      {open && (
        <div id={`${id}-body`} className="le-style__body">
          <StyleFieldRow label="Font">
            <Select
              label="Police"
              fullWidth
              clearable={false}
              options={FONTS}
              value={style.font}
              onChange={(e) => onChange({ font: String(e.target.value) })}
            />
          </StyleFieldRow>
          <StyleFieldRow label="Size">
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
          </StyleFieldRow>
          {lineHeight !== undefined && lineHeightOptions && onLineHeightChange && (
            <StyleFieldRow label="Interligne">
              <Select
                label="Interligne"
                fullWidth
                clearable={false}
                options={lineHeightOptions}
                value={String(lineHeight)}
                onChange={(e) => onLineHeightChange(Number(e.target.value))}
              />
            </StyleFieldRow>
          )}
          <StyleFieldRow label="Color">
            <span className="le-style__color">
              <input
                aria-label={`Couleur ${label}`}
                type="color"
                value={style.color}
                onChange={(e) => onChange({ color: e.target.value })}
              />
              <span className="le-mono">{style.color.toUpperCase()}</span>
            </span>
          </StyleFieldRow>
        </div>
      )}
    </section>
  );
}

function StyleFieldRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="le-style__row">
      <span className="le-style__label">{label}</span>
      {children}
    </div>
  );
}

function TableStyleSection({
  id,
  open,
  onToggle,
  table,
  onChange,
}: {
  id: string;
  open: boolean;
  onToggle: () => void;
  table: LayoutConfig["table"];
  onChange: (patch: Partial<LayoutConfig["table"]>) => void;
}) {
  return (
    <section id="tableaux" className="le-style">
      <SectionToggle open={open} controls={`${id}-body`} onToggle={onToggle}>
        Tableaux
      </SectionToggle>
      {open && (
        <div id={`${id}-body`} className="le-style__body">
          <StyleFieldRow label="Filets">
            <Select
              label="Filets"
              fullWidth
              clearable={false}
              options={TABLE_STROKES}
              value={table.stroke}
              onChange={(e) => onChange({ stroke: String(e.target.value) as LayoutConfig["table"]["stroke"] })}
            />
          </StyleFieldRow>
          <StyleFieldRow label="Fond">
            <Select
              label="Fond de l'en-tête"
              fullWidth
              clearable={false}
              options={TABLE_HEADER_FILLS}
              value={table.headerFill}
              onChange={(e) => onChange({ headerFill: String(e.target.value) as LayoutConfig["table"]["headerFill"] })}
            />
          </StyleFieldRow>
          <StyleFieldRow label="Alternance">
            <Switch
              label="Lignes alternées"
              role="switch"
              fullWidth
              checked={table.zebra}
              onChange={(e) => onChange({ zebra: e.target.checked })}
            />
          </StyleFieldRow>
          <StyleFieldRow label="Taille">
            <Select
              label="Taille du texte"
              fullWidth
              clearable={false}
              options={TABLE_FONT_SIZES}
              value={table.fontSize}
              onChange={(e) => onChange({ fontSize: String(e.target.value) as LayoutConfig["table"]["fontSize"] })}
            />
          </StyleFieldRow>
        </div>
      )}
    </section>
  );
}

function HeaderFields({
  uid,
  assets,
  canDeleteAssets,
  onDeleteAsset,
  value,
  onChange,
  onImport,
}: {
  uid: string;
  assets: string[];
  canDeleteAssets?: boolean;
  onDeleteAsset: (file: string) => void;
  value: HeaderContent;
  onChange: (patch: Partial<HeaderContent>) => void;
  onImport: () => void;
}) {
  return (
    <>
      <Gallery
        label="Visuel"
        assets={assets}
        canDeleteAssets={canDeleteAssets}
        onDeleteAsset={onDeleteAsset}
        value={value.logo}
        onPick={(logo) => onChange({ logo })}
        onImport={onImport}
      />
      {value.logo && (
        <Switch
          label="Pleine largeur (bord à bord)"
          role="switch"
          fullWidth
          checked={value.fullBleed}
          onChange={(e) => onChange({ fullBleed: e.target.checked })}
        />
      )}
      <TextArea
        label="Texte"
        fullWidth
        rows={2}
        value={value.text}
        onChange={(e) => onChange({ text: e.target.value })}
      />
      <AlignRadios
        name={`${uid}-align`}
        groupLabel="Alignement de l'en-tête"
        value={value.align}
        onChange={(align) => onChange({ align })}
      />
      <Switch
        label="Filet"
        role="switch"
        fullWidth
        checked={value.rule}
        onChange={(e) => onChange({ rule: e.target.checked })}
      />
    </>
  );
}

function FooterFields({
  uid,
  assets,
  canDeleteAssets,
  onDeleteAsset,
  value,
  onChange,
  onImport,
}: {
  uid: string;
  assets: string[];
  canDeleteAssets?: boolean;
  onDeleteAsset: (file: string) => void;
  value: FooterContent;
  onChange: (patch: Partial<FooterContent>) => void;
  onImport: () => void;
}) {
  return (
    <>
      <TextArea
        label="Texte"
        fullWidth
        rows={2}
        value={value.text}
        onChange={(e) => onChange({ text: e.target.value })}
      />
      <Gallery
        label="Visuel"
        assets={assets}
        canDeleteAssets={canDeleteAssets}
        onDeleteAsset={onDeleteAsset}
        value={value.logo}
        onPick={(logo) => onChange({ logo })}
        onImport={onImport}
      />
      {value.logo && (
        <Switch
          label="Pleine largeur (bord à bord)"
          role="switch"
          fullWidth
          checked={value.fullBleed}
          onChange={(e) => onChange({ fullBleed: e.target.checked })}
        />
      )}
      <Select
        label="Numérotation"
        fullWidth
        clearable={false}
        options={NUMBERINGS}
        value={value.numbering}
        onChange={(e) => onChange({ numbering: String(e.target.value) as Numbering })}
      />
      <AlignRadios
        name={`${uid}-align`}
        groupLabel="Alignement du pied de page"
        value={value.align}
        onChange={(align) => onChange({ align })}
      />
      <Switch
        label="Filet"
        role="switch"
        fullWidth
        checked={value.rule}
        onChange={(e) => onChange({ rule: e.target.checked })}
      />
    </>
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
  canDeleteAssets,
  onDeleteAsset,
  value,
  onPick,
  onImport,
}: {
  label: string;
  assets: string[];
  canDeleteAssets?: boolean;
  onDeleteAsset?: (file: string) => void;
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
          <div key={file} className="le-thumb-wrap">
            <button
              type="button"
              className={`le-thumb${value === file ? " le-thumb--on" : ""}`}
              aria-pressed={value === file}
              title={file}
              onClick={() => onPick(file)}
            >
              <img src={assetUrl(file)} alt={file} loading="lazy" />
            </button>
            {canDeleteAssets && (
              <button
                type="button"
                className="le-thumb-delete"
                title="Supprimer ce visuel"
                aria-label={`Supprimer le visuel ${file}`}
                onClick={() => onDeleteAsset?.(file)}
              >
                <Trash size={12} aria-hidden="true" />
              </button>
            )}
          </div>
        ))}
        <button type="button" className="le-thumb le-thumb--add" title="Importer un visuel" onClick={onImport}>
          <Upload size={16} aria-hidden="true" />
          <span className="le-sr">Importer un visuel</span>
        </button>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <section className="le-section">
      <SectionToggle open={open} onToggle={() => setOpen(!open)}>
        {title}
      </SectionToggle>
      {open && <div className="le-section__body">{children}</div>}
    </section>
  );
}

function SectionToggle({
  open,
  controls,
  onToggle,
  children,
}: {
  open: boolean;
  controls?: string;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className="le-section__toggle"
      aria-expanded={open}
      aria-controls={controls}
      onClick={onToggle}
    >
      <span>{children}</span>
      {open ? <ChevronDown size={18} aria-hidden="true" /> : <ChevronRight size={18} aria-hidden="true" />}
    </button>
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
