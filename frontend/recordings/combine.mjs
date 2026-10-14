// Joins the recorded clips into one MP4 (for LinkedIn): an intro card, then a
// title card before each clip, with short fades in between.
//   node recordings/combine.mjs            → out/dots-demo.mp4, clips in order 4 1 2 3
//   node recordings/combine.mjs 1 2 3 4    → another order
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";

const OUT = path.join(import.meta.dirname, "out");
const WIDTH = 1920;
const HEIGHT = 1200;
const FPS = 30;
const CARD_S = 2.2;
const FADE_S = 0.4;
const BLUE = "#3E5DE7";

const INTRO = {
  title: "Dots",
  text: "From a La Suite Docs document to an official PDF, through reusable Typst templates.",
};
const CLIPS = {
  1: { file: "1-text-setup.mp4", title: "Layout editor", text: "Text sizes, colours and tables, previewed live." },
  2: { file: "2-header-setup.mp4", title: "Header & footer", text: "Reuse a header from an existing PDF, add page numbers." },
  3: { file: "3-typst-ai.mp4", title: "Typst + AI", text: "Ask the assistant to change the template." },
  4: { file: "4-docs-to-dots.mp4", title: "Docs → PDF", text: "Paste a Docs link, pick a template: edits in Docs flow into the PDF." },
};

const order = process.argv.length > 2 ? process.argv.slice(2) : ["4", "1", "2", "3"];
for (const n of order) if (!CLIPS[n]) throw new Error(`unknown clip "${n}" (1–4)`);

const work = path.join(OUT, "combine");
fs.rmSync(work, { recursive: true, force: true });
fs.mkdirSync(work, { recursive: true });

// ── Title cards, rendered as images (this ffmpeg build has no drawtext) ─────
const card = ({ title, text }, label) => `<!doctype html>
<html><body style="margin:0;width:${WIDTH}px;height:${HEIGHT}px;display:flex;flex-direction:column;
  justify-content:center;padding:0 200px;box-sizing:border-box;background:#fff;
  font-family:-apple-system,'Helvetica Neue',Arial,sans-serif;color:#161616">
  ${label ? `<div style="font-size:44px;font-weight:600;color:${BLUE};margin-bottom:28px">${label}</div>` : ""}
  <div style="font-size:${label ? 124 : 180}px;font-weight:700;line-height:1.05;color:${label ? "#161616" : BLUE}">${title}</div>
  <div style="font-size:58px;line-height:1.3;margin-top:40px;color:#3a3a3a;max-width:1400px">${text}</div>
</body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT } });
const segments = [];
const renderCard = async (content, label, name) => {
  await page.setContent(card(content, label));
  const file = path.join(work, `${name}.png`);
  await page.screenshot({ path: file });
  segments.push({ file, still: true, duration: CARD_S });
};
await renderCard(INTRO, null, "intro");
for (const [i, n] of order.entries()) {
  await renderCard(CLIPS[n], `${i + 1} / ${order.length}`, `card-${n}`);
  const file = path.join(OUT, CLIPS[n].file);
  if (!fs.existsSync(file)) throw new Error(`${file} is missing: record the clips first`);
  const duration = Number(
    execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]),
  );
  segments.push({ file, still: false, duration });
}
await browser.close();

// ── One pass: normalise every segment, chain them with xfade, add silent audio ─
const inputs = segments.flatMap((s) =>
  s.still ? ["-loop", "1", "-t", String(s.duration), "-i", s.file] : ["-i", s.file],
);
const norm = segments.map(
  (_, i) =>
    `[${i}:v]scale=${WIDTH}:${HEIGHT}:force_original_aspect_ratio=decrease,` +
    `pad=${WIDTH}:${HEIGHT}:(ow-iw)/2:(oh-ih)/2:color=white,fps=${FPS},format=yuv420p,setsar=1,settb=AVTB[s${i}]`,
);
const chain = [];
let last = "s0";
let offset = 0;
for (let i = 1; i < segments.length; i++) {
  offset += segments[i - 1].duration - FADE_S;
  const out = i === segments.length - 1 ? "v" : `x${i}`;
  chain.push(`[${last}][s${i}]xfade=transition=fade:duration=${FADE_S}:offset=${offset.toFixed(3)}[${out}]`);
  last = out;
}
const total = segments.reduce((sum, s) => sum + s.duration, 0) - FADE_S * (segments.length - 1);

const result = path.join(OUT, "dots-demo.mp4");
execFileSync("ffmpeg", [
  "-y", "-loglevel", "error",
  ...inputs,
  "-f", "lavfi", "-t", total.toFixed(3), "-i", "anullsrc=channel_layout=stereo:sample_rate=48000",
  "-filter_complex", [...norm, ...chain].join(";"),
  "-map", "[v]", "-map", `${segments.length}:a`,
  "-c:v", "libx264", "-preset", "slow", "-crf", "20", "-pix_fmt", "yuv420p",
  "-c:a", "aac", "-b:a", "64k", "-shortest",
  "-movflags", "+faststart",
  result,
]);
const mb = (fs.statSync(result).size / 1024 / 1024).toFixed(1);
console.log(`${result} — ${total.toFixed(1)} s, ${mb} MB (order ${order.join(" ")})`);
