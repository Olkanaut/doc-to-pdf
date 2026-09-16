/**
 * Bloc « dots:layout » : la mise en page réglée par des contrôles, traduite en
 * Typst et insérée dans le gabarit juste avant `#include "body.typ"`. En Typst,
 * la dernière règle `#set` gagne : placé après les `#set` écrits à la main, le
 * bloc a le dernier mot sur la page, la police, les titres et l'allure des
 * tableaux (leur structure vient du document, voir convert/blocksToTypst.ts).
 */
import { escapeTypstText } from "../convert/escapeTypst.js";
import {
  defaultLayout,
  INLINE_LOGO_HEIGHT_MM,
  sanitizeLayout,
  type LayoutConfig,
  type Numbering,
} from "./layoutConfig.js";

export const LAYOUT_BEGIN = "// dots:layout begin";
export const LAYOUT_END = "// dots:layout end";
/** Préfixe commun aux trois lignes-marqueurs (begin, `{json}`, end). */
const LAYOUT_MARK = "// dots:layout";

/** Polices de repli, toujours présentes : Marianne n'est pas installée partout. */
const FALLBACK_FONTS = ["Arial", "Helvetica", "Libertinus Serif"];

/** Tailles des titres de niveau 1 à 3, en em, selon l'échelle. */
const HEADING_SIZES = {
  compact: [1.3, 1.15, 1.05],
  normal: [1.6, 1.3, 1.1],
  large: [1.9, 1.5, 1.2],
} as const;

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
    .map((line) =>
      escapeTypstText(line), // couvre aussi `/` et les marqueurs de début de ligne
    )
    .join(" \\ ");
}

/** Couleur déjà validée (#rrggbb) par sanitizeLayout. */
function rgb(color: string): string {
  return `rgb("${color}")`;
}

function contentBlock(parts: string[], indent: string): string {
  return `[\n${parts.map((p) => indent + p).join("\n")}\n${indent.slice(2)}]`;
}

/**
 * Bandeau bord à bord : `place` sort de la zone de texte par un `dx` négatif
 * égal à la marge, et l'image est élargie des deux marges. La marge du côté
 * concerné doit valoir au moins la hauteur rendue, sinon Typst rogne l'image —
 * c'est l'appelant qui la règle (voir ingest/templateFromAnalysis.ts).
 */
function bleed(file: string, side: "top" | "bottom", cfg: LayoutConfig): string {
  const { left, right } = cfg.margins;
  return `#place(${side} + left, dx: -${left}mm, image("assets/${file}", width: 100% + ${left + right}mm))`;
}

function header(cfg: LayoutConfig): string {
  const h = cfg.header;
  if (!h.enabled) return "none";
  const parts: string[] = [];
  const body = `[${text(h.text)}]`;
  if (h.logo && h.fullBleed) {
    parts.push(bleed(h.logo, "top", cfg));
    if (h.text) parts.push(`#align(${h.align})${body}`);
  } else if (h.logo) {
    parts.push(
      `#grid(columns: (auto, 1fr), column-gutter: 0.4cm, align: (left + horizon, ${h.align} + horizon), image("assets/${h.logo}", height: ${INLINE_LOGO_HEIGHT_MM}mm), ${body})`,
    );
  } else if (h.text) {
    parts.push(`#align(${h.align})${body}`);
  }
  if (h.rule) parts.push("#v(0.2cm)", `#line(length: 100%, stroke: 0.5pt + ${rgb(cfg.headings.color)})`);
  return contentBlock(parts, "    ");
}

function footer(cfg: LayoutConfig): string {
  const f = cfg.footer;
  if (!f.enabled) return "none";
  const parts: string[] = [];
  if (f.logo && f.fullBleed) parts.push(bleed(f.logo, "bottom", cfg));
  else if (f.logo) parts.push(`#align(${f.align})[#image("assets/${f.logo}", height: ${INLINE_LOGO_HEIGHT_MM}mm)]`);
  if (f.rule) parts.push(`#line(length: 100%, stroke: 0.5pt + ${rgb(cfg.headings.color)})`, "#v(0.2cm)");
  const pieces = [text(f.text), NUMBERING[f.numbering]].filter(Boolean);
  if (pieces.length) parts.push(`#align(${f.align})[${pieces.join("#h(1em)")}]`);
  if (f.firstPage) return contentBlock(parts, "    ");
  // Pas de pied sur la première page : tout son contenu passe sous condition.
  return contentBlock(
    [`#context { if counter(page).get().first() > 1 ${contentBlock(parts, "      ")} }`],
    "    ",
  );
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
  const headerFill = t.headerFill === "grey" ? "luma(240)" : t.headerFill === "brand" ? color : undefined;
  const branches: string[] = [];
  if (headerFill) branches.push(`if y == 0 { ${headerFill} }`);
  if (t.zebra) branches.push(`if calc.odd(y) { luma(248) }`);
  const fill = branches.length ? `, fill: (x, y) => ${branches.join(" else ")}` : "";
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
  const m = cfg.margins;
  const fonts = [cfg.font, ...FALLBACK_FONTS.filter((f) => f !== cfg.font)];
  const color = rgb(cfg.headings.color);
  // 0.65em est l'interligne par défaut de Typst, pris comme équivalent de 1.2.
  const leading = Math.round(((0.65 * cfg.lineHeight) / 1.2) * 100) / 100;
  return [
    LAYOUT_BEGIN,
    jsonLine(cfg),
    "#set page(",
    `  paper: "${cfg.paper}",`,
    `  flipped: ${cfg.orientation === "landscape"},`,
    `  margin: (top: ${m.top}mm, bottom: ${m.bottom}mm, left: ${m.left}mm, right: ${m.right}mm),`,
    `  header: ${header(cfg)},`,
    `  footer: ${footer(cfg)},`,
    // Un bandeau bord à bord posé par `place` reste borné par la part de marge
    // que Typst réserve par défaut (30 %) entre l'en-tête/pied et le corps : à
    // 0 %, le bandeau dispose de toute la hauteur que templateFromAnalysis.ts
    // lui a réservée, sans quoi son bas se fait rogner.
    ...(cfg.header.enabled && cfg.header.logo && cfg.header.fullBleed ? [`  header-ascent: 0%,`] : []),
    ...(cfg.footer.enabled && cfg.footer.logo && cfg.footer.fullBleed ? [`  footer-descent: 0%,`] : []),
    ")",
    `#set text(font: (${fonts.map((f) => JSON.stringify(f)).join(", ")}), size: ${cfg.fontSize}pt)`,
    `#set par(leading: ${leading}em)`,
    ...HEADING_SIZES[cfg.headings.scale].map(
      (size, i) => `#show heading.where(level: ${i + 1}): set text(size: ${size}em, fill: ${color})`,
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
  const end = begin < 0 ? -1 : lines.findIndex((l, i) => i > begin && l.trim() === LAYOUT_END);
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
export function readLayout(source: string): { layout: LayoutConfig; managed: boolean } {
  const lines = source.split("\n");
  const begin = lines.findIndex((l) => l.trim() === LAYOUT_BEGIN);
  if (begin < 0) return { layout: deduceLayout(source), managed: false };
  const end = lines.findIndex((l, i) => i > begin && l.trim() === LAYOUT_END);
  const json = lines
    .slice(begin + 1, end > begin ? end : undefined)
    .map((l) => l.trim())
    .find((l) => l.startsWith(`${LAYOUT_MARK} {`));
  try {
    return { layout: sanitizeLayout(JSON.parse(json ? json.slice(LAYOUT_MARK.length) : "")), managed: true };
  } catch {
    return { layout: defaultLayout(), managed: true };
  }
}

// ── Déduction depuis une source écrite à la main ─────────────────────────────

/** Indice du `close` apparié au `open` situé en `from`, ou -1. */
function closing(src: string, from: number, open: string, close: string): number {
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
  const per: Record<string, number> = { cm: 10, mm: 1, pt: 25.4 / 72, in: 25.4 };
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
  const m = /(Page\s+)?#context\s+counter\(page\)\.display\("[^"]*"(,\s*both:\s*true)?\)/.exec(footer);
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

  const margin = /(?:^|[,(\s])margin:\s*(\([^)]*\)|[^,\n]+)/.exec(page)?.[1]?.trim();
  const sides: Record<string, number | undefined> = {};
  if (margin?.startsWith("(")) {
    for (const [, k, v] of margin.matchAll(/(\w+):\s*([^,()]+)/g)) sides[k] = toMm(v);
  } else {
    sides.rest = toMm(margin);
  }
  const side = (k: string, axis: string) => sides[k] ?? sides[axis] ?? sides.rest;

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
    // En-tête ou pied absent : seul `enabled` passe à false, le reste garde ses défauts.
    header: header === undefined ? { enabled: false } : {
      enabled: true,
      text: headerText(header),
      logo: /image\("assets\/([^"]+)"/.exec(header)?.[1] ?? null,
      rule: /#line\(/.test(header),
    },
    footer: footer === undefined ? { enabled: false } : {
      enabled: true,
      numbering: numbering(footer),
      align: /#align\((left|center|right)\)/.exec(footer)?.[1],
      firstPage: !/counter\(page\)\.get\(\)\.first\(\)\s*>\s*1/.test(footer),
      rule: /#line\(/.test(footer),
    },
    headings: { color },
  });
}
