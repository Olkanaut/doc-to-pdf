import { describe, expect, it } from "vitest";
import { mergePatch, parseAiReply } from "./parse.js";
import { systemPrompt } from "./prompt.js";
import { defaultLayout } from "../layout/layoutConfig.js";

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

describe("réponse abrégée <layout>", () => {
  it("lit un correctif JSON et ignore <typst> s'il y en a un", () => {
    const text = [
      "<summary>Marges à 30 mm.</summary>",
      "<changes><item>marges à 30 mm</item></changes>",
      '<layout>{"margins":{"top":30}}</layout>',
      `<typst>\n${TEMPLATE}\n</typst>`,
    ].join("\n");
    expect(parseAiReply(text)).toEqual({
      summary: "Marges à 30 mm.",
      changes: ["marges à 30 mm"],
      layout: { margins: { top: 30 } },
    });
  });

  it("retombe sur <typst> si le correctif est vide ou illisible", () => {
    const suffixe = `<typst>\n${TEMPLATE}\n</typst>`;
    expect(parseAiReply(`<layout>{}</layout>${suffixe}`)?.source).toBe(TEMPLATE + "\n");
    expect(parseAiReply(`<layout>pas du json</layout>${suffixe}`)?.source).toBe(TEMPLATE + "\n");
  });
});

describe("mergePatch", () => {
  it("fusionne les objets clé par clé sans toucher au reste", () => {
    const base = { margins: { top: 25, bottom: 20 }, font: "Marianne" };
    expect(mergePatch(base, { margins: { top: 30 } })).toEqual({
      margins: { top: 30, bottom: 20 },
      font: "Marianne",
    });
  });

  it("remplace un tableau en entier, il ne le fusionne pas", () => {
    const base = { header: { blocks: [{ title: "A" }, { title: "B" }] } };
    expect(mergePatch(base, { header: { blocks: [{ title: "C" }] } })).toEqual({
      header: { blocks: [{ title: "C" }] },
    });
  });

  it("ne modifie pas la base", () => {
    const base = { margins: { top: 25 } };
    mergePatch(base, { margins: { top: 30 } });
    expect(base).toEqual({ margins: { top: 25 } });
  });
});

/**
 * Le prompt recopie LayoutConfig à la main : rien ne garantissait qu'il suive le
 * type. Il ne le suivait pas — il décrivait encore `header.enabled/mode/first`,
 * supprimés depuis, et annonçait qu'un logo à droite était impossible alors que
 * `imagePosition` existe. Ce contrôle est ce qui l'aurait montré.
 */
describe("le prompt décrit le type réel", () => {
  const prompt = systemPrompt(["assets/logo-ministere.png"]);

  it("nomme les clés de premier niveau de la config par défaut", () => {
    for (const cle of Object.keys(defaultLayout()))
      expect(prompt, `clé ${cle} absente du prompt`).toContain(cle);
  });

  it("décrit les bandes par blocks/spacing, pas par l'ancienne forme", () => {
    expect(prompt).toContain("blocks: Block[]");
    expect(prompt).toContain("imagePosition: ImagePosition");
    expect(prompt).toContain("numberingScope: BlockScope");
    expect(prompt).not.toContain("PageBandMode");
    expect(prompt).not.toContain("first: HeaderContent");
  });
});
