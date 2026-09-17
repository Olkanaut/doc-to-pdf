# PDF / DOCX extraction

`extract.py` reads a document's first page and crops regions from it, so
`/api/ingest` can deduce a Typst template. For DOCX it also renders a
three-page header/footer probe. The backend calls it as a subprocess
(`src/ingest/sidecar.ts`).

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

## .docx: render the composition, not its loose media

A header is not one file from `word/media/`: Word composes images, text,
tables, lines and DrawingML using relationships and section rules. Every DOCX
is therefore rendered by LibreOffice before analysis. The PDF path itself is
unchanged and reads that rendered output for page geometry, margins, body font
and the user preview.

`docx.py` also creates a temporary three-page copy with an empty body and the
first section left intact. Rendering that probe isolates the complete visual
bands:

1. page 1 carries the first-page variant;
2. page 2 is used only to detect a distinct even-page variant;
3. page 3 carries the normal following-page variant.

PyMuPDF crops each full-width band as a 288 DPI PNG. Equal first and following
bands collapse to scope `all`; different bands become `first` and
`except-first`. `PAGE` and `NUMPAGES` paragraphs are removed from the probe and
reported as dynamic pagination metadata, so their sample values are never
baked into the image. Multiple sections, mixed pagination content and distinct
even-page bands produce explicit warnings.

LibreOffice is consequently required for every DOCX import. Without
`soffice`/`libreoffice` on `PATH`, the route responds with `no_libreoffice`.
On macOS the standard application path is detected as well.

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
