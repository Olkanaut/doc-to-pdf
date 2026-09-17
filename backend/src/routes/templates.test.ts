/**
 * `sniffImageExt` décide seul si /api/templates/assets accepte un fichier : un
 * test direct, sans passer par Fastify ni par une session, couvre le cas qui
 * compte — un contenu lu sur ses octets, jamais sur son nom.
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
    // Un PDF renommé en .png : c'est le contenu qui décide, pas le nom du fichier.
    expect(sniffImageExt(Buffer.from("%PDF-1.7 pas une image", "utf8"))).toBeNull();
    expect(sniffImageExt(Buffer.alloc(0))).toBeNull();
  });

  it("ignore un <svg> qui n'apparaît pas en tête du fichier", () => {
    // Un fragment de texte qui mentionne « svg » sans en être un.
    const padded = Buffer.concat([Buffer.alloc(2000, 0x20), Buffer.from("<svg></svg>")]);
    expect(sniffImageExt(padded)).toBeNull();
  });
});
