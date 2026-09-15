import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import {
  applyLayout,
  deduceLayout,
  layoutToTypst,
  readLayout,
  LAYOUT_BEGIN,
  LAYOUT_END,
} from "./layoutTypst.js";
import { defaultLayout, sanitizeLayout, type LayoutConfig } from "./layoutConfig.js";
import { compileToPdf } from "../compile/typstCompile.js";
import { TEMPLATES_ASSETS_DIR } from "../registry/templates.js";

const minimal = await readFile(new URL("../../templates/minimal.typ", import.meta.url), "utf8");
const ministere = await readFile(new URL("../../templates/ministere.typ", import.meta.url), "utf8");

function count(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

/** Config qui exerce toutes les branches du générateur. */
function fullConfig(): LayoutConfig {
  return sanitizeLayout({
    ...defaultLayout(),
    orientation: "landscape",
    font: "Arial",
    lineHeight: 1.5,
    header: {
      enabled: true,
      text: "= Ministère * # \" [x]\n- Direction _générale_",
      logo: "logo-ministere.png",
      align: "right",
      rule: true,
    },
    footer: {
      enabled: true,
      text: "Réf. #2026",
      numbering: "page-n-of-total",
      align: "center",
      firstPage: false,
      rule: true,
    },
    headings: { scale: "large", color: "#002f6c" },
    table: { stroke: "full", headerFill: "brand", zebra: true, fontSize: "small" },
  });
}

/** Défauts + réglages de tableaux. */
function withTable(table: Partial<LayoutConfig["table"]>): LayoutConfig {
  const d = defaultLayout();
  return { ...d, table: { ...d.table, ...table } };
}

describe("applyLayout", () => {
  it("insère le bloc avant #include, après les #set écrits à la main", () => {
    const out = applyLayout(minimal, defaultLayout());
    const begin = out.indexOf(LAYOUT_BEGIN);
    expect(begin).toBeGreaterThan(out.indexOf("#set heading(numbering: none)"));
    expect(out.indexOf(LAYOUT_END)).toBeLessThan(out.indexOf('#include "body.typ"'));
    expect(count(out, '#include "body.typ"')).toBe(1);
  });

  it("est idempotent : deux applications, un seul bloc", () => {
    const cfg = fullConfig();
    const once = applyLayout(minimal, cfg);
    const twice = applyLayout(once, cfg);
    expect(twice).toBe(once);
    expect(count(twice, LAYOUT_BEGIN)).toBe(1);
    expect(count(twice, LAYOUT_END)).toBe(1);
  });

  it("remplace un bloc existant par la nouvelle config", () => {
    const a = applyLayout(minimal, defaultLayout());
    const b = applyLayout(a, { ...defaultLayout(), fontSize: 14 });
    expect(b).toContain("size: 14pt");
    expect(b).not.toContain("size: 11pt");
    expect(count(b, LAYOUT_BEGIN)).toBe(1);
  });

  it("sans #include, ajoute le bloc à la fin", () => {
    const out = applyLayout("#set heading(numbering: none)\n", defaultLayout());
    expect(out.trimEnd().endsWith(LAYOUT_END)).toBe(true);
  });

  it("bloc abîmé (begin sans end) : un seul bloc, et readLayout relit la nouvelle config", () => {
    const broken = `${LAYOUT_BEGIN}\n// dots:layout {"fontSize":14}\n#set text(size: 14pt)\n#include "body.typ"\n`;
    const out = applyLayout(broken, { ...defaultLayout(), fontSize: 9 });
    expect(count(out, LAYOUT_BEGIN)).toBe(1);
    expect(count(out, LAYOUT_END)).toBe(1);
    expect(count(out, "// dots:layout {")).toBe(1);
    expect(out.indexOf(LAYOUT_END)).toBeLessThan(out.indexOf('#include "body.typ"'));
    expect(readLayout(out)).toEqual({ layout: { ...defaultLayout(), fontSize: 9 }, managed: true });
  });
});

describe("readLayout", () => {
  it("relit ce qu'applyLayout a écrit", () => {
    const cfg = fullConfig();
    const { layout, managed } = readLayout(applyLayout(minimal, cfg));
    expect(managed).toBe(true);
    expect(layout).toEqual(sanitizeLayout(cfg));
  });

  it("sans bloc : réglages déduits de la source, managed false", () => {
    const { layout, managed } = readLayout(minimal);
    expect(managed).toBe(false);
    expect(layout).toEqual({
      ...defaultLayout(),
      margins: { top: 25, bottom: 25, left: 25, right: 25 },
      font: "Libertinus Serif",
      header: { ...defaultLayout().header, enabled: false },
      footer: { ...defaultLayout().footer, align: "center", rule: false },
    });
  });

  it("source sans #set page : ni en-tête ni pied, le reste par défaut", () => {
    const { layout } = readLayout("#set heading(numbering: none)\n#include \"body.typ\"\n");
    expect(layout.header.enabled).toBe(false);
    expect(layout.footer.enabled).toBe(false);
    expect(layout.margins).toEqual(defaultLayout().margins);
  });

  it("relit les caractères de fin de ligne exotiques tels quels", () => {
    const cfg = { ...defaultLayout(), header: { ...defaultLayout().header, text: "a\rb\u2028c\u0085d\u2029e" } };
    expect(readLayout(applyLayout(minimal, cfg)).layout).toEqual(cfg);
  });

  it("bloc présent mais JSON illisible : défauts, managed true", () => {
    const broken = `${LAYOUT_BEGIN}\n// dots:layout {pas du json\n${LAYOUT_END}\n#include "body.typ"\n`;
    expect(readLayout(broken)).toEqual({ layout: defaultLayout(), managed: true });
  });
});

describe("deduceLayout", () => {
  it("ministere.typ : marges, logo, texte, filet, couleur, pied centré", () => {
    const l = deduceLayout(ministere);
    expect(l.paper).toBe("a4");
    expect(l.orientation).toBe("portrait");
    expect(l.margins).toEqual({ top: 40, bottom: 25, left: 25, right: 25 });
    expect(l.font).toBe("Libertinus Serif");
    expect(l.header).toEqual({
      enabled: true,
      text: "RÉPUBLIQUE FRANÇAISE\nMinistère de l'Exemple",
      logo: "logo-ministere.png",
      align: "left",
      rule: true,
    });
    expect(l.footer).toEqual({
      enabled: true,
      text: "",
      numbering: "n-of-total",
      align: "center",
      firstPage: true,
      rule: true,
    });
    expect(l.headings.color).toBe("#002f6c");
  });

  it("police, taille, paysage, marge unique en pouces, pied conditionnel", () => {
    const src = [
      '#set page(paper: "us-letter", flipped: true, margin: 1in, header: none, footer: [',
      "  #context { if counter(page).get().first() > 1 [",
      '    #align(right)[Page #context counter(page).display("1 / 1", both: true)]',
      "  ] }",
      "])",
      '#set text(font: ("Arial", "Helvetica"), size: 12pt)',
      '#include "body.typ"',
    ].join("\n");
    const l = deduceLayout(src);
    expect(l.paper).toBe("us-letter");
    expect(l.orientation).toBe("landscape");
    expect(l.margins).toEqual({ top: 25, bottom: 25, left: 25, right: 25 });
    expect(l.font).toBe("Arial");
    expect(l.fontSize).toBe(12);
    expect(l.header.enabled).toBe(false);
    expect(l.footer).toMatchObject({ enabled: true, numbering: "page-n-of-total", align: "right", firstPage: false, rule: false });
  });
});

describe("layoutToTypst", () => {
  it("écrit header: none et footer: none quand ils sont désactivés", () => {
    const cfg = defaultLayout();
    cfg.header.enabled = false;
    cfg.footer.enabled = false;
    const out = layoutToTypst(cfg);
    expect(out).toContain("header: none,");
    expect(out).toContain("footer: none,");
  });

  it("échappe le texte libre", () => {
    const out = layoutToTypst(fullConfig());
    expect(out).toContain('[\\= Ministère \\* \\# " \\[x\\] \\ \\- Direction \\_générale\\_]');
    expect(out).toContain("[Réf. \\#2026#h(1em)Page #context counter(page).display(\"1 / 1\", both: true)]");
  });

  it("échappe `//` et les fins de ligne que Typst reconnaît", () => {
    const cfg = defaultLayout();
    cfg.header.text = "Ministère // Direction\r= Titre\u2028- liste\u0085+ énum\u2029/ terme\x0B1. un";
    cfg.footer.text = "https://example.fr";
    const lines = layoutToTypst(cfg).split("\n");
    expect(lines.join("\n")).toContain(
      "[Ministère \\/\\/ Direction \\ \\= Titre \\ \\- liste \\ \\+ énum \\ \\/ terme \\ 1\\. un]",
    );
    expect(lines.join("\n")).toContain("[https:\\/\\/example.fr");
    for (const line of lines) expect(line).not.toMatch(/[\r\x0B\x0C\u0085\u2028\u2029]/);
    // La ligne JSON reste un commentaire d'une seule ligne, et se relit.
    expect(lines[1]).toContain("\\u2028");
    expect(readLayout(lines.join("\n")).layout).toEqual(cfg);
  });

  it("porte la config en JSON sur la 2e ligne, la chaîne de repli et la 1re page conditionnelle", () => {
    const cfg = fullConfig();
    const lines = layoutToTypst(cfg).split("\n");
    expect(lines[0]).toBe(LAYOUT_BEGIN);
    expect(lines[1]).toBe(`// dots:layout ${JSON.stringify(cfg)}`);
    expect(lines.join("\n")).toContain('font: ("Arial", "Helvetica", "Libertinus Serif")');
    expect(lines.join("\n")).toContain("flipped: true");
    expect(lines.join("\n")).toContain("counter(page).get().first() > 1");
  });
});

describe("tableaux", () => {
  it("sanitizeLayout : valeur hors liste ou absente → défaut", () => {
    expect(sanitizeLayout({}).table).toEqual({ stroke: "light", headerFill: "grey", zebra: false, fontSize: "inherit" });
    expect(
      sanitizeLayout({ table: { stroke: "dashed", headerFill: "pink", zebra: "oui", fontSize: 12 } }).table,
    ).toEqual({ stroke: "light", headerFill: "grey", zebra: false, fontSize: "inherit" });
    expect(sanitizeLayout({ table: { stroke: "none", headerFill: "brand", zebra: true, fontSize: "small" } }).table).toEqual({
      stroke: "none",
      headerFill: "brand",
      zebra: true,
      fontSize: "small",
    });
  });

  it("défauts : filets fins, en-tête gris en gras, pas de zébrage ni de taille réduite", () => {
    const out = layoutToTypst(defaultLayout());
    expect(out).toContain("#set table(stroke: 0.5pt + luma(200), inset: 6pt, fill: (x, y) => if y == 0 { luma(240) })");
    expect(out).toContain('#show table.cell.where(y: 0): set text(weight: "bold")');
    expect(out).not.toContain("calc.odd");
    expect(out).not.toContain("#show table: set text");
    expect(count(out, "#set table(")).toBe(1);
  });

  it("filets : none, light, full", () => {
    expect(layoutToTypst(withTable({ stroke: "none" }))).toContain("#set table(stroke: none, inset: 6pt");
    expect(layoutToTypst(withTable({ stroke: "light" }))).toContain("#set table(stroke: 0.5pt + luma(200), inset: 6pt");
    expect(layoutToTypst(withTable({ stroke: "full" }))).toContain("#set table(stroke: 0.5pt + luma(120), inset: 6pt");
  });

  it("fond de l'en-tête : none sans zébrage → pas de fill ; grey → luma(240) ; brand → couleur des titres et texte blanc", () => {
    const none = layoutToTypst(withTable({ headerFill: "none" }));
    expect(none).toContain("#set table(stroke: 0.5pt + luma(200), inset: 6pt)");
    expect(none).not.toContain("fill: (x, y)");
    expect(none).toContain('#show table.cell.where(y: 0): set text(weight: "bold")');

    const grey = layoutToTypst(withTable({ headerFill: "grey" }));
    expect(grey).toContain("fill: (x, y) => if y == 0 { luma(240) })");

    const brand = layoutToTypst(withTable({ headerFill: "brand" }));
    expect(brand).toContain('fill: (x, y) => if y == 0 { rgb("#0659c5") })');
    // Blanc seulement sur les cellules sans fill propre : une cellule colorée dans Docs garde un texte sombre.
    expect(brand).toContain(
      '#show table.cell.where(y: 0): it => { set text(weight: "bold"); set text(fill: white) if it.fill == auto; it }',
    );
    expect(brand).not.toContain('set text(weight: "bold", fill: white)');
  });

  it("zébrage : lignes impaires en luma(248), dans la même fonction fill", () => {
    expect(layoutToTypst(withTable({ headerFill: "grey", zebra: true }))).toContain(
      "fill: (x, y) => if y == 0 { luma(240) } else if calc.odd(y) { luma(248) })",
    );
    const none = layoutToTypst(withTable({ headerFill: "none", zebra: true }));
    expect(none).toContain("fill: (x, y) => if calc.odd(y) { luma(248) })");
    expect(count(none, "fill: (x, y)")).toBe(1);
  });

  it("taille réduite : #show table: set text(size: 0.9em)", () => {
    expect(layoutToTypst(withTable({ fontSize: "small" }))).toContain("#show table: set text(size: 0.9em)");
    expect(layoutToTypst(withTable({ fontSize: "inherit" }))).not.toContain("#show table: set text");
  });

  it("les règles table sont dans le bloc, après #set text ; le JSON porte table ; idempotent", () => {
    const cfg = withTable({ stroke: "none", headerFill: "brand", zebra: true, fontSize: "small" });
    const once = applyLayout(minimal, cfg);
    const block = once.slice(once.indexOf(LAYOUT_BEGIN), once.indexOf(LAYOUT_END));
    expect(block.indexOf("#set table(")).toBeGreaterThan(block.indexOf("#set text("));
    expect(block).toContain('"table":{"stroke":"none","headerFill":"brand","zebra":true,"fontSize":"small"}');
    expect(readLayout(once).layout.table).toEqual(cfg.table);
    const twice = applyLayout(once, cfg);
    expect(twice).toBe(once);
    // Dans le bloc seulement : les semis portent leur propre `#set table` avant le bloc.
    expect(count(block, "#set table(")).toBe(1);
    expect(count(block, "#show table.cell.where(y: 0)")).toBe(1);
  });

  it("deduceLayout : une source manuscrite garde les défauts pour table", () => {
    expect(deduceLayout(ministere).table).toEqual(defaultLayout().table);
  });
});

describe("compilation réelle (typst)", () => {
  const bodyTypst = "= Titre\nUn paragraphe.";
  // En-tête comme l'émet convert/tableToTypst.ts, avec une cellule colorée dans Docs (it.fill != auto).
  const tableTypst =
    '#table(columns: 3, table.header(table.cell(fill: rgb("#ddebf1"))[a],[b],[c]), [1],[2],[3],[4],[5],[6])';

  it("tableaux : en-tête couleur + zébrage compile avec un #table dans le corps", async () => {
    const pdf = await compileToPdf({
      templateSource: applyLayout(minimal, withTable({ headerFill: "brand", zebra: true })),
      bodyTypst: `${bodyTypst}\n\n${tableTypst}`,
      bodyImages: [],
    });
    expect(pdf.length).toBeGreaterThan(0);
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
  });

  it("tableaux : chaque combinaison filets × en-tête compile", async () => {
    for (const stroke of ["none", "light", "full"] as const) {
      for (const headerFill of ["none", "grey", "brand"] as const) {
        const pdf = await compileToPdf({
          templateSource: applyLayout(minimal, withTable({ stroke, headerFill, zebra: true, fontSize: "small" })),
          bodyTypst: tableTypst,
          bodyImages: [],
        });
        expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
      }
    }
  });

  it("minimal.typ + défauts compile en PDF", async () => {
    const pdf = await compileToPdf({
      templateSource: applyLayout(minimal, defaultLayout()),
      bodyTypst,
      bodyImages: [],
    });
    expect(pdf.length).toBeGreaterThan(0);
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
  });

  it("config complète (logo, texte échappé, paysage, pied conditionnel) compile", async () => {
    const pdf = await compileToPdf({
      templateSource: applyLayout(minimal, fullConfig()),
      templateAssetsDir: TEMPLATES_ASSETS_DIR,
      bodyTypst: `${bodyTypst}\n#pagebreak()\n== Page deux`,
      bodyImages: [],
    });
    expect(pdf.length).toBeGreaterThan(0);
  });

  it("texte avec `//` et fins de ligne exotiques compile", async () => {
    const cfg = defaultLayout();
    cfg.header.text = "Réf. 12//34 https://example.fr\r= pas un titre\u2028- pas une liste";
    const pdf = await compileToPdf({
      templateSource: applyLayout(minimal, cfg),
      bodyTypst,
      bodyImages: [],
    });
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
  });

  it("ministere.typ + réglages déduits compile avec le logo", async () => {
    const pdf = await compileToPdf({
      templateSource: applyLayout(ministere, deduceLayout(ministere)),
      templateAssetsDir: TEMPLATES_ASSETS_DIR,
      bodyTypst,
      bodyImages: [],
    });
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
  });
});
