"""Lecture OOXML minimale pour préparer un rendu fidèle d'un .docx.

Le header et le footer ne sont jamais reconstruits depuis les fichiers de
``word/media`` : une image seule ne porte ni sa position, ni le texte et les
formes qui l'accompagnent. LibreOffice compose le document et PyMuPDF recadre
ensuite le résultat.

Ce module ne cherche donc pas à devenir un moteur Word. Il fait seulement ce
qui doit être connu avant le rendu :

* la première section et ses références header/footer ;
* ``titlePg`` et ``evenAndOddHeaders`` ;
* les paragraphes de pagination ``PAGE`` / ``NUMPAGES`` ;
* une copie-sonde de trois pages vides, où seuls les bandeaux restent visibles.

Les anciens helpers d'assets restent provisoirement disponibles pour les routes
existantes. L'analyse principale ne les utilise plus.
"""

from __future__ import annotations

import copy
import io
import posixpath
import re
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET

# Word compte en twips (1/20 de point) pour la page, en demi-points pour le corps.
TWIPS_PER_PT = 20.0
PT_PER_MM = 72.0 / 25.4
MEDIA_RE = re.compile(r"^word/media/[^/]+\.(png|jpe?g|gif|bmp|webp|svg|emf|wmf)$", re.I)
# Ce que Typst sait poser directement ; le reste est signalé mais pas proposé.
TYPST_IMAGE_EXT = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"}

W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
REL = "http://schemas.openxmlformats.org/package/2006/relationships"
NS = {"w": W, "r": R, "rel": REL}

ET.register_namespace("w", W)
ET.register_namespace("r", R)


def _q(namespace: str, local: str) -> str:
    return f"{{{namespace}}}{local}"


def _xml(zf: zipfile.ZipFile, name: str) -> ET.Element:
    try:
        data = zf.read(name)
        for _, namespace in ET.iterparse(io.BytesIO(data), events=("start-ns",)):
            prefix, uri = namespace
            if prefix not in {"xml", "xmlns"}:
                try:
                    ET.register_namespace(prefix, uri)
                except ValueError:
                    pass  # ElementTree reserves synthetic prefixes such as ns0.
        return ET.fromstring(data)
    except (KeyError, ET.ParseError) as error:
        raise KeyError(name) from error


def _first_section(document: ET.Element) -> tuple[ET.Element, int]:
    sections = document.findall(".//w:sectPr", NS)
    if not sections:
        raise KeyError("word/document.xml#w:sectPr")
    return sections[0], len(sections)


def _relationship_parts(zf: zipfile.ZipFile, section: ET.Element) -> dict[str, dict[str, str]]:
    """Resolve only the header/footer relationships used by the first section."""
    references = [
        *section.findall("w:headerReference", NS),
        *section.findall("w:footerReference", NS),
    ]
    try:
        rels = _xml(zf, "word/_rels/document.xml.rels")
    except KeyError:
        if references:
            raise
        return {"header": {}, "footer": {}}
    targets: dict[str, str] = {}
    for rel in rels.findall("rel:Relationship", NS):
        if rel.get("TargetMode") == "External":
            continue
        rel_id = rel.get("Id")
        target = rel.get("Target")
        if not rel_id or not target:
            continue
        normalized = (
            posixpath.normpath(target.lstrip("/"))
            if target.startswith("/")
            else posixpath.normpath(posixpath.join("word", target))
        )
        if normalized.startswith("word/"):
            targets[rel_id] = normalized

    parts: dict[str, dict[str, str]] = {"header": {}, "footer": {}}
    for kind in ("header", "footer"):
        for ref in section.findall(f"w:{kind}Reference", NS):
            variant = ref.get(_q(W, "type"), "default")
            rel_id = ref.get(_q(R, "id"))
            if variant in {"first", "default", "even"} and rel_id in targets:
                parts[kind][variant] = targets[rel_id]
    return parts


def _field_codes(paragraph: ET.Element) -> set[str]:
    raw = " ".join(
        [node.text or "" for node in paragraph.findall(".//w:instrText", NS)]
        + [node.get(_q(W, "instr"), "") for node in paragraph.findall(".//w:fldSimple", NS)]
    ).upper()
    return {name for name in ("PAGE", "NUMPAGES") if re.search(rf"\b{name}\b", raw)}


def _numbering_style(codes: set[str], visible: str) -> str | None:
    if "PAGE" not in codes:
        return None
    if "NUMPAGES" not in codes:
        return "n"
    return "page-n-of-total" if re.search(r"\bpage\b", visible, re.I) else "n-of-total"


def _numbering_scope(variant: str, different_first: bool) -> str | None:
    if variant == "first":
        return "first" if different_first else None
    if variant == "default" and different_first:
        return "except-first"
    if variant == "default":
        return "all"
    return None


def _is_pagination_only(visible: str) -> bool:
    words = re.findall(r"[A-Za-zÀ-ÿ]+", visible.lower())
    return all(word in {"page", "pages", "sur", "de", "of", "von"} for word in words)


def _is_on(element: ET.Element | None) -> bool:
    if element is None:
        return False
    return element.get(_q(W, "val"), "true").lower() not in {"0", "false", "off", "no"}


def _strip_pagination(
    root: ET.Element,
    kind: str,
    variants: list[str],
    different_first: bool,
    warnings: list[str],
) -> tuple[list[dict], bool]:
    """Remove dynamic page fields from the visual probe so they cannot freeze."""
    found: list[dict] = []
    changed = False
    for parent in root.iter():
        for paragraph in list(parent):
            if paragraph.tag != _q(W, "p"):
                continue
            codes = _field_codes(paragraph)
            if not codes:
                continue
            visible = "".join(node.text or "" for node in paragraph.findall(".//w:t", NS)).strip()
            style = _numbering_style(codes, visible)
            align_node = paragraph.find("w:pPr/w:jc", NS)
            align = align_node.get(_q(W, "val"), "center") if align_node is not None else "center"
            if align not in {"left", "center", "right"}:
                align = "center"

            if style:
                for variant in variants:
                    scope = _numbering_scope(variant, different_first)
                    if kind == "footer" and scope is not None:
                        found.append(
                            {
                                "kind": kind,
                                "scope": scope,
                                "numbering": style,
                                "align": align,
                            }
                        )
                    elif variant == "even" or kind == "header":
                        warnings.append(
                            f"Pagination Word non representable retiree du {kind} pour ne pas figer sa valeur."
                        )
            if not _is_pagination_only(visible) or style is None:
                warnings.append(
                    f"Pagination Word complexe retiree du {kind} pour ne pas figer sa valeur."
                )
            parent.remove(paragraph)
            changed = True
    return found, changed


def _probe_document(section: ET.Element) -> bytes:
    root = ET.Element(_q(W, "document"))
    body = ET.SubElement(root, _q(W, "body"))
    for _ in range(2):
        paragraph = ET.SubElement(body, _q(W, "p"))
        run = ET.SubElement(paragraph, _q(W, "r"))
        ET.SubElement(run, _q(W, "br"), {_q(W, "type"): "page"})
    ET.SubElement(body, _q(W, "p"))
    body.append(copy.deepcopy(section))
    return ET.tostring(root, encoding="utf-8", xml_declaration=True)


def create_probe(input_path: Path, target: Path) -> dict:
    """Create a three-page DOCX retaining only the first section's page stories."""
    warnings: list[str] = []
    with zipfile.ZipFile(input_path) as source:
        document = _xml(source, "word/document.xml")
        section, section_count = _first_section(document)
        parts = _relationship_parts(source, section)
        different_first = _is_on(section.find("w:titlePg", NS))
        try:
            settings = _xml(source, "word/settings.xml")
            even_and_odd = _is_on(settings.find("w:evenAndOddHeaders", NS))
        except KeyError:
            even_and_odd = False

        if section_count > 1:
            warnings.append("Le document contient plusieurs sections ; seule la premiere est importee.")
        transformed: dict[str, bytes] = {
            "word/document.xml": _probe_document(section),
        }
        pagination: list[dict] = []
        variants_by_part: dict[tuple[str, str], list[str]] = {}
        for kind, variants in parts.items():
            for variant, part in variants.items():
                variants_by_part.setdefault((kind, part), []).append(variant)

        for (kind, part), variants in variants_by_part.items():
            root = _xml(source, part)
            extracted, changed = _strip_pagination(
                root, kind, variants, different_first, warnings
            )
            pagination.extend(extracted)
            if changed:
                transformed[part] = ET.tostring(root, encoding="utf-8", xml_declaration=True)

        target.parent.mkdir(parents=True, exist_ok=True)
        with zipfile.ZipFile(target, "w", compression=zipfile.ZIP_DEFLATED) as output:
            for info in source.infolist():
                output.writestr(info, transformed.get(info.filename, source.read(info.filename)))

    unique_pagination: list[dict] = []
    for item in pagination:
        if item not in unique_pagination:
            unique_pagination.append(item)
    collapsed: list[dict] = []
    for item in unique_pagination:
        same = [
            other
            for other in unique_pagination
            if all(other[key] == item[key] for key in ("kind", "numbering", "align"))
        ]
        scopes = {other["scope"] for other in same}
        normalized = {**item, "scope": "all"} if scopes == {"first", "except-first"} else item
        if normalized not in collapsed:
            collapsed.append(normalized)
    return {
        "differentFirstPage": different_first,
        "evenAndOddHeaders": even_and_odd,
        "sectionCount": section_count,
        "parts": parts,
        "pagination": collapsed,
        "warnings": list(dict.fromkeys(warnings)),
    }


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
