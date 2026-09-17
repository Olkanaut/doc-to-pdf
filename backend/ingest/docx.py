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
"""

from __future__ import annotations

import copy
import io
import posixpath
import re
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET

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
