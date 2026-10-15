// Builds one story out of recorded clips, straight from their captured frames
// (no extra compression step): intro card, then a card + clip per chapter, hard cuts.
//   node recordings/story.mjs   → out/8-story.mp4 + out/8-story.gif
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { CLIP_CARDS, INTRO, renderCards } from "./cards.mjs";

const OUT = path.join(import.meta.dirname, "out");
const NAME = "8-story";
const CARD_S = 0.7;
/** End hold of a chapter's clip before the next card; the last clip keeps its own. */
const BETWEEN_S = 0.3;

/** Chapters: which clip folder, which card, which recorded frames (by number) to leave out. */
const CHAPTERS = [
  // Frames 280–288: the scroll back to the top on the second template, which only takes time.
  { clip: "5-docs-to-dots-paste", card: CLIP_CARDS[4], drop: [280, 288] },
  { clip: "2-header-setup", card: CLIP_CARDS[2] },
  { clip: "3-typst-ai", card: CLIP_CARDS[3] },
];

const GIF_WIDTH = Number(process.env.GIF_WIDTH ?? 1440);
const GIF_QUALITY = Number(process.env.GIF_QUALITY ?? 90);
const GIF_FPS = Number(process.env.GIF_FPS ?? 12);
const MP4_WIDTH = Number(process.env.MP4_WIDTH ?? 1920);

const work = path.join(OUT, NAME);
fs.rmSync(work, { recursive: true, force: true });
fs.mkdirSync(work, { recursive: true });

/** A clip's frames.txt as [{ file, duration }], without the closing repeat the concat demuxer needs. */
function readFrames(clip) {
  const lines = fs.readFileSync(path.join(OUT, clip, "frames.txt"), "utf8").split("\n");
  const frames = [];
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].startsWith("file ")) continue;
    const next = lines[i + 1] ?? "";
    if (!next.startsWith("duration ")) continue; // the closing repeat
    frames.push({ file: lines[i].slice(6, -1), duration: Number(next.slice(9)) });
    i++;
  }
  const missing = frames.find((f) => !fs.existsSync(f.file));
  if (missing) throw new Error(`${clip}: frame missing on disk, ${missing.file}`);
  return frames;
}
const frameNumber = (file) => Number(path.basename(file, ".jpg"));

// ── Cards at the frames' size (2880×1800) ────────────────────────────────────
const cards = [
  { content: INTRO, label: null, file: path.join(work, "intro.png") },
  ...CHAPTERS.map((c, i) => ({
    content: c.card,
    label: `${i + 1} / ${CHAPTERS.length}`,
    file: path.join(work, `card-${i + 1}.png`),
  })),
];
await renderCards(cards, 1.5);

// ── One frame list: intro, then card + clip per chapter ──────────────────────
const timeline = [{ file: cards[0].file, duration: CARD_S }];
CHAPTERS.forEach((chapter, i) => {
  timeline.push({ file: cards[i + 1].file, duration: CARD_S });
  let frames = readFrames(chapter.clip);
  if (chapter.drop) {
    const [from, to] = chapter.drop;
    frames = frames.filter((f) => frameNumber(f.file) < from || frameNumber(f.file) > to);
  }
  if (i < CHAPTERS.length - 1) frames.at(-1).duration = BETWEEN_S;
  timeline.push(...frames);
});
const list = path.join(work, "frames.txt");
fs.writeFileSync(
  list,
  [...timeline.flatMap((f) => [`file '${f.file}'`, `duration ${f.duration.toFixed(3)}`]), `file '${timeline.at(-1).file}'`].join("\n"),
);

// ── Same encoding as the recorder: fixed canvas, MP4 + GIF from the frames ──
const fit = (width) => {
  const height = Math.round((width * 900) / 1440 / 2) * 2;
  return `scale=${width}:${height}:force_original_aspect_ratio=decrease:flags=lanczos,pad=${width}:${height}:0:0:color=white`;
};
const concat = ["-reinit_filter", "0", "-f", "concat", "-safe", "0", "-i", list];

const mp4 = path.join(OUT, `${NAME}.mp4`);
execFileSync("ffmpeg", [
  "-y", "-loglevel", "error", ...concat,
  "-vf", `fps=30,${fit(MP4_WIDTH)}`,
  "-c:v", "libx264", "-preset", "slow", "-crf", "20", "-pix_fmt", "yuv420p",
  "-movflags", "+faststart", mp4,
]);

const gifFrames = path.join(work, "gif");
fs.mkdirSync(gifFrames);
execFileSync("ffmpeg", [
  "-y", "-loglevel", "error", ...concat,
  "-vf", `fps=${GIF_FPS},${fit(GIF_WIDTH)}`,
  path.join(gifFrames, "%05d.png"),
]);
const pngs = fs.readdirSync(gifFrames).sort().map((f) => path.join(gifFrames, f));
const gif = path.join(OUT, `${NAME}.gif`);
execFileSync("gifski", [
  "--quiet", "--fps", String(GIF_FPS), "--quality", String(GIF_QUALITY),
  "--width", String(GIF_WIDTH), "-o", gif, ...pngs,
]);

const mb = (f) => (fs.statSync(f).size / 1024 / 1024).toFixed(1);
const seconds = timeline.reduce((sum, f) => sum + f.duration, 0).toFixed(1);
console.log(`${NAME}: ${seconds} s, ${pngs.length} GIF frames — ${mp4} (${mb(mp4)} MB), ${gif} (${mb(gif)} MB)`);
