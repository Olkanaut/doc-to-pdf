/**
 * Correspondance tableau Docs (BlockNote `tableContent`) -> Typst `#table(...)`.
 *
 * Module NON BRANCHÉ : `blocksToTypst.ts` ne l'appelle pas encore. Le
 * branchement tient en une ligne dans `blockToTypst` :
 * `case "table": return tableToTypst(block, inlinesToTypst);`
 *
 * Ce que Docs met dans un tableau (lu dans backend/fixtures/reel-roadmap.json) :
 *   content: {
 *     type: "tableContent",
 *     columnWidths: [120, 82, 275, null, null],
 *     headerRows: 1,
 *     rows: [{ cells: [{ type: "tableCell", content: [inlines], props: {
 *       colspan: 1, rowspan: 1, backgroundColor: "default",
 *       textColor: "default", textAlignment: "left" } }] }],
 *   }
 * Nos fixtures maison utilisent la forme simplifiée `cells: [{ content }]`,
 * sans `type` ni `props`. Les deux formes sont acceptées (`TableBlockLike`),
 * sans toucher à `types/blocks.ts` : `TableBlock` y est assignable.
 *
 * Fusions : une cellule couverte par le colspan/rowspan d'une cellule
 * précédente est ABSENTE de la ligne dans Docs. On n'émet rien pour elle :
 * Typst place chaque cellule à la première position libre en sautant celles
 * qu'une fusion occupe (vérifié avec typst 0.15.1 + pdftotext -layout dans
 * tableToTypst.test.ts). Le nombre de pistes est calculé par la même
 * simulation de grille, pas en comptant les cellules de la première ligne.
 * Exception : un rowspan qui part de `table.header(...)` ne réserve RIEN dans
 * le corps (typst 0.15.1 compile sans erreur mais ajoute une ligne d'en-tête
 * vide et la ligne de corps suivante repart de la première piste : décalage
 * d'une colonne). On borne donc le rowspan d'une cellule d'en-tête à
 * l'en-tête, et on émet une cellule vide `[]` à chaque position du corps que
 * Docs considérait couverte. La colonne est juste ; seul le trait entre
 * l'en-tête et la cellule vide trahit la fusion perdue.
 *
 * Largeurs : l'exporteur BlockNote émet `<w>pt` (pixels de l'éditeur pris
 * tels quels). Ici on émet `<w>fr` : 120 + 82 + 275 px = 477 pt = 168 mm,
 * plus que la largeur de texte d'une page A4 à marges de 25 mm ; en fractions,
 * les proportions réglées dans Docs sont conservées et le tableau remplit la
 * largeur du texte sans jamais déborder. `null` (colonne jamais
 * redimensionnée) -> `120fr`, la largeur que l'éditeur lui donne
 * (defaultCellMinWidth: 120 dans @blocknote/core 0.54.0,
 * dist/blocks-CzQLehlc.js:2705). Pas `auto`, contrairement à l'exporteur
 * BlockNote (qui n'a pas de `fr` en concurrence) : Typst mesure les colonnes
 * `auto` avant de partager le reste entre les `fr`, et avec
 * `(180fr, 90fr, 90fr, 90fr, auto)` (admin-tableau-complexe, tableau 1) une
 * phrase dans la colonne `auto` écrasait les quatre autres jusqu'à superposer
 * les en-têtes « Titulaires » et « Contractuels » (typst 0.15.1 ; test de
 * régression dans tableToTypst.test.ts). Prix accepté : une colonne jamais
 * réglée ne suit plus son contenu, et une piste `fr` ne s'élargit pas pour un
 * mot plus long qu'elle (sous ~150 mm de largeur de texte, « Contractuels »
 * en gras dans une piste 90fr sur 570 touche la cellule voisine ; les trois
 * templates donnent 160 à 170 mm). Sans `columnWidths` du tout (fixtures
 * maison), `columns: N` : pistes `auto`, inchangé.
 *
 * Zébrage du template (`#set table(fill: (x, y) => …)`, layout/layoutTypst.ts)
 * et rowspan : Typst évalue `fill` à la ligne de départ de la cellule
 * fusionnée, qui garde ce fond sur toute sa hauteur pendant que le reste de la
 * ligne suivante est zébré. Comportement Typst, connu, non corrigé ici.
 *
 * Aucun `stroke:` ni `inset:` dans l'appel `#table` : un argument explicite
 * écraserait le `#set table(…)` du template (bloc dots:layout, section
 * « Tableaux »). Décision du 2026-09-15 : le template pilote le style des
 * tableaux, le convertisseur n'émet que la structure et les couleurs de
 * cellules voulues dans Docs. Sans `#set table`, défaut Typst (trait noir 1pt).
 */
import type { InlineContent } from "../types/blocks.js";

export interface TableCellPropsLike {
  colspan?: number;
  rowspan?: number;
  backgroundColor?: string;
  textColor?: string;
  textAlignment?: string;
}

export interface TableCellLike {
  type?: string;
  content?: InlineContent[];
  props?: TableCellPropsLike;
}

export interface TableRowLike {
  cells: TableCellLike[];
}

export interface TableBlockLike {
  type: "table";
  content: {
    type?: string;
    columnWidths?: (number | null)[];
    headerRows?: number;
    rows: TableRowLike[];
  };
}

/** Rendu des inlines d'une cellule ; au branchement, c'est `inlinesToTypst`. */
export type RenderInlines = (content: InlineContent[]) => string;

/*
 * Couleurs par défaut de BlockNote, thème clair. Copiées de
 * @blocknote/core 0.54.0, dist/blocks-CzQLehlc.js, région
 * `src/editor/defaultColors.ts` (objet `W`, lignes 1521-1557 dans le conteneur
 * docs-frontend-development-1) ; mêmes valeurs dans dist/style.css
 * (`[data-background-color=gray]{background-color:#ebeced}`).
 * Les hex émises sortent de CES tables, jamais de l'entrée : un nom inconnu ou
 * "default" ne produit rien.
 */
const BACKGROUND_HEX = new Map<string, string>([
  ["gray", "#ebeced"],
  ["brown", "#e9e5e3"],
  ["red", "#fbe4e4"],
  ["orange", "#f6e9d9"],
  ["yellow", "#fbf3db"],
  ["green", "#ddedea"],
  ["blue", "#ddebf1"],
  ["purple", "#eae4f2"],
  ["pink", "#f4dfeb"],
]);

const TEXT_HEX = new Map<string, string>([
  ["gray", "#9b9a97"],
  ["brown", "#64473a"],
  ["red", "#e03e3e"],
  ["orange", "#d9730d"],
  ["yellow", "#dfab01"],
  ["green", "#4d6461"],
  ["blue", "#0b6e99"],
  ["purple", "#6940a5"],
  ["pink", "#ad1a72"],
]);

/** Garde-fou : un colspan/rowspan absurde ne doit pas faire exploser Typst. */
const MAX_SPAN = 1000;

/** Entier borné à [1, MAX_SPAN] ; tout ce qui n'est pas un nombre fini vaut 1. */
function clampSpan(value: unknown): number {
  const n = typeof value === "number" ? Math.floor(value) : Number.NaN;
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(n, MAX_SPAN);
}

function clampHeaderRows(value: unknown, rowCount: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.min(Math.max(0, Math.floor(value)), rowCount);
}

function colorHex(
  table: Map<string, string>,
  name: unknown,
): string | undefined {
  if (typeof name !== "string") return undefined;
  return table.get(name.trim().toLowerCase());
}

/** "left" est le défaut Typst ; "justify" est ignoré (aucun équivalent par cellule). */
function alignOf(value: unknown): "center" | "right" | undefined {
  return value === "center" || value === "right" ? value : undefined;
}

/** Piste d'une colonne jamais réglée : defaultCellMinWidth de BlockNote (120 px), en fractions comme les autres. */
const DEFAULT_TRACK = "120fr";

/**
 * Une piste de colonne. Seul un nombre fini > 0 devient `<w>fr` ; le texte
 * émis est reconstruit depuis le nombre et filtré (pas de notation
 * exponentielle), jamais recopié de l'entrée. Tout le reste (null, absent,
 * invalide) -> DEFAULT_TRACK.
 */
function trackSpec(width: unknown): string {
  if (typeof width !== "number" || !Number.isFinite(width) || width <= 0)
    return DEFAULT_TRACK;
  const text = String(width);
  return /^\d+(\.\d+)?$/.test(text) ? `${text}fr` : DEFAULT_TRACK;
}

function columnsSpec(columnWidths: unknown, tracks: number): string {
  if (!Array.isArray(columnWidths) || columnWidths.length === 0)
    return String(tracks);
  const specs: string[] = [];
  for (let i = 0; i < tracks; i += 1) specs.push(trackSpec(columnWidths[i]));
  return `(${specs.join(", ")})`;
}

interface PlacedCell {
  cell: TableCellLike;
  /** Piste de départ. */
  col: number;
  colspan: number;
  /** Rowspan ÉMIS : celui de Docs, borné aux lignes restantes et à l'en-tête. */
  rowspan: number;
}

/**
 * État d'une position couverte par un rowspan venu d'au-dessus :
 * - "skip" : Typst la réserve lui-même, on n'émet rien ;
 * - "fill" : couverte pour Docs mais pas pour Typst (rowspan parti de
 *   l'en-tête), on émet une cellule vide pour garder la colonne.
 */
type Covered = "skip" | "fill";

interface Grid {
  rows: PlacedCell[][];
  /** Nombre de pistes : le maximum, sur les lignes, de la largeur occupée. */
  tracks: number;
  covered: (Covered | undefined)[][];
}

/**
 * Simule le placement Typst : chaque cellule va à la première piste libre de
 * sa ligne, puis avance de son colspan ; son rowspan réserve les pistes des
 * lignes suivantes. Un rowspan est borné aux lignes restantes, et, pour une
 * cellule d'en-tête, à l'en-tête (voir l'en-tête du fichier).
 */
function placeRows(rows: TableRowLike[], headerRows: number): Grid {
  const covered: (Covered | undefined)[][] = rows.map(() => []);
  const placed: PlacedCell[][] = [];
  let tracks = 0;
  rows.forEach((row, r) => {
    const cells = Array.isArray(row?.cells) ? row.cells : [];
    const out: PlacedCell[] = [];
    let col = 0;
    for (const cell of cells) {
      while (covered[r][col]) col += 1;
      const colspan = clampSpan(cell?.props?.colspan);
      const docsRowspan = Math.min(
        clampSpan(cell?.props?.rowspan),
        rows.length - r,
      );
      const rowspan =
        r < headerRows ? Math.min(docsRowspan, headerRows - r) : docsRowspan;
      for (let dr = 1; dr < docsRowspan; dr += 1) {
        const state: Covered = dr < rowspan ? "skip" : "fill";
        for (let dc = 0; dc < colspan; dc += 1)
          covered[r + dr][col + dc] = state;
      }
      out.push({ cell, col, colspan, rowspan });
      col += colspan;
    }
    placed.push(out);
    while (covered[r][col]) col += 1;
    tracks = Math.max(tracks, col);
  });
  return { rows: placed, tracks, covered };
}

function cellToTypst(
  placed: PlacedCell,
  header: boolean,
  renderInlines: RenderInlines,
): string {
  const { cell, colspan, rowspan } = placed;
  const props = cell?.props ?? {};

  // Le contenu passe par renderInlines (échappement compris). Dans `#table(...)`
  // on est en mode code : les fonctions de texte s'écrivent `[#text(...)[...]]`.
  let inner = renderInlines(Array.isArray(cell?.content) ? cell.content : []);
  const textHex = colorHex(TEXT_HEX, props.textColor);
  if (textHex) inner = `#text(fill: rgb("${textHex}"))[${inner}]`;
  if (header) inner = `#strong[${inner}]`;
  const body = `[${inner}]`;

  const options: string[] = [];
  if (colspan > 1) options.push(`colspan: ${colspan}`);
  if (rowspan > 1) options.push(`rowspan: ${rowspan}`);
  const fillHex = colorHex(BACKGROUND_HEX, props.backgroundColor);
  if (fillHex) options.push(`fill: rgb("${fillHex}")`);
  const align = alignOf(props.textAlignment);
  if (align) options.push(`align: ${align}`);
  return options.length > 0 ? `table.cell(${options.join(", ")})${body}` : body;
}

/**
 * Rend un bloc tableau Docs en appel `#table(...)` Typst.
 * Retourne "" pour un tableau sans aucune piste (aucune ligne, aucune cellule).
 */
export function tableToTypst(
  block: TableBlockLike,
  renderInlines: RenderInlines,
): string {
  const content = block?.content;
  const rows = Array.isArray(content?.rows) ? content.rows : [];
  const headerRows = clampHeaderRows(content?.headerRows, rows.length);
  const grid = placeRows(rows, headerRows);
  if (grid.tracks === 0) return "";

  const rowLines = grid.rows.map((row, r) => {
    const cells: string[] = [];
    let next = 0;
    for (let c = 0; c < grid.tracks; ) {
      const placed = row[next];
      if (placed && placed.col === c) {
        cells.push(cellToTypst(placed, r < headerRows, renderInlines));
        next += 1;
        c += placed.colspan;
      } else if (grid.covered[r][c] === "skip") {
        c += 1;
      } else {
        // Position "fill" (fusion perdue à la frontière de l'en-tête) ou ligne
        // plus courte que la grille (fixture à la main) : cellule vide, pour
        // que la ligne suivante reparte bien au bord gauche.
        cells.push("[]");
        c += 1;
      }
    }
    return `${cells.join(", ")},`;
  });

  const lines = [
    `  columns: ${columnsSpec(content.columnWidths, grid.tracks)},`,
  ];
  if (headerRows > 0) {
    // Typst répète table.header en tête de chaque page du tableau.
    lines.push("  table.header(");
    for (const line of rowLines.slice(0, headerRows)) lines.push(`    ${line}`);
    lines.push("  ),");
  }
  for (const line of rowLines.slice(headerRows)) lines.push(`  ${line}`);
  return `#table(\n${lines.join("\n")}\n)`;
}
