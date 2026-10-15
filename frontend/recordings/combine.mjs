// Joins the recorded clips into one MP4 (for LinkedIn): an intro card, then a
// title card before each clip, with short fades in between.
//   node recordings/combine.mjs            → out/dots-demo.mp4, clips in order 4 1 2 3
//   node recordings/combine.mjs 1 2 3 4    → another order
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { CLIP_CARDS, INTRO, renderCards } from "./cards.mjs";

const OUT = path.join(import.meta.dirname, "out");
const WIDTH = 1920;
const HEIGHT = 1200;
const FPS = 30;
const CARD_S = 2.2;
const FADE_S = 0.4;
const CLIPS = {
  1: { file: "1-text-setup.mp4", ...CLIP_CARDS[1] },
  2: { file: "2-header-setup.mp4", ...CLIP_CARDS[2] },
  3: { file: "3-typst-ai.mp4", ...CLIP_CARDS[3] },
  4: { file: "4-docs-to-dots.mp4", ...CLIP_CARDS[4] },
};

const order = process.argv.length > 2 ? process.argv.slice(2) : ["4", "1", "2", "3"];
for (const n of order) if (!CLIPS[n]) throw new Error(`unknown clip "${n}" (1–4)`);

const work = path.join(OUT, "combine");
fs.rmSync(work, { recursive: true, force: true });
fs.mkdirSync(work, { recursive: true });

// ── Title cards, then the clips they introduce ──────────────────────────────
const cards = [{ content: INTRO, label: null, file: path.join(work, "intro.png") }];
const segments = [{ file: cards[0].file, still: true, duration: CARD_S }];
for (const [i, n] of order.entries()) {
  const card = { content: CLIPS[n], label: `${i + 1} / ${order.length}`, file: path.join(work, `card-${n}.png`) };
  cards.push(card);
  segments.push({ file: card.file, still: true, duration: CARD_S });
  const file = path.join(OUT, CLIPS[n].file);
  if (!fs.existsSync(file)) throw new Error(`${file} is missing: record the clips first`);
  const duration = Number(
    execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]),
  );
  segments.push({ file, still: false, duration });
}
await renderCards(cards);

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
