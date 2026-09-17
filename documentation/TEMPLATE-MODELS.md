# Template models

This document fixes the roles of the three template representations used by
Dots. The goal is to let extraction become richer without forcing every new
capability into `LayoutConfig`.

## ImportModel

`ImportModel` is what an extractor observed in an input document. It is not the
user-facing editable template.

It can hold raw PDF, DOCX, OCR, rendered-page, or AI observations:

- pages with point dimensions;
- detected zones such as header, footer, body, background, or custom;
- objects such as text, images, shapes, lines, raster regions, or unknown items;
- object provenance and confidence;
- warnings emitted by extractors.

The model keeps provenance so later UI can say where an object came from and how
trustworthy it is.

## TemplateModel

`TemplateModel` is the future editable template structure. It represents what a
user has accepted, arranged, or created manually.

It can hold:

- page settings;
- regions;
- editable nodes such as text, field, image, shape, line, group, page number,
  and raster nodes;
- typed fields such as dates, images, numbers, rich text, and custom text;
- assets and source metadata.

`TemplateModel` is versioned. New node kinds, scopes, regions, and field
capabilities should be added by model migrations rather than by overloading
`LayoutConfig`.

## LayoutConfig

`LayoutConfig` remains the simple, stable layout profile used by the current
editor and by existing managed Typst templates.

It expresses:

- paper, orientation, margins;
- global text and heading styles;
- simple header and footer blocks;
- footer numbering;
- table style.

It is intentionally not the universal template model. A `TemplateModel` may be
projected back to `LayoutConfig` only when it uses the compatible subset.

## Conversion Direction

The intended direction is:

```text
PDF/DOCX/OCR -> ImportModel -> TemplateModel -> Typst
                                      |
                                      v
                               LayoutConfig subset
```

Phase 1 keeps runtime behavior unchanged. It only introduces the contracts,
sanitizers, and compatibility adapters needed by later extraction work.
