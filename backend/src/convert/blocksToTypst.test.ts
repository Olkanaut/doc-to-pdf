import { describe, expect, it } from "vitest";
import { blocksToTypst } from "./blocksToTypst.js";
import { escapeTypstText } from "./escapeTypst.js";
import type { Block } from "../types/blocks.js";

describe("escapeTypstText", () => {
  it("escapes typst special characters", () => {
    expect(escapeTypstText("100% # done * maybe _not_ \\ [x]")).toBe(
      "100% \\# done \\* maybe \\_not\\_ \\\\ \\[x\\]",
    );
  });

  it("leaves plain text untouched", () => {
    expect(escapeTypstText("Bonjour le monde")).toBe("Bonjour le monde");
  });
});

describe("blocksToTypst", () => {
  it("converts headings, paragraphs and marks", () => {
    const blocks: Block[] = [
      { type: "heading", props: { level: 1 }, content: [{ type: "text", text: "Titre" }] },
      {
        type: "paragraph",
        content: [
          { type: "text", text: "un mot en " },
          { type: "text", text: "gras", styles: { bold: true } },
          { type: "text", text: " et un symbole # littéral" },
        ],
      },
    ];
    const { typst } = blocksToTypst(blocks);
    expect(typst).toContain("= Titre");
    expect(typst).toContain("*gras*");
    expect(typst).toContain("\\#");
  });

  it("does not let literal markup characters affect structure", () => {
    const blocks: Block[] = [
      { type: "paragraph", content: [{ type: "text", text: "*not bold* _not italic_" }] },
    ];
    const { typst } = blocksToTypst(blocks);
    expect(typst).toBe("\\*not bold\\* \\_not italic\\_");
  });

  it("registers image assets", () => {
    const blocks: Block[] = [
      { type: "image", props: { url: "images/sample.png", caption: "légende" } },
    ];
    const { typst, images } = blocksToTypst(blocks);
    expect(images).toEqual([{ src: "images/sample.png", dest: "assets/img-0.png" }]);
    expect(typst).toContain('#image("assets/img-0.png"');
  });
});

// Régressions trouvées en rendant de vrais documents Docs (fixtures reel-*).
// Les trois faisaient échouer tout le rendu en 500, ou cassaient les liens.
describe("contenu réel de Docs", () => {
  it("prend le texte d'un lien dans content[], pas dans .text", () => {
    const blocks: Block[] = [
      {
        type: "paragraph",
        content: [
          {
            type: "link",
            href: "https://wemakecommons.org/",
            content: [{ type: "text", text: "WeMakeCommons", styles: {} }],
          },
        ],
      } as Block,
    ];
    const { typst } = blocksToTypst(blocks);
    expect(typst).toContain('#link("https://wemakecommons.org/")[WeMakeCommons]');
  });

  it("n'échappe pas la syntaxe markup dans une URL", () => {
    const url = "https://ara.numerique.gouv.fr/rapport/NQm_a0q0oJUVhg9_jVjUE/resultats";
    const blocks: Block[] = [
      {
        type: "paragraph",
        content: [{ type: "link", href: url, content: [{ type: "text", text: "rapport", styles: {} }] }],
      } as Block,
    ];
    const { typst } = blocksToTypst(blocks);
    expect(typst).toContain(`#link("${url}")`);
    expect(typst).not.toContain("\\_");
  });

  it("rend un lien interne Docs via props.title", () => {
    const blocks: Block[] = [
      {
        type: "paragraph",
        content: [
          {
            type: "interlinkingLinkInline",
            props: { docId: "1e2a0b10-bc55-4b47-94f6-6b854acc3050", title: "Planned S2 2026" },
          },
        ],
      } as Block,
    ];
    const { typst } = blocksToTypst(blocks);
    expect(typst).toContain("Planned S2 2026");
  });

  it("ignore un inline inconnu sans texte au lieu d'échouer", () => {
    const blocks: Block[] = [
      { type: "paragraph", content: [{ type: "mention", props: { id: "x" } }] } as unknown as Block,
    ];
    expect(() => blocksToTypst(blocks)).not.toThrow();
  });
});

describe("échappement des débuts de ligne et des barres", () => {
  const para = (text: string) => ({ type: "paragraph" as const, content: [{ type: "text" as const, text, styles: {} }] });
  it("un tiret, un numéro ou une URL en début de texte restent du texte", () => {
    const { typst } = blocksToTypst([para("- dans le tiers du trottoir"), para("1. Objet"), para("https://example.fr")] as never);
    expect(typst).toContain("\\- dans le tiers du trottoir");
    expect(typst).toContain("1\\. Objet");
    expect(typst).toContain("https:\\/\\/example.fr");
  });
  it("un tableau Docs fusionné passe par tableToTypst", () => {
    const cell = (text: string, colspan = 1) => ({ type: "tableCell", content: [{ type: "text", text, styles: {} }], props: { colspan, rowspan: 1, backgroundColor: "default", textColor: "default", textAlignment: "left" } });
    const block = { type: "table", content: { type: "tableContent", columnWidths: [100, 100], headerRows: 1, rows: [{ cells: [cell("A"), cell("B")] }, { cells: [cell("total", 2)] }] } };
    const { typst } = blocksToTypst([block] as never);
    expect(typst).toContain("table.header(");
    expect(typst).toContain("table.cell(colspan: 2");
    expect(typst).not.toMatch(/^\s*stroke:/m);
  });
});
