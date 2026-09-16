import { useEffect, useState, type ReactNode } from "react";
import type { Align, LayoutConfig, Numbering, PaperSize } from "../../api/client";
import { IconChevronDown, IconChevronRight, IconCode } from "../shell/icons";

/** Même liste que backend/src/layout/layoutConfig.ts (FONTS) : hors liste, le backend retombe sur Marianne. */
const FONTS = ["Marianne", "Arial", "Helvetica", "Libertinus Serif", "New Computer Modern", "DejaVu Sans Mono"];
const FONT_SIZES = [8, 9, 10, 11, 12, 13, 14, 15, 16];
const LINE_HEIGHTS: [number, string][] = [
  [1, "1,0"],
  [1.15, "1,15"],
  [1.2, "1,2"],
  [1.5, "1,5"],
  [2, "2,0"],
];
const PAPERS: [PaperSize, string][] = [
  ["a4", "A4 — 210 × 297 mm"],
  ["a5", "A5 — 148 × 210 mm"],
  ["us-letter", "Lettre US — 216 × 279 mm"],
];
const ALIGNS: [Align, string][] = [
  ["left", "Gauche"],
  ["center", "Centre"],
  ["right", "Droite"],
];
const NUMBERINGS: [Numbering, string][] = [
  ["none", "Aucune"],
  ["n", "1"],
  ["n-of-total", "1 / N"],
  ["page-n-of-total", "Page 1 / N"],
];
/* Tableaux : mêmes listes que backend/src/layout/layoutConfig.ts (TABLE_*). */
const TABLE_STROKES: [LayoutConfig["table"]["stroke"], string][] = [
  ["none", "Aucun"],
  ["light", "Fins"],
  ["full", "Complets"],
];
const TABLE_HEADER_FILLS: [LayoutConfig["table"]["headerFill"], string][] = [
  ["none", "Aucun"],
  ["grey", "Gris"],
  ["brand", "Couleur des titres"],
];
const TABLE_FONT_SIZES: [LayoutConfig["table"]["fontSize"], string][] = [
  ["inherit", "Normale"],
  ["small", "Réduite"],
];

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

  return (
    <aside className="le-panel" aria-label="Réglages de mise en page">
      {!managed && (
        <div className="dots-notice le-panel__notice">
          <span>
            Ce gabarit n'a pas encore de bloc de mise en page : le premier réglage l'ajoute avant{" "}
            <code>#include "body.typ"</code>.
          </span>
        </div>
      )}
      {disabled && (
        <div className="dots-notice le-panel__notice">
          Une proposition de l'assistant est en attente : appliquez-la ou ignorez-la pour reprendre les réglages.
        </div>
      )}
      <fieldset disabled={disabled}>
        <Section title="Page">
          <label className="dots-field">
            <span>Format</span>
            <select value={layout.paper} onChange={(e) => set({ paper: e.target.value as PaperSize })}>
              {PAPERS.map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </label>
          <div className="dots-field">
            <span>Orientation</span>
            <Segmented
              label="Orientation"
              value={layout.orientation}
              options={[["portrait", "Portrait"], ["landscape", "Paysage"]]}
              onChange={(v) => set({ orientation: v })}
            />
          </div>
          <div className="dots-field">
            <span>Marges (mm)</span>
            <div className="dots-grid-4">
              {(
                [
                  ["top", "Haut"],
                  ["bottom", "Bas"],
                  ["left", "Gauche"],
                  ["right", "Droite"],
                ] as const
              ).map(([side, label]) => (
                <label key={side} className="dots-field">
                  <span>{label}</span>
                  <input
                    type="number"
                    min={0}
                    max={80}
                    value={layout.margins[side]}
                    onChange={(e) => setMargin(side, e.target.value)}
                  />
                </label>
              ))}
            </div>
          </div>
        </Section>

        <Section title="Typographie">
          <label className="dots-field">
            <span>Police</span>
            <select value={layout.font} onChange={(e) => set({ font: e.target.value })}>
              {FONTS.map((f) => (
                <option key={f} value={f}>{f}</option>
              ))}
            </select>
            {/* Repli de layoutTypst.ts (FALLBACK_FONTS) : l'aperçu ne remonte pas les avertissements typst. */}
            <span className="dots-muted">
              Si la police n'est pas installée sur le serveur, Arial la remplace (Libertinus Serif à défaut).
            </span>
          </label>
          <div className="dots-grid-2">
            <label className="dots-field">
              <span>Taille</span>
              <select value={layout.fontSize} onChange={(e) => set({ fontSize: Number(e.target.value) })}>
                {/* Valeur hors liste (écrite par l'assistant, ex. 10.5) : affichée plutôt qu'un select vide. */}
                {!FONT_SIZES.includes(layout.fontSize) && <option value={layout.fontSize}>{layout.fontSize} pt</option>}
                {FONT_SIZES.map((s) => (
                  <option key={s} value={s}>{s} pt</option>
                ))}
              </select>
            </label>
            <label className="dots-field">
              <span>Interligne</span>
              <select value={layout.lineHeight} onChange={(e) => set({ lineHeight: Number(e.target.value) })}>
                {!LINE_HEIGHTS.some(([v]) => v === layout.lineHeight) && (
                  <option value={layout.lineHeight}>{String(layout.lineHeight).replace(".", ",")}</option>
                )}
                {LINE_HEIGHTS.map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </label>
          </div>
        </Section>

        <Section title="En-tête">
          <Switch label="Activer" checked={layout.header.enabled} onChange={(v) => setHeader({ enabled: v })} />
          <label className="dots-field">
            <span>Logo</span>
            <select
              value={layout.header.logo ?? ""}
              onChange={(e) => setHeader({ logo: e.target.value || null })}
            >
              <option value="">Aucun</option>
              {assets.map((f) => (
                <option key={f} value={f}>{f}</option>
              ))}
            </select>
          </label>
          <label className="dots-field">
            <span>Texte</span>
            <textarea className="dots-textarea--text" rows={2} value={layout.header.text} onChange={(e) => setHeader({ text: e.target.value })} />
          </label>
          <div className="dots-field">
            <span>Alignement</span>
            <Segmented
              label="Alignement de l'en-tête"
              value={layout.header.align}
              options={ALIGNS}
              onChange={(v) => setHeader({ align: v })}
            />
          </div>
          <Switch label="Filet" checked={layout.header.rule} onChange={(v) => setHeader({ rule: v })} />
        </Section>

        <Section title="Pied de page">
          <Switch label="Activer" checked={layout.footer.enabled} onChange={(v) => setFooter({ enabled: v })} />
          <label className="dots-field">
            <span>Texte</span>
            <textarea className="dots-textarea--text" rows={2} value={layout.footer.text} onChange={(e) => setFooter({ text: e.target.value })} />
          </label>
          <label className="dots-field">
            <span>Numérotation</span>
            <select
              value={layout.footer.numbering}
              onChange={(e) => setFooter({ numbering: e.target.value as Numbering })}
            >
              {NUMBERINGS.map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </label>
          <div className="dots-field">
            <span>Alignement</span>
            <Segmented
              label="Alignement du pied de page"
              value={layout.footer.align}
              options={ALIGNS}
              onChange={(v) => setFooter({ align: v })}
            />
          </div>
          <Switch
            label="Numéroter la première page"
            checked={layout.footer.firstPage}
            onChange={(v) => setFooter({ firstPage: v })}
          />
          <Switch label="Filet" checked={layout.footer.rule} onChange={(v) => setFooter({ rule: v })} />
        </Section>

        <Section title="Titres">
          <label className="dots-field">
            <span>Échelle</span>
            <select
              value={layout.headings.scale}
              onChange={(e) =>
                set({ headings: { ...layout.headings, scale: e.target.value as LayoutConfig["headings"]["scale"] } })
              }
            >
              <option value="compact">Compacte</option>
              <option value="normal">Normale</option>
              <option value="large">Grande</option>
            </select>
          </label>
          <label className="dots-field">
            <span>Couleur</span>
            <span className="le-color">
              <input
                type="color"
                value={layout.headings.color}
                onChange={(e) => set({ headings: { ...layout.headings, color: e.target.value } })}
              />
              <span className="dots-mono">{layout.headings.color}</span>
            </span>
          </label>
        </Section>

        {/* Le gabarit règle l'allure des tableaux ; leurs colonnes et fusions viennent du document. */}
        <Section id="tableaux" title="Tableaux">
          <label className="dots-field">
            <span>Filets</span>
            <select
              value={layout.table.stroke}
              onChange={(e) => setTable({ stroke: e.target.value as LayoutConfig["table"]["stroke"] })}
            >
              {TABLE_STROKES.map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </label>
          <label className="dots-field">
            <span>Fond de l'en-tête</span>
            <select
              value={layout.table.headerFill}
              onChange={(e) => setTable({ headerFill: e.target.value as LayoutConfig["table"]["headerFill"] })}
            >
              {TABLE_HEADER_FILLS.map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </label>
          <Switch label="Lignes alternées" checked={layout.table.zebra} onChange={(v) => setTable({ zebra: v })} />
          <label className="dots-field">
            <span>Taille du texte</span>
            <select
              value={layout.table.fontSize}
              onChange={(e) => setTable({ fontSize: e.target.value as LayoutConfig["table"]["fontSize"] })}
            >
              {TABLE_FONT_SIZES.map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </label>
        </Section>
      </fieldset>

      <div className="le-panel__foot">
        <p className="dots-muted">
          <IconCode size={16} />
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
      <button
        type="button"
        className="le-section__toggle"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        {title}
        {open ? <IconChevronDown size={18} /> : <IconChevronRight size={18} />}
      </button>
      {open && <div className="le-section__body">{children}</div>}
    </section>
  );
}

function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly (readonly [T, string])[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="dots-segmented" role="group" aria-label={label}>
      {options.map(([v, l]) => (
        <button key={v} type="button" aria-pressed={v === value} onClick={() => onChange(v)}>
          {l}
        </button>
      ))}
    </div>
  );
}

function Switch({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="le-switch">
      <span>{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        className="dots-toggle"
        onClick={() => onChange(!checked)}
      />
    </div>
  );
}
