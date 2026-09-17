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
import { defaultLayout, newBlock, sanitizeLayout, type Block, type LayoutConfig } from "./layoutConfig.js";
import { compileToPdf } from "../compile/typstCompile.js";
import { TEMPLATES_ASSETS_DIR } from "../registry/templates.js";

const minimal = await readFile(new URL("../../templates/minimal.typ", import.meta.url), "utf8");
const ministere = await readFile(new URL("../../templates/ministere.typ", import.meta.url), "utf8");

function count(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

/**
 * A block with the given overrides. Title and subtitle start empty rather than
 * with newBlock's stand-in text, so each test only renders what it sets.
 */
function blk(patch: Partial<Block> = {}): Block {
  return { ...newBlock("custom", "#0659c5"), title: "", subtitle: "", ...patch };
}

/** Config qui exerce toutes les branches du générateur. */
function fullConfig(): LayoutConfig {
  return sanitizeLayout({
    ...defaultLayout(),
    orientation: "landscape",
    font: "Arial",
    lineHeight: 1.5,
    header: {
      blocks: [blk({
        title: "= Ministère * # \" [x]\n- Direction _générale_",
        image: "logo-ministere.png",
        align: "right",
      })],
    },
    footer: {
      blocks: [blk({ title: "Réf. #2026", scope: "except-first", align: "center" })],
      numbering: "page-n-of-total",
      numberingAlign: "center",
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
    expect(readLayout(out)).toEqual({ layout: sanitizeLayout({ ...defaultLayout(), fontSize: 9 }), managed: true });
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
    expect(layout).toMatchObject({
      margins: { top: 25, bottom: 25, left: 25, right: 25 },
      font: "Libertinus Serif",
      header: { blocks: [] },
    });
    expect(layout.footer.blocks).toEqual([]);
    expect(layout.footer.numbering).toBe("n-of-total");
  });

  it("source sans #set page : ni en-tête ni pied, le reste par défaut", () => {
    const { layout } = readLayout("#set heading(numbering: none)\n#include \"body.typ\"\n");
    expect(layout.header.blocks).toEqual([]);
    expect(layout.footer.blocks).toEqual([]);
    expect(layout.footer.numbering).toBe("none");
    expect(layout.margins).toEqual(defaultLayout().margins);
  });

  it("relit les caractères de fin de ligne exotiques tels quels", () => {
    const cfg = sanitizeLayout({
      ...defaultLayout(),
      header: { blocks: [blk({ title: "a\rb\u2028c\u0085d\u2029e" })] },
    });
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
    expect(l.header.blocks).toHaveLength(1);
    expect(l.header.blocks[0]).toMatchObject({
      scope: "all",
      title: "RÉPUBLIQUE FRANÇAISE\nMinistère de l'Exemple",
      image: "logo-ministere.png",
      align: "left",
    });
    expect(l.header.blocks[0].rule.on).toBe(true);
    // A rule with no text and no image is still a block: the line is drawn.
    expect(l.footer.blocks).toHaveLength(1);
    expect(l.footer.blocks[0]).toMatchObject({ scope: "all", title: "", image: null });
    expect(l.footer.numbering).toBe("n-of-total");
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
    expect(l.header.blocks).toEqual([]);
    expect(l.footer.numbering).toBe("page-n-of-total");
    expect(l.footer.numberingAlign).toBe("right");
  });
});

describe("layoutToTypst", () => {
  it("écrit header: none et footer: none quand la bande est vide", () => {
    // No visual, no text, no rule and no page number: presence is derived from
    // the fields, so there is nothing left to draw.
    const cfg = defaultLayout();
    cfg.footer.numbering = "none";
    const out = layoutToTypst(cfg);
    expect(out).toContain("header: none,");
    expect(out).toContain("footer: none,");
  });

  it("une bande désactivée avant la dérivation reste vide après relecture", () => {
    // Templates saved with the old `enabled: false` must keep looking the way
    // they were saved, instead of the defaults reappearing.
    const cfg = sanitizeLayout({ ...defaultLayout(), header: { enabled: false, rule: true } });
    expect(cfg.header.blocks).toEqual([]);
    expect(layoutToTypst(cfg)).toContain("header: none,");
  });

  it("échappe le texte libre", () => {
    const out = layoutToTypst(fullConfig());
    expect(out).toContain('[\\= Ministère \\* \\# " \\[x\\] \\ \\- Direction \\_générale\\_]');
    expect(out).toContain("[Réf. \\#2026]");
    expect(out).toContain('#align(center)[Page #context counter(page).display("1 / 1", both: true)]');
  });

  it("échappe `//` et les fins de ligne que Typst reconnaît", () => {
    const cfg = sanitizeLayout({
      ...defaultLayout(),
      header: { blocks: [blk({ title: "Ministère // Direction\r= Titre\u2028- liste\u0085+ énum\u2029/ terme\x0B1. un" })] },
      footer: { blocks: [blk({ title: "https://example.fr" })] },
    });
    const lines = layoutToTypst(cfg).split("\n");
    expect(lines.join("\n")).toContain(
      "[Ministère \\/\\/ Direction \\ \\= Titre \\ \\- liste \\ \\+ énum \\ \\/ terme \\ 1\\. un]",
    );
    expect(lines.join("\n")).toContain("[https:\\/\\/example.fr]");
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

  it("applique un en-tête seulement sur la première page", () => {
    const cfg = sanitizeLayout({
      ...defaultLayout(),
      header: { blocks: [blk({ scope: "first", title: "Couverture" })] },
    });
    const out = layoutToTypst(cfg);
    expect(out).toContain("header: [");
    expect(out).toContain('if counter(page).get().first() == 1');
    expect(out).toContain("[Couverture]");
  });

  it("applique un pied différent en première page", () => {
    const cfg = sanitizeLayout({
      ...defaultLayout(),
      footer: {
        blocks: [blk({ scope: "first", title: "Première" }), blk({ scope: "except-first", title: "Suite" })],
        numbering: "none",
      },
    });
    const out = layoutToTypst(cfg);
    expect(out).toContain("if counter(page).get().first() == 1");
    expect(out).toContain("if counter(page).get().first() > 1");
    expect(out).toContain("[Première]");
    expect(out).toContain("[Suite]");
  });

  it("dérive les styles de texte depuis les anciens champs quand ils ne sont pas custom", () => {
    const cfg = { ...defaultLayout(), font: "Arial", fontSize: 14, headings: { scale: "compact", color: "#ff5050" } as const };
    const out = layoutToTypst(cfg);
    expect(out).toContain('#set text(font: ("Arial", "Helvetica", "Libertinus Serif"), size: 14pt, fill: rgb("#000000"))');
    expect(out).toContain(
      '#show heading.where(level: 1): set text(font: ("Arial", "Helvetica", "Libertinus Serif"), size: 18.2pt, fill: rgb("#ff5050"))',
    );
    expect(readLayout(out).layout.textStyles.h1).toEqual({ font: "Arial", fontSize: 18.2, color: "#ff5050" });
  });

  it("garde les anciens champs pilotes quand les styles existants étaient seulement dérivés", () => {
    const imported = sanitizeLayout({ ...defaultLayout(), font: "Arial", fontSize: 12 });
    const edited = sanitizeLayout({ ...imported, fontSize: 10, headings: { scale: "large", color: "#ff5050" } });
    expect(edited.textStyles).toMatchObject({
      body: { font: "Arial", fontSize: 10, color: "#000000" },
      h1: { font: "Arial", fontSize: 19, color: "#ff5050" },
      h2: { font: "Arial", fontSize: 15, color: "#ff5050" },
      h3: { font: "Arial", fontSize: 12, color: "#ff5050" },
    });
  });

  it("écrit les styles de texte custom body, h1, h2 et h3", () => {
    const cfg = sanitizeLayout({
      ...defaultLayout(),
      textStyles: {
        body: { font: "Helvetica", fontSize: 10, color: "#222222" },
        h1: { font: "Arial", fontSize: 24, color: "#ff5050" },
        h2: { font: "Libertinus Serif", fontSize: 18, color: "#00aa77" },
        h3: { font: "DejaVu Sans Mono", fontSize: 13, color: "#555555" },
      },
    });
    const out = layoutToTypst(cfg);
    expect(out).toContain('#set text(font: ("Helvetica", "Arial", "Libertinus Serif"), size: 10pt, fill: rgb("#222222"))');
    expect(out).toContain('#show heading.where(level: 1): set text(font: ("Arial", "Helvetica", "Libertinus Serif"), size: 24pt, fill: rgb("#ff5050"))');
    expect(out).toContain('#show heading.where(level: 2): set text(font: ("Libertinus Serif", "Arial", "Helvetica"), size: 18pt, fill: rgb("#00aa77"))');
    expect(out).toContain('#show heading.where(level: 3): set text(font: ("DejaVu Sans Mono", "Arial", "Helvetica", "Libertinus Serif"), size: 13pt, fill: rgb("#555555"))');
    expect(readLayout(out).layout.textStyles).toEqual(cfg.textStyles);
  });
});

describe("espacement des sections et pagination", () => {
  it("un bloc neuf n'a pas de filet : plusieurs sections ne tracent pas chacune leur trait", () => {
    expect(newBlock("custom", "#0659c5").rule.on).toBe(false);
  });

  it("l'espacement s'applique même filet éteint, pour écarter des sections sans tracer de trait", () => {
    const cfg = sanitizeLayout({
      ...defaultLayout(),
      header: {
        blocks: [blk({ title: "Un", spaceBelowMm: 8 }), blk({ title: "Deux", spaceAboveMm: 0 })],
      },
    });
    const out = layoutToTypst(cfg);
    expect(out).toContain("#v(8mm)");
    expect(out).not.toContain("#line(");
  });

  it("l'espace « après » d'un bloc suit son propre contenu, dans un pied comme dans un en-tête", () => {
    // A plain toContain would have missed this: the bug moved #v(8mm) before "Un",
    // not between "Un" and "Deux". Only the order reveals it.
    for (const kind of ["header", "footer"] as const) {
      const cfg = sanitizeLayout({
        ...defaultLayout(),
        [kind]: {
          blocks: [blk({ title: "Un", spaceBelowMm: 8 }), blk({ title: "Deux" })],
        },
      });
      const out = layoutToTypst(cfg);
      const iUn = out.indexOf("[Un]");
      const iGap = out.indexOf("#v(8mm)");
      const iDeux = out.indexOf("[Deux]");
      expect(iUn, kind).toBeGreaterThan(-1);
      expect(iGap, kind).toBeGreaterThan(iUn);
      expect(iDeux, kind).toBeGreaterThan(iGap);
    }
  });

  it("le filet se place au-dessus du contenu dans un pied, en dessous dans un en-tête", () => {
    const rule = { on: true, color: "#0659c5", widthPt: 1 } as const;
    const header = layoutToTypst(
      sanitizeLayout({ ...defaultLayout(), header: { blocks: [blk({ title: "Texte", rule })] } }),
    );
    const footer = layoutToTypst(
      sanitizeLayout({ ...defaultLayout(), footer: { blocks: [blk({ title: "Texte", rule })] } }),
    );
    expect(header.indexOf("[Texte]")).toBeLessThan(header.indexOf("#line("));
    expect(footer.indexOf("#line(")).toBeLessThan(footer.indexOf("[Texte]"));
  });

  it("le filet ne touche jamais son contenu, même sans espacement réglé par l'utilisateur", () => {
    const rule = { on: true, color: "#0659c5", widthPt: 1 } as const;
    const out = layoutToTypst(
      sanitizeLayout({ ...defaultLayout(), footer: { blocks: [blk({ title: "Texte", rule })] } }),
    );
    // The line comes before the content in a footer: the fixed v() reads just before "[Texte]".
    const iLine = out.indexOf("#line(");
    const iGap = out.indexOf("#v(3mm)");
    const iTexte = out.indexOf("[Texte]");
    expect(iLine).toBeGreaterThan(-1);
    expect(iGap).toBeGreaterThan(iLine);
    expect(iTexte).toBeGreaterThan(iGap);
  });

  it("le filet garde toute la largeur de la page même si la bande a ses propres marges gauche/droite", () => {
    const rule = { on: true, color: "#0659c5", widthPt: 1 } as const;
    const cfg = sanitizeLayout({
      ...defaultLayout(),
      footer: {
        blocks: [blk({ title: "Texte", rule })],
        spacing: { top: 0, left: 30, right: 15, gap: 6 },
      },
    });
    const out = layoutToTypst(cfg);
    expect(out).toContain("pad(left: -30mm, right: -15mm)[#line(length: 100%,");
  });

  it("centre le numéro de page par défaut", () => {
    expect(defaultLayout().footer.numberingAlign).toBe("center");
  });

  it("la marge basse loge le numéro de page même sans aucun bloc dans le pied", () => {
    // Margin deliberately too short for a line of text: without the fix,
    // bandHeightMm ignored the numbering and would never have widened it.
    const cfg = sanitizeLayout({
      ...defaultLayout(),
      margins: { ...defaultLayout().margins, bottom: 2 },
      footer: { blocks: [], numbering: "n-of-total" },
    });
    const out = layoutToTypst(cfg);
    const bottom = Number(/margin: \([^)]*bottom: ([\d.]+)mm/.exec(out)![1]);
    expect(bottom).toBeGreaterThan(2);
    expect(out).toContain("footer: [");
  });

  it("la numérotation a sa propre portée, indépendante de celle des blocs", () => {
    const cfg = sanitizeLayout({
      ...defaultLayout(),
      footer: { blocks: [], numbering: "n", numberingScope: "except-first" },
    });
    const out = layoutToTypst(cfg);
    expect(out).toContain("counter(page).get().first() > 1");
  });

  it("deux blocs qui tracent chacun leur filet donnent deux traits, pas un seul", () => {
    const cfg = sanitizeLayout({
      ...defaultLayout(),
      header: {
        blocks: [
          blk({ title: "Un", rule: { on: true, color: "#0659c5", widthPt: 1 } }),
          blk({ title: "Deux", rule: { on: true, color: "#0659c5", widthPt: 1 } }),
        ],
      },
    });
    expect(count(layoutToTypst(cfg), "#line(")).toBe(2);
  });
});

describe("image pleine largeur", () => {
  it("header-ascent/footer-descent à 0 % seulement pour une image pleine largeur", () => {
    const d = defaultLayout();
    const full = blk({ image: "logo-ministere.png", imageHeightMm: 0 });

    const bleedHeader = layoutToTypst({ ...d, header: { ...d.header, blocks: [full] } });
    expect(bleedHeader).toContain("header-ascent: 0%,");
    expect(bleedHeader).not.toContain("footer-descent: 0%,");

    const bleedFooter = layoutToTypst({ ...d, footer: { ...d.footer, blocks: [full] } });
    expect(bleedFooter).toContain("footer-descent: 0%,");
    expect(bleedFooter).not.toContain("header-ascent: 0%,");

    // Image à largeur fixe : la réserve devient l'écart réglé par la bande.
    const inline = layoutToTypst({
      ...d,
      header: { ...d.header, blocks: [blk({ image: "logo-ministere.png", imageHeightMm: 40 })] },
    });
    expect(inline).toContain(`header-ascent: ${d.header.spacing.gap}mm,`);
  });

  it("empile plusieurs blocs dans un seul argument header", () => {
    const cfg = sanitizeLayout({
      ...defaultLayout(),
      header: {
        blocks: [blk({ title: "Bloc un" }), blk({ title: "Bloc deux", scope: "first" })],
        spacing: { top: 5, left: 10, right: 10, gap: 6 },
      },
    });
    const out = layoutToTypst(cfg);
    // Un seul en-tête, deux blocs dedans.
    expect(count(out, "header: ")).toBe(1);
    // `top` passe par la marge de page, pas par un pad interne.
    expect(out).toContain("pad(left: 10mm, right: 10mm)");
    expect(out).not.toContain("pad(top:");
    expect(out).toContain("[Bloc un]");
    expect(out).toContain("[Bloc deux]");
    expect(readLayout(out).layout.header.blocks).toHaveLength(2);
  });

  it("« Bas » (spacing.top) est un plancher : jamais réduit, jamais additionné au besoin réel", () => {
    const d = defaultLayout();
    // The content (20mm image + 6mm gap = 26mm) sits well under the 30mm
    // asked for: "Bas" wins, it is not added on top.
    const floorWins = sanitizeLayout({
      ...d,
      header: {
        blocks: [blk({ kind: "image-text", title: "Titre", imageHeightMm: 20 })],
        spacing: { top: 30, left: 0, right: 0, gap: 6 },
      },
    });
    const top1 = Number(/margin: \(top: ([\d.]+)mm/.exec(layoutToTypst(floorWins))![1]);
    expect(top1).toBe(30);

    // Conversely, content taller than "Bas" is never clipped: the real need wins.
    const contentWins = sanitizeLayout({
      ...d,
      header: {
        blocks: [blk({ kind: "image-text", title: "Titre", imageHeightMm: 60 })],
        spacing: { top: 5, left: 0, right: 0, gap: 6 },
      },
    });
    const top2 = Number(/margin: \(top: ([\d.]+)mm/.exec(layoutToTypst(contentWins))![1]);
    expect(top2).toBeGreaterThanOrEqual(60 + 6);

    // Une marge déjà plus grande que la bande est gardée telle quelle.
    const wide = sanitizeLayout({ ...d, margins: { ...d.margins, top: 70 } });
    expect(layoutToTypst(wide)).toContain("margin: (top: 70mm");
  });

  it("migre l'ancienne forme : different-first devient deux blocs", () => {
    const cfg = sanitizeLayout({
      ...defaultLayout(),
      header: {
        mode: "different-first",
        text: "Suite",
        rule: true,
        first: { text: "Couverture", logo: null, fullBleed: false, align: "left", rule: true },
      },
    });
    expect(cfg.header.blocks.map((b) => [b.scope, b.title])).toEqual([
      ["first", "Couverture"],
      ["except-first", "Suite"],
    ]);
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

  it("première page différente compile", async () => {
    const cfg = sanitizeLayout({
      ...defaultLayout(),
      header: {
        blocks: [
          blk({ scope: "first", title: "Première page" }),
          blk({ scope: "except-first", title: "Pages suivantes" }),
        ],
      },
      footer: {
        blocks: [blk({ scope: "first", title: "Couverture" })],
        numbering: "none",
      },
    });
    const pdf = await compileToPdf({
      templateSource: applyLayout(minimal, cfg),
      bodyTypst: `${bodyTypst}\n#pagebreak()\n== Page deux`,
      bodyImages: [],
    });
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
  });

  it("texte avec `//` et fins de ligne exotiques compile", async () => {
    const cfg = sanitizeLayout({
      ...defaultLayout(),
      header: { blocks: [blk({ title: "Réf. 12//34 https://example.fr\r= pas un titre\u2028- pas une liste" })] },
    });
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
