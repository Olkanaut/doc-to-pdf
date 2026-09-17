import { describe, expect, it } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  tableToTypst,
  type TableBlockLike,
  type TableCellLike,
} from "./tableToTypst.js";
import { escapeTypstText } from "./escapeTypst.js";
import type { InlineContent, TableBlock } from "../types/blocks.js";

// Rendu minimal des inlines, même échappement que blocksToTypst.inlineToTypst
// pour le texte brut. Au branchement, c'est inlinesToTypst qui sera injecté.
const render = (inlines: InlineContent[]): string =>
  inlines
    .map((inline) =>
      inline.type === "text" ? escapeTypstText(inline.text) : "",
    )
    .join("");

const text = (value: string): InlineContent[] => [
  { type: "text", text: value },
];

/** Forme simplifiée (fixtures maison) : `{ content }` seulement. */
const simple = (value: string): TableCellLike => ({ content: text(value) });

/** Forme réelle Docs : `type: "tableCell"` + props complets. */
const docsCell = (
  value: string,
  props: Partial<NonNullable<TableCellLike["props"]>> = {},
): TableCellLike => ({
  type: "tableCell",
  content: text(value),
  props: {
    colspan: 1,
    rowspan: 1,
    backgroundColor: "default",
    textColor: "default",
    textAlignment: "left",
    ...props,
  },
});

const table = (
  rows: TableCellLike[][],
  extra: Partial<TableBlockLike["content"]> = {},
): TableBlockLike => ({
  type: "table",
  content: { rows: rows.map((cells) => ({ cells })), ...extra },
});

/**
 * Cellules émises : un `[` en début de ligne de cellules ou après `, `, précédé
 * ou non de `table.cell(...)`. Les `[` internes (#strong[, #text(...)[) ne
 * comptent pas.
 */
const countCells = (typst: string): number =>
  (typst.match(/(?:^ +|, )(?:table\.cell\([^)]*\))?\[/gm) ?? []).length;

describe("tableToTypst — forme et pistes", () => {
  it("forme simplifiée 3×3 → columns: 3 et 9 cellules, sans en-tête", () => {
    const block = table([
      [simple("a1"), simple("b1"), simple("c1")],
      [simple("a2"), simple("b2"), simple("c2")],
      [simple("a3"), simple("b3"), simple("c3")],
    ]);
    const typst = tableToTypst(block, render);
    expect(typst).toContain("columns: 3,");
    // Le template pilote le style (#set table) : rien d'explicite dans l'appel.
    expect(typst).not.toMatch(/^\s*stroke:/m);
    expect(typst).not.toMatch(/^\s*inset:/m);
    expect(typst).not.toContain("table.header");
    expect(typst).not.toContain("table.cell");
    expect(countCells(typst)).toBe(9);
    expect(typst).toMatch(/^#table\(\n[\s\S]*\n\)$/);
  });

  it("accepte le TableBlock de types/blocks.ts sans conversion", () => {
    const block: TableBlock = {
      type: "table",
      content: { rows: [{ cells: [{ content: text("x") }] }] },
    };
    // Vérification de type : TableBlock est assignable à TableBlockLike.
    expect(tableToTypst(block, render)).toContain("[x]");
  });

  it("columnWidths [120, null] → columns: (120fr, 120fr) : null vaut defaultCellMinWidth", () => {
    const block = table([[docsCell("a"), docsCell("b")]], {
      columnWidths: [120, null],
    });
    expect(tableToTypst(block, render)).toContain("columns: (120fr, 120fr),");
  });

  it("columnWidths réel Docs [120, 82, 275, null, null]", () => {
    const row = ["a", "b", "c", "d", "e"].map((v) => docsCell(v));
    const block = table([row], {
      type: "tableContent",
      columnWidths: [120, 82, 275, null, null],
      headerRows: 0,
    });
    expect(tableToTypst(block, render)).toContain(
      "columns: (120fr, 82fr, 275fr, 120fr, 120fr),",
    );
  });

  it("largeur non exploitable (0, négative, NaN, chaîne, exponentielle) → 120fr, jamais auto", () => {
    const row = ["a", "b", "c", "d", "e"].map((v) => docsCell(v));
    const widths = [0, -5, Number.NaN, "120", 1e21] as unknown as number[];
    const block = table([row], { columnWidths: widths });
    const typst = tableToTypst(block, render);
    expect(typst).toContain("columns: (120fr, 120fr, 120fr, 120fr, 120fr),");
    expect(typst).not.toContain("auto");
  });

  it("columnWidths plus court que la grille → complété par 120fr", () => {
    const block = table([[docsCell("a"), docsCell("b"), docsCell("c")]], {
      columnWidths: [50],
    });
    expect(tableToTypst(block, render)).toContain(
      "columns: (50fr, 120fr, 120fr),",
    );
  });

  it("tableau vide → chaîne vide", () => {
    expect(tableToTypst(table([]), render)).toBe("");
    expect(tableToTypst(table([[]]), render)).toBe("");
  });
});

describe("tableToTypst — en-tête", () => {
  it("headerRows 1 → table.header(...) et cellules #strong", () => {
    const block = table(
      [
        [docsCell("Nom"), docsCell("Origine")],
        [docsCell("Docs"), docsCell("DINUM")],
      ],
      { headerRows: 1 },
    );
    const typst = tableToTypst(block, render);
    expect(typst).toContain(
      "table.header(\n    [#strong[Nom]], [#strong[Origine]],\n  ),",
    );
    expect(typst).toContain("  [Docs], [DINUM],");
    expect(typst).not.toContain("#strong[Docs]");
  });

  it("headerRows absent ou 0 → pas d'en-tête ; > nb lignes → borné", () => {
    const rows = [[docsCell("a")], [docsCell("b")]];
    expect(tableToTypst(table(rows), render)).not.toContain("table.header");
    expect(tableToTypst(table(rows, { headerRows: 0 }), render)).not.toContain(
      "table.header",
    );
    const all = tableToTypst(table(rows, { headerRows: 5 }), render);
    expect(all).toContain("[#strong[a]]");
    expect(all).toContain("[#strong[b]]");
  });
});

describe("tableToTypst — fusions", () => {
  it("colspan 3 → table.cell(colspan: 3) et 5 pistes malgré 3 cellules sur la ligne", () => {
    const block = table([
      [docsCell("fusion", { colspan: 3 }), docsCell("d"), docsCell("e")],
      ["1", "2", "3", "4", "5"].map((v) => docsCell(v)),
    ]);
    const typst = tableToTypst(block, render);
    expect(typst).toContain("columns: 5,");
    expect(typst).toContain("table.cell(colspan: 3)[fusion], [d], [e],");
  });

  it("rowspan 2 → table.cell(rowspan: 2) ; la cellule couverte est absente et rien n'est émis", () => {
    const block = table([
      [docsCell("haut", { rowspan: 2 }), docsCell("b1")],
      [docsCell("b2")],
    ]);
    const typst = tableToTypst(block, render);
    expect(typst).toContain("columns: 2,");
    expect(typst).toContain("table.cell(rowspan: 2)[haut], [b1],");
    expect(typst).toContain("\n  [b2],\n");
    expect(countCells(typst)).toBe(3);
  });

  it("rowspan venu d'au-dessus élargit la ligne suivante (pistes = 3, pas 2)", () => {
    const block = table([
      [docsCell("a", { rowspan: 2 }), docsCell("b")],
      [docsCell("c"), docsCell("d")],
    ]);
    expect(tableToTypst(block, render)).toContain("columns: 3,");
  });

  it("colspan et rowspan combinés", () => {
    const block = table([
      [docsCell("bloc", { colspan: 2, rowspan: 2 }), docsCell("c1")],
      [docsCell("c2")],
      [docsCell("a3"), docsCell("b3"), docsCell("c3")],
    ]);
    const typst = tableToTypst(block, render);
    expect(typst).toContain("columns: 3,");
    expect(typst).toContain("table.cell(colspan: 2, rowspan: 2)[bloc]");
  });

  it("colspan/rowspan bornés à des entiers ≥ 1", () => {
    const rows = [
      [docsCell("a", { colspan: 0 }), docsCell("b", { rowspan: -3 })],
    ];
    expect(tableToTypst(table(rows), render)).not.toContain("table.cell");
    const weird = [
      [
        docsCell("a", { colspan: 2.7 }),
        docsCell("b", { rowspan: Number.NaN }),
        docsCell("c", { colspan: "5" as unknown as number }),
      ],
    ];
    const typst = tableToTypst(table(weird), render);
    expect(typst).toContain("table.cell(colspan: 2)[a], [b], [c],");
    expect(typst).toContain("columns: 4,");
  });

  it("rowspan d'une cellule d'en-tête → borné à l'en-tête, cellule vide émise dans le corps", () => {
    // Typst 0.15.1 : un rowspan parti de table.header ne réserve rien dans le
    // corps (ligne d'en-tête vide ajoutée, corps décalé d'une colonne).
    const block = table(
      [
        [docsCell("H1", { rowspan: 2 }), docsCell("H2"), docsCell("H3")],
        [docsCell("b2"), docsCell("b3")],
        [docsCell("c1"), docsCell("c2"), docsCell("c3")],
      ],
      { headerRows: 1 },
    );
    const typst = tableToTypst(block, render);
    expect(typst).toContain("columns: 3,");
    expect(typst).not.toContain("rowspan");
    expect(typst).toContain(
      "table.header(\n    [#strong[H1]], [#strong[H2]], [#strong[H3]],\n  ),",
    );
    expect(typst).toContain("\n  [], [b2], [b3],\n  [c1], [c2], [c3],\n");
  });

  it("rowspan qui reste dans un en-tête de deux lignes → conservé", () => {
    const block = table(
      [
        [docsCell("H1", { rowspan: 2 }), docsCell("H2")],
        [docsCell("H2b")],
        [docsCell("a"), docsCell("b")],
      ],
      { headerRows: 2 },
    );
    const typst = tableToTypst(block, render);
    expect(typst).toContain(
      "table.header(\n    table.cell(rowspan: 2)[#strong[H1]], [#strong[H2]],\n    [#strong[H2b]],\n  ),",
    );
    expect(typst).toContain("\n  [a], [b],\n");
  });

  it("rowspan qui dépasse la dernière ligne → borné aux lignes restantes", () => {
    const block = table([[docsCell("a", { rowspan: 9 }), docsCell("b")]]);
    expect(tableToTypst(block, render)).not.toContain("rowspan");
  });

  it("ligne plus courte que la grille → complétée par des cellules vides", () => {
    const block = table([
      [simple("a"), simple("b"), simple("c")],
      [simple("d")],
    ]);
    expect(tableToTypst(block, render)).toContain("\n  [d], [], [],\n");
  });
});

describe("tableToTypst — couleurs et alignement", () => {
  it('backgroundColor gray → fill: rgb("#ebeced") (hex de @blocknote/core 0.54.0)', () => {
    const block = table([[docsCell("a", { backgroundColor: "gray" })]]);
    expect(tableToTypst(block, render)).toContain(
      'table.cell(fill: rgb("#ebeced"))[a]',
    );
  });

  it("toutes les couleurs de fond BlockNote", () => {
    const expected: Record<string, string> = {
      gray: "#ebeced",
      brown: "#e9e5e3",
      red: "#fbe4e4",
      orange: "#f6e9d9",
      yellow: "#fbf3db",
      green: "#ddedea",
      blue: "#ddebf1",
      purple: "#eae4f2",
      pink: "#f4dfeb",
    };
    for (const [name, hex] of Object.entries(expected)) {
      const block = table([[docsCell("x", { backgroundColor: name })]]);
      expect(tableToTypst(block, render)).toContain(`fill: rgb("${hex}")`);
    }
  });

  it("couleur default ou inconnue → pas de fill, et l'entrée n'est jamais recopiée", () => {
    const def = table([[docsCell("a", { backgroundColor: "default" })]]);
    expect(tableToTypst(def, render)).not.toContain("fill");
    const injected = table([
      [docsCell("a", { backgroundColor: '")]#eval("1"' })],
    ]);
    const typst = tableToTypst(injected, render);
    expect(typst).not.toContain("fill");
    expect(typst).not.toContain("eval");
  });

  it('textColor red → #text(fill: rgb("#e03e3e"))[...]', () => {
    const block = table([[docsCell("alerte", { textColor: "red" })]]);
    expect(tableToTypst(block, render)).toContain(
      '[#text(fill: rgb("#e03e3e"))[alerte]]',
    );
  });

  it("toutes les couleurs de texte BlockNote", () => {
    const expected: Record<string, string> = {
      gray: "#9b9a97",
      brown: "#64473a",
      red: "#e03e3e",
      orange: "#d9730d",
      yellow: "#dfab01",
      green: "#4d6461",
      blue: "#0b6e99",
      purple: "#6940a5",
      pink: "#ad1a72",
    };
    for (const [name, hex] of Object.entries(expected)) {
      const block = table([[docsCell("x", { textColor: name })]]);
      expect(tableToTypst(block, render)).toContain(
        `#text(fill: rgb("${hex}"))`,
      );
    }
  });

  it("textColor dans une cellule d'en-tête : #strong enveloppe #text", () => {
    const block = table([[docsCell("t", { textColor: "blue" })]], {
      headerRows: 1,
    });
    expect(tableToTypst(block, render)).toContain(
      '[#strong[#text(fill: rgb("#0b6e99"))[t]]]',
    );
  });
  it("textAlignment right / center → align ; left / justify → rien", () => {
    const right = table([[docsCell("a", { textAlignment: "right" })]]);
    expect(tableToTypst(right, render)).toContain(
      "table.cell(align: right)[a]",
    );
    const center = table([[docsCell("a", { textAlignment: "center" })]]);
    expect(tableToTypst(center, render)).toContain(
      "table.cell(align: center)[a]",
    );
    const left = table([[docsCell("a", { textAlignment: "left" })]]);
    expect(tableToTypst(left, render)).not.toContain("align");
    const justify = table([[docsCell("a", { textAlignment: "justify" })]]);
    expect(tableToTypst(justify, render)).not.toContain("align");
  });

  it("toutes les options ensemble, dans un ordre stable", () => {
    const block = table([
      [
        docsCell("tout", {
          colspan: 2,
          rowspan: 2,
          backgroundColor: "yellow",
          textColor: "purple",
          textAlignment: "center",
        }),
        docsCell("c"),
      ],
      [docsCell("d")],
    ]);
    expect(tableToTypst(block, render)).toContain(
      'table.cell(colspan: 2, rowspan: 2, fill: rgb("#fbf3db"), align: center)[#text(fill: rgb("#6940a5"))[tout]]',
    );
  });

  it("le contenu passe par renderInlines (échappement inclus)", () => {
    const block = table([[simple("100% # fait [x]")]]);
    expect(tableToTypst(block, render)).toContain("[100% \\# fait \\[x\\]]");
  });
});

// Compilation réelle : typst 0.15 + pdftotext (poppler) sur le PATH.
const hasTools =
  spawnSync("typst", ["--version"]).status === 0 &&
  spawnSync("pdftotext", ["-v"]).status === 0;

/** Le template pilote le style des tableaux : ce préambule joue le rôle de son `#set table` (section « Tableaux », filets fins). */
const TABLE_SET = "#set table(stroke: 0.5pt + luma(200), inset: 6pt)\n";
const PAGE =
  "#set page(width: 160mm, height: auto, margin: 10mm)\n" + TABLE_SET;
/** Largeur de texte du template le plus étroit (minimal.typ, ministere.typ : A4, marges 2,5 cm → 160 mm). */
const PAGE_A4 =
  '#set page(paper: "a4", height: auto, margin: 25mm)\n' + TABLE_SET;

function compileToText(
  name: string,
  typstBody: string,
  page: string = PAGE,
): { pdfSize: number; layout: string } {
  const dir = mkdtempSync(join(tmpdir(), "table-typst-"));
  const src = join(dir, `${name}.typ`);
  const pdf = join(dir, `${name}.pdf`);
  writeFileSync(src, page + typstBody + "\n");
  execFileSync("typst", ["compile", src, pdf], { stdio: "pipe" });
  const layout = execFileSync("pdftotext", ["-layout", pdf, "-"], {
    encoding: "utf8",
  });
  return { pdfSize: statSync(pdf).size, layout };
}

describe.skipIf(!hasTools)("tableToTypst — compilation Typst réelle", () => {
  it("en-tête + colspan + rowspan + fill compile, et chaque cellule tombe dans sa colonne", () => {
    // H1 | H2 | H3
    // A (colspan 2)  | B
    // C (rowspan 2) | D | E
    //  (C)          | F | G
    const block = table(
      [
        [docsCell("H1"), docsCell("H2"), docsCell("H3")],
        [docsCell("A", { colspan: 2, backgroundColor: "gray" }), docsCell("B")],
        [
          docsCell("C", { rowspan: 2, textAlignment: "right" }),
          docsCell("D"),
          docsCell("E", { textColor: "red" }),
        ],
        [docsCell("F"), docsCell("G", { textAlignment: "center" })],
      ],
      { type: "tableContent", columnWidths: [120, 82, null], headerRows: 1 },
    );
    const typst = tableToTypst(block, render);
    const { pdfSize, layout } = compileToText("fusions", typst);
    expect(pdfSize).toBeGreaterThan(0);

    const lines = layout.split("\n").filter((line) => line.trim() !== "");
    expect(lines.length).toBeGreaterThanOrEqual(4);
    const [header, rowA, rowC, rowF] = lines;
    for (const label of ["H1", "H2", "H3"]) expect(header).toContain(label);

    const col = (line: string, label: string) => line.indexOf(label);
    expect(col(header, "H1")).toBeLessThan(col(header, "H2"));
    expect(col(header, "H2")).toBeLessThan(col(header, "H3"));

    // B suit un colspan 2 : il doit être dans la 3e colonne, sous H3, pas sous H2.
    expect(rowA).toContain("A");
    expect(col(rowA, "B")).toBeGreaterThan(col(header, "H2"));
    expect(Math.abs(col(rowA, "B") - col(header, "H3"))).toBeLessThanOrEqual(2);

    // D et E après C.
    expect(col(rowC, "D")).toBeGreaterThan(col(rowC, "C"));
    expect(Math.abs(col(rowC, "D") - col(header, "H2"))).toBeLessThanOrEqual(2);
    expect(Math.abs(col(rowC, "E") - col(header, "H3"))).toBeLessThanOrEqual(2);

    // F est la première cellule de sa ligne mais C (rowspan 2) occupe la 1re
    // colonne : F doit tomber sous H2, G sous H3.
    expect(rowF).not.toContain("C");
    expect(col(rowF, "F")).toBeGreaterThan(col(header, "H1"));
    expect(Math.abs(col(rowF, "F") - col(header, "H2"))).toBeLessThanOrEqual(2);
    expect(col(rowF, "G")).toBeGreaterThan(col(rowF, "F"));
  });

  it("rowspan d'en-tête : b2 tombe sous H2, c1 sous H1", () => {
    const block = table(
      [
        [docsCell("H1", { rowspan: 2 }), docsCell("H2"), docsCell("H3")],
        [docsCell("b2"), docsCell("b3")],
        [docsCell("c1"), docsCell("c2"), docsCell("c3")],
      ],
      { headerRows: 1 },
    );
    const { pdfSize, layout } = compileToText(
      "entete-rowspan",
      tableToTypst(block, render),
    );
    expect(pdfSize).toBeGreaterThan(0);
    const lines = layout.split("\n").filter((line) => line.trim() !== "");
    expect(lines.length).toBe(3);
    const [header, rowB, rowC] = lines;
    const col = (line: string, label: string) => line.indexOf(label);
    expect(Math.abs(col(rowB, "b2") - col(header, "H2"))).toBeLessThanOrEqual(
      2,
    );
    expect(Math.abs(col(rowB, "b3") - col(header, "H3"))).toBeLessThanOrEqual(
      2,
    );
    expect(Math.abs(col(rowC, "c1") - col(header, "H1"))).toBeLessThanOrEqual(
      2,
    );
  });

  it("cas limites : cellules vides, en-tête vide, ligne complétée, toutes couleurs", () => {
    const block = table(
      [
        [
          docsCell(""),
          docsCell("Titre", { textColor: "blue" }),
          docsCell("", { backgroundColor: "pink" }),
        ],
        [
          docsCell("x", {
            colspan: 2,
            rowspan: 2,
            backgroundColor: "green",
            textAlignment: "center",
          }),
          docsCell(""),
        ],
        [docsCell("y", { textAlignment: "justify" })],
        [simple("z")],
      ],
      { headerRows: 1, columnWidths: [null, 200, null] },
    );
    const typst = tableToTypst(block, render);
    const { pdfSize, layout } = compileToText("limites", typst);
    expect(pdfSize).toBeGreaterThan(0);
    expect(layout).toContain("Titre");
    expect(layout).toContain("z");
  });

  it("colonne null à contenu long : l'en-tête reste sur une ligne, sans superposition", () => {
    // admin-tableau-complexe, tableau 1 : columnWidths [180, 90, 90, 90, null].
    // Avec `null -> auto`, typst 0.15.1 écrasait les quatre colonnes `fr`
    // (pdftotext -layout : « DirectionTitulaires » puis « Contractuels » puis
    // « TotalObservations » sur trois lignes). Compilé à la largeur de texte
    // des templates (160 mm) : en dessous de ~150 mm, « Contractuels » en gras
    // déborde de sa piste 90fr et touche « Total » (limite des pistes `fr`).
    const labels = [
      "Direction",
      "Titulaires",
      "Contractuels",
      "Total",
      "Observations",
    ];
    const block = table(
      [
        labels.map((v) => docsCell(v)),
        [
          docsCell("Secrétariat général"),
          docsCell("52", { textAlignment: "right" }),
          docsCell("9", { textAlignment: "right" }),
          docsCell("61", { textAlignment: "right" }),
          docsCell(
            "Réorganisation en cours ; chiffres provisoires au 30 juin 2026",
            {
              backgroundColor: "yellow",
            },
          ),
        ],
      ],
      {
        type: "tableContent",
        columnWidths: [180, 90, 90, 90, null],
        headerRows: 1,
      },
    );
    const typst = tableToTypst(block, render);
    expect(typst).toContain("columns: (180fr, 90fr, 90fr, 90fr, 120fr),");
    const { layout } = compileToText("null-long", typst, PAGE_A4);
    const header = layout.split("\n").find((line) => line.trim() !== "") ?? "";
    let previousEnd = -1;
    for (const label of labels) {
      const at = header.indexOf(label);
      expect(
        at,
        `« ${label} » absent de la 1re ligne : ${JSON.stringify(header)}`,
      ).toBeGreaterThan(previousEnd);
      previousEnd = at + label.length;
    }
  });

  it("forme simplifiée 3×3 telle que dans nos fixtures compile", () => {
    const block = table([
      [simple("Poste"), simple("Montant"), simple("Part")],
      [simple("Infrastructure"), simple("45 000 €"), simple("30 %")],
      [simple("Développement"), simple("105 000 €"), simple("70 %")],
    ]);
    const { pdfSize, layout } = compileToText(
      "simple",
      tableToTypst(block, render),
    );
    expect(pdfSize).toBeGreaterThan(0);
    expect(layout).toContain("Infrastructure");
    expect(layout).toContain("105 000 €");
  });
});
