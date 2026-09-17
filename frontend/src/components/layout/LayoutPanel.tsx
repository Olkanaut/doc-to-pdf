import { useEffect, useId, useMemo, useState, type ReactNode } from "react";
import {
  Alert,
  Input,
  Label,
  Radio,
  RadioGroup,
  Select,
  Switch,
  VariantType,
} from "@gouvfr-lasuite/ui-components";
import { ChevronDown, ChevronRight } from "@gouvfr-lasuite/ui-components/icons";
import {
  deleteTemplateAsset,
  uploadTemplateAsset,
  type Block,
  type LayoutConfig,
  type PaperSize,
  type TextStyleKey,
} from "../../api/client";
import { ImportDocumentModal } from "../templates/ImportDocumentModal";
import { SectionBuilder } from "./SectionBuilder";
import { TemplateNameField } from "./TemplateNameField";

type Option = { value: string; label: string };

/** Même liste que backend/src/layout/layoutConfig.ts (FONTS) : hors liste, le backend retombe sur Marianne. */
const FONTS: Option[] = [
  "Marianne",
  "Arial",
  "Helvetica",
  "Libertinus Serif",
  "New Computer Modern",
  "DejaVu Sans Mono",
].map((f) => ({ value: f, label: f }));
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
const RADIO_ROW = {
  flexDirection: "row",
  flexWrap: "wrap",
  gap: "0 0.75rem",
} as const;
type LayoutTab = (typeof TABS)[number]["id"];
type TextSection = TextStyleKey | "table";
type Importing = { kind: "header" | "footer"; index: number };

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
  /** The visual is shared: deleting it clears it from every block that uses it. */
  const handleDeleteAsset = async (file: string) => {
    if (
      !window.confirm(
        `Supprimer ce visuel ? Il sera retiré de tous les templates qui l'utilisent.`,
      )
    )
      return;
    try {
      await deleteTemplateAsset(file);
    } catch (e) {
      window.alert(e instanceof Error ? e.message : String(e));
      return;
    }
    const clear = (b: Block): Block => (b.image === file ? { ...b, image: null } : b);
    set({
      header: { ...layout.header, blocks: layout.header.blocks.map(clear) },
      footer: { ...layout.footer, blocks: layout.footer.blocks.map(clear) },
    });
    onAssetsChanged?.();
  };
  /** Dépose un fichier local comme image du bloc d'indice donné, sans passer par le recadrage PDF/DOCX. */
  const handleUploadImage = async (kind: "header" | "footer", index: number, file: File) => {
    let uploaded: string;
    try {
      uploaded = (await uploadTemplateAsset(file)).file;
    } catch (e) {
      window.alert(e instanceof Error ? e.message : String(e));
      return;
    }
    const band = layout[kind];
    const blocks = band.blocks.map((b, i) => (i === index ? { ...b, image: uploaded } : b));
    set({ [kind]: { ...band, blocks } } as Partial<LayoutConfig>);
    onAssetsChanged?.();
  };
  const setTable = (patch: Partial<LayoutConfig["table"]>) =>
    set({ table: { ...layout.table, ...patch } });
  const setTextStyle = (
    key: TextStyleKey,
    patch: Partial<LayoutConfig["textStyles"][TextStyleKey]>,
  ) => {
    const nextStyle = { ...layout.textStyles[key], ...patch };
    const next: Partial<LayoutConfig> = {
      textStyles: { ...layout.textStyles, [key]: nextStyle },
    };
    if (key === "body") {
      if (patch.font) next.font = patch.font;
      if (typeof patch.fontSize === "number") next.fontSize = patch.fontSize;
    }
    if (key === "h1" && patch.color)
      next.headings = { ...layout.headings, color: patch.color };
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
    set({
      margins: { ...layout.margins, [side]: Math.min(80, Math.max(0, n)) },
    });
  };
  // Le navigateur traite `#tableaux` avant le rendu React : on ouvre l'onglet puis on recale le défilement.
  useEffect(() => {
    const hash = window.location.hash.slice(1);
    if (hash === "tableaux") {
      setActiveTab("text");
      setOpenTextSection("table");
    }
    if (hash)
      window.setTimeout(
        () => document.getElementById(hash)?.scrollIntoView(),
        0,
      );
  }, []);

  const lineHeightOptions = useMemo<Option[]>(() => {
    const list = LINE_HEIGHTS.map(([v, l]) => ({ value: String(v), label: l }));
    return LINE_HEIGHTS.some(([v]) => v === layout.lineHeight)
      ? list
      : [
          {
            value: String(layout.lineHeight),
            label: String(layout.lineHeight).replace(".", ","),
          },
          ...list,
        ];
  }, [layout.lineHeight]);

  return (
    <aside className="le-panel" aria-label="Réglages de mise en page">
      <div className="le-panel__top">
        <TemplateNameField
          value={templateName}
          isDefault={isDefault}
          onChange={onTemplateNameChange}
        />
        {modeMenu}
      </div>

      <nav
        className="le-panel__tabs"
        aria-label="Réglages de la template"
        role="tablist"
      >
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
              Cette template n'a pas encore de bloc de mise en page : le premier
              réglage l'ajoute avant <code>#include "body.typ"</code>.
            </span>
          </Alert>
        )}
        {disabled && (
          <Alert type={VariantType.WARNING} className="le-panel__notice">
            <span>
              Une proposition de l'assistant est en attente : appliquez-la ou
              ignorez-la pour reprendre les réglages.
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
                onChange={(e) =>
                  set({ paper: String(e.target.value) as PaperSize })
                }
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
                  onToggle={() =>
                    setOpenTextSection((current) =>
                      current === key ? null : key,
                    )
                  }
                  onChange={(patch) => setTextStyle(key, patch)}
                  onSizeChange={(raw) => setTextStyleSize(key, raw)}
                  lineHeight={key === "body" ? layout.lineHeight : undefined}
                  lineHeightOptions={
                    key === "body" ? lineHeightOptions : undefined
                  }
                  onLineHeightChange={
                    key === "body"
                      ? (value) => set({ lineHeight: value })
                      : undefined
                  }
                />
              ))}
              <TableStyleSection
                id={`${uid}-text-table`}
                open={openTextSection === "table"}
                onToggle={() =>
                  setOpenTextSection((current) =>
                    current === "table" ? null : "table",
                  )
                }
                table={layout.table}
                onChange={setTable}
              />
            </div>
          </TabPanel>

          <TabPanel uid={uid} tab="header" activeTab={activeTab}>
            <div className="le-tab-body">
              <SectionBuilder
                kind="header"
                band={layout.header}
                ruleColor={layout.headings.color}
                onChange={(band) => set({ header: band })}
                onPickImage={(index) => setImporting({ kind: "header", index })}
                onUploadImage={(index, file) => void handleUploadImage("header", index, file)}
                assets={assets}
                canDeleteAssets={canDeleteAssets}
                onDeleteAsset={handleDeleteAsset}
              />
            </div>
          </TabPanel>

          <TabPanel uid={uid} tab="footer" activeTab={activeTab}>
            <div className="le-tab-body">
              <SectionBuilder
                kind="footer"
                band={layout.footer}
                ruleColor={layout.headings.color}
                onChange={(band) => set({ footer: band as LayoutConfig["footer"] })}
                onPickImage={(index) => setImporting({ kind: "footer", index })}
                onUploadImage={(index, file) => void handleUploadImage("footer", index, file)}
                assets={assets}
                canDeleteAssets={canDeleteAssets}
                onDeleteAsset={handleDeleteAsset}
              />
            </div>
          </TabPanel>
        </fieldset>
      </div>

      {importing && (
        <ImportDocumentModal
          target={importing.kind}
          onClose={() => setImporting(null)}
          onFragment={(file) => {
            // A strip cropped out of a document spans the page: width 0 is edge to edge.
            const band = layout[importing.kind];
            const blocks = band.blocks.map((b, i) =>
              i === importing.index ? { ...b, image: file, imageHeightMm: 0 } : b,
            );
            set({ [importing.kind]: { ...band, blocks } } as Partial<LayoutConfig>);
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
          {lineHeight !== undefined &&
            lineHeightOptions &&
            onLineHeightChange && (
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

function StyleFieldRow({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
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
              onChange={(e) =>
                onChange({
                  stroke: String(
                    e.target.value,
                  ) as LayoutConfig["table"]["stroke"],
                })
              }
            />
          </StyleFieldRow>
          <StyleFieldRow label="Fond">
            <Select
              label="Fond de l'en-tête"
              fullWidth
              clearable={false}
              options={TABLE_HEADER_FILLS}
              value={table.headerFill}
              onChange={(e) =>
                onChange({
                  headerFill: String(
                    e.target.value,
                  ) as LayoutConfig["table"]["headerFill"],
                })
              }
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
              onChange={(e) =>
                onChange({
                  fontSize: String(
                    e.target.value,
                  ) as LayoutConfig["table"]["fontSize"],
                })
              }
            />
          </StyleFieldRow>
        </div>
      )}
    </section>
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
      {open ? (
        <ChevronDown size={18} aria-hidden="true" />
      ) : (
        <ChevronRight size={18} aria-hidden="true" />
      )}
    </button>
  );
}

