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

/** Which pages a block prints on. Replaces the old four-valued PageBandMode. */
export type BlockScope = "all" | "first" | "except-first";
/**
 * Which fields the panel reveals. The stored shape is the same for every kind:
 * a preset only seeds the fields and decides what stays hidden, so switching
 * kind never loses what was typed.
 */
export type BlockKind = "image-text" | "text-image" | "centered" | "custom";
export type ImagePosition = "left" | "center" | "right";

/** The line under a block. */
export interface BlockRule {
  on: boolean;
  color: string;
  /** Points. */
  widthPt: number;
  /** Millimetres. */
  aboveMm: number;
  belowMm: number;
}

/**
 * One piece of a header or footer. Several stack inside a single Typst
 * `header:`/`footer:` argument — they are not separate page bands.
 */
export interface Block {
  kind: BlockKind;
  scope: BlockScope;
  /** A file of backend/templates/assets. */
  image: string | null;
  imagePosition: ImagePosition;
  /**
   * Height in millimetres, width left to the aspect ratio — the height has to
   * be known here or the band's own height cannot be worked out, and Typst
   * clips whatever does not fit the page margin. 0 means the full width of the
   * page instead, edge to edge.
   */
  imageHeightMm: number;
  title: string;
  subtitle: string;
  align: Align;
  rule: BlockRule;
}

/** Spacing is a property of the band, not of a block: one set per header. */
export interface BandSpacing {
  /** Millimetres. */
  top: number;
  left: number;
  right: number;
  /** Distance between the band and the body text. */
  gap: number;
}

export interface Band {
  blocks: Block[];
  spacing: BandSpacing;
}

export interface FooterBand extends Band {
  numbering: Numbering;
  numberingAlign: Align;
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
  header: Band;
  footer: FooterBand;
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
export const BLOCK_SCOPES: readonly BlockScope[] = ["all", "first", "except-first"];
export const BLOCK_KINDS: readonly BlockKind[] = ["image-text", "text-image", "centered", "custom"];
export const IMAGE_POSITIONS: readonly ImagePosition[] = ["left", "center", "right"];
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
    header: { blocks: [], spacing: { ...DEFAULT_SPACING } },
    footer: { blocks: [], spacing: { ...DEFAULT_SPACING }, numbering: "n-of-total", numberingAlign: "right" },
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

const asset = (v: unknown): string | null =>
  typeof v === "string" && /^[\w.-]+\.(png|jpe?g|svg)$/i.test(v) ? v : null;

export const DEFAULT_SPACING: BandSpacing = { top: 0, left: 0, right: 0, gap: 6 };
export const DEFAULT_RULE_WIDTH_PT = 1;
/**
 * A new block starts with stand-in text rather than empty, so the section shows
 * up in the preview the moment a layout is picked and the user can see where it
 * lands. Typing over it is the normal path.
 */
export const PLACEHOLDER_TITLE = "Titre";
export const PLACEHOLDER_SUBTITLE = "Sous-titre";

/** A fresh block of the given kind, with the fields that kind uses seeded. */
export function newBlock(kind: BlockKind, ruleColor: string): Block {
  return {
    kind,
    scope: "all",
    image: null,
    imagePosition: kind === "text-image" ? "right" : kind === "centered" ? "center" : "left",
    imageHeightMm: INLINE_LOGO_HEIGHT_MM,
    title: PLACEHOLDER_TITLE,
    subtitle: PLACEHOLDER_SUBTITLE,
    align: kind === "centered" ? "center" : "left",
    rule: { on: true, color: ruleColor, widthPt: DEFAULT_RULE_WIDTH_PT, aboveMm: 2, belowMm: 0 },
  };
}

function blockRule(raw: unknown, fallback: BlockRule): BlockRule {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    on: bool(o.on, fallback.on),
    color: color(o.color, fallback.color),
    widthPt: num(o.widthPt, fallback.widthPt, 0.1, 10),
    aboveMm: num(o.aboveMm, fallback.aboveMm, 0, 40),
    belowMm: num(o.belowMm, fallback.belowMm, 0, 40),
  };
}

function block(raw: unknown, ruleColor: string): Block {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const kind = oneOf(o.kind, BLOCK_KINDS, "custom");
  const d = newBlock(kind, ruleColor);
  return {
    kind,
    scope: oneOf(o.scope, BLOCK_SCOPES, d.scope),
    image: o.image === null ? null : (asset(o.image) ?? d.image),
    imagePosition: oneOf(o.imagePosition, IMAGE_POSITIONS, d.imagePosition),
    imageHeightMm: num(o.imageHeightMm, d.imageHeightMm, 0, 120),
    title: str(o.title, d.title),
    subtitle: str(o.subtitle, d.subtitle),
    align: oneOf(o.align, ALIGNS, d.align),
    rule: blockRule(o.rule, d.rule),
  };
}

function spacing(raw: unknown): BandSpacing {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    top: num(o.top, DEFAULT_SPACING.top, 0, 80),
    left: num(o.left, DEFAULT_SPACING.left, 0, 80),
    right: num(o.right, DEFAULT_SPACING.right, 0, 80),
    gap: num(o.gap, DEFAULT_SPACING.gap, 0, 80),
  };
}

/** At most this many blocks in one band; beyond it the panel stops being usable. */
const MAX_BLOCKS = 6;

/**
 * Templates saved before blocks existed carry a single band with `text`,
 * `logo`, `mode` and a `first` variant. Each old mode maps onto scopes without
 * loss — `different-first` becomes two blocks, one per scope — so nothing a
 * user set up is dropped on the way in.
 */
function blocksFromLegacy(o: Record<string, any>, ruleColor: string): Block[] {
  if (o.enabled === false) return [];
  const mode = String(o.mode ?? "all");
  const one = (raw: Record<string, any>, scope: BlockScope): Block | null => {
    const image = raw.logo === null ? null : asset(raw.logo);
    const title = str(raw.text, "");
    const on = bool(raw.rule, false);
    if (!image && !title && !on) return null;
    const b = newBlock("custom", ruleColor);
    return {
      ...b,
      scope,
      image,
      imagePosition: oneOf(raw.align, IMAGE_POSITIONS, b.imagePosition),
      // Edge-to-edge in the old shape meant the full width of the page; anything
      // else was laid out at the one fixed height the old generator used.
      imageHeightMm: bool(raw.fullBleed, false) ? 0 : INLINE_LOGO_HEIGHT_MM,
      title,
      align: oneOf(raw.align, ALIGNS, b.align),
      rule: { ...b.rule, on },
    };
  };
  if (mode === "different-first") {
    return [one(o.first ?? {}, "first"), one(o, "except-first")].filter((b): b is Block => b !== null);
  }
  const scope: BlockScope = mode === "first-only" ? "first" : mode === "except-first" ? "except-first" : "all";
  const b = one(o, scope);
  return b ? [b] : [];
}

function band(raw: unknown, ruleColor: string): Band {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, any>;
  const blocks = Array.isArray(o.blocks)
    ? o.blocks.slice(0, MAX_BLOCKS).map((b: unknown) => block(b, ruleColor))
    : blocksFromLegacy(o, ruleColor);
  return { blocks, spacing: spacing(o.spacing) };
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
  const f = (o.footer ?? {}) as Record<string, any>;
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
  const footerBand = band(f, headingColor);
  // Only the old shape carried numbering on the band; a block-shaped footer keeps its own.
  const legacyNumbering = Array.isArray(f.blocks) ? undefined : f.numbering;
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
    header: band(o.header, headingColor),
    footer: {
      ...footerBand,
      numbering: oneOf(legacyNumbering ?? f.numbering, NUMBERINGS, d.footer.numbering),
      numberingAlign: oneOf(f.numberingAlign ?? f.align, ALIGNS, d.footer.numberingAlign),
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
