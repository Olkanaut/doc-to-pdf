# Demo recordings

Playwright scripts that record the demo clips as MP4 + GIF in `recordings/out/`.
Waits (PDF generation, AI answer, Docs autosave) are cut from the result automatically.

Requires the running stack (Dots :3002, Docs :3000, Keycloak :8083), plus `ffmpeg` and `gifski`.

```sh
cd frontend
npx playwright test -c recordings                 # all clips
npx playwright test -c recordings -g "1 text"     # one clip: 1 text, 2 header, 3 typst, 4 docs, 6 typst
```

Then, to join the clips into one video (for LinkedIn): an intro card, a title card per clip,
short fades, a silent audio track. Default order is 4 1 2 3.

```sh
node recordings/combine.mjs            # → out/dots-demo.mp4
node recordings/combine.mjs 1 2 3 4    # another order
```

Each clip opens a visible Chrome window while it records: headless Chrome only captures
at 1440×900, a visible window at 2880×1800. `HEADLESS=1` runs without a window, at lower quality.

| Clip | What it shows |
|---|---|
| `1-text-setup` | Templates home → "Nouvelle template" → Text tab → body size to 11 → Heading 3 colour → tables: grey header, no rules |
| `2-header-setup` | Header tab → remove image → extract a header zone from a PDF (bottom handle) → Footer tab → remove section → page numbers "1 / N" |
| `3-typst-ai` | Typst code mode → AI assistant → "Make all headings cobalt blue (#1338BE)" → apply |
| `6-typst-ai-wide` | Same as clip 3, plus: the code panel is dragged wider, and after applying, the code scrolls sideways to the new heading colour |
| `4-docs-to-dots` | Docs document → paste link in Dots → switch templates → edit the title year and first paragraph in Docs → Dots updates |

Nothing is saved in the templates. Side effects:
- clip 2 adds the extracted header image to the shared visuals library (`backend/templates/assets/en-tete-*.png`);
- clip 4 sets the Docs title year to `DOCS_YEAR`, edits it, then puts it back with the first paragraph (set `KEEP_EDIT=1` to keep the edit).

## Settings (environment variables)

| Variable | Default |
|---|---|
| `DEMO_USER` / `DEMO_PASSWORD` | `demo1` / `demo1` |
| `DOCS_DOC` | `http://localhost:3000/docs/402c11db-…/` |
| `HEADER_PDF` | `/Users/ok/templates/Planning - DINUM x 42.pdf` |
| `TEXT_TEMPLATE` / `AI_TEMPLATE` | `Nouvelle template` / `Template 42` |
| `TEXT_SIZE` | `11` |
| `H3_COLOR` | `#182d9e` |
| `AI_PROMPT` | "Make all headings cobalt blue (#1338BE)" |
| `DOCS_YEAR` / `NEW_YEAR` | `2025` / `DOCS_YEAR` + 1 |
| `DOCS_SENTENCE` | sentence appended to the first paragraph in clip 4 |
| `CAPTIONS` | on; `0` removes the captions in clip 4 |
| `GIF_WIDTH` / `GIF_QUALITY` / `GIF_FPS` / `MP4_WIDTH` | `1440` / `90` / `12` / `1920` |
| `HEADLESS` | off; `1` records without a window (1440×900 frames) |

## How it works

`recorder.ts` captures frames through Chrome's screencast (sharper than Playwright's video),
draws a fake cursor, and suspends capture inside `rec.cut(page, wait)`. `finish()` assembles
the frames with their real durations into the MP4 (`ffmpeg`), and builds the GIF straight
from the same frames (`gifski`).
