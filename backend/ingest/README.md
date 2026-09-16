# PDF / DOCX extraction

`extract.py` reads a document's first page and crops regions from it, so
`/api/ingest` can deduce a Typst template. The backend calls it as a
subprocess (`src/ingest/sidecar.ts`).

## Why Python

Extraction relies on [PyMuPDF](https://pymupdf.readthedocs.io/), which gives
the page's real vector geometry — paths, image placement rectangles, paint
order — and can re-emit a region as true SVG. `mupdf.js` exists (same engine,
in WASM) but lacks these conveniences: they'd have to be rewritten on top of
the low-level API. For a service called a handful of times per import, a
~200ms subprocess is the best effort/result ratio.

**License**: PyMuPDF is AGPL by default. As long as dots is self-hosted and
open, that has no consequence; a closed distribution would need a commercial
license from Artifex. Worth settling before any production deployment.

## Installation

`make install` (repo root) sets this up automatically: it runs `make
install-ingest`, which creates `backend/ingest/.venv` and installs
`requirements.txt` into it, whenever `python3` is on the `PATH`. Nothing
else to do — no manual venv, no separate step for teammates.

That target is best-effort and never fails `make install`: without
`python3`, it prints a note and skips itself, and the rest of the app works
normally — the `/api/ingest` routes just respond 422 with an explicit
message.

The backend looks for the interpreter in this order:

1. `DOTS_PYTHON` (full path to an interpreter, to point at a different one);
2. `backend/ingest/.venv/bin/python3` (what `make install` creates);
3. `python3` from `PATH`.

To set it up by hand instead (or redo it after editing `requirements.txt`):

```bash
make install-ingest        # from the repo root
# or, equivalently:
cd backend/ingest && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
```

## .docx: the zip first, LibreOffice as a last resort

A .docx is a zip of XML, and most of what's needed reads straight out of it
with nothing composed (`docx.py`):

- **paper size, margins, orientation** — `w:pgSz` and `w:pgMar` from
  `sectPr`, in twips;
- **default font and body size** — `docDefaults` in `styles.xml`, the real
  name resolved in `theme1.xml` when Word defers to the theme;
- **visuals** — the files under `word/media/`, taken as-is. A real embedded
  SVG (Office 365's `asvg:svgBlip` extension) wins over its mandatory PNG
  fallback: that's the original vector, not an approximation.

This path gives **the original image, byte for byte** — strictly better than
cropping a rendered page — and needs neither a rendering pass nor
LibreOffice. There is then no page to crop: the analysis responds in `assets`
mode and the user picks a visual instead of a region.

**LibreOffice is needed only for case 3**: a letterhead drawn in the XML
(DrawingML, SmartArt, VML) exists nowhere as a file, so the document has to be
composed to see it. This case is recognized by the *absence* of any visual in
`word/media/` — not by shape markers, which show up in almost every .docx,
if only for a picture's own frame. Without `soffice` on the `PATH`, such a
document is refused with the code `no_libreoffice`.

```bash
brew install --cask libreoffice   # macOS
```

## Direct use

```bash
python3 extract.py analyze --input letter.pdf --out /tmp/job
python3 extract.py crop --input letter.pdf --out /tmp/job \
  --rect 0,0,595.28,124 --name header [--vector]
```

Both subcommands write a single JSON object to stdout, including on failure
(`{"ok": false, "code": "...", "error": "..."}`), and then exit 1.

## What extraction refuses to do

An opaque shape painted over text hides it on screen without erasing it from
the file: `get_text()` would still return it. Every word and shape therefore
passes through an occlusion check (`visible_items`) before being measured or
cropped — automatically, on every analysis. A document "redacted" this way
cannot be reconstructed through the import.
