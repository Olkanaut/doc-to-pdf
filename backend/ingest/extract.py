"""PDF/DOCX -> Typst extraction sidecar.

Called by the Node backend with execFile (array args, never a shell string).
Two subcommands, both printing a single JSON object on stdout:

    extract.py analyze --input FILE --out DIR
    extract.py crop    --input FILE --out DIR --rect x0,y0,x1,y1 [--vector] --name BASE

Everything the page hides stays hidden: text and shapes painted over by a
later, fully opaque shape are dropped before anything is measured or
extracted (see `visible_items`). This runs on every analysis, not on demand.
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import zipfile
import sys
import tempfile
from pathlib import Path

import pymupdf

import docx as docx_zip

PT_PER_MM = 72.0 / 25.4
# Page sizes we can name, in points, portrait.
PAPERS = {"a4": (595.28, 841.89), "a5": (419.53, 595.28), "us-letter": (612.0, 792.0)}
# Fonts the layout panel offers; anything else is reported as a substitution.
KNOWN_FONTS = {
    "marianne": "Marianne",
    "arial": "Arial",
    "helvetica": "Helvetica",
    "libertinus serif": "Libertinus Serif",
    "new computer modern": "New Computer Modern",
    "dejavu sans mono": "DejaVu Sans Mono",
}
PREVIEW_SCALE = 2.0
CROP_SCALE = 4.0
# A shape covering this much of the page is background, not content.
BACKGROUND_AREA_RATIO = 0.9
# Vertical gap (pt) that separates one band of content from the next.
CLUSTER_GAP = 24.0
# Where to look for a header or a footer, as a fraction of page height.
SEARCH_ZONE = 0.35
# A proposal taller than this fraction of the page is not a band.
MAX_BAND = 0.40
MIN_BAND = 6.0
# Écart (mm) au-delà duquel une marge droite relevée est mise au compte du
# drapeau de fin de ligne plutôt que d'une mise en page asymétrique.
RAGGED_TOLERANCE_MM = 5.0
# Trimmed a hair rather than bleeding into the neighbouring line.
BAND_PAD = 2.0


def fail(message: str, code: str = "extract_failed") -> None:
    json.dump({"ok": False, "code": code, "error": message}, sys.stdout)
    sys.stdout.write("\n")
    sys.exit(1)


# ---------------------------------------------------------------- occlusion


def opaque_covers(drawings: list[dict]) -> list[tuple[int, pymupdf.Rect]]:
    """Fully opaque filled shapes, as (paint order, rect) — the things that hide."""
    covers = []
    for d in drawings:
        if d.get("fill") is None:
            continue
        if (d.get("fill_opacity") if d.get("fill_opacity") is not None else 1.0) < 0.99:
            continue
        covers.append((d.get("seqno", 0), d["rect"]))
    return covers


def is_covered(rect: pymupdf.Rect, seqno: int, covers: list[tuple[int, pymupdf.Rect]]) -> bool:
    """True when something opaque is painted over `rect` after it was drawn."""
    for cover_seq, cover_rect in covers:
        if cover_seq > seqno and cover_rect.contains(rect):
            return True
    return False


def visible_items(page: pymupdf.Page) -> tuple[list[dict], list[dict]]:
    """(text spans, drawings) that actually show on the rendered page.

    Text carries no paint order of its own, so it is tested against every
    opaque cover: a word under a white box is not content we may reuse.
    """
    drawings = page.get_drawings()
    covers = opaque_covers(drawings)
    page_area = abs(page.rect.get_area()) or 1.0

    spans = []
    for block in page.get_text("dict").get("blocks", []):
        for line in block.get("lines", []):
            for span in line.get("spans", []):
                rect = pymupdf.Rect(span["bbox"])
                if rect.is_empty or not span.get("text", "").strip():
                    continue
                if any(c.contains(rect) for _, c in covers):
                    continue
                spans.append(
                    {
                        "rect": rect,
                        "text": span["text"],
                        "font": span.get("font", ""),
                        "size": float(span.get("size", 0.0)),
                        "color": int(span.get("color", 0)),
                    }
                )

    shapes = []
    for d in drawings:
        rect = d["rect"]
        if rect.is_empty:
            continue
        # A page-sized fill is the paper, not a figure.
        if abs(rect.get_area()) / page_area > BACKGROUND_AREA_RATIO:
            continue
        if is_covered(rect, d.get("seqno", 0), covers):
            continue
        shapes.append(d)
    return spans, shapes


# ---------------------------------------------------------------- measuring


def saturation(color: tuple[float, float, float]) -> float:
    return max(color[:3]) - min(color[:3])


def int_to_hex(color: int) -> str:
    return "#%06x" % (color & 0xFFFFFF)


def rgb_to_hex(color) -> str:
    r, g, b = (max(0, min(255, round(c * 255))) for c in color[:3])
    return "#%02x%02x%02x" % (r, g, b)


def guess_paper(width: float, height: float) -> tuple[str, str]:
    orientation = "landscape" if width > height else "portrait"
    w, h = (height, width) if orientation == "landscape" else (width, height)
    for name, (pw, ph) in PAPERS.items():
        if abs(w - pw) < 6 and abs(h - ph) < 6:
            return name, orientation
    return "a4", orientation


def clip(rect: pymupdf.Rect, page_rect: pymupdf.Rect) -> pymupdf.Rect | None:
    """Rects can run off the page (a bled banner); measure only what shows."""
    inside = pymupdf.Rect(rect) & page_rect
    return None if inside.is_empty else inside


def cluster_by_gap(rects: list[pymupdf.Rect]) -> list[pymupdf.Rect]:
    """Merge rects into bands separated by vertical gaps."""
    if not rects:
        return []
    ordered = sorted(rects, key=lambda r: r.y0)
    bands: list[pymupdf.Rect] = [pymupdf.Rect(ordered[0])]
    for rect in ordered[1:]:
        if rect.y0 - bands[-1].y1 > CLUSTER_GAP:
            bands.append(pymupdf.Rect(rect))
        else:
            bands[-1] |= rect
    return bands


def find_band(
    items: list[pymupdf.Rect],
    figures: list[pymupdf.Rect],
    page_rect: pymupdf.Rect,
    kind: str,
) -> pymupdf.Rect | None:
    """Propose the header or footer band, or None when the page has none.

    A letterhead is usually a figure sitting alone at the top, often with its
    title one line below it — too close for a gap to separate them — so a
    figure's own edge decides the boundary when there is one. A footer is
    usually just a line of text, which a gap does separate.
    """
    height = page_rect.height
    limit = height * MAX_BAND

    if kind == "header":
        bands = cluster_by_gap(items)
        if len(bands) > 1 and bands[0].y1 <= height * 0.25:
            band = pymupdf.Rect(0, 0, page_rect.width, bands[0].y1 + BAND_PAD)
        else:
            # No gap to go by: a letterhead often sits one line above its
            # title, so the figure's own bottom edge is the boundary.
            figs = [r for r in figures if r.y1 <= height * SEARCH_ZONE]
            if not figs:
                return None
            edge = max(r.y1 for r in figs)
            band = pymupdf.Rect(0, 0, page_rect.width, edge + BAND_PAD)
    else:
        bands = cluster_by_gap(items)
        if len(bands) > 1 and bands[-1].y0 > height * (1 - SEARCH_ZONE):
            band = pymupdf.Rect(0, bands[-1].y0 - BAND_PAD, page_rect.width, height)
        else:
            figs = [r for r in figures if r.y0 >= height * (1 - SEARCH_ZONE)]
            if not figs:
                return None
            band = pymupdf.Rect(0, min(r.y0 for r in figs) - BAND_PAD, page_rect.width, height)

    band &= page_rect
    return band if MIN_BAND < band.height <= limit else None


def dominant_font(spans: list[dict]) -> tuple[str, float, float]:
    """Most-used (font, size) by character count — the body text."""
    weights: dict[tuple[str, float], int] = {}
    for span in spans:
        key = (span["font"], round(span["size"], 1))
        weights[key] = weights.get(key, 0) + len(span["text"])
    if not weights:
        return "", 11.0, 0
    (font, size), chars = max(weights.items(), key=lambda kv: kv[1])
    return font, size, chars


def map_font(raw: str) -> tuple[str, str | None]:
    """(font to use, font that was replaced or None)."""
    name = raw.split("+")[-1].split("-")[0].split(",")[0].strip()
    hit = KNOWN_FONTS.get(name.lower())
    if hit:
        return hit, None
    return "Marianne", name or None


def heading_color(spans: list[dict], shapes: list[dict], body_size: float) -> str:
    """Colour of the largest coloured text, else the most saturated fill."""
    titles = [s for s in spans if s["size"] > body_size * 1.1 and (s["color"] & 0xFFFFFF) != 0]
    if titles:
        return int_to_hex(max(titles, key=lambda s: s["size"])["color"])
    coloured = [d for d in shapes if d.get("fill") and saturation(d["fill"]) > 0.05]
    if coloured:
        return rgb_to_hex(max(coloured, key=lambda d: abs(d["rect"].get_area()))["fill"])
    return "#0659c5"


def line_height(spans: list[dict], body_size: float) -> float:
    """Ratio between successive baselines and the font size."""
    tops = sorted({round(s["rect"].y0, 1) for s in spans if abs(s["size"] - body_size) < 0.6})
    gaps = [b - a for a, b in zip(tops, tops[1:]) if 0 < b - a < body_size * 3]
    if not gaps or body_size <= 0:
        return 1.2
    gaps.sort()
    return max(1.0, min(2.0, round(gaps[len(gaps) // 2] / body_size, 2)))


# ---------------------------------------------------------------- analyze


def analyze(input_path: Path, out_dir: Path) -> dict:
    """Relevé de la première page.

    Deux modes selon ce que le fichier permet :

    * ``page`` — une page est rendue et des bandes y sont proposées ; c'est le
      cas de tout PDF, et d'un .docx dont le papier à en-tête est dessiné dans
      le XML (il faut alors composer le document pour le voir).
    * ``assets`` — les visuels sont sortis du .docx tels quels et la géométrie
      lue dans son XML : rien n'est rendu, donc rien n'est à recadrer, et
      l'image reprise est l'originale plutôt qu'un découpage approché.
    """
    if sniff(input_path) == "docx":
        from_zip = analyze_docx(input_path)
        if from_zip is not None:
            return from_zip

    doc = open_document(input_path, out_dir)
    if doc.page_count == 0:
        fail("Document vide", "empty_document")
    page = doc[0]
    page_rect = page.rect
    spans, shapes = visible_items(page)

    image_rects: list[pymupdf.Rect] = []
    for info in page.get_images(full=True):
        image_rects.extend(r for r in page.get_image_rects(info[0]) if not r.is_empty)

    preview = page.get_pixmap(matrix=pymupdf.Matrix(PREVIEW_SCALE, PREVIEW_SCALE))
    preview.save(out_dir / "page-1.png")

    raw_items = [s["rect"] for s in spans] + [d["rect"] for d in shapes] + image_rects
    items = [clipped for r in raw_items if (clipped := clip(r, page_rect)) is not None]
    if not items:
        fail("Aucun contenu exploitable sur la première page", "empty_page")

    content = pymupdf.Rect(items[0])
    for rect in items[1:]:
        content |= rect

    figures = [d["rect"] for d in shapes if d.get("fill") and saturation(d["fill"]) > 0.05]
    figures += image_rects
    header_band = find_band(items, figures, page_rect, "header")
    footer_band = find_band(items, figures, page_rect, "footer")

    body_spans = [
        s
        for s in spans
        if not (header_band and header_band.contains(s["rect"]))
        and not (footer_band and footer_band.contains(s["rect"]))
    ]
    raw_font, body_size, _ = dominant_font(body_spans or spans)
    font, substituted = map_font(raw_font)

    def mm(value: float) -> float:
        return round(max(0.0, min(80.0, value / PT_PER_MM)), 1)

    if body_spans:
        body = pymupdf.Rect(body_spans[0]["rect"])
        for span in body_spans[1:]:
            body |= span["rect"]
        left = mm(body.x0)
        right = mm(page_rect.width - body.x1)
        # Text extents give the left margin exactly (every line starts there)
        # but only an upper bound on the right one: with a ragged right edge no
        # line reaches the margin, so the measurement overstates it by up to a
        # word. Left and right are equal on almost every letterhead, so the
        # narrower of the two is the better estimate — and it never produces a
        # text column wider than the source.
        if right > left + RAGGED_TOLERANCE_MM and len(body_spans) > 3:
            right = left
        margins = {
            "top": mm(body.y0),
            "bottom": mm(page_rect.height - body.y1),
            "left": left,
            "right": right,
        }
    else:
        # A page of figures alone says nothing about text margins.
        margins = {"top": 25.0, "bottom": 20.0, "left": 20.0, "right": 20.0}

    paper, orientation = guess_paper(page_rect.width, page_rect.height)
    layout = {
        "paper": paper,
        "orientation": orientation,
        "margins": margins,
        "font": font,
        "fontSize": round(max(8.0, min(16.0, body_size)), 1),
        "lineHeight": line_height(body_spans or spans, body_size),
        "headings": {"scale": "normal", "color": heading_color(spans, shapes, body_size)},
    }

    def region(kind: str, rect: pymupdf.Rect) -> dict:
        # Bleed a hair inward: neighbouring content often sits within a point
        # of a band's true edge and a rectangular crop cannot carve it out.
        return {
            "kind": kind,
            "x": round(max(0.0, rect.x0), 2),
            "y": round(max(0.0, rect.y0), 2),
            "width": round(min(page_rect.width, rect.x1) - max(0.0, rect.x0), 2),
            "height": round(min(page_rect.height, rect.y1) - max(0.0, rect.y0), 2),
            "vector": has_vector(rect, shapes, image_rects),
        }

    regions = []
    if header_band is not None:
        full = pymupdf.Rect(0, 0, page_rect.width, header_band.y1 + 2)
        regions.append(region("header", full))
    if footer_band is not None:
        full = pymupdf.Rect(0, footer_band.y0 - 2, page_rect.width, page_rect.height)
        regions.append(region("footer", full))
    regions.append(region("page", page_rect))

    return {
        "ok": True,
        "mode": "page",
        "page": {
            "widthPt": round(page_rect.width, 2),
            "heightPt": round(page_rect.height, 2),
            "count": doc.page_count,
            "previewScale": PREVIEW_SCALE,
            "preview": "page-1.png",
        },
        "regions": regions,
        "layout": layout,
        "fontSubstitution": substituted,
        "counts": {"text": len(spans), "shapes": len(shapes), "images": len(image_rects)},
    }


def analyze_docx(input_path: Path) -> dict | None:
    """Relevé lu dans le zip, ou ``None`` s'il n'y a aucun visuel à en tirer.

    Sans visuel, le papier à en-tête est dessiné dans le XML (cas 3) : aucun
    unzip ne le sortira, il faut composer le document — c'est le seul cas où
    LibreOffice est nécessaire.
    """
    try:
        with zipfile.ZipFile(input_path) as zf:
            assets = docx_zip.media(zf)
            if not assets:
                return None
            geometry = docx_zip.page_geometry(zf)
            raw_font, size = docx_zip.default_font(zf)
    except (zipfile.BadZipFile, KeyError):
        return None

    font, substituted = map_font(raw_font or "")
    paper, orientation = guess_paper(geometry["widthPt"], geometry["heightPt"])
    return {
        "ok": True,
        "mode": "assets",
        "page": {
            "widthPt": geometry["widthPt"],
            "heightPt": geometry["heightPt"],
            "count": 1,
            "previewScale": 1.0,
            "preview": None,
        },
        "regions": [],
        "assets": assets,
        "layout": {
            "paper": paper,
            "orientation": orientation,
            "margins": geometry["margins"],
            "font": font,
            "fontSize": size,
            # Word donne l'interligne par style, pas globalement : la valeur par
            # défaut du template vaut mieux qu'une moyenne inventée.
            "lineHeight": 1.2,
            "headings": {"scale": "normal", "color": "#0659c5"},
        },
        "fontSubstitution": substituted,
        "counts": {"text": 0, "shapes": 0, "images": len(assets)},
    }


def take_asset(input_path: Path, out_dir: Path, entry: str, name: str) -> dict:
    """Sort un visuel du .docx sans le recoder : l'original, octet pour octet."""
    try:
        with zipfile.ZipFile(input_path) as zf:
            return docx_zip.extract_media(zf, entry, out_dir, name)
    except KeyError:
        fail("Visuel introuvable dans le document", "unknown_asset")
    except zipfile.BadZipFile:
        fail("Document illisible", "unreadable_docx")


def has_vector(rect: pymupdf.Rect, shapes: list[dict], image_rects: list[pymupdf.Rect]) -> bool:
    """True when the region is drawn, not placed as a bitmap."""
    drawn = any(rect.intersects(d["rect"]) for d in shapes)
    placed = any(rect.intersects(r) for r in image_rects)
    return drawn and not placed


# ---------------------------------------------------------------- crop


def crop(input_path: Path, out_dir: Path, rect: pymupdf.Rect, vector: bool, name: str) -> dict:
    doc = open_document(input_path, out_dir)
    page = doc[0]
    rect = rect & page.rect
    if rect.is_empty:
        fail("Zone vide", "empty_rect")

    if vector:
        # set_cropbox + get_svg_image re-emits the region as real <path>
        # elements. It only pays off when the source really is vector.
        page.set_cropbox(rect)
        svg = page.get_svg_image()
        target = out_dir / f"{name}.svg"
        target.write_text(svg, encoding="utf-8")
    else:
        pix = page.get_pixmap(matrix=pymupdf.Matrix(CROP_SCALE, CROP_SCALE), clip=rect, alpha=False)
        target = out_dir / f"{name}.png"
        pix.save(target)

    return {
        "ok": True,
        "file": target.name,
        "widthPt": round(rect.width, 2),
        "heightPt": round(rect.height, 2),
        "bytes": target.stat().st_size,
    }


# ---------------------------------------------------------------- input


def open_document(input_path: Path, out_dir: Path) -> pymupdf.Document:
    """Open a PDF, or a DOCX that has to be composed to be read.

    A .docx is normally handled by ``analyze_docx`` straight from its zip. It
    only reaches here when that found no image at all — a letterhead drawn as
    DrawingML shapes exists nowhere as a file, so the document has to be laid
    out before anything can be seen of it.
    """
    kind = sniff(input_path)
    if kind == "pdf":
        try:
            return pymupdf.open(input_path)
        except Exception as err:  # noqa: BLE001 - reported to the caller as JSON
            fail(f"PDF illisible : {err}", "unreadable_pdf")
    if kind == "docx":
        return pymupdf.open(docx_to_pdf(input_path, out_dir))
    fail("Format non reconnu : seuls .pdf et .docx sont acceptés", "unsupported_format")


def sniff(path: Path) -> str:
    """Type from the file's own bytes, never its extension."""
    with path.open("rb") as handle:
        magic = handle.read(4)
    if magic[:4] == b"%PDF":
        return "pdf"
    if magic[:2] == b"PK":
        return "docx"
    return "unknown"


def docx_to_pdf(input_path: Path, out_dir: Path) -> Path:
    soffice = shutil.which("soffice") or shutil.which("libreoffice")
    if not soffice:
        fail(
            "Conversion .docx indisponible : LibreOffice n'est pas installé sur le serveur. "
            "Exportez le document en PDF et réimportez-le.",
            "no_libreoffice",
        )
    with tempfile.TemporaryDirectory() as work:
        try:
            subprocess.run(
                [soffice, "--headless", "--convert-to", "pdf", "--outdir", work, str(input_path)],
                check=True,
                capture_output=True,
                timeout=120,
            )
        except subprocess.CalledProcessError as err:
            fail(f"Conversion .docx échouée : {err.stderr.decode('utf-8', 'replace')[:400]}", "docx_failed")
        except subprocess.TimeoutExpired:
            fail("Conversion .docx trop longue", "docx_timeout")
        produced = next(Path(work).glob("*.pdf"), None)
        if produced is None:
            fail("Conversion .docx sans résultat", "docx_failed")
        target = out_dir / "source.pdf"
        shutil.copyfile(produced, target)
        return target


# ---------------------------------------------------------------- cli


def parse_rect(raw: str) -> pymupdf.Rect:
    try:
        x0, y0, x1, y1 = (float(v) for v in raw.split(","))
    except ValueError:
        fail("--rect attend x0,y0,x1,y1", "bad_rect")
    return pymupdf.Rect(x0, y0, x1, y1)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)

    analyze_cmd = sub.add_parser("analyze")
    analyze_cmd.add_argument("--input", required=True)
    analyze_cmd.add_argument("--out", required=True)

    asset_cmd = sub.add_parser("asset")
    asset_cmd.add_argument("--input", required=True)
    asset_cmd.add_argument("--out", required=True)
    asset_cmd.add_argument("--entry", required=True)
    asset_cmd.add_argument("--name", required=True)

    crop_cmd = sub.add_parser("crop")
    crop_cmd.add_argument("--input", required=True)
    crop_cmd.add_argument("--out", required=True)
    crop_cmd.add_argument("--rect", required=True)
    crop_cmd.add_argument("--name", required=True)
    crop_cmd.add_argument("--vector", action="store_true")

    args = parser.parse_args()
    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)
    input_path = Path(args.input)
    if not input_path.is_file():
        fail("Fichier introuvable", "missing_input")

    if args.command == "analyze":
        result = analyze(input_path, out_dir)
    elif args.command == "asset":
        result = take_asset(input_path, out_dir, args.entry, args.name)
    else:
        if not args.name.isidentifier() and not args.name.replace("-", "_").isidentifier():
            fail("--name invalide", "bad_name")
        result = crop(input_path, out_dir, parse_rect(args.rect), args.vector, args.name)

    json.dump(result, sys.stdout, ensure_ascii=False)
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
