/**
 * Réglages de mise en page pilotés par /templates/:id/layout.
 * Le même type existe côté frontend (frontend/src/api/client.ts, LayoutConfig) :
 * toute modification ici se reporte là-bas.
 */

export type PaperSize = "a4" | "a5" | "us-letter";
export type Align = "left" | "center" | "right";
export type Numbering = "none" | "n" | "n-of-total" | "page-n-of-total";

export interface LayoutConfig {
  paper: PaperSize;
  orientation: "portrait" | "landscape";
  /** Millimètres. */
  margins: { top: number; bottom: number; left: number; right: number };
  font: string;
  /** Points. */
  fontSize: number;
  lineHeight: number;
  header: { enabled: boolean; text: string; logo: string | null; align: Align; rule: boolean };
  footer: {
    enabled: boolean;
    text: string;
    numbering: Numbering;
    align: Align;
    firstPage: boolean;
    rule: boolean;
  };
  headings: { scale: "compact" | "normal" | "large"; color: string };
  /** Allure des tableaux ; leur structure (colonnes, fusions, contenu) vient du document. */
  table: {
    stroke: "none" | "light" | "full";
    headerFill: "none" | "grey" | "brand";
    zebra: boolean;
    fontSize: "inherit" | "small";
  };
}

/**
 * Polices proposées. « Marianne » n'est pas installée sur toutes les machines :
 * le Typst généré donne toujours une chaîne de repli (voir layoutTypst.ts).
 * Libertinus Serif, New Computer Modern et DejaVu Sans Mono sont embarquées dans typst.
 */
export const FONTS = [
  "Marianne",
  "Arial",
  "Helvetica",
  "Libertinus Serif",
  "New Computer Modern",
  "DejaVu Sans Mono",
] as const;

export const PAPERS: readonly PaperSize[] = ["a4", "a5", "us-letter"];
export const ALIGNS: readonly Align[] = ["left", "center", "right"];
export const NUMBERINGS: readonly Numbering[] = ["none", "n", "n-of-total", "page-n-of-total"];
export const HEADING_SCALES = ["compact", "normal", "large"] as const;
export const TABLE_STROKES = ["none", "light", "full"] as const;
export const TABLE_HEADER_FILLS = ["none", "grey", "brand"] as const;
export const TABLE_FONT_SIZES = ["inherit", "small"] as const;

export function defaultLayout(): LayoutConfig {
  return {
    paper: "a4",
    orientation: "portrait",
    margins: { top: 25, bottom: 20, left: 20, right: 20 },
    font: "Marianne",
    fontSize: 11,
    lineHeight: 1.2,
    header: { enabled: true, text: "", logo: null, align: "left", rule: true },
    footer: {
      enabled: true,
      text: "",
      numbering: "n-of-total",
      align: "right",
      firstPage: true,
      rule: true,
    },
    headings: { scale: "normal", color: "#0659c5" },
    table: { stroke: "light", headerFill: "grey", zebra: false, fontSize: "inherit" },
  };
}

function num(v: unknown, fallback: number, min: number, max: number): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}
function oneOf<T extends string>(v: unknown, allowed: readonly T[], fallback: T): T {
  return (allowed as readonly string[]).includes(v as string) ? (v as T) : fallback;
}
function str(v: unknown, fallback: string, max = 200): string {
  return typeof v === "string" ? v.slice(0, max) : fallback;
}
function bool(v: unknown, fallback: boolean): boolean {
  return typeof v === "boolean" ? v : fallback;
}

/**
 * Frontière de confiance : tout ce qui entre par l'API passe ici. Valeurs hors
 * liste ou hors bornes → valeur par défaut, jamais d'erreur. Le texte libre est
 * borné ; son échappement Typst se fait à la génération.
 */
export function sanitizeLayout(input: unknown): LayoutConfig {
  const d = defaultLayout();
  const o = (input && typeof input === "object" ? input : {}) as Record<string, any>;
  const m = (o.margins ?? {}) as Record<string, unknown>;
  const h = (o.header ?? {}) as Record<string, unknown>;
  const f = (o.footer ?? {}) as Record<string, unknown>;
  const t = (o.headings ?? {}) as Record<string, unknown>;
  const tb = (o.table ?? {}) as Record<string, unknown>;
  const logo = typeof h.logo === "string" && /^[\w.-]+\.(png|jpe?g|svg)$/i.test(h.logo) ? h.logo : null;
  const color = typeof t.color === "string" && /^#[0-9a-f]{6}$/i.test(t.color) ? t.color : d.headings.color;
  return {
    paper: oneOf(o.paper, PAPERS, d.paper),
    orientation: oneOf(o.orientation, ["portrait", "landscape"] as const, d.orientation),
    margins: {
      top: num(m.top, d.margins.top, 0, 80),
      bottom: num(m.bottom, d.margins.bottom, 0, 80),
      left: num(m.left, d.margins.left, 0, 80),
      right: num(m.right, d.margins.right, 0, 80),
    },
    font: oneOf(o.font, FONTS, d.font),
    fontSize: num(o.fontSize, d.fontSize, 8, 16),
    lineHeight: num(o.lineHeight, d.lineHeight, 1, 2),
    header: {
      enabled: bool(h.enabled, d.header.enabled),
      text: str(h.text, d.header.text),
      logo,
      align: oneOf(h.align, ALIGNS, d.header.align),
      rule: bool(h.rule, d.header.rule),
    },
    footer: {
      enabled: bool(f.enabled, d.footer.enabled),
      text: str(f.text, d.footer.text),
      numbering: oneOf(f.numbering, NUMBERINGS, d.footer.numbering),
      align: oneOf(f.align, ALIGNS, d.footer.align),
      firstPage: bool(f.firstPage, d.footer.firstPage),
      rule: bool(f.rule, d.footer.rule),
    },
    headings: { scale: oneOf(t.scale, HEADING_SCALES, d.headings.scale), color },
    table: {
      stroke: oneOf(tb.stroke, TABLE_STROKES, d.table.stroke),
      headerFill: oneOf(tb.headerFill, TABLE_HEADER_FILLS, d.table.headerFill),
      zebra: bool(tb.zebra, d.table.zebra),
      fontSize: oneOf(tb.fontSize, TABLE_FONT_SIZES, d.table.fontSize),
    },
  };
}
