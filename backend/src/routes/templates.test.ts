/**
 * `sniffImageExt` alone decides whether /api/templates/assets accepts a file:
 * a direct test, without going through Fastify or a session, covers the case
 * that matters — content read from its bytes, never from its name.
 */
import { describe, expect, it } from "vitest";
import { sniffImageExt } from "./templates.js";

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]);
const SVG = Buffer.from('<?xml version="1.0"?>\n<svg xmlns="http://www.w3.org/2000/svg"></svg>', "utf8");
const SVG_NO_DECLARATION = Buffer.from("<svg></svg>", "utf8");

describe("sniffImageExt", () => {
  it("reconnaît un PNG à sa signature", () => {
    expect(sniffImageExt(PNG)).toBe("png");
  });

  it("reconnaît un JPEG à sa signature", () => {
    expect(sniffImageExt(JPEG)).toBe("jpeg");
  });

  it("reconnaît un SVG, avec ou sans déclaration XML", () => {
    expect(sniffImageExt(SVG)).toBe("svg");
    expect(sniffImageExt(SVG_NO_DECLARATION)).toBe("svg");
  });

  it("refuse ce qui n'est ni l'un ni l'autre, même déguisé", () => {
    // A PDF renamed to .png: the content decides, not the file name.
    expect(sniffImageExt(Buffer.from("%PDF-1.7 pas une image", "utf8"))).toBeNull();
    expect(sniffImageExt(Buffer.alloc(0))).toBeNull();
  });

  it("ignore un <svg> qui n'apparaît pas en tête du fichier", () => {
    // A text fragment that mentions "svg" without being one.
    const padded = Buffer.concat([Buffer.alloc(2000, 0x20), Buffer.from("<svg></svg>")]);
    expect(sniffImageExt(padded)).toBeNull();
  });
});
