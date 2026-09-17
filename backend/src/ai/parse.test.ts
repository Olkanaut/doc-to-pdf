import { describe, expect, it } from "vitest";
import { parseAiReply } from "./parse.js";

const TEMPLATE = '#set page(paper: "a4")\n#include "body.typ"';

describe("parseAiReply", () => {
  it("lit les trois balises", () => {
    const text = [
      "<summary>Marges réduites.</summary>",
      "<changes><item>marges à 15 mm</item><item>pied de page centré</item></changes>",
      `<typst>\n${TEMPLATE}\n</typst>`,
    ].join("\n");
    expect(parseAiReply(text)).toEqual({
      summary: "Marges réduites.",
      changes: ["marges à 15 mm", "pied de page centré"],
      source: TEMPLATE + "\n",
    });
  });

  it("sans balise, prend le texte entier comme source s'il contient l'include", () => {
    expect(parseAiReply(`${TEMPLATE}\n`)).toEqual({
      summary: "",
      changes: [],
      source: TEMPLATE + "\n",
    });
  });

  it("retire un bloc de code Markdown autour de la source", () => {
    const text = `<summary>ok</summary><typst>\n\`\`\`typst\n${TEMPLATE}\n\`\`\`\n</typst>`;
    expect(parseAiReply(text)?.source).toBe(TEMPLATE + "\n");
  });

  it("tolère une balise <typst> non fermée", () => {
    const text = `<summary>ok</summary>\n<typst>\n${TEMPLATE}`;
    expect(parseAiReply(text)?.source).toBe(TEMPLATE + "\n");
  });

  it("rejette une réponse sans template", () => {
    expect(parseAiReply("Je ne peux pas modifier ce template.")).toBeNull();
    expect(parseAiReply("")).toBeNull();
    // une source qui a perdu l'include compilerait sans le corps : refusée
    expect(parseAiReply('<typst>#set page(paper: "a4")</typst>')).toBeNull();
  });
});
