import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type { BrowserContext, CDPSession, Locator, Page, Request } from "@playwright/test";
import { OUT_DIR } from "./paths";

/**
 * Frame recorder built on Chrome's screencast (CDP) rather than Playwright's video,
 * which is compressed so hard that the text in PDF previews smears.
 *
 * Waits (PDF generation, AI answer, Docs autosave) go through `cut()`: capture is
 * suspended while waiting, and the final edit keeps only the before and after.
 * On-screen time does not advance during a cut.
 */

interface Frame {
  file: string;
  /** Seconds since the start, cuts excluded. */
  t: number;
}

const GIF_WIDTH = Number(process.env.GIF_WIDTH ?? 1440);
const GIF_FPS = Number(process.env.GIF_FPS ?? 12);
const GIF_QUALITY = Number(process.env.GIF_QUALITY ?? 90);
const MP4_WIDTH = Number(process.env.MP4_WIDTH ?? 1920);
/**
 * Every frame goes on a fixed canvas: a visible window sometimes hands over frames
 * a few pixels shorter (2880×1784), which would otherwise stretch or jump.
 */
const fit = (width: number) => {
  const height = Math.round((width * 900) / 1440 / 2) * 2;
  return `scale=${width}:${height}:force_original_aspect_ratio=decrease:flags=lanczos,pad=${width}:${height}:0:0:color=white`;
};
/** How long the last frame stays: time to read the result. */
const FINAL_HOLD_S = 2;

export class Recorder {
  readonly dir: string;
  private framesDir: string;
  private frames: Frame[] = [];
  private session: CDPSession | null = null;
  private start = 0;
  private paused = false;
  private pauseStart = 0;
  private pausedTotal = 0;
  /** Last frame received during a cut: written out again on resume. */
  private lastDropped: string | null = null;

  constructor(readonly name: string) {
    this.dir = path.join(OUT_DIR, name);
    this.framesDir = path.join(this.dir, "frames");
    fs.rmSync(this.dir, { recursive: true, force: true });
    fs.mkdirSync(this.framesDir, { recursive: true });
  }

  /** Records `page` (the first call starts the clock). Call again to switch tabs. */
  async attach(page: Page) {
    await this.detach();
    await page.bringToFront();
    const session = await page.context().newCDPSession(page);
    this.session = session;
    session.on("Page.screencastFrame", ({ data, sessionId }) => {
      session.send("Page.screencastFrameAck", { sessionId }).catch(() => {});
      if (this.session !== session) return;
      if (this.paused) {
        this.lastDropped = data;
        return;
      }
      this.write(data);
    });
    if (!this.start) this.start = Date.now();
    const viewport = page.viewportSize() ?? { width: 1440, height: 900 };
    await session.send("Page.startScreencast", {
      format: "jpeg",
      quality: 95,
      maxWidth: viewport.width * 2,
      maxHeight: viewport.height * 2,
      everyNthFrame: 1,
    });
    // A visible window only sends frames when something repaints: grab the page as
    // it is now, or a still page (Docs at the start of clip 4) never shows up.
    const { data } = await session.send("Page.captureScreenshot", { format: "jpeg", quality: 95 });
    if (this.session === session && !this.paused) this.write(data);
  }

  private async detach() {
    const session = this.session;
    this.session = null;
    if (!session) return;
    await session.send("Page.stopScreencast").catch(() => {});
    await session.detach().catch(() => {});
  }

  private now() {
    return (Date.now() - this.start - this.pausedTotal) / 1000;
  }

  private write(data: string) {
    const file = path.join(this.framesDir, `${String(this.frames.length).padStart(5, "0")}.jpg`);
    fs.writeFileSync(file, Buffer.from(data, "base64"));
    this.frames.push({ file, t: this.now() });
  }

  /**
   * Runs `wait` off camera. `keep`: seconds still recorded before the cut, so the
   * wait is seen starting (spinner, blank page).
   */
  async cut<T>(page: Page, wait: () => Promise<T>, keep = 0.4): Promise<T> {
    if (keep > 0) await page.waitForTimeout(keep * 1000);
    this.paused = true;
    this.pauseStart = Date.now();
    this.lastDropped = null;
    try {
      return await wait();
    } finally {
      this.pausedTotal += Date.now() - this.pauseStart;
      this.paused = false;
      if (this.lastDropped) this.write(this.lastDropped);
    }
  }

  /** Stops capturing and writes `<name>.mp4` and `<name>.gif` to out/. */
  async finish() {
    await this.detach();
    if (this.frames.length === 0) throw new Error(`${this.name} : aucune image capturée`);

    const list = path.join(this.dir, "frames.txt");
    const lines: string[] = [];
    this.frames.forEach((frame, i) => {
      const next = this.frames[i + 1];
      const duration = next ? Math.max(next.t - frame.t, 0.001) : FINAL_HOLD_S;
      lines.push(`file '${frame.file}'`, `duration ${duration.toFixed(3)}`);
    });
    // The concat demuxer ignores the last entry's duration: repeat that entry.
    lines.push(`file '${this.frames.at(-1)!.file}'`);
    fs.writeFileSync(list, lines.join("\n"));

    const mp4 = path.join(OUT_DIR, `${this.name}.mp4`);
    execFileSync("ffmpeg", [
      "-y", "-loglevel", "error",
      // Frame sizes can change mid-clip (between tabs): rebuilding the filters
      // there drops frames, so let the scale filter absorb the change instead.
      "-reinit_filter", "0",
      "-f", "concat", "-safe", "0", "-i", list,
      "-vf", `fps=30,${fit(MP4_WIDTH)}`,
      "-c:v", "libx264", "-preset", "slow", "-crf", "20", "-pix_fmt", "yuv420p",
      "-movflags", "+faststart",
      mp4,
    ]);

    // From the captured frames, not the MP4: one lossy step fewer.
    const gifFrames = path.join(this.dir, "gif");
    fs.rmSync(gifFrames, { recursive: true, force: true });
    fs.mkdirSync(gifFrames, { recursive: true });
    execFileSync("ffmpeg", [
      "-y", "-loglevel", "error",
      // Frame sizes can change mid-clip (between tabs): rebuilding the filters
      // there drops frames, so let the scale filter absorb the change instead.
      "-reinit_filter", "0",
      "-f", "concat", "-safe", "0", "-i", list,
      "-vf", `fps=${GIF_FPS},${fit(GIF_WIDTH)}`,
      path.join(gifFrames, "%05d.png"),
    ]);
    const pngs = fs.readdirSync(gifFrames).sort().map((f) => path.join(gifFrames, f));
    const gif = path.join(OUT_DIR, `${this.name}.gif`);
    // --width: without it gifski quietly shrinks anything above ~800×600.
    execFileSync("gifski", [
      "--quiet", "--fps", String(GIF_FPS), "--quality", String(GIF_QUALITY),
      "--width", String(GIF_WIDTH),
      "-o", gif, ...pngs,
    ]);

    const mb = (f: string) => (fs.statSync(f).size / 1024 / 1024).toFixed(1);
    const seconds = (this.frames.at(-1)!.t + FINAL_HOLD_S).toFixed(1);
    console.log(`${this.name} : ${seconds} s — ${mp4} (${mb(mp4)} Mo), ${gif} (${mb(gif)} Mo)`);
  }
}

// ── Visible cursor ───────────────────────────────────────────────────────────
// The screencast doesn't show the pointer: draw one in the page that follows
// the mouse events Playwright sends.

export async function installCursor(context: BrowserContext) {
  await context.addInitScript(() => {
    const KEY = "__rec_cursor_pos";
    const install = () => {
      if (document.getElementById("__rec_cursor")) return;
      const el = document.createElement("div");
      el.id = "__rec_cursor";
      el.innerHTML =
        '<svg width="26" height="26" viewBox="0 0 24 24"><path d="M4 2.5 L4 19 L8.6 14.9 L11.6 21.5 L14.4 20.3 L11.5 13.8 L17.8 13.8 Z" fill="#111" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/></svg>';
      Object.assign(el.style, {
        position: "fixed",
        left: "0",
        top: "0",
        zIndex: "2147483647",
        pointerEvents: "none",
        transition: "scale 120ms ease",
        transformOrigin: "4px 3px",
      });
      const place = (x: number, y: number) => {
        el.style.transform = `translate(${x - 4}px, ${y - 3}px)`;
      };
      try {
        const saved = JSON.parse(sessionStorage.getItem(KEY) ?? "null");
        place(saved?.x ?? -50, saved?.y ?? -50);
      } catch {
        place(-50, -50);
      }
      document.documentElement.appendChild(el);
      window.addEventListener(
        "mousemove",
        (e) => {
          place(e.clientX, e.clientY);
          try {
            sessionStorage.setItem(KEY, JSON.stringify({ x: e.clientX, y: e.clientY }));
          } catch {
            // storage unavailable: the cursor starts from the corner again.
          }
        },
        true,
      );
      window.addEventListener("mousedown", () => (el.style.scale = "0.82"), true);
      window.addEventListener("mouseup", () => (el.style.scale = "1"), true);
    };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install);
    else install();
  });
}

// ── Gestures at human speed ──────────────────────────────────────────────────

/** Glides the cursor to the centre of `target` (or to the given point). */
export async function moveTo(page: Page, target: Locator | { x: number; y: number }) {
  let point: { x: number; y: number };
  if ("boundingBox" in target) {
    await target.scrollIntoViewIfNeeded();
    const box = await target.boundingBox();
    if (!box) throw new Error("élément sans boîte : invisible ?");
    point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  } else {
    point = target;
  }
  await page.mouse.move(point.x, point.y, { steps: 28 });
  await page.waitForTimeout(150);
}

export async function click(page: Page, target: Locator) {
  await moveTo(page, target);
  await page.mouse.down();
  await page.waitForTimeout(90);
  await page.mouse.up();
  await page.waitForTimeout(350);
}

export async function type(page: Page, text: string, delay = 65) {
  await page.keyboard.type(text, { delay });
}

/** Scrolls in small wheel steps, so the movement is easy to follow. */
export async function scroll(page: Page, deltaY: number, step = 90) {
  const n = Math.max(1, Math.round(Math.abs(deltaY) / step));
  for (let i = 0; i < n; i++) {
    await page.mouse.wheel(0, Math.sign(deltaY) * step);
    await page.waitForTimeout(35);
  }
  await page.waitForTimeout(300);
}

/**
 * Waits until the page has had no API request in flight for `quietMs`
 * (compilation, PDF render…), which also gives react-pdf time to draw.
 */
export function trackApi(page: Page, match: RegExp = /\/api\//) {
  const inFlight = new Set<Request>();
  let lastChange = Date.now();
  const done = (r: Request) => {
    if (inFlight.delete(r)) lastChange = Date.now();
  };
  page.on("request", (r) => {
    if (!match.test(r.url())) return;
    inFlight.add(r);
    lastChange = Date.now();
  });
  page.on("requestfinished", done);
  page.on("requestfailed", done);
  // A navigation cancels the old page's requests without always reporting it.
  page.on("framenavigated", (frame) => {
    if (frame !== page.mainFrame()) return;
    inFlight.clear();
    lastChange = Date.now();
  });
  return async function settle(quietMs = 900, timeout = 120_000) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      if (inFlight.size === 0 && Date.now() - lastChange >= quietMs) return;
      await page.waitForTimeout(100);
    }
    throw new Error("la page ne s'est pas stabilisée");
  };
}

/** Caption at the bottom of the frame, to say where the action is (e.g. "Docs" / "Dots"). */
export async function caption(page: Page, text: string | null) {
  if (process.env.CAPTIONS === "0") return;
  await page.evaluate((label) => {
    document.getElementById("__rec_caption")?.remove();
    if (!label) return;
    const el = document.createElement("div");
    el.id = "__rec_caption";
    el.textContent = label;
    Object.assign(el.style, {
      position: "fixed",
      left: "50%",
      bottom: "28px",
      transform: "translateX(-50%)",
      zIndex: "2147483646",
      pointerEvents: "none",
      padding: "10px 18px",
      borderRadius: "999px",
      background: "rgba(17, 17, 17, 0.82)",
      color: "#fff",
      font: "600 17px/1.2 system-ui, -apple-system, sans-serif",
      boxShadow: "0 4px 16px rgba(0,0,0,0.2)",
    });
    document.documentElement.appendChild(el);
  }, text);
}
