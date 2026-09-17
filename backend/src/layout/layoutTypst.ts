/**
 * Bloc « dots:layout » : la mise en page réglée par des contrôles, traduite en
 * Typst et insérée dans le template juste avant `#include "body.typ"`. En Typst,
 * la dernière règle `#set` gagne : placé après les `#set` écrits à la main, le
 * bloc a le dernier mot sur la page, la police, les titres et l'allure des
 * tableaux (leur structure vient du document, voir convert/blocksToTypst.ts).
 */
import { escapeTypstText } from "../convert/escapeTypst.js";
import {
  HEADING_SIZE_FACTORS,
  defaultLayout,
  INLINE_LOGO_HEIGHT_MM,
  sanitizeLayout,
  PLACEHOLDER_SUBTITLE,
  PLACEHOLDER_TITLE,
  type Band,
  type Block,
  type BlockScope,
  type BlockKind,
  type FooterBand,
  type LayoutConfig,
  type Numbering,
  type TextStyle,
} from "./layoutConfig.js";

export const LAYOUT_BEGIN = "// dots:layout begin";
export const LAYOUT_END = "// dots:layout end";
/** Préfixe commun aux trois lignes-marqueurs (begin, `{json}`, end). */
const LAYOUT_MARK = "// dots:layout";

/** Polices de repli, toujours présentes : Marianne n'est pas installée partout. */
const FALLBACK_FONTS = ["Arial", "Helvetica", "Libertinus Serif"];

const NUMBERING: Record<Numbering, string> = {
  none: "",
  n: `#context counter(page).display("1")`,
  "n-of-total": `#context counter(page).display("1 / 1", both: true)`,
  "page-n-of-total": `Page #context counter(page).display("1 / 1", both: true)`,
};

/** Filets des tableaux : mêmes valeurs que l'exporteur Typst de BlockNote pour « light ». */
const TABLE_STROKE: Record<LayoutConfig["table"]["stroke"], string> = {
  none: "none",
  light: "0.5pt + luma(200)",
  full: "0.5pt + luma(120)",
};

/**
 * Tout ce que Typst lit comme une fin de ligne : `\r` seul, tabulation
 * verticale, saut de page, U+0085, U+2028, U+2029 — pas seulement `\n`.
 * En tête de ligne, `= x` deviendrait un titre.
 */
const TYPST_NEWLINE = /\r\n?|[\n\x0B\x0C\u0085\u2028\u2029]/;

/**
 * Texte libre → markup Typst littéral. escapeTypstText couvre les caractères
 * spéciaux ; restent `//` (ouvre un commentaire jusqu'à la fin de la ligne et
 * avalerait le `]` fermant) et les marqueurs de début de ligne (`= titre`,
 * `- liste`, `+ énumération`, `1. énumération`), actifs aussi en tête d'un
 * bloc `[...]`. Les retours à la ligne deviennent `\ ` (saut de ligne Typst).
 */
function text(raw: string): string {
  return raw
    .split(TYPST_NEWLINE)
    .map(
      (line) => escapeTypstText(line), // couvre aussi `/` et les marqueurs de début de ligne
    )
    .join(" \\ ");
}

/** Couleur déjà validée (#rrggbb) par sanitizeLayout. */
function rgb(color: string): string {
  return `rgb("${color}")`;
}

function fontTuple(font: string): string {
  const fonts = [font, ...FALLBACK_FONTS.filter((f) => f !== font)];
  return `(${fonts.map((f) => JSON.stringify(f)).join(", ")})`;
}

function textSet(style: TextStyle): string {
  return `set text(font: ${fontTuple(style.font)}, size: ${style.fontSize}pt, fill: ${rgb(style.color)})`;
}

function contentBlock(parts: string[], indent: string): string {
  return `[\n${parts.map((p) => indent + p).join("\n")}\n${indent.slice(2)}]`;
}

/**
 * Which pages a piece of the band prints on — a block, or the footer's own
 * page number. Typst evaluates the header/footer once per page, so the test
 * is on the page counter; `all` needs no test at all.
 */
function scoped(body: string, scope: BlockScope): string {
  if (scope === "all") return body;
  const n = "counter(page).get().first()";
  const test = scope === "first" ? `${n} == 1` : `${n} > 1`;
  return `#context { if ${test} [${body}] }`;
}

/**
 * Stand-ins drawn until the real thing is chosen, so the section shows where it
 * sits on the page from the moment a layout is picked. A grey area takes the
 * image's place and untouched text is set in light grey; both turn into real
 * content as soon as the user replaces them.
 */
const PLACEHOLDER_FILL = "luma(232)";
const PLACEHOLDER_INK = "luma(165)";
/** Height of the grey strip standing in for a full-page-width image. */
const PLACEHOLDER_BLEED_HEIGHT_MM = 20;
const PT_PER_MM = 72 / 25.4;

/**
 * Only the two layouts an image defines get a stand-in. « custom » is composed
 * by hand and may well want no image, and every band migrated from the old
 * shape lands there — a grey area would appear in templates that never had one.
 */
function usesImage(kind: BlockKind): boolean {
  return kind === "image-text" || kind === "text-image";
}

/**
 * An image at a set width. Height is left to Typst so the aspect ratio holds.
 */
function image(block: Block): string {
  return `image("assets/${block.image}", height: ${block.imageHeightMm}mm)`;
}

/**
 * The grey area shown in place of an image that has not been chosen yet. Only
 * the height is set by the user, so the stand-in takes a plain 3:1 shape.
 */
function imagePlaceholder(block: Block): string {
  const h = block.imageHeightMm;
  return `rect(width: ${h * 3}mm, height: ${h}mm, fill: ${PLACEHOLDER_FILL}, stroke: none)`;
}

/**
 * `imageHeightMm: 0` means the full width of the *page*, not of the text column:
 * a strip cropped out of a letterhead has to reach both paper edges. `place`
 * leaves the text area by a negative `dx` and the image grows by both margins.
 * The margin on that side must be at least the rendered height or Typst clips
 * it without a word — templateFromAnalysis.ts is what widens it.
 */
function bleed(block: Block, side: "top" | "bottom", cfg: LayoutConfig): string {
  const { left, right } = cfg.margins;
  return `#place(${side} + left, dx: -${left}mm, image("assets/${block.image}", width: 100% + ${left + right}mm))`;
}

/**
 * Title and subtitle, each on its own line; either may be empty. Text still left
 * at its stand-in value is set in light grey, so what is really filled in reads
 * apart from what is not.
 */
function words(block: Block): string {
  const lines = [
    [block.title, PLACEHOLDER_TITLE] as const,
    [block.subtitle, PLACEHOLDER_SUBTITLE] as const,
  ]
    .filter(([value]) => value.trim())
    .map(([value, stand]) =>
      value === stand ? `#text(fill: ${PLACEHOLDER_INK})[${text(value)}]` : text(value),
    );
  return lines.length ? `[${lines.join(" \\ ")}]` : "";
}

/**
 * One block's markup. An image beside text becomes a two-column grid; centred
 * or alone, the two simply stack.
 */
function blockBody(block: Block, cfg: LayoutConfig, band: Band, side: "top" | "bottom"): string {
  const parts: string[] = [];
  // A full-width image is placed, not laid out: it never shares a row with text.
  // A real image always bleeds, whatever the layout; a stand-in only where the
  // layout is defined by an image.
  if (block.imageHeightMm === 0 && (block.image !== null || usesImage(block.kind))) {
    parts.push(
      block.image
        ? bleed(block, side, cfg)
        : `#rect(width: 100%, height: ${PLACEHOLDER_BLEED_HEIGHT_MM}mm, fill: ${PLACEHOLDER_FILL}, stroke: none)`,
    );
    const only = words(block);
    if (only) parts.push(`#align(${block.align})${only}`);
    return withSpacing(parts, block, band, side).join("\n      ");
  }
  const img = block.image ? image(block) : usesImage(block.kind) ? imagePlaceholder(block) : "";
  const txt = words(block);

  if (img && txt && block.imagePosition !== "center") {
    const cols = block.imagePosition === "right" ? "(1fr, auto)" : "(auto, 1fr)";
    const cells = block.imagePosition === "right" ? `${txt}, ${img}` : `${img}, ${txt}`;
    parts.push(
      `#grid(columns: ${cols}, column-gutter: 4mm, align: horizon, ${cells})`,
    );
  } else {
    if (img) parts.push(`#align(${block.imagePosition})[#${img}]`);
    if (txt) parts.push(`#align(${block.align})${txt}`);
  }

  return withSpacing(parts, block, band, side).join("\n      ");
}

/**
 * However narrow the band's own left/right padding makes its content, the
 * rule still needs to span the full page — a rule that stops wherever the
 * text happens to be inset reads as a layout bug, not a choice. `pad` with a
 * *negative* amount cancels the band's own `pad(left:, right:)` for just this
 * element, the mirror image of `bleed()`'s trick for a full-width image.
 */
function fullWidthRule(block: Block, band: Band): string {
  const { left, right } = band.spacing;
  const line = `#line(length: 100%, stroke: ${block.rule.widthPt}pt + ${rgb(block.rule.color)})`;
  return left || right ? `#pad(left: ${-left}mm, right: ${-right}mm)[${line}]` : line;
}

/**
 * Clear space between the rule and the content it sits next to, and between
 * the last block and the page number — never flush against either. 2mm read
 * as still touching once rendered; this is the smallest value that visibly
 * doesn't.
 */
const RULE_GAP_MM = 3;

/**
 * The block's own clear space, with its rule (if any) drawn just inside it.
 * Space applies whether or not the line does, which is what lets several
 * blocks in one band be pulled apart without forcing a line onto any of
 * them. The rule itself sits below the content in a header (the traditional
 * placement, right before the body) and above it in a footer (separating
 * the footer from the body above), with a small fixed gap either way so it
 * never touches the text it sits next to.
 */
function withSpacing(parts: string[], block: Block, band: Band, side: "top" | "bottom"): string[] {
  const above = block.spaceAboveMm ? [`#v(${block.spaceAboveMm}mm)`] : [];
  const below = block.spaceBelowMm ? [`#v(${block.spaceBelowMm}mm)`] : [];
  if (!block.rule.on) return [...above, ...parts, ...below];

  const rule = fullWidthRule(block, band);
  const gap = `#v(${RULE_GAP_MM}mm)`;
  const withRule = side === "bottom" ? [rule, gap, ...parts] : [...parts, gap, rule];
  return [...above, ...withRule, ...below];
}

/** True when a block would draw nothing at all. */
function isBlockEmpty(block: Block): boolean {
  if (usesImage(block.kind)) return false;
  return !block.image && !block.title.trim() && !block.subtitle.trim() && !block.rule.on;
}

const NUMBERING_BLOCK = (band: FooterBand): string =>
  NUMBERING[band.numbering] ? `#align(${band.numberingAlign})[${NUMBERING[band.numbering]}]` : "";

/** The footer's page number, wrapped in its own page-scope test. */
function numberingMarkup(band: FooterBand): string {
  const body = NUMBERING_BLOCK(band);
  return body ? scoped(body, band.numberingScope) : "";
}

/**
 * The whole band: every block stacked inside one `header:`/`footer:` argument,
 * wrapped in a single `pad` that holds the band's spacing. `none` when there is
 * nothing to draw — presence is derived, never stored.
 */
function bandMarkup(band: Band, cfg: LayoutConfig, side: "top" | "bottom", extra = ""): string {
  const drawn = band.blocks.filter((b) => !isBlockEmpty(b));
  const bodies = drawn.map((b) => scoped(blockBody(b, cfg, band, side), b.scope));
  // par.spacing is zeroed below, so without this the page number would sit
  // flush against whatever block came before it — the same "stuck" look the
  // rule itself needed fixing for, just for the numbering instead of a rule.
  if (extra) bodies.push(bodies.length ? `#v(${RULE_GAP_MM}mm)\n      ${extra}` : extra);
  if (!bodies.length) return "none";

  // `top` is not padded here: Typst gives the header only `margin.top` minus the
  // ascent, so padding inside it would push the band straight through the body.
  // The margin is widened instead (see bandHeightMm), and Typst sits the band on
  // the bottom of that box — which lands it exactly `top` from the paper edge.
  const s = band.spacing;
  const pad = [
    s.left ? `left: ${s.left}mm` : "",
    s.right ? `right: ${s.right}mm` : "",
  ].filter(Boolean).join(", ");
  // Several blocks are several separate paragraphs, and Typst inserts its own
  // spacing between paragraphs (par.spacing, ~1em by default) on top of the
  // #v() calls above — invisible to bandHeightMm, so the band silently grew
  // taller than the margin it had just computed for itself. Zeroing it here
  // makes every gap between blocks an explicit one, which is the only kind
  // bandHeightMm can see.
  const inner = bodies.map((b) => `      ${b}`).join("\n");
  const content = `[\n      #set par(spacing: 0pt)\n${inner}\n    ]`;
  return pad ? `pad(${pad})${content}` : content;
}

function header(cfg: LayoutConfig): string {
  return bandMarkup(cfg.header, cfg, "top");
}

function footer(cfg: LayoutConfig): string {
  return bandMarkup(cfg.footer, cfg, "bottom", numberingMarkup(cfg.footer));
}

/**
 * How tall a block prints, in millimetres. Every part of it is a set length —
 * that is the reason an image is sized by height rather than width: the aspect
 * ratio is not knowable here, and without the height the band cannot be made to
 * fit the page margin, which is the only room Typst gives it.
 */
function blockHeightMm(block: Block, cfg: LayoutConfig): number {
  const lines = [block.title, block.subtitle].filter((t) => t.trim()).length;
  const textMm = (lines * cfg.textStyles.body.fontSize * cfg.lineHeight) / PT_PER_MM;
  const drawsImage = block.image !== null || usesImage(block.kind);
  const imageMm = !drawsImage
    ? 0
    : block.imageHeightMm === 0
      ? PLACEHOLDER_BLEED_HEIGHT_MM
      : block.imageHeightMm;
  // Beside the text the two share a row; stacked, they add up.
  const sideBySide = drawsImage && textMm > 0 && block.imageHeightMm !== 0 && block.imagePosition !== "center";
  const content = sideBySide ? Math.max(textMm, imageMm) : textMm + imageMm;
  // Space applies whether or not the line is drawn; the line adds its own thickness
  // plus the fixed gap that keeps it clear of the content (see RULE_GAP_MM).
  const space =
    block.spaceAboveMm + block.spaceBelowMm +
    (block.rule.on ? block.rule.widthPt / PT_PER_MM + RULE_GAP_MM : 0);
  return content + space;
}

/** One line of body text, in millimetres — what the page-number line takes. */
function textLineHeightMm(cfg: LayoutConfig): number {
  return (cfg.textStyles.body.fontSize * cfg.lineHeight) / PT_PER_MM;
}

/**
 * The margin the band needs: its distance from the paper edge, the tallest
 * stack of things that can land on one page, and the gap to the body text.
 * Things scoped to different pages never print together, so only the worst
 * page has to fit. `extra` folds in content that is not a block — the
 * footer's page number, which has its own scope and no block of its own.
 */
function bandHeightMm(
  band: Band,
  cfg: LayoutConfig,
  extra: { heightMm: number; scope: BlockScope }[] = [],
): number {
  const blockItems = band.blocks
    .filter((b) => !isBlockEmpty(b))
    .map((b) => ({ heightMm: blockHeightMm(b, cfg), scope: b.scope }));
  // Matches the #v() bandMarkup inserts before `extra` when blocks precede it.
  const gapBeforeExtra = blockItems.length && extra.length ? RULE_GAP_MM : 0;
  const items = [...blockItems, ...extra];
  if (!items.length) return 0;
  let always = 0;
  let first = 0;
  let rest = 0;
  for (const it of items) {
    if (it.scope === "first") first += it.heightMm;
    else if (it.scope === "except-first") rest += it.heightMm;
    else always += it.heightMm;
  }
  // "Haut" (spacing.gap): the room content actually needs, plus its own
  // breathing room toward the body — always added, never optional.
  const needed = always + Math.max(first, rest) + gapBeforeExtra + band.spacing.gap;
  // "Bas" (spacing.top): a floor on the band's distance from the *page* edge,
  // the same relationship margins.top/bottom already have with this same
  // number — asking for more than the content needs pushes it further from
  // the edge; asking for less never clips it, `needed` still wins.
  return Math.max(band.spacing.top, needed);
}

/**
 * A block image spanning the full width of the band needs the whole margin:
 * Typst otherwise reserves 30 % of it between the band and the body.
 */
function hasFullWidthImage(band: Band): boolean {
  return band.blocks.some((b) => b.image !== null && b.imageHeightMm === 0);
}

/**
 * Règles `table` : un seul `#set table(…)` (filets, marge intérieure, fond) et
 * une seule règle `show` pour la première ligne (gras, texte blanc sur fond
 * couleur). Le fond est une fonction de la ligne `y` : en-tête en `y == 0`,
 * zébrage sur les lignes impaires. Une cellule qui porte son propre `fill:`
 * (couleur posée dans le document) garde le dessus, c'est l'ordre Typst — le
 * texte blanc n'est donc posé que sur les cellules sans `fill:` propre
 * (`it.fill == auto`), sinon il serait illisible sur un fond pâle.
 */
function table(cfg: LayoutConfig, color: string): string[] {
  const t = cfg.table;
  const headerFill =
    t.headerFill === "grey"
      ? "luma(240)"
      : t.headerFill === "brand"
        ? color
        : undefined;
  const branches: string[] = [];
  if (headerFill) branches.push(`if y == 0 { ${headerFill} }`);
  if (t.zebra) branches.push(`if calc.odd(y) { luma(248) }`);
  const fill = branches.length
    ? `, fill: (x, y) => ${branches.join(" else ")}`
    : "";
  const headerShow =
    t.headerFill === "brand"
      ? `it => { set text(weight: "bold"); set text(fill: white) if it.fill == auto; it }`
      : `set text(weight: "bold")`;
  return [
    `#set table(stroke: ${TABLE_STROKE[t.stroke]}, inset: 6pt${fill})`,
    `#show table.cell.where(y: 0): ${headerShow}`,
    ...(t.fontSize === "small" ? ["#show table: set text(size: 0.9em)"] : []),
  ];
}

/**
 * JSON.stringify laisse U+0085, U+2028 et U+2029 en clair ; pour Typst ce sont
 * des fins de ligne, le commentaire s'arrêterait là et la suite du JSON
 * deviendrait du markup. On les écrit en `\uXXXX`, que JSON.parse relit.
 */
function jsonLine(cfg: LayoutConfig): string {
  const json = JSON.stringify(cfg).replace(
    /[\u0085\u2028\u2029]/g,
    (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`,
  );
  return `${LAYOUT_MARK} ${json}`;
}

/** Le bloc complet, de `// dots:layout begin` à `// dots:layout end`. */
export function layoutToTypst(cfg: LayoutConfig): string {
  cfg = sanitizeLayout(cfg);
  const m = cfg.margins;
  // Never smaller than what the user set, never too small for the band: below
  // its own height Typst clips the band without a word.
  const round = (n: number) => Math.round(n * 10) / 10;
  const marginTop = round(Math.max(m.top, bandHeightMm(cfg.header, cfg)));
  const numberingExtra = NUMBERING[cfg.footer.numbering]
    ? [{ heightMm: textLineHeightMm(cfg), scope: cfg.footer.numberingScope }]
    : [];
  const marginBottom = round(Math.max(m.bottom, bandHeightMm(cfg.footer, cfg, numberingExtra)));
  const color = rgb(cfg.headings.color);
  // 0.65em est l'interligne par défaut de Typst, pris comme équivalent de 1.2.
  const leading = Math.round(((0.65 * cfg.lineHeight) / 1.2) * 100) / 100;
  return [
    LAYOUT_BEGIN,
    jsonLine(cfg),
    "#set page(",
    `  paper: "${cfg.paper}",`,
    `  flipped: ${cfg.orientation === "landscape"},`,
    `  margin: (top: ${marginTop}mm, bottom: ${marginBottom}mm, left: ${m.left}mm, right: ${m.right}mm),`,
    `  header: ${header(cfg)},`,
    `  footer: ${footer(cfg)},`,
    // Un bandeau bord à bord posé par `place` reste borné par la part de marge
    // que Typst réserve par défaut (30 %) entre l'en-tête/pied et le corps : à
    // 0 %, le bandeau dispose de toute la hauteur que templateFromAnalysis.ts
    // lui a réservée, sans quoi son bas se fait rogner.
    `  header-ascent: ${hasFullWidthImage(cfg.header) ? "0%" : `${cfg.header.spacing.gap}mm`},`,
    `  footer-descent: ${hasFullWidthImage(cfg.footer) ? "0%" : `${cfg.footer.spacing.gap}mm`},`,
    ")",
    `#${textSet(cfg.textStyles.body)}`,
    `#set par(leading: ${leading}em)`,
    ...(["h1", "h2", "h3"] as const).map(
      (key, i) =>
        `#show heading.where(level: ${i + 1}): ${textSet(cfg.textStyles[key])}`,
    ),
    ...table(cfg, color),
    LAYOUT_END,
  ].join("\n");
}

function isMark(line: string): boolean {
  return line.trim().startsWith(LAYOUT_MARK);
}

/**
 * Remplace le bloc existant, ou l'insère juste avant la première ligne
 * `#include "body.typ"` (à défaut, à la fin). Appliquer deux fois ne donne
 * qu'un seul bloc. Un bloc abîmé (begin sans end, ou l'inverse) perd ses
 * lignes-marqueurs orphelines : ses `#set` restent mais le nouveau bloc,
 * placé après, l'emporte.
 */
export function applyLayout(source: string, cfg: LayoutConfig): string {
  const block = layoutToTypst(cfg);
  const lines = source.split("\n");
  const begin = lines.findIndex((l) => l.trim() === LAYOUT_BEGIN);
  const end =
    begin < 0
      ? -1
      : lines.findIndex((l, i) => i > begin && l.trim() === LAYOUT_END);
  if (begin >= 0 && end > begin) {
    lines.splice(begin, end - begin + 1, block);
    return lines.join("\n");
  }
  const kept = lines.filter((l) => !isMark(l));
  const include = kept.findIndex((l) => /^\s*#include\s+"body\.typ"/.test(l));
  if (include >= 0) {
    kept.splice(include, 0, block, "");
    return kept.join("\n");
  }
  const rest = kept.join("\n");
  return rest + (rest === "" || rest.endsWith("\n") ? "" : "\n") + block + "\n";
}

/**
 * Relit la config portée par la ligne `// dots:layout {json}` du bloc. Sans
 * bloc : ce qu'on déduit de la source écrite à la main, managed:false. Bloc
 * présent mais JSON illisible : défauts, managed:true (le bloc sera régénéré à
 * la prochaine sauvegarde).
 */
export function readLayout(source: string): {
  layout: LayoutConfig;
  managed: boolean;
} {
  const lines = source.split("\n");
  const begin = lines.findIndex((l) => l.trim() === LAYOUT_BEGIN);
  if (begin < 0) return { layout: deduceLayout(source), managed: false };
  const end = lines.findIndex((l, i) => i > begin && l.trim() === LAYOUT_END);
  const json = lines
    .slice(begin + 1, end > begin ? end : undefined)
    .map((l) => l.trim())
    .find((l) => l.startsWith(`${LAYOUT_MARK} {`));
  try {
    return {
      layout: sanitizeLayout(
        JSON.parse(json ? json.slice(LAYOUT_MARK.length) : ""),
      ),
      managed: true,
    };
  } catch {
    return { layout: defaultLayout(), managed: true };
  }
}

// ── Déduction depuis une source écrite à la main ─────────────────────────────

/** Indice du `close` apparié au `open` situé en `from`, ou -1. */
function closing(
  src: string,
  from: number,
  open: string,
  close: string,
): number {
  let depth = 0;
  for (let i = from; i < src.length; i++) {
    if (src[i] === "\\") i++;
    else if (src[i] === open) depth++;
    else if (src[i] === close && --depth === 0) return i;
  }
  return -1;
}

/** Contenu de `key: [ … ]` parmi des arguments Typst ; undefined si absent ou `none`. */
function contentArg(args: string, key: string): string | undefined {
  const m = new RegExp(`(?:^|[,(\\s])${key}:\\s*\\[`).exec(args);
  if (!m) return undefined;
  const open = m.index + m[0].length - 1;
  const close = closing(args, open, "[", "]");
  return close < 0 ? undefined : args.slice(open + 1, close);
}

/** Longueur Typst (cm, mm, pt, in) → millimètres entiers. */
function toMm(len: string | undefined): number | undefined {
  const m = len?.trim().match(/^([\d.]+)(cm|mm|pt|in)$/);
  if (!m) return undefined;
  const per: Record<string, number> = {
    cm: 10,
    mm: 1,
    pt: 25.4 / 72,
    in: 25.4,
  };
  return Math.round(Number(m[1]) * per[m[2]]);
}

/** Markup simple → texte de champ : gras/italique retirés, `\` de fin de ligne → retour à la ligne. */
function plainText(markup: string): string {
  return markup
    .split("\n")
    .map((l) => l.trim().replace(/\\$/, "").replace(/[*_]/g, "").trim())
    .filter(Boolean)
    .join("\n");
}

/** Texte d'un en-tête manuscrit : son contenu s'il est sans code, sinon ses sous-blocs `[…]` sans code. */
function headerText(content: string): string {
  if (!content.includes("#")) return plainText(content);
  const parts: string[] = [];
  for (let i = content.indexOf("["); i >= 0; i = content.indexOf("[", i + 1)) {
    const close = closing(content, i, "[", "]");
    if (close < 0) break;
    const inner = content.slice(i + 1, close);
    if (!/[#[]/.test(inner)) parts.push(plainText(inner));
  }
  return parts.filter(Boolean).join("\n");
}

function numbering(footer: string): Numbering {
  const m =
    /(Page\s+)?#context\s+counter\(page\)\.display\("[^"]*"(,\s*both:\s*true)?\)/.exec(
      footer,
    );
  if (!m) return "none";
  if (m[1]) return "page-n-of-total";
  return m[2] ? "n-of-total" : "n";
}

/**
 * Source sans bloc géré : ce que le panneau affiche, et que le premier bloc
 * reproduira au lieu d'écraser l'en-tête, les marges et la police écrits à la
 * main. Lecture par expressions régulières du `#set page(…)` et des
 * `#set text(…)` ; ce qui n'est pas reconnu garde sa valeur par défaut.
 * Non relus : l'alignement de l'en-tête, le texte du pied, l'échelle des titres,
 * les tableaux (`table` garde ses défauts : filets fins, en-tête gris).
 */
export function deduceLayout(source: string): LayoutConfig {
  const pageAt = source.search(/#set\s+page\(/);
  const open = pageAt < 0 ? -1 : source.indexOf("(", pageAt);
  const close = open < 0 ? -1 : closing(source, open, "(", ")");
  const page = close < 0 ? "" : source.slice(open + 1, close);

  const margin = /(?:^|[,(\s])margin:\s*(\([^)]*\)|[^,\n]+)/
    .exec(page)?.[1]
    ?.trim();
  const sides: Record<string, number | undefined> = {};
  if (margin?.startsWith("(")) {
    for (const [, k, v] of margin.matchAll(/(\w+):\s*([^,()]+)/g))
      sides[k] = toMm(v);
  } else {
    sides.rest = toMm(margin);
  }
  const side = (k: string, axis: string) =>
    sides[k] ?? sides[axis] ?? sides.rest;

  const header = contentArg(page, "header");
  const footer = contentArg(page, "footer");
  const color = /rgb\("(#[0-9a-f]{6})"\)/i.exec(header ?? footer ?? "")?.[1];

  let font: string | undefined;
  let fontSize: number | undefined;
  for (const m of source.matchAll(/#set\s+text\(/g)) {
    const from = m.index + m[0].length - 1;
    const args = source.slice(from + 1, closing(source, from, "(", ")"));
    font = /font:\s*\(?\s*"([^"]+)"/.exec(args)?.[1] ?? font;
    fontSize = Number(/size:\s*([\d.]+)pt/.exec(args)?.[1]) || fontSize;
  }

  return sanitizeLayout({
    paper: /paper:\s*"([^"]+)"/.exec(page)?.[1],
    orientation: /flipped:\s*true/.test(page) ? "landscape" : "portrait",
    margins: {
      top: side("top", "y"),
      bottom: side("bottom", "y"),
      left: side("left", "x"),
      right: side("right", "x"),
    },
    // Sans `font:` explicite, Typst compose en Libertinus Serif : le bloc doit le conserver.
    font: font ?? "Libertinus Serif",
    fontSize,
    // No header or footer in the source: the band is deduced empty, which is
    // what makes it render as nothing now that presence comes from the fields.
    header: header === undefined ? { text: "", logo: null, rule: false } : {
      text: headerText(header),
      logo: /image\("assets\/([^"]+)"/.exec(header)?.[1] ?? null,
      rule: /#line\(/.test(header),
    },
    footer: footer === undefined ? { text: "", logo: null, rule: false, numbering: "none" } : {
      numbering: numbering(footer),
      align: /#align\((left|center|right)\)/.exec(footer)?.[1],
      firstPage: !/counter\(page\)\.get\(\)\.first\(\)\s*>\s*1/.test(footer),
      rule: /#line\(/.test(footer),
    },
    headings: { color },
    textStyles: font || fontSize || color
      ? {
        body: { font: font ?? "Libertinus Serif", fontSize, color: "#000000" },
        ...(["h1", "h2", "h3"] as const).reduce<Record<string, { font: string | undefined; fontSize: number | undefined; color: string | undefined }>>(
          (acc, key, i) => {
            const scale = HEADING_SIZE_FACTORS.normal[i];
            acc[key] = {
              font: font ?? "Libertinus Serif",
              fontSize: fontSize ? Math.round(fontSize * scale * 10) / 10 : undefined,
              color,
            };
            return acc;
          },
          {},
        ),
      }
      : undefined,
  });
}
