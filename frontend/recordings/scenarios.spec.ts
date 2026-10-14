import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  Recorder,
  caption,
  click,
  installCursor,
  moveTo,
  scroll,
  trackApi,
  type,
} from "./recorder";

// One test = one clip (out/<name>.mp4 + .gif). Nothing is saved in the templates:
// settings stay as unsaved drafts and are gone when the browser closes.
//   npx playwright test -c recordings -g "1 text"

const DOCS_URL = process.env.DOCS_URL ?? "http://localhost:3000";
const DOCS_DOC =
  process.env.DOCS_DOC ?? `${DOCS_URL}/docs/402c11db-5e0a-45aa-ae81-fd705a1bbf25/`;
const HEADER_PDF = process.env.HEADER_PDF ?? "/Users/ok/templates/Planning - DINUM x 42.pdf";
const TEXT_TEMPLATE = process.env.TEXT_TEMPLATE ?? "Nouvelle template";
const AI_TEMPLATE = process.env.AI_TEMPLATE ?? "Template 42";
const AI_PROMPT = process.env.AI_PROMPT ?? "Make all headings cobalt blue (#1338BE)";
/** How much wider clip 6 drags the code panel, in CSS px. */
const CODE_PANEL_EXTRA_PX = Number(process.env.CODE_PANEL_EXTRA_PX ?? 110);
/** Heading 3 colour in clip 1. */
const H3_COLOR = process.env.H3_COLOR ?? "#182d9e";
/** Year in the Docs document's title before the clip; it is put back afterwards. */
const DOCS_YEAR = process.env.DOCS_YEAR ?? "2025";
/** Sentence appended to the first paragraph of the Docs document (clip 4). */
const DOCS_SENTENCE =
  process.env.DOCS_SENTENCE ??
  " This year, every department moved its letters, minutes and reports to shared templates, so the official layout now follows the content wherever it goes.";
/** How the first Docs paragraph ends before the clip: anything typed after it is removed afterwards. */
const DOCS_PARAGRAPH_END =
  process.env.DOCS_PARAGRAPH_END ?? "All figures in this document are fictional.";
/** Height of the header zone, in points (A4 page: 595.3 × 841.9). */
const HEADER_ZONE_PT = { height: 121.6 };

test.beforeEach(async ({ context }) => {
  await installCursor(context);
});

const preview = (page: Page) => page.locator(".pdf-scroll .pdf-page canvas").first();

/** Finds a template's editor URL from the home page, off camera. */
async function layoutUrl(page: Page, name: string) {
  await page.goto("/");
  const link = page.getByRole("link", { name, exact: true }).first();
  await expect(link).toBeVisible();
  const href = await link.getAttribute("href");
  if (!href) throw new Error(`template « ${name} » introuvable`);
  return href;
}

async function openEditor(page: Page, name: string) {
  const settle = trackApi(page);
  await page.goto(await layoutUrl(page, name));
  await expect(preview(page)).toBeVisible();
  await settle();
  return settle;
}

test("1 text — taille du texte courant", async ({ page }) => {
  const settle = trackApi(page);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Mes templates" })).toBeVisible();
  await settle();

  const rec = new Recorder("1-text-setup");
  await rec.attach(page);
  await page.waitForTimeout(1200);

  await click(page, page.getByRole("link", { name: TEXT_TEMPLATE, exact: true }).first());
  await rec.cut(page, async () => {
    await expect(preview(page)).toBeVisible();
    await settle();
  });
  await page.waitForTimeout(1000);

  await click(page, page.getByRole("tab", { name: "Text", exact: true }));
  const panel = page.getByRole("tabpanel");
  await click(page, panel.getByRole("button", { name: "Text", exact: true }));
  const size = panel.getByRole("spinbutton", { name: "Taille" });
  await click(page, size);
  // No typing: the field clamps "1" to the minimum of 6 before the second digit lands.
  const target = Number(process.env.TEXT_SIZE ?? 11);
  const steps = Math.round((target - Number(await size.inputValue())) / 0.5);
  if (Math.abs(steps) <= 8) {
    for (let i = 0; i < Math.abs(steps); i++) {
      await page.keyboard.press(steps > 0 ? "ArrowUp" : "ArrowDown");
      await page.waitForTimeout(220);
    }
  } else {
    await size.fill(String(target));
  }

  await rec.cut(page, () => settle(), 0.6);
  await page.waitForTimeout(1500);

  // Heading 3 in blue. The native colour picker never shows on screen: the cursor
  // rests on the swatch and the value changes.
  await click(page, panel.getByRole("button", { name: "Heading 3", exact: true }));
  const swatch = panel.getByLabel("Couleur Heading 3");
  await moveTo(page, swatch);
  await page.waitForTimeout(300);
  await swatch.fill(H3_COLOR);
  await rec.cut(page, () => settle(), 0.6);
  await page.waitForTimeout(1500);

  // Tables: grey header row, no rules.
  await click(page, panel.getByRole("button", { name: "Tableaux", exact: true }));
  await choose(page, panel.getByRole("combobox", { name: "Fond de l'en-tête" }), "Gris");
  await rec.cut(page, () => settle(), 0.6);
  await page.waitForTimeout(1000);
  await choose(page, panel.getByRole("combobox", { name: "Filets" }), "Aucun");
  await rec.cut(page, () => settle(), 0.6);
  await page.waitForTimeout(2500);
  await rec.finish();
});

test("2 header — en-tête extrait d'un PDF", async ({ page }) => {
  const settle = await openEditor(page, TEXT_TEMPLATE);

  const rec = new Recorder("2-header-setup");
  await rec.attach(page);
  await page.waitForTimeout(1000);

  await click(page, page.getByRole("tab", { name: "En-tête", exact: true }));
  const panel = page.getByRole("tabpanel");
  await click(page, panel.getByRole("button", { name: "Retirer l'image" }).first());
  await rec.cut(page, () => settle(), 0.3);
  await page.waitForTimeout(600);
  await click(page, panel.getByRole("button", { name: "Extraire d'un PDF/DOCX" }).first());

  const dialog = page.getByRole("dialog", { name: "Importer un document" });
  await expect(dialog).toBeVisible();
  await page.waitForTimeout(600);
  const browse = dialog.getByText("ou cliquez pour parcourir");
  const chooser = page.waitForEvent("filechooser");
  await click(page, browse);
  await (await chooser).setFiles(HEADER_PDF);

  const crop = dialog.locator(".crop");
  await rec.cut(page, async () => {
    await expect(crop.locator("img")).toBeVisible({ timeout: 120_000 });
    await crop.locator("img").evaluate((img: HTMLImageElement) => img.decode());
  });
  await page.waitForTimeout(1200);

  await resizeZone(page, crop);
  await page.waitForTimeout(1200);

  // The render with the new header only starts once the dialog closes and the layout is recomposed.
  const rendered = page.waitForResponse(
    (r) => r.url().endsWith("/api/render") && r.request().method() === "POST",
    { timeout: 120_000 },
  );
  await click(page, dialog.getByRole("button", { name: "Utiliser comme visuel" }));
  await rec.cut(page, async () => {
    await expect(dialog).toBeHidden({ timeout: 120_000 });
    await rendered;
    await settle();
  });
  await page.waitForTimeout(2500);

  // Footer: remove the existing section, then "1 / N" page numbering.
  await click(page, page.getByRole("tab", { name: "Pied", exact: true }));
  await click(page, panel.getByRole("button", { name: /^Supprimer la section/ }).first());
  await rec.cut(page, () => settle(), 0.3);
  await page.waitForTimeout(800);
  await choose(page, panel.getByRole("combobox", { name: "Numérotation" }), "1 / N");
  await rec.cut(page, () => settle(), 0.3);
  await page.waitForTimeout(3000);
  await rec.finish();
});

/** Opens a UI-kit dropdown and picks `option`. */
async function choose(page: Page, select: Locator, option: string) {
  await click(page, select);
  await page.waitForTimeout(400);
  await click(page, page.getByRole("option", { name: option, exact: true }));
}

/**
 * Resizes the suggested zone by its bottom handle: the selection switches to
 * "Zone personnalisée" by itself.
 */
async function resizeZone(page: Page, crop: Locator) {
  const box = (await crop.boundingBox())!;
  const scale = box.width / 595.3;
  const bottom = crop.locator(".crop__handle").nth(6); // nw, n, ne, w, e, sw, s, se
  const handle = (await bottom.boundingBox())!;
  await dragTo(page, bottom, {
    x: handle.x + handle.width / 2,
    y: box.y + HEADER_ZONE_PT.height * scale,
  });
}

async function dragTo(page: Page, handle: Locator, to: { x: number; y: number }) {
  await moveTo(page, handle);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 40 });
  await page.mouse.up();
  await page.waitForTimeout(300);
}

test("3 typst + ai — titres en bleu", async ({ page }) => {
  await recordTypstAi(page, "3-typst-ai", false);
});

test("6 typst wide — panneau élargi, couleurs dans le code", async ({ page }) => {
  await recordTypstAi(page, "6-typst-ai-wide", true);
});

/**
 * Clip 3, and its variant 6 (`wide`): the code panel is dragged wider when the
 * Typst view opens, and once the change is applied the code scrolls sideways to
 * the new heading colour.
 */
async function recordTypstAi(page: Page, name: string, wide: boolean) {
  const settle = await openEditor(page, AI_TEMPLATE);

  const rec = new Recorder(name);
  await rec.attach(page);
  await page.waitForTimeout(1000);

  await click(page, page.getByRole("link", { name: "Mode code Typst" }));
  await rec.cut(page, () => settle(), 0.3);
  await page.waitForTimeout(wide ? 800 : 1500);

  if (wide) {
    const divider = page.getByRole("separator", { name: "Redimensionner le panneau d'édition" });
    const box = (await divider.boundingBox())!;
    await dragTo(page, divider, { x: box.x + box.width / 2 + CODE_PANEL_EXTRA_PX, y: box.y + box.height / 2 });
    await rec.cut(page, () => settle(), 0.3);
    await page.waitForTimeout(800);
    // Show the headings' current colour before asking for a new one.
    await scrollCodeToColour(page);
    await page.waitForTimeout(1500);
  }

  await click(page, page.getByRole("button", { name: "Assistant IA" }));
  const ai = page.getByRole("complementary", { name: "Assistant IA" });
  await expect(ai).toBeVisible();
  await page.waitForTimeout(600);
  await click(page, ai.getByRole("textbox", { name: "Demande à l'assistant" }));
  await type(page, AI_PROMPT, 45);
  await page.waitForTimeout(400);
  await click(page, ai.getByRole("button", { name: "Envoyer" }));

  const apply = ai.getByRole("button", { name: "Appliquer" });
  await rec.cut(
    page,
    async () => {
      await expect(apply).toBeVisible({ timeout: 5 * 60_000 });
      await settle();
    },
    1.5,
  );
  await page.waitForTimeout(2500);

  await click(page, apply);
  await rec.cut(page, () => settle(), 0.3);
  if (wide) {
    await page.waitForTimeout(1200);
    await scrollCodeToColour(page);
  }
  await page.waitForTimeout(3000);
  await rec.finish();
}

/**
 * Scrolls the Typst source sideways until the heading rules' colour is in view (the
 * lines don't wrap, the colour sits past the right edge): the end of the first
 * `fill: rgb("#……")` on a `#show heading` rule, whatever the colour is.
 */
async function scrollCodeToColour(page: Page) {
  const code = page.getByRole("textbox", { name: "Source Typst" });
  const target = await code.evaluate((ta: HTMLTextAreaElement) => {
    const fill = /fill:\s*rgb\("#[0-9a-f]{6}"\)/i;
    // A `#show heading…` rule, not the long settings line at the top (it mentions "headings" too).
    const line = ta.value
      .split("\n")
      .find((l) => l.trimStart().startsWith("#show heading") && fill.test(l));
    if (!line) return 0;
    const match = fill.exec(line)!;
    const column = match.index + match[0].length;
    const style = getComputedStyle(ta);
    const ctx = document.createElement("canvas").getContext("2d")!;
    ctx.font = `${style.fontSize} ${style.fontFamily}`;
    const charWidth = ctx.measureText("0").width;
    return Math.max(0, column * charWidth + parseFloat(style.paddingLeft) - ta.clientWidth + 24);
  });
  if (!target) return;
  await moveTo(page, code);
  while ((await code.evaluate((ta) => ta.scrollLeft)) < target - 1) {
    const before = await code.evaluate((ta) => ta.scrollLeft);
    await page.mouse.wheel(Math.min(60, target - before), 0);
    await page.waitForTimeout(35);
    if ((await code.evaluate((ta) => ta.scrollLeft)) === before) break; // end of the line
  }
}

test("4 docs → dots — contenu à jour", async ({ context, page: dots }) => {
  const docs = await context.newPage();
  const docsSettle = trackApi(docs, /\/api\/v1\.0\/documents\/.+\/content\//);
  await docs.goto(DOCS_DOC);
  const editor = docs.locator(".bn-editor");
  await expect(editor).toBeVisible({ timeout: 60_000 });
  await docs.waitForTimeout(1500);

  const settle = trackApi(dots);
  await dots.goto("/");
  await expect(dots.getByRole("heading", { name: "Mes templates" })).toBeVisible();
  await settle();

  // Fixed starting point, off camera: an interrupted run may have left its edits behind.
  await restoreDocs(docs, DOCS_YEAR);
  const newYear = process.env.NEW_YEAR ?? String(Number(DOCS_YEAR) + 1);

  const rec = new Recorder("4-docs-to-dots");
  try {
    // ① The document in Docs
    await rec.attach(docs);
    await caption(docs, "The document lives in La Suite Docs");
    await docs.waitForTimeout(2500);
    await caption(docs, null);

    // ② Dots: paste the URL
    await rec.attach(dots);
    await caption(dots, "Paste its link into Dots");
    await dots.waitForTimeout(800);
    await click(dots, dots.getByRole("combobox", { name: "Coller l'URL d'un document Docs" }));
    await dots.getByRole("combobox", { name: "Coller l'URL d'un document Docs" }).fill(DOCS_DOC);
    await dots.waitForTimeout(600);
    await click(dots, dots.getByRole("button", { name: "Ouvrir", exact: true }));
    await rec.cut(dots, async () => {
      await expect(preview(dots)).toBeVisible({ timeout: 120_000 });
      await settle();
    });
    await caption(dots, "Pick a template");
    await dots.waitForTimeout(1500);

    // ③ Switch templates; on the second one, show page 2. The last one chosen
    //   stays in the URL (?template=), so Dots reopens it after Docs.
    const tiles = dots.locator(".doc-rail__templates .compose-tile__name");
    const count = await tiles.count();
    const order = [1, 2].filter((i) => i < count);
    for (const [n, i] of order.entries()) {
      await click(dots, tiles.nth(i));
      await rec.cut(dots, () => settle(), 0);
      await dots.waitForTimeout(1200);
      const pages = dots.locator(".pdf-scroll .pdf-page:not(.pdf-page--pending)");
      if (n === 0 && (await pages.count()) > 1) {
        const firstPage = (await pages.first().boundingBox())!;
        await moveTo(dots, preview(dots));
        await scroll(dots, firstPage.height + 16);
        await dots.waitForTimeout(1500);
        await scroll(dots, -(firstPage.height + 16));
        await dots.waitForTimeout(600);
      }
    }
    await caption(dots, null);

    // ④ Back in Docs: change the year in the title
    await rec.attach(docs);
    await caption(docs, "Edit the document in Docs");
    await docs.waitForTimeout(800);
    await freezeScroll(docs, true);
    const fresh = await findYear(docs);
    await moveTo(docs, fresh);
    await docs.mouse.dblclick(fresh.x, fresh.y);
    await docs.waitForTimeout(400);
    await type(docs, newYear, 140);
    await docs.waitForTimeout(800);

    // …and lengthen the first paragraph: a change that shows in the PDF.
    const end = await paragraphEnd(docs);
    await moveTo(docs, end);
    await docs.mouse.click(end.x, end.y);
    await docs.keyboard.press("End");
    await type(docs, DOCS_SENTENCE, 40);
    await docs.waitForTimeout(1200);
    await freezeScroll(docs, false);
    // Keystrokes have been lost or reordered before ("minuts … goes.e"): fail rather than keep a typo.
    const typed = await firstParagraph(docs);
    if (!typed.endsWith(DOCS_PARAGRAPH_END + DOCS_SENTENCE)) {
      throw new Error(`typed text differs from DOCS_SENTENCE: …${typed.slice(-80)}`);
    }

    // Docs only saves once a minute: wait for the save off camera.
    await rec.cut(docs, async () => {
      await waitForDocsSave(docs);
      await docsSettle();
    }, 0);

    // ⑤ Dots: reload, the PDF follows
    await rec.attach(dots);
    await caption(dots, "Dots picks up the change");
    await dots.waitForTimeout(600);
    await rec.cut(dots, async () => {
      await dots.reload();
      await expect(preview(dots)).toBeVisible({ timeout: 120_000 });
      await settle();
      // The reload wipes the caption: put it back before recording resumes.
      await caption(dots, "Dots picks up the change");
    }, 0);
    await dots.waitForTimeout(5500);
    await rec.finish();
  } finally {
    // Put the document back as it was, so the clip can be recorded again.
    if (process.env.KEEP_EDIT !== "1") await restoreDocs(docs, DOCS_YEAR);
  }
});

/** First year (19xx/20xx) in a heading of the Docs document, with its position on screen. */
async function findYear(docs: Page) {
  const found = await docs.evaluate(() => {
    const headings = document.querySelectorAll(
      '.bn-editor [data-content-type="heading"]',
    );
    for (const heading of headings) {
      const walker = document.createTreeWalker(heading, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const match = /\b(19|20)\d{2}\b/.exec(node.textContent ?? "");
        if (!match) continue;
        const range = document.createRange();
        range.setStart(node, match.index);
        range.setEnd(node, match.index + 4);
        const r = range.getBoundingClientRect();
        return { text: match[0], x: r.left + r.width / 2, y: r.top + r.height / 2 };
      }
    }
    return null;
  });
  if (!found) throw new Error("aucune année dans les titres du document Docs");
  return found;
}

/**
 * Typing in Docs scrolls its main container (smooth scroll from the editor library),
 * which pushes the edited line to the top edge. While frozen, the container can't
 * scroll at all; the edits happen at the top of the document, where it sits at 0.
 */
async function freezeScroll(docs: Page, frozen: boolean) {
  await docs.evaluate((on) => {
    const main = document.getElementById("mainContent");
    if (main) main.style.overflowY = on ? "clip" : "";
  }, frozen);
}

/** End of the first non-empty paragraph in the Docs document, in screen coordinates. */
async function paragraphEnd(docs: Page) {
  const found = await docs.evaluate(() => {
    for (const p of document.querySelectorAll('.bn-editor [data-content-type="paragraph"]')) {
      const walker = document.createTreeWalker(p, NodeFilter.SHOW_TEXT);
      let last: Text | null = null;
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (node.textContent?.trim()) last = node as Text;
      }
      if (!last) continue;
      const range = document.createRange();
      range.setStart(last, last.length - 1);
      range.setEnd(last, last.length);
      const r = range.getBoundingClientRect();
      return { x: r.right, y: r.top + r.height / 2 };
    }
    return null;
  });
  if (!found) throw new Error("aucun paragraphe dans le document Docs");
  return found;
}

/**
 * Selects `text` in the Docs editor through a DOM selection that ProseMirror picks
 * up (no mouse: a double-click in a background tab selects nothing).
 * `scope` narrows the search, e.g. to headings.
 */
async function selectText(docs: Page, text: string, scope = ".bn-editor") {
  return docs.evaluate(
    ({ needle, scope }) => {
      const editor = document.querySelector<HTMLElement>(".bn-editor");
      if (!editor) return false;
      for (const root of document.querySelectorAll(scope)) {
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
          const at = (node.textContent ?? "").replace(/\u00a0/g, " ").indexOf(needle);
          if (at < 0) continue;
          editor.focus();
          const range = document.createRange();
          range.setStart(node, at);
          range.setEnd(node, at + needle.length);
          const selection = window.getSelection()!;
          selection.removeAllRanges();
          selection.addRange(range);
          return true;
        }
      }
      return false;
    },
    { needle: text, scope },
  );
}

/** Text of the first non-empty paragraph in the Docs editor (non-breaking spaces as spaces). */
async function firstParagraph(docs: Page) {
  return docs.evaluate(() => {
    for (const p of document.querySelectorAll('.bn-editor [data-content-type="paragraph"]')) {
      const text = (p.textContent ?? "").replace(/\u00a0/g, " ");
      if (text.trim()) return text;
    }
    return "";
  });
}

/**
 * Selects whatever follows DOCS_PARAGRAPH_END in the first paragraph, whatever was
 * typed there (exact or garbled). False when there is nothing to remove.
 */
async function selectAfterParagraphEnd(docs: Page) {
  return docs.evaluate((end) => {
    for (const p of document.querySelectorAll('.bn-editor [data-content-type="paragraph"]')) {
      const nodes: Text[] = [];
      const walker = document.createTreeWalker(p, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) nodes.push(n as Text);
      const full = nodes.map((n) => n.data).join("").replace(/\u00a0/g, " ");
      if (!full.trim()) continue;
      const at = full.indexOf(end);
      if (at < 0 || at + end.length >= full.length) return false;
      const locate = (offset: number): [Text, number] => {
        for (const n of nodes) {
          if (offset <= n.length) return [n, offset];
          offset -= n.length;
        }
        const last = nodes[nodes.length - 1];
        return [last, last.length];
      };
      const range = document.createRange();
      range.setStart(...locate(at + end.length));
      range.setEnd(...locate(full.length));
      document.querySelector<HTMLElement>(".bn-editor")?.focus();
      const selection = window.getSelection()!;
      selection.removeAllRanges();
      selection.addRange(range);
      return true;
    }
    return false;
  }, DOCS_PARAGRAPH_END);
}

/** Removes the added sentence and restores the year, then waits for Docs to save it. */
async function restoreDocs(docs: Page, originalYear: string) {
  await docs.bringToFront();
  let changed = false;
  if (await selectAfterParagraphEnd(docs)) {
    await docs.waitForTimeout(200);
    await docs.keyboard.press("Backspace");
    changed = true;
  }
  const current = await findYear(docs).catch(() => null);
  if (current && current.text !== originalYear) {
    await selectText(docs, current.text, '.bn-editor [data-content-type="heading"]');
    await docs.waitForTimeout(200);
    await docs.keyboard.type(originalYear);
    changed = true;
  }
  if (!changed) return;
  await docs.waitForTimeout(300);
  const after = await findYear(docs);
  const paragraph = await firstParagraph(docs);
  if (after.text !== originalYear || !paragraph.endsWith(DOCS_PARAGRAPH_END)) {
    throw new Error(`Docs not restored: title says ${after.text}, paragraph ends "…${paragraph.slice(-40)}"`);
  }
  await waitForDocsSave(docs);
}

/**
 * Waits for a Docs autosave (at most a minute away) sent after this call: a save
 * already in flight may not include the last keystroke.
 */
async function waitForDocsSave(docs: Page) {
  const request = await docs.waitForRequest(
    (r) => /\/documents\/.+\/content\/$/.test(r.url()) && r.method() === "PATCH",
    { timeout: 90_000 },
  );
  const response = await request.response();
  if (!response?.ok()) throw new Error(`sauvegarde Docs en échec (${response?.status()})`);
}
