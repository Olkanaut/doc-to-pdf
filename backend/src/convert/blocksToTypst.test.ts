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
