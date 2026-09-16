/**
 * Bout en bout, sans HTTP : un PDF à en-tête est fabriqué avec typst, relu par
 * l'extracteur Python, puis le gabarit déduit est recompilé. Ce qui est vérifié
 * ici, c'est la chaîne complète — relevé, découpe, marge élargie pour loger le
 * bandeau — et pas seulement chaque maillon.
 *
 * Ignoré quand typst ou PyMuPDF manquent : l'extraction est un service
 * facultatif du backend, pas une dépendance de build.
 */
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { analyzeDocument, cropRegion } from "./sidecar.js";
import { INLINE_LOGO_HEIGHT_MM } from "../layout/layoutConfig.js";
import { buildLayout, buildSource } from "./templateFromAnalysis.js";

const execFileAsync = promisify(execFile);

/** Bandeau coloré en haut, corps de texte, numéro de page : une lettre type. */
const SOURCE_DOC = `#set page(
  paper: "a4",
  margin: (top: 40mm, bottom: 20mm, left: 25mm, right: 25mm),
  header: place(top + left, dx: -25mm, rect(width: 100% + 50mm, height: 22mm, fill: rgb("#000091"))),
  footer: align(right)[#context counter(page).display("1")],
)
#set text(font: "Libertinus Serif", size: 11pt)

= Titre du document

Corps du document, sur plusieurs lignes, pour que le relevé ait de quoi mesurer
les marges et l'interligne du texte courant.

Un second paragraphe, pour la même raison.
`;

async function available(): Promise<boolean> {
  const python = process.env.DOTS_PYTHON ?? "python3";
  const checks = [
    execFileAsync("typst", ["--version"]),
    execFileAsync(python, ["-c", "import pymupdf"]),
  ];
  return Promise.all(checks).then(
    () => true,
    () => false,
  );
}

const enabled = await available();

describe.skipIf(!enabled)("import d'un PDF vers un gabarit", () => {
  let dir = "";
  let pdf = "";

  beforeAll(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "dots-ingest-"));
    const src = path.join(dir, "doc.typ");
    pdf = path.join(dir, "doc.pdf");
    await writeFile(src, SOURCE_DOC, "utf8");
    await execFileAsync("typst", ["compile", "--root", dir, src, pdf]);
  });

  afterAll(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  it("relève le format, les marges et propose la bande d'en-tête", async () => {
    const analysis = await analyzeDocument(pdf, dir);

    expect(analysis.page.count).toBe(1);
    expect(analysis.layout.paper).toBe("a4");
    expect(analysis.layout.orientation).toBe("portrait");
    // Marges relevées sur le texte : au millimètre près de la source.
    expect(analysis.layout.margins.left).toBeCloseTo(25, 0);
    expect(analysis.layout.margins.right).toBeCloseTo(25, 0);
    expect(analysis.layout.margins.top).toBeGreaterThan(30);

    const header = analysis.regions.find((r) => r.kind === "header");
    expect(header, "une bande d'en-tête est proposée").toBeDefined();
    expect(header!.y).toBe(0);
    // Le bandeau fait 22 mm ≈ 62 pt ; la bande le contient sans avaler le titre.
    expect(header!.height).toBeGreaterThan(50);
    expect(header!.height).toBeLessThan(110);
    // Un rectangle plein est du vectoriel : l'extraction peut rester en SVG.
    expect(header!.vector).toBe(true);

    expect(analysis.regions.at(-1)!.kind).toBe("page");
  });

  it("découpe la bande et produit un gabarit qui compile, marge comprise", async () => {
    const analysis = await analyzeDocument(pdf, dir);
    const region = analysis.regions.find((r) => r.kind === "header")!;

    const fragment = await cropRegion({
      input: pdf,
      outDir: dir,
      rect: { x: region.x, y: region.y, width: region.width, height: region.height },
      vector: false,
      name: "en-tete",
    });
    expect(fragment.file).toBe("en-tete.png");
    expect(fragment.bytes).toBeGreaterThan(0);

    const placement = {
      file: "en-tete.png",
      widthPt: fragment.widthPt,
      heightPt: fragment.heightPt,
      fullBleed: true,
    };
    const layout = buildLayout({ analysis, header: placement });

    expect(layout.header.enabled).toBe(true);
    expect(layout.header.logo).toBe("en-tete.png");
    expect(layout.header.fullBleed).toBe(true);
    // La marge haute doit loger l'image rendue pleine largeur, sinon typst la rogne.
    const rendered = (210 * fragment.heightPt) / fragment.widthPt;
    expect(layout.margins.top).toBeGreaterThanOrEqual(rendered);

    // Le gabarit compile avec son asset à côté, référencé par son seul nom.
    const source = buildSource(layout);
    expect(source).toContain('image("assets/en-tete.png"');
    expect(source).not.toContain("..");

    const out = path.join(dir, "gabarit.typ");
    const assets = path.join(dir, "assets");
    await execFileAsync("mkdir", ["-p", assets]);
    await execFileAsync("cp", [path.join(dir, "en-tete.png"), assets]);
    await writeFile(out, source, "utf8");
    await writeFile(path.join(dir, "body.typ"), "= Essai\n\nTexte.\n", "utf8");
    await execFileAsync("typst", ["compile", "--root", dir, out, path.join(dir, "out.pdf")]);

    expect(existsSync(path.join(dir, "out.pdf"))).toBe(true);
    const bytes = await readFile(path.join(dir, "out.pdf"));
    expect(bytes.subarray(0, 4).toString()).toBe("%PDF");
  });

  it("n'étire pas un logo à la largeur de la page", async () => {
    const analysis = await analyzeDocument(pdf, dir);
    // Un logo de 183 × 88 px : étiré sur 210 mm, il ferait 101 mm de haut.
    const logo = { file: "logo.png", widthPt: 183, heightPt: 88, fullBleed: false };

    const layout = buildLayout({ analysis, header: logo });

    expect(layout.header.logo).toBe("logo.png");
    expect(layout.header.fullBleed).toBe(false);
    // La marge loge la hauteur fixe du logo, pas la hauteur d'un bandeau.
    expect(layout.margins.top).toBeGreaterThanOrEqual(INLINE_LOGO_HEIGHT_MM);
    expect(layout.margins.top).toBeLessThan(50);
  });

  it("loge un logo dans une marge haute trop courte pour lui", async () => {
    const analysis = await analyzeDocument(pdf, dir);
    // Word compte son en-tête hors marge : 6 mm lui suffisent, pas à Typst.
    const tight = { ...analysis, layout: { ...analysis.layout, margins: { ...analysis.layout.margins, top: 6.3 } } };

    const layout = buildLayout({
      analysis: tight,
      header: { file: "logo.png", widthPt: 183, heightPt: 88, fullBleed: false },
    });

    expect(layout.margins.top).toBeGreaterThan(INLINE_LOGO_HEIGHT_MM);
  });

  it("refuse un fichier qui n'est ni PDF ni docx, sur ses octets", async () => {
    const fake = path.join(dir, "note.pdf");
    await writeFile(fake, "ceci n'est pas un PDF", "utf8");
    await expect(analyzeDocument(fake, dir)).rejects.toMatchObject({ code: "unsupported_format" });
  });
});

/**
 * Un .docx qui porte ses visuels en clair ne passe par aucune composition :
 * ni LibreOffice, ni rendu de page. Le fichier de test est fabriqué ici — un
 * .docx est un zip, ses parties se posent à la main.
 */
describe.skipIf(!enabled)("import d'un .docx sans composition", () => {
  let dir = "";

  /** PNG 2×1 valide : l'extracteur en lit les dimensions dans l'en-tête IHDR. */
  const PNG = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAAEklEQVR4nGP8z4AATAxQxrBhAgCr2QP2N3AikwAAAABJRU5ErkJggg==",
    "base64",
  );

  const DOCUMENT_XML = `<?xml version="1.0"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:sectPr>
      <w:pgSz w:w="11909" w:h="16834" w:orient="portrait"/>
      <w:pgMar w:top="1701" w:right="1134" w:bottom="1134" w:left="1134"/>
    </w:sectPr>
  </w:body>
</w:document>`;

  const STYLES_XML = `<?xml version="1.0"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults><w:rPrDefault><w:rPr>
    <w:rFonts w:ascii="Helvetica"/><w:sz w:val="24"/>
  </w:rPr></w:rPrDefault></w:docDefaults>
</w:styles>`;

  /** Zip sans dépendance : « store » seul, ce que zipfile relit sans peine. */
  async function buildDocx(parts: Record<string, Buffer | string>): Promise<string> {
    const target = path.join(dir, `made-${Math.random().toString(16).slice(2)}.docx`);
    const staging = path.join(dir, `staging-${path.basename(target)}`);
    for (const [name, content] of Object.entries(parts)) {
      const file = path.join(staging, name);
      await execFileAsync("mkdir", ["-p", path.dirname(file)]);
      await writeFile(file, content as never);
    }
    await execFileAsync("zip", ["-r", "-X", "-q", target, "."], { cwd: staging });
    return target;
  }

  beforeAll(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "dots-docx-"));
  });

  afterAll(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  it("lit le format, les marges et la police dans le XML, sans rendre la page", async () => {
    const docx = await buildDocx({
      "word/document.xml": DOCUMENT_XML,
      "word/styles.xml": STYLES_XML,
      "word/media/image1.png": PNG,
    });

    const analysis = await analyzeDocument(docx, dir);

    expect(analysis.mode).toBe("assets");
    // Aucune page rendue : il n'y a rien à recadrer, donc aucune zone proposée.
    expect(analysis.page.preview).toBeNull();
    expect(analysis.regions).toEqual([]);

    expect(analysis.layout.paper).toBe("a4");
    // 1701 twips = 30 mm, 1134 = 20 mm : lus, pas mesurés.
    expect(analysis.layout.margins.top).toBeCloseTo(30, 1);
    expect(analysis.layout.margins.left).toBeCloseTo(20, 1);
    expect(analysis.layout.font).toBe("Helvetica");
    expect(analysis.layout.fontSize).toBe(12);

    expect(analysis.assets).toHaveLength(1);
    expect(analysis.assets![0]).toMatchObject({ name: "image1.png", vector: false, widthPt: 2 });
  });

  it("préfère le vrai SVG à son repli PNG obligatoire", async () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 40"></svg>';
    const docx = await buildDocx({
      "word/document.xml": DOCUMENT_XML,
      "word/media/image1.png": PNG,
      "word/media/image1.svg": svg,
    });

    const analysis = await analyzeDocument(docx, dir);

    // Le PNG est le repli du même visuel : il ne doit pas être proposé deux fois.
    expect(analysis.assets).toHaveLength(1);
    expect(analysis.assets![0]).toMatchObject({
      name: "image1.svg",
      vector: true,
      widthPt: 120,
      heightPt: 40,
    });
  });

  it("reconnaît un visuel posé dans une partie en-tête de Word", async () => {
    const rels = `<?xml version="1.0"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image1.png"/>
</Relationships>`;
    const docx = await buildDocx({
      "word/document.xml": DOCUMENT_XML,
      "word/header1.xml": "<w:hdr/>",
      "word/_rels/header1.xml.rels": rels,
      "word/media/image1.png": PNG,
    });

    const analysis = await analyzeDocument(docx, dir);
    expect(analysis.assets![0].kind).toBe("header");
  });

  it("demande LibreOffice seulement quand le .docx n'a aucun visuel à extraire", async () => {
    // Cas 3 : le papier à en-tête est dessiné dans le XML, rien dans word/media.
    const docx = await buildDocx({
      "word/document.xml": DOCUMENT_XML,
      "word/styles.xml": STYLES_XML,
    });

    await expect(analyzeDocument(docx, dir)).rejects.toMatchObject({ code: "no_libreoffice" });
  });
});
