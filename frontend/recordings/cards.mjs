// Title cards shared by combine.mjs and story.mjs: HTML rendered to PNG with
// Playwright's Chrome (this ffmpeg build has no drawtext).
import { chromium } from "@playwright/test";

export const BLUE = "#3E5DE7";

export const INTRO = {
  title: "Dots",
  text: "From a La Suite Docs document to an official PDF, through reusable Typst templates.",
};

/** One card per clip, by clip number. */
export const CLIP_CARDS = {
  1: { title: "Layout editor", text: "Text sizes, colours and tables, previewed live." },
  2: { title: "Header & footer", text: "Reuse a header from an existing PDF, add page numbers." },
  3: { title: "Typst + AI", text: "Ask the assistant to change the template." },
  4: { title: "Docs → PDF", text: "Paste a Docs link, pick a template: edits in Docs flow into the PDF." },
};

/** Card designed for a 1920×1200 viewport; `label` is the "1 / 4" line (none on the intro). */
function cardHtml({ title, text }, label) {
  return `<!doctype html>
<html><body style="margin:0;width:1920px;height:1200px;display:flex;flex-direction:column;
  justify-content:center;padding:0 200px;box-sizing:border-box;background:#fff;
  font-family:-apple-system,'Helvetica Neue',Arial,sans-serif;color:#161616">
  ${label ? `<div style="font-size:44px;font-weight:600;color:${BLUE};margin-bottom:28px">${label}</div>` : ""}
  <div style="font-size:${label ? 124 : 180}px;font-weight:700;line-height:1.05;color:${label ? "#161616" : BLUE}">${title}</div>
  <div style="font-size:58px;line-height:1.3;margin-top:40px;color:#3a3a3a;max-width:1400px">${text}</div>
</body></html>`;
}

/**
 * Renders cards to PNG files. `scale` multiplies the 1920×1200 design: 1 for
 * 1920×1200, 1.5 for 2880×1800 (the size of the recorded frames).
 * cards: [{ content, label, file }]
 */
export async function renderCards(cards, scale = 1) {
  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 1920, height: 1200 },
    deviceScaleFactor: scale,
  });
  for (const { content, label, file } of cards) {
    await page.setContent(cardHtml(content, label));
    await page.screenshot({ path: file });
  }
  await browser.close();
}
