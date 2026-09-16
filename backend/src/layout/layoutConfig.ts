/**
 * Réglages de mise en page pilotés par /templates/:id/layout.
 * Le même type existe côté frontend (frontend/src/api/client.ts, LayoutConfig) :
 * toute modification ici se reporte là-bas.
 */

export type PaperSize = "a4" | "a5" | "us-letter";
export type Align = "left" | "center" | "right";
export type Numbering = "none" | "n" | "n-of-total" | "page-n-of-total";
export type TextStyleKey = "body" | "h1" | "h2" | "h3";

export interface TextStyle {
  font: string;
  /** Points. */
  fontSize: number;
  color: string;
}

export interface LayoutConfig {
  paper: PaperSize;
  orientation: "portrait" | "landscape";
  /** Millimètres. */
  margins: { top: number; bottom: number; left: number; right: number };
  font: string;
  /** Points. */
  fontSize: number;
  lineHeight: number;
  /** Styles typographiques de base, prêts pour le futur onglet Texte. */
  textStyles: Record<TextStyleKey, TextStyle>;
  /**
   * `logo` est un fichier de backend/templates/assets. `fullBleed` le pose
   * bord à bord sur toute la largeur de la page (bandeau d'en-tête repris d'un
   * PDF) au lieu de l'aligner dans la marge ; la marge correspondante doit
   * alors être au moins aussi haute que l'image rendue, sinon Typst la rogne.
   */
  header: {
    enabled: boolean;
    text: string;
    logo: string | null;
    fullBleed: boolean;
    align: Align;
    rule: boolean;
  };
  footer: {
    enabled: boolean;
    text: string;
    logo: string | null;
    fullBleed: boolean;
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
/** Tailles des titres de niveau 1 à 3, en proportion de la taille du texte courant. */
export const HEADING_SIZE_FACTORS: Record<LayoutConfig["headings"]["scale"], readonly [number, number, number]> = {
  compact: [1.3, 1.15, 1.05],
  normal: [1.6, 1.3, 1.1],
  large: [1.9, 1.5, 1.2],
};
export const TABLE_STROKES = ["none", "light", "full"] as const;
export const TABLE_HEADER_FILLS = ["none", "grey", "brand"] as const;
export const TABLE_FONT_SIZES = ["inherit", "small"] as const;

/**
 * Hauteur à laquelle un logo d'en-tête est posé quand il n'est pas bord à bord
 * (layoutTypst.ts). La marge du côté concerné doit la loger, sinon le logo
 * mord sur le corps du texte : Word place son en-tête dans une bande à part,
 * Typst le pose dans la marge.
 */
export const INLINE_LOGO_HEIGHT_MM = 12;

function roundPt(n: number): number {
  return Math.round(n * 10) / 10;
}

function textStylesFromLegacy(
  font: string,
  fontSize: number,
  headings: LayoutConfig["headings"],
): Record<TextStyleKey, TextStyle> {
  const [h1, h2, h3] = HEADING_SIZE_FACTORS[headings.scale];
  return {
    body: { font, fontSize, color: "#000000" },
    h1: { font, fontSize: roundPt(fontSize * h1), color: headings.color },
    h2: { font, fontSize: roundPt(fontSize * h2), color: headings.color },
    h3: { font, fontSize: roundPt(fontSize * h3), color: headings.color },
  };
}

export function defaultLayout(): LayoutConfig {
  const font = "Marianne";
  const fontSize = 11;
  const headings: LayoutConfig["headings"] = { scale: "normal", color: "#0659c5" };
  return {
    paper: "a4",
    orientation: "portrait",
    margins: { top: 25, bottom: 20, left: 20, right: 20 },
    font,
    fontSize,
    lineHeight: 1.2,
    textStyles: textStylesFromLegacy(font, fontSize, headings),
    header: { enabled: true, text: "", logo: null, fullBleed: false, align: "left", rule: true },
    footer: {
      enabled: true,
      text: "",
      logo: null,
      fullBleed: false,
      numbering: "n-of-total",
      align: "right",
      firstPage: true,
      rule: true,
    },
    headings,
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
function color(v: unknown, fallback: string): string {
  return typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v) ? v : fallback;
}
function isLegacyDerivedTextStyles(v: unknown): boolean {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, any>;
  const body = o.body as TextStyle | undefined;
  const h1 = o.h1 as TextStyle | undefined;
  const h2 = o.h2 as TextStyle | undefined;
  const h3 = o.h3 as TextStyle | undefined;
  if (!body || !h1 || !h2 || !h3) return false;
  if (body.color !== "#000000") return false;
  if (![h1, h2, h3].every((s) => s.font === body.font && s.color === h1.color)) return false;
  return Object.values(HEADING_SIZE_FACTORS).some(([a, b, c]) =>
    h1.fontSize === roundPt(body.fontSize * a) &&
    h2.fontSize === roundPt(body.fontSize * b) &&
    h3.fontSize === roundPt(body.fontSize * c)
  );
}
function textStyle(raw: unknown, fallback: TextStyle): TextStyle {
  const s = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    font: oneOf(s.font, FONTS, fallback.font as (typeof FONTS)[number]),
    fontSize: num(s.fontSize, fallback.fontSize, 6, 72),
    color: color(s.color, fallback.color),
  };
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
  const legacyFont = oneOf(o.font, FONTS, d.font);
  const legacyFontSize = num(o.fontSize, d.fontSize, 8, 16);
  const headingScale = oneOf(t.scale, HEADING_SCALES, d.headings.scale);
  const headingColor = color(t.color, d.headings.color);
  const headings = { scale: headingScale, color: headingColor };
  const legacyTextStyles = textStylesFromLegacy(legacyFont, legacyFontSize, headings);
  const rawTextStyles: Partial<Record<TextStyleKey, unknown>> = isLegacyDerivedTextStyles(o.textStyles)
    ? {}
    : ((o.textStyles ?? {}) as Record<TextStyleKey, unknown>);
  const asset = (v: unknown): string | null =>
    typeof v === "string" && /^[\w.-]+\.(png|jpe?g|svg)$/i.test(v) ? v : null;
  const logo = asset(h.logo);
  return {
    paper: oneOf(o.paper, PAPERS, d.paper),
    orientation: oneOf(o.orientation, ["portrait", "landscape"] as const, d.orientation),
    margins: {
      top: num(m.top, d.margins.top, 0, 80),
      bottom: num(m.bottom, d.margins.bottom, 0, 80),
      left: num(m.left, d.margins.left, 0, 80),
      right: num(m.right, d.margins.right, 0, 80),
    },
    font: legacyFont,
    fontSize: legacyFontSize,
    lineHeight: num(o.lineHeight, d.lineHeight, 1, 2),
    textStyles: {
      body: textStyle(rawTextStyles.body, legacyTextStyles.body),
      h1: textStyle(rawTextStyles.h1, legacyTextStyles.h1),
      h2: textStyle(rawTextStyles.h2, legacyTextStyles.h2),
      h3: textStyle(rawTextStyles.h3, legacyTextStyles.h3),
    },
    header: {
      enabled: bool(h.enabled, d.header.enabled),
      text: str(h.text, d.header.text),
      logo,
      fullBleed: bool(h.fullBleed, d.header.fullBleed),
      align: oneOf(h.align, ALIGNS, d.header.align),
      rule: bool(h.rule, d.header.rule),
    },
    footer: {
      enabled: bool(f.enabled, d.footer.enabled),
      text: str(f.text, d.footer.text),
      logo: asset(f.logo),
      fullBleed: bool(f.fullBleed, d.footer.fullBleed),
      numbering: oneOf(f.numbering, NUMBERINGS, d.footer.numbering),
      align: oneOf(f.align, ALIGNS, d.footer.align),
      firstPage: bool(f.firstPage, d.footer.firstPage),
      rule: bool(f.rule, d.footer.rule),
    },
    headings,
    table: {
      stroke: oneOf(tb.stroke, TABLE_STROKES, d.table.stroke),
      headerFill: oneOf(tb.headerFill, TABLE_HEADER_FILLS, d.table.headerFill),
      zebra: bool(tb.zebra, d.table.zebra),
      fontSize: oneOf(tb.fontSize, TABLE_FONT_SIZES, d.table.fontSize),
    },
  };
}
