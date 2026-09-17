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

`TemplateModel` is the editable template structure. It represents what a user
has accepted, arranged, or created manually.

It can hold:

- page settings;
- regions such as header, footer, body, sidebar, watermark, signature, and
  custom regions;
- editable nodes such as text, field, image, shape, line, group, table, and
  page number nodes;
- typed fields with stable ids, labels, aliases, validation metadata, source,
  and confidence;
- field candidates proposed by extraction and kept separate from accepted
  fields;
- assets and source metadata.

`TemplateModel` is versioned:

- `TemplateModel v1` is the compatibility contract introduced before rich
  editing. It mirrors the current simple layout path and may still contain
  legacy raster nodes.
- `TemplateModel v2` is the rich editable contract. Each node carries `id`,
  `type`, `region`, `regionId`, `bbox`, optional layout, style, scope, source,
  confidence, and lock state. Rendered fallback captures are represented as
  `ImageNode` values with `imageKind: "raster-region"`.

New node kinds, scopes, regions, and field capabilities should be added by
model migrations rather than by overloading `LayoutConfig`.

## Field Registry

Typed fields live in a registry independent from layout. A field can exist even
when no node displays it, and a `FieldNode` only references an accepted field by
id.

Built-in field ids:

- `document.title`
- `document.reference`
- `document.date`
- `organization.name`
- `organization.logo`
- `recipient.name`
- `recipient.address`
- `signature.name`
- `signature.image`

Custom fields must use the `custom.*` namespace, for example
`custom.invoice.total` or `custom.project.manager`.

Supported field types are `text`, `date`, `image`, `address`, `number`, and
`richText`.

`TemplateModel v2` separates:

- `fields`: accepted fields, either user-created or user-validated;
- `fieldCandidates`: extraction proposals with `sourceCandidate`, confidence,
  source objects, optional bbox, and proposed value.

Extraction may populate `fieldCandidates`, but it must not automatically add
those candidates to `fields`.

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

`TemplateModel v2` can project back to `LayoutConfig` only when it stays inside
the simple subset: header/footer nodes, current page scopes, no positioned
layout, and no advanced node types such as fields, tables, groups, or shapes.

## Visual Import Editor

The import flow now inserts an editing step between upload and final template
creation:

```text
Upload -> ImportModel -> editable TemplateModel v2 -> Typst preview -> template
```

The editor treats `ImportModel` as immutable extraction evidence. User actions
modify only `TemplateModel v2`: assign regions, choose scopes, hide/delete
objects, group nodes, convert extracted text into accepted fields, rasterize
zones, and preview the resulting Typst output.

The first Typst adapter for this flow is conservative. It renders the simple
header/footer subset and keeps unsupported advanced nodes in the model with
warnings, so richer rendering can be added without changing the import contract.
