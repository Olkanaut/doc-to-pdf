/**
 * Bout en bout, sans HTTP : un PDF à en-tête est fabriqué avec typst, relu par
 * l'extracteur Python, puis le template déduit est recompilé. Ce qui est vérifié
 * ici, c'est la chaîne complète — relevé, découpe, marge élargie pour loger le
 * bandeau — et pas seulement chaque maillon.
 *
 * Ignoré quand typst ou PyMuPDF manquent : l'extraction est un service
 * facultatif du backend, pas une dépendance de build.
 */
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { analyzeDocument, cropRegion } from "./sidecar.js";
import { INLINE_LOGO_HEIGHT_MM } from "../layout/layoutConfig.js";
import { buildLayout, buildSource } from "./templateFromAnalysis.js";

const execFileAsync = promisify(execFile);
const INGEST_DIR = path.resolve(process.cwd(), "ingest");
const VENV_PYTHON = path.join(INGEST_DIR, ".venv", "bin", "python3");
const INGEST_PYTHON = process.env.DOTS_PYTHON ?? (existsSync(VENV_PYTHON) ? VENV_PYTHON : "python3");

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
  const checks = [
    execFileAsync("typst", ["--version"]),
    execFileAsync(INGEST_PYTHON, ["-c", "import pymupdf"]),
  ];
  return Promise.all(checks).then(
    () => true,
    () => false,
  );
}

const enabled = await available();

describe.skipIf(!enabled)("import d'un PDF vers un template", () => {
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

  it("découpe la bande et produit un template qui compile, marge comprise", async () => {
    const analysis = await analyzeDocument(pdf, dir);
    const region = analysis.regions.find((r) => r.kind === "header")!;

    const fragment = await cropRegion({
      input: pdf,
      outDir: dir,
      rect: {
        x: region.x,
        y: region.y,
        width: region.width,
        height: region.height,
      },
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

    // The band renders because it holds a visual; there is no separate flag.
    expect(layout.header.blocks).toHaveLength(1);
    expect(layout.header.blocks[0].image).toBe("en-tete.png");
    // Width 0 is the full width of the band, which is what a cropped strip wants.
    expect(layout.header.blocks[0].imageHeightMm).toBe(0);
    // La marge haute doit loger l'image rendue pleine largeur, sinon typst la rogne.
    const rendered = (210 * fragment.heightPt) / fragment.widthPt;
    expect(layout.margins.top).toBeGreaterThanOrEqual(rendered);

    // Le template compile avec ses assets à côté, référencé par son seul nom.
    const source = buildSource(layout);
    expect(source).toContain('image("assets/en-tete.png"');
    expect(source).not.toContain("..");

    const out = path.join(dir, "template.typ");
    const assets = path.join(dir, "assets");
    await execFileAsync("mkdir", ["-p", assets]);
    await execFileAsync("cp", [path.join(dir, "en-tete.png"), assets]);
    await writeFile(out, source, "utf8");
    await writeFile(path.join(dir, "body.typ"), "= Essai\n\nTexte.\n", "utf8");
    await execFileAsync("typst", [
      "compile",
      "--root",
      dir,
      out,
      path.join(dir, "out.pdf"),
    ]);

    expect(existsSync(path.join(dir, "out.pdf"))).toBe(true);
    const bytes = await readFile(path.join(dir, "out.pdf"));
    expect(bytes.subarray(0, 4).toString()).toBe("%PDF");
  });

  it("n'étire pas un logo à la largeur de la page", async () => {
    const analysis = await analyzeDocument(pdf, dir);
    // Un logo de 183 × 88 px : étiré sur 210 mm, il ferait 101 mm de haut.
    const logo = {
      file: "logo.png",
      widthPt: 183,
      heightPt: 88,
      fullBleed: false,
    };

    const layout = buildLayout({ analysis, header: logo });

    expect(layout.header.blocks[0].image).toBe("logo.png");
    expect(layout.header.blocks[0].imageHeightMm).toBeGreaterThan(0);
    // La marge loge la hauteur fixe du logo, pas la hauteur d'un bandeau.
    expect(layout.margins.top).toBeGreaterThanOrEqual(INLINE_LOGO_HEIGHT_MM);
    expect(layout.margins.top).toBeLessThan(50);
  });

  it("loge un logo dans une marge haute trop courte pour lui", async () => {
    const analysis = await analyzeDocument(pdf, dir);
    // Word compte son en-tête hors marge : 6 mm lui suffisent, pas à Typst.
    const tight = {
      ...analysis,
      layout: {
        ...analysis.layout,
        margins: { ...analysis.layout.margins, top: 6.3 },
      },
    };

    const layout = buildLayout({
      analysis: tight,
      header: {
        file: "logo.png",
        widthPt: 183,
        heightPt: 88,
        fullBleed: false,
      },
    });

    expect(layout.margins.top).toBeGreaterThan(INLINE_LOGO_HEIGHT_MM);
  });

  it("compose les bandes DOCX avec leurs scopes et une pagination dynamique", async () => {
    const analysis = await analyzeDocument(pdf, dir);
    const layout = buildLayout({
      analysis,
      headers: [
        { file: "h-first.png", widthPt: 595.28, heightPt: 72, fullBleed: true, scope: "first" },
        { file: "h-rest.png", widthPt: 595.28, heightPt: 54, fullBleed: true, scope: "except-first" },
      ],
      footers: [
        { file: "f-all.png", widthPt: 595.28, heightPt: 36, fullBleed: true, scope: "all" },
      ],
      pagination: { numbering: "page-n-of-total", align: "right", scope: "except-first" },
    });

    expect(layout.header.blocks.map((block) => [block.image, block.scope])).toEqual([
      ["h-first.png", "first"],
      ["h-rest.png", "except-first"],
    ]);
    expect(layout.footer.blocks[0]).toMatchObject({ image: "f-all.png", scope: "all" });
    expect(layout.footer).toMatchObject({
      numbering: "page-n-of-total",
      numberingAlign: "right",
      numberingScope: "except-first",
    });
    expect(layout.margins.top).toBeGreaterThanOrEqual((72 / 72) * 25.4);

    const source = buildSource(layout);
    expect(source).toContain('image("assets/h-first.png"');
    expect(source).toContain('image("assets/h-rest.png"');
    expect(source).toContain("counter(page).get().first() == 1");
    expect(source).toContain("counter(page).get().first() > 1");
  });

  it("refuse un fichier qui n'est ni PDF ni docx, sur ses octets", async () => {
    const fake = path.join(dir, "note.pdf");
    await writeFile(fake, "ceci n'est pas un PDF", "utf8");
    await expect(analyzeDocument(fake, dir)).rejects.toMatchObject({
      code: "unsupported_format",
    });
  });
});

const W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const R_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

function docxParts(): Record<string, string> {
  return {
    "[Content_Types].xml": `<?xml version="1.0"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>
  <Override PartName="/word/header2.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>
  <Override PartName="/word/header3.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>
  <Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>
</Types>`,
    "_rels/.rels": `<?xml version="1.0"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`,
    "word/document.xml": `<?xml version="1.0"?>
<w:document xmlns:w="${W_NS}" xmlns:r="${R_NS}">
  <w:body>
    <w:p><w:r><w:t>CE CORPS DOIT DISPARAITRE</w:t></w:r></w:p>
    <w:sectPr>
      <w:headerReference w:type="default" r:id="rId1"/>
      <w:headerReference w:type="first" r:id="rId2"/>
      <w:headerReference w:type="even" r:id="rId3"/>
      <w:footerReference w:type="default" r:id="rId4"/>
      <w:pgSz w:w="11909" w:h="16834"/>
      <w:pgMar w:top="1701" w:right="1134" w:bottom="1134" w:left="1134"/>
      <w:titlePg/>
    </w:sectPr>
  </w:body>
</w:document>`,
    "word/_rels/document.xml.rels": `<?xml version="1.0"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="${R_NS}/header" Target="header1.xml"/>
  <Relationship Id="rId2" Type="${R_NS}/header" Target="header2.xml"/>
  <Relationship Id="rId3" Type="${R_NS}/header" Target="header3.xml"/>
  <Relationship Id="rId4" Type="${R_NS}/footer" Target="footer1.xml"/>
</Relationships>`,
    "word/settings.xml": `<?xml version="1.0"?><w:settings xmlns:w="${W_NS}"><w:evenAndOddHeaders/></w:settings>`,
    "word/header1.xml": `<?xml version="1.0"?><w:hdr xmlns:w="${W_NS}"><w:p><w:r><w:t>SUITE</w:t></w:r></w:p></w:hdr>`,
    "word/header2.xml": `<?xml version="1.0"?><w:hdr xmlns:w="${W_NS}"><w:p><w:r><w:t>PREMIERE</w:t></w:r></w:p></w:hdr>`,
    "word/header3.xml": `<?xml version="1.0"?><w:hdr xmlns:w="${W_NS}"><w:p><w:r><w:t>PAIRE</w:t></w:r></w:p></w:hdr>`,
    "word/footer1.xml": `<?xml version="1.0"?>
<w:ftr xmlns:w="${W_NS}"><w:p><w:pPr><w:jc w:val="right"/></w:pPr>
  <w:r><w:t>Page </w:t></w:r>
  <w:fldSimple w:instr=" PAGE "><w:r><w:t>1</w:t></w:r></w:fldSimple>
  <w:r><w:t> sur </w:t></w:r>
  <w:fldSimple w:instr=" NUMPAGES "><w:r><w:t>3</w:t></w:r></w:fldSimple>
</w:p></w:ftr>`,
  };
}

async function buildDocx(
  dir: string,
  parts: Record<string, string> = docxParts(),
): Promise<string> {
  const target = path.join(dir, `made-${Math.random().toString(16).slice(2)}.docx`);
  const staging = path.join(dir, `staging-${path.basename(target)}`);
  for (const [name, content] of Object.entries(parts)) {
    const file = path.join(staging, name);
    await execFileAsync("mkdir", ["-p", path.dirname(file)]);
    await writeFile(file, content, "utf8");
  }
  await execFileAsync("zip", ["-r", "-X", "-q", target, "."], { cwd: staging });
  return target;
}

async function createProbe(input: string, target: string): Promise<Record<string, any>> {
  const script = [
    "import json, sys",
    "from pathlib import Path",
    "import docx",
    "print(json.dumps(docx.create_probe(Path(sys.argv[1]), Path(sys.argv[2]))))",
  ].join("; ");
  const { stdout } = await execFileAsync(INGEST_PYTHON, ["-c", script, input, target], {
    cwd: INGEST_DIR,
  });
  return JSON.parse(stdout);
}

const PROBE_SOURCE = `#set page(
  paper: "a4",
  margin: (top: 35mm, bottom: 25mm, left: 20mm, right: 20mm),
  header: context {
    let n = counter(page).get().first()
    if n == 1 [PREMIERE] else if n == 2 [PAIRE] else [SUITE]
  },
  footer: align(right)[PIED],
)
#box(width: 0pt, height: 0pt)
#pagebreak()
#box(width: 0pt, height: 0pt)
#pagebreak()
#box(width: 0pt, height: 0pt)
`;

const BLANK_PROBE_SOURCE = `#set page(paper: "a4")
#box(width: 0pt, height: 0pt)
#pagebreak()
#box(width: 0pt, height: 0pt)
#pagebreak()
#box(width: 0pt, height: 0pt)
`;

describe.skipIf(!enabled)("import d'un DOCX rendu", () => {
  let dir = "";
  let blankProbePdf = "";
  let previousPath: string | undefined;

  beforeAll(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "dots-docx-"));
    const sourceTyp = path.join(dir, "source-fixture.typ");
    const probeTyp = path.join(dir, "probe-fixture.typ");
    const sourcePdf = path.join(dir, "source-fixture.pdf");
    const probePdf = path.join(dir, "probe-fixture.pdf");
    const blankProbeTyp = path.join(dir, "blank-probe-fixture.typ");
    blankProbePdf = path.join(dir, "blank-probe-fixture.pdf");
    await writeFile(sourceTyp, SOURCE_DOC, "utf8");
    await writeFile(probeTyp, PROBE_SOURCE, "utf8");
    await writeFile(blankProbeTyp, BLANK_PROBE_SOURCE, "utf8");
    await execFileAsync("typst", ["compile", "--root", dir, sourceTyp, sourcePdf]);
    await execFileAsync("typst", ["compile", "--root", dir, probeTyp, probePdf]);
    await execFileAsync("typst", ["compile", "--root", dir, blankProbeTyp, blankProbePdf]);

    const bin = path.join(dir, "bin");
    await execFileAsync("mkdir", ["-p", bin]);
    const soffice = path.join(bin, "soffice");
    await writeFile(
      soffice,
      `#!/bin/sh
out=""
input=""
while [ "$#" -gt 0 ]; do
  if [ "$1" = "--outdir" ]; then shift; out="$1"
  elif [ "\${1##*.}" = "docx" ]; then input="$1"
  fi
  shift
done
name="$(basename "$input" .docx)"
if [ "$name" = "probe" ]; then source="$DOTS_FAKE_PROBE_PDF"; else source="$DOTS_FAKE_SOURCE_PDF"; fi
cp "$source" "$out/$name.pdf"
`,
      "utf8",
    );
    await chmod(soffice, 0o755);
    previousPath = process.env.PATH;
    process.env.PATH = `${bin}:${previousPath ?? ""}`;
    process.env.DOTS_FAKE_SOURCE_PDF = sourcePdf;
    process.env.DOTS_FAKE_PROBE_PDF = probePdf;
  });

  afterAll(async () => {
    process.env.PATH = previousPath;
    delete process.env.DOTS_FAKE_SOURCE_PDF;
    delete process.env.DOTS_FAKE_PROBE_PDF;
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  it("fabrique trois pages avec la première section et retire la pagination dynamique", async () => {
    const input = await buildDocx(dir);
    const probe = path.join(dir, "unit-probe.docx");
    const metadata = await createProbe(input, probe);

    expect(metadata).toMatchObject({
      differentFirstPage: true,
      evenAndOddHeaders: true,
      sectionCount: 1,
      pagination: [
        {
          kind: "footer",
          scope: "except-first",
          numbering: "page-n-of-total",
          align: "right",
        },
      ],
    });
    expect(metadata.parts.header).toEqual({
      default: "word/header1.xml",
      first: "word/header2.xml",
      even: "word/header3.xml",
    });

    const document = (await execFileAsync("unzip", ["-p", probe, "word/document.xml"])).stdout;
    const footer = (await execFileAsync("unzip", ["-p", probe, "word/footer1.xml"])).stdout;
    const sourceHeader = (await execFileAsync("unzip", ["-p", input, "word/header1.xml"])).stdout;
    const probeHeader = (await execFileAsync("unzip", ["-p", probe, "word/header1.xml"])).stdout;
    expect(document).not.toContain("CE CORPS DOIT DISPARAITRE");
    expect(document.match(/w:type="page"/g)).toHaveLength(2);
    expect(document).toContain("w:titlePg");
    expect(footer).not.toMatch(/PAGE|NUMPAGES/);
    expect(probeHeader).toBe(sourceHeader);
  });

  it("accepte un DOCX sans relations quand il n'a aucun bandeau", async () => {
    const parts = docxParts();
    parts["word/document.xml"] = `<?xml version="1.0"?>
<w:document xmlns:w="${W_NS}"><w:body><w:p/><w:sectPr>
  <w:pgSz w:w="11909" w:h="16834"/>
</w:sectPr></w:body></w:document>`;
    delete parts["word/_rels/document.xml.rels"];
    const input = await buildDocx(dir, parts);
    const metadata = await createProbe(input, path.join(dir, "probe-without-relations.docx"));

    expect(metadata.parts).toEqual({ header: {}, footer: {} });
    expect(metadata.pagination).toEqual([]);
    expect(metadata.warnings).toEqual([]);
  });

  it("rend le document et produit des bandeaux composés sans mode assets", async () => {
    const input = await buildDocx(dir);
    const output = path.join(dir, "analysis");
    await execFileAsync("mkdir", ["-p", output]);
    const analysis = await analyzeDocument(input, output);

    expect(analysis.mode).toBe("page");
    expect(analysis.page.count).toBe(1);
    expect(analysis.docx).toMatchObject({
      differentFirstPage: true,
      evenOddDifferent: true,
      sectionCount: 1,
      pagination: [
        {
          kind: "footer",
          scope: "except-first",
          numbering: "page-n-of-total",
          align: "right",
        },
      ],
    });
    expect(analysis.docx!.bands.map((band) => [band.kind, band.scope])).toEqual([
      ["header", "first"],
      ["header", "except-first"],
      ["footer", "all"],
    ]);
    expect(analysis.docx!.warnings.join(" ")).toContain("pages paires");
    for (const band of analysis.docx!.bands) {
      const bytes = await readFile(path.join(output, band.file));
      expect(bytes.subarray(1, 4).toString()).toBe("PNG");
      expect(band.widthPt).toBeCloseTo(595.28, 1);
      expect(band.bytes).toBe(bytes.length);
    }
  });

  it("détecte une première page différente quand seule la pagination change", async () => {
    const input = await buildDocx(dir);
    const output = path.join(dir, "pagination-only-analysis");
    await execFileAsync("mkdir", ["-p", output]);
    const regularProbe = process.env.DOTS_FAKE_PROBE_PDF;
    process.env.DOTS_FAKE_PROBE_PDF = blankProbePdf;
    try {
      const analysis = await analyzeDocument(input, output);
      expect(analysis.docx?.bands).toEqual([]);
      expect(analysis.docx?.pagination).toEqual([
        {
          kind: "footer",
          scope: "except-first",
          numbering: "page-n-of-total",
          align: "right",
        },
      ]);
      expect(analysis.docx?.differentFirstPage).toBe(true);
    } finally {
      process.env.DOTS_FAKE_PROBE_PDF = regularProbe;
    }
  });
});
