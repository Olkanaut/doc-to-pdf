import { describe, expect, it } from "vitest";
import type { Block } from "../types/blocks.js";
import {
  renderBlocksToPdf,
  UnsupportedBodyImagesError,
} from "./renderBlocks.js";

describe("renderBlocksToPdf", () => {
  it("merges converted document blocks into the template", async () => {
    const result = await renderBlocksToPdf({
      blocks: [
        {
          type: "heading",
          props: { level: 1 },
          content: [{ type: "text", text: "Titre Docs" }],
        },
        {
          type: "paragraph",
          content: [{ type: "text", text: "Contenu du document" }],
        },
      ],
      templateSource: '#include "body.typ"',
    });

    expect(result.pdf.subarray(0, 4).toString()).toBe("%PDF");
    expect(result.blockCount).toBe(2);
    expect(result.unsupported).toEqual({});
  });

  it("compiles headings and combined inline styles with literal Typst delimiters", async () => {
    const result = await renderBlocksToPdf({
      blocks: [
        {
          type: "heading",
          props: { level: 1 },
          content: [{ type: "text", text: "Titre principal", styles: { bold: true } }],
        },
        {
          type: "heading",
          props: { level: 2 },
          content: [{ type: "text", text: "Titre secondaire", styles: { italic: true } }],
        },
        {
          type: "heading",
          props: { level: 3 },
          content: [{ type: "text", text: "Section", styles: { underline: true } }],
        },
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "*bold",
              styles: { bold: true, italic: true, underline: true },
            },
          ],
        },
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "*",
              styles: { bold: true, italic: true, underline: true },
            },
          ],
        },
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "_italic_ [texte] #variable \\ `code`",
            },
          ],
        },
      ],
      templateSource: `#set heading(numbering: none)
#show heading.where(level: 1): set text(size: 1.4em)
#show heading.where(level: 2): set text(size: 1.2em)
#show heading.where(level: 3): set text(size: 1.1em)
#include "body.typ"`,
    });

    expect(result.pdf.subarray(0, 4).toString()).toBe("%PDF");
    expect(result.blockCount).toBe(6);
  });

  it("rejects Docs images until remote assets are supported", async () => {
    const blocks = [
      {
        type: "image",
        props: { url: "http://docs.local/media/image.png" },
      },
    ] as Block[];

    await expect(
      renderBlocksToPdf({
        blocks,
        templateSource: '#include "body.typ"',
      }),
    ).rejects.toBeInstanceOf(UnsupportedBodyImagesError);
  });
});
