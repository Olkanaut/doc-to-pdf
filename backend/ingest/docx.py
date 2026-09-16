"""Lecture d'un .docx sans le composer.

Un .docx est un zip de XML : la géométrie de la page et les images réellement
embarquées s'y lisent directement, sans rien rendre. C'est la voie à prendre en
premier — elle donne le fichier d'origine, octet pour octet, là où un découpage
dans une page rendue ne donnerait qu'un raster approché.

Trois formes d'« image » cohabitent dans Word :

1. une vraie image (png/jpeg/…) dans ``word/media/`` — extraite telle quelle ;
2. un vrai SVG à côté de son repli PNG obligatoire (extension ``asvg:svgBlip``
   d'Office 365) — c'est le SVG qu'on prend ;
3. une forme dessinée dans le XML (DrawingML, SmartArt, VML) : aucun fichier à
   extraire. Ce seul cas demande une composition par LibreOffice.

Ce module couvre 1 et 2. Le cas 3 se reconnaît à l'absence de visuel : les
marqueurs XML des formes (``prstGeom`` et compagnie) figurent dans presque tout
.docx, ne serait-ce que pour le cadre d'une image, et ne distinguent rien.
"""

from __future__ import annotations

import re
import zipfile
from pathlib import Path

# Word compte en twips (1/20 de point) pour la page, en demi-points pour le corps.
TWIPS_PER_PT = 20.0
PT_PER_MM = 72.0 / 25.4
MEDIA_RE = re.compile(r"^word/media/[^/]+\.(png|jpe?g|gif|bmp|webp|svg|emf|wmf)$", re.I)
# Ce que Typst sait poser directement ; le reste est signalé mais pas proposé.
TYPST_IMAGE_EXT = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"}


def _text(zf: zipfile.ZipFile, name: str) -> str:
    try:
        return zf.read(name).decode("utf-8", "replace")
    except KeyError:
        return ""


def _attr(xml: str, tag: str, attr: str) -> str | None:
    match = re.search(rf"<{tag}\b[^>]*\b{attr}=\"([^\"]*)\"", xml)
    return match.group(1) if match else None


def _twips(xml: str, tag: str, attr: str) -> float | None:
    raw = _attr(xml, tag, attr)
    if raw is None:
        return None
    try:
        return float(raw) / TWIPS_PER_PT
    except ValueError:
        return None


def page_geometry(zf: zipfile.ZipFile) -> dict:
    """Format et marges, lus dans le `sectPr` de la dernière section."""
    document = _text(zf, "word/document.xml")
    sections = re.findall(r"<w:sectPr\b.*?</w:sectPr>", document, re.S)
    # Une section sans corps (`<w:sectPr .../>`) reste possible sur un document vide.
    section = sections[-1] if sections else document

    width = _twips(section, "w:pgSz", "w:w") or 595.28
    height = _twips(section, "w:pgSz", "w:h") or 841.89
    orient = _attr(section, "w:pgSz", "w:orient")
    if orient == "landscape" and width < height:
        width, height = height, width

    def mm(value: float | None, fallback: float) -> float:
        if value is None:
            return fallback
        return round(max(0.0, min(80.0, value / PT_PER_MM)), 1)

    return {
        "widthPt": round(width, 2),
        "heightPt": round(height, 2),
        "margins": {
            "top": mm(_twips(section, "w:pgMar", "w:top"), 25.0),
            "bottom": mm(_twips(section, "w:pgMar", "w:bottom"), 20.0),
            "left": mm(_twips(section, "w:pgMar", "w:left"), 20.0),
            "right": mm(_twips(section, "w:pgMar", "w:right"), 20.0),
        },
    }


def default_font(zf: zipfile.ZipFile) -> tuple[str | None, float]:
    """(police nommée dans les styles, corps en points). `None` quand Word s'en
    remet au thème : le nom réel est alors dans theme1.xml."""
    styles = _text(zf, "word/styles.xml")
    defaults = re.search(r"<w:docDefaults\b.*?</w:docDefaults>", styles, re.S)
    scope = defaults.group(0) if defaults else styles

    font = _attr(scope, "w:rFonts", "w:ascii")
    if not font:
        theme = _attr(scope, "w:rFonts", "w:asciiTheme")
        if theme:
            # « minorHAnsi » / « majorHAnsi » désignent une entrée du thème.
            minor = "minor" in theme
            themed = _text(zf, "word/theme/theme1.xml")
            pattern = (
                r"<a:minorFont>.*?</a:minorFont>" if minor else r"<a:majorFont>.*?</a:majorFont>"
            )
            block = re.search(pattern, themed, re.S)
            if block:
                font = _attr(block.group(0), "a:latin", "typeface") or None

    half_points = _attr(scope, "w:sz", "w:val")
    try:
        size = float(half_points) / 2 if half_points else 11.0
    except ValueError:
        size = 11.0
    return font, max(8.0, min(16.0, size))


def _part_media(zf: zipfile.ZipFile, prefix: str) -> set[str]:
    """Images référencées par les parties header*/footer* — le vrai papier à en-tête."""
    found: set[str] = set()
    for name in zf.namelist():
        if not re.match(rf"^word/_rels/{prefix}\d*\.xml\.rels$", name):
            continue
        for target in re.findall(r'Target="([^"]+)"', _text(zf, name)):
            if target.startswith("media/"):
                found.add(f"word/{target}")
    return found


def _pixel_size(data: bytes, suffix: str) -> tuple[float, float] | None:
    """Dimensions, pour le rapport largeur/hauteur du bandeau. Lues sur les
    octets : ni Pillow ni décodage complet."""
    if suffix == ".png" and data[:8] == b"\x89PNG\r\n\x1a\n":
        return (
            float(int.from_bytes(data[16:20], "big")),
            float(int.from_bytes(data[20:24], "big")),
        )
    if suffix in {".jpg", ".jpeg"} and data[:2] == b"\xff\xd8":
        i = 2
        while i + 9 < len(data):
            if data[i] != 0xFF:
                i += 1
                continue
            marker = data[i + 1]
            length = int.from_bytes(data[i + 2 : i + 4], "big")
            # SOF0..SOF15, hors marqueurs de table (C4, C8, CC).
            if 0xC0 <= marker <= 0xCF and marker not in {0xC4, 0xC8, 0xCC}:
                return (
                    float(int.from_bytes(data[i + 7 : i + 9], "big")),
                    float(int.from_bytes(data[i + 5 : i + 7], "big")),
                )
            i += 2 + length
        return None
    if suffix == ".svg":
        head = data[:2000].decode("utf-8", "replace")
        box = _attr(head, "svg", "viewBox")
        if box:
            parts = box.replace(",", " ").split()
            if len(parts) == 4:
                try:
                    return abs(float(parts[2])), abs(float(parts[3]))
                except ValueError:
                    pass
        width, height = _attr(head, "svg", "width"), _attr(head, "svg", "height")
        try:
            if width and height:
                return abs(float(re.sub(r"[^\d.]", "", width))), abs(
                    float(re.sub(r"[^\d.]", "", height))
                )
        except ValueError:
            pass
    return None


def media(zf: zipfile.ZipFile) -> list[dict]:
    """Visuels utilisables, le vrai SVG préféré à son repli PNG."""
    names = [n for n in zf.namelist() if MEDIA_RE.match(n)]
    # Case 2 : image1.svg et image1.png désignent le même visuel — on garde le vecteur.
    vectors = {Path(n).stem for n in names if n.lower().endswith(".svg")}
    header_media = _part_media(zf, "header")
    footer_media = _part_media(zf, "footer")

    found = []
    for name in sorted(names):
        path = Path(name)
        suffix = path.suffix.lower()
        if suffix not in TYPST_IMAGE_EXT:
            continue  # emf/wmf : Typst ne sait pas les poser
        if suffix != ".svg" and path.stem in vectors:
            continue  # repli d'un SVG déjà retenu
        data = zf.read(name)
        size = _pixel_size(data, suffix)
        found.append(
            {
                "id": name,
                "name": path.name,
                "kind": "header" if name in header_media else "footer" if name in footer_media else "body",
                "vector": suffix == ".svg",
                "bytes": len(data),
                "widthPt": size[0] if size else 0.0,
                "heightPt": size[1] if size else 0.0,
            }
        )
    # Un papier à en-tête posé dans une partie header passe devant le reste.
    order = {"header": 0, "footer": 1, "body": 2}
    found.sort(key=lambda m: (order[m["kind"]], m["name"]))
    return found


def extract_media(zf: zipfile.ZipFile, entry: str, out_dir: Path, name: str) -> dict:
    """Copie un visuel du zip vers le dossier de travail, sans le recoder."""
    if not MEDIA_RE.match(entry):
        raise KeyError(entry)
    data = zf.read(entry)
    suffix = Path(entry).suffix.lower()
    target = out_dir / f"{name}{suffix}"
    target.write_bytes(data)
    size = _pixel_size(data, suffix)
    return {
        "ok": True,
        "file": target.name,
        "widthPt": round(size[0], 2) if size else 0.0,
        "heightPt": round(size[1], 2) if size else 0.0,
        "bytes": len(data),
    }
