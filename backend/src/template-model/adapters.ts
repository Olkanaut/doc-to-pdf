import { sanitizeLayout, type Block, type LayoutConfig } from "../layout/layoutConfig.js";
import type { Analysis, Region } from "../ingest/sidecar.js";
import {
  fieldDefinitionForId,
  importProvenanceToFieldSourceKind,
  type FieldCandidate,
  type RegistryFieldId,
} from "./fieldRegistry.js";
import {
  IMPORT_MODEL_KIND,
  IMPORT_MODEL_VERSION,
  sanitizeImportModel,
  type ImportBBox,
  type ImportModelV1,
  type ImportObject,
} from "./importModel.js";
import {
  DEFAULT_REGIONS,
  DEFAULT_REGIONS_V2,
  TEMPLATE_MODEL_KIND,
  TEMPLATE_MODEL_VERSION,
  TEMPLATE_MODEL_V2_VERSION,
  sanitizeTemplateModel,
  sanitizeTemplateModelV2,
  type TemplateModelV1,
  type TemplateModelV2,
  type TemplateNode,
  type TemplateNodeV2,
  type TemplateRegionKindV2,
  type TemplateShapeKindV2,
  type TemplateScopeV2,
  type TemplateSourceKindV2,
} from "./templateModel.js";

function regionId(kind: "header" | "footer" | "body" | "background" | "custom"): string {
  return `region-${kind}`;
}

function regionIdV2(kind: TemplateRegionKindV2): string {
  return `region-${kind}`;
}

function userSource(objectIds: string[] = [], assetIds: string[] = []) {
  return { kind: "user" as const, objectIds, assetIds };
}

function blockToNodes(block: Block, region: "header" | "footer", index: number): TemplateNode[] {
  const base = `${region}-block-${index + 1}`;
  const nodes: TemplateNode[] = [];
  if (block.image) {
    nodes.push({
      id: `${base}-image`,
      type: block.imageHeightMm === 0 ? "raster" : "image",
      regionId: regionId(region),
      scope: block.scope,
      sourceObjectIds: [],
      locked: false,
      assetId: block.image,
      style: {
        imagePosition: block.imagePosition,
        imageHeightMm: block.imageHeightMm,
      },
    });
  }
  if (block.title) {
    nodes.push({
      id: `${base}-title`,
      type: "text",
      regionId: regionId(region),
      scope: block.scope,
      sourceObjectIds: [],
      locked: false,
      text: block.title,
      style: { align: block.align, role: "title" },
    });
  }
  if (block.subtitle) {
    nodes.push({
      id: `${base}-subtitle`,
      type: "text",
      regionId: regionId(region),
      scope: block.scope,
      sourceObjectIds: [],
      locked: false,
      text: block.subtitle,
      style: { align: block.align, role: "subtitle" },
    });
  }
  if (block.rule.on) {
    nodes.push({
      id: `${base}-rule`,
      type: "line",
      regionId: regionId(region),
      scope: block.scope,
      sourceObjectIds: [],
      locked: false,
      style: { color: block.rule.color, widthPt: block.rule.widthPt },
    });
  }
  return nodes;
}

function blockToNodesV2(block: Block, region: "header" | "footer", index: number): TemplateNodeV2[] {
  const base = `${region}-block-${index + 1}`;
  const regionId = regionIdV2(region);
  const scope = block.scope as TemplateScopeV2;
  const nodes: TemplateNodeV2[] = [];
  const common = (id: string, order: number) => ({
    id,
    region,
    regionId,
    scope,
    source: userSource(),
    confidence: 1,
    locked: false,
    order,
  });

  if (block.image) {
    nodes.push({
      ...common(`${base}-image`, index * 10),
      type: "image",
      imageKind: block.imageHeightMm === 0 ? "raster-region" : "embedded",
      assetId: block.image,
      style: {
        imagePosition: block.imagePosition,
        imageHeightMm: block.imageHeightMm,
      },
    });
  }
  if (block.title) {
    nodes.push({
      ...common(`${base}-title`, index * 10 + 1),
      type: "text",
      text: block.title,
      style: { align: block.align, role: "title" },
    });
  }
  if (block.subtitle) {
    nodes.push({
      ...common(`${base}-subtitle`, index * 10 + 2),
      type: "text",
      text: block.subtitle,
      style: { align: block.align, role: "subtitle" },
    });
  }
  if (block.rule.on) {
    nodes.push({
      ...common(`${base}-rule`, index * 10 + 3),
      type: "line",
      style: { color: block.rule.color, widthPt: block.rule.widthPt },
    });
  }
  return nodes;
}

export function layoutConfigToTemplateModel(
  layoutInput: LayoutConfig,
  metadata: { name?: string } = {},
): TemplateModelV1 {
  const layout = sanitizeLayout(layoutInput);
  return sanitizeTemplateModel({
    model: TEMPLATE_MODEL_KIND,
    version: TEMPLATE_MODEL_VERSION,
    page: {
      paper: layout.paper,
      orientation: layout.orientation,
      margins: layout.margins,
    },
    regions: DEFAULT_REGIONS.map((region) => ({
      ...region,
      id: regionId(region.kind),
    })),
    nodes: [
      ...layout.header.blocks.flatMap((block, index) => blockToNodes(block, "header", index)),
      ...layout.footer.blocks.flatMap((block, index) => blockToNodes(block, "footer", index)),
      ...(layout.footer.numbering === "none"
        ? []
        : [{
            id: "footer-page-number",
            type: "pageNumber",
            regionId: regionId("footer"),
            scope: layout.footer.numberingScope,
            sourceObjectIds: [],
            locked: false,
            style: {
              numbering: layout.footer.numbering,
              align: layout.footer.numberingAlign,
            },
          }]),
    ],
    fields: [],
    assets: [
      ...new Set([
        ...layout.header.blocks.map((block) => block.image).filter(Boolean),
        ...layout.footer.blocks.map((block) => block.image).filter(Boolean),
      ]),
    ].map((file) => ({ id: String(file), file: String(file), sourceObjectIds: [] })),
    styles: { layout },
    metadata: { ...metadata, layoutConfigCompatible: true },
  });
}

export function layoutConfigToTemplateModelV2(
  layoutInput: LayoutConfig,
  metadata: { name?: string } = {},
): TemplateModelV2 {
  const layout = sanitizeLayout(layoutInput);
  return sanitizeTemplateModelV2({
    model: TEMPLATE_MODEL_KIND,
    version: TEMPLATE_MODEL_V2_VERSION,
    page: {
      paper: layout.paper,
      orientation: layout.orientation,
      margins: layout.margins,
    },
    regions: DEFAULT_REGIONS_V2,
    nodes: [
      ...layout.header.blocks.flatMap((block, index) => blockToNodesV2(block, "header", index)),
      ...layout.footer.blocks.flatMap((block, index) => blockToNodesV2(block, "footer", index)),
      ...(layout.footer.numbering === "none"
        ? []
        : [{
            id: "footer-page-number",
            type: "pageNumber",
            region: "footer",
            regionId: regionIdV2("footer"),
            scope: layout.footer.numberingScope,
            source: userSource(),
            confidence: 1,
            locked: false,
            order: 100_000,
            numbering: layout.footer.numbering,
            align: layout.footer.numberingAlign,
          }]),
    ],
    fields: [],
    assets: [
      ...new Set([
        ...layout.header.blocks.map((block) => block.image).filter(Boolean),
        ...layout.footer.blocks.map((block) => block.image).filter(Boolean),
      ]),
    ].map((file) => ({ id: String(file), file: String(file), source: userSource([], [String(file)]) })),
    styles: { layout },
    metadata: { ...metadata, layoutConfigCompatible: true, notes: [] },
  });
}

export function templateModelToLayoutConfig(modelInput: TemplateModelV1): {
  compatible: boolean;
  layout: LayoutConfig;
  reason?: string;
} {
  const model = sanitizeTemplateModel(modelInput);
  if (!model.metadata.layoutConfigCompatible) {
    return {
      compatible: false,
      layout: model.styles.layout,
      reason: "TemplateModel declares itself outside the LayoutConfig subset.",
    };
  }
  const unsupported = model.nodes.find((node) =>
    !["text", "image", "raster", "line", "pageNumber"].includes(node.type)
  );
  if (unsupported) {
    return {
      compatible: false,
      layout: model.styles.layout,
      reason: `Node "${unsupported.id}" of type "${unsupported.type}" is not representable as LayoutConfig.`,
    };
  }
  return { compatible: true, layout: model.styles.layout };
}

export function templateModelV2ToLayoutConfig(modelInput: TemplateModelV2): {
  compatible: boolean;
  layout: LayoutConfig;
  reason?: string;
} {
  const model = sanitizeTemplateModelV2(modelInput);
  if (!model.metadata.layoutConfigCompatible) {
    return {
      compatible: false,
      layout: model.styles.layout,
      reason: "TemplateModel v2 declares itself outside the LayoutConfig subset.",
    };
  }
  const unsupportedType = model.nodes.find((node) =>
    !["text", "image", "line", "pageNumber"].includes(node.type)
  );
  if (unsupportedType) {
    return {
      compatible: false,
      layout: model.styles.layout,
      reason: `Node "${unsupportedType.id}" of type "${unsupportedType.type}" is not representable as LayoutConfig.`,
    };
  }
  const unsupportedScope = model.nodes.find((node) =>
    !["all", "first", "except-first"].includes(node.scope)
  );
  if (unsupportedScope) {
    return {
      compatible: false,
      layout: model.styles.layout,
      reason: `Node "${unsupportedScope.id}" uses scope "${unsupportedScope.scope}", outside the LayoutConfig subset.`,
    };
  }
  const unsupportedRegion = model.nodes.find((node) => !["header", "footer"].includes(node.region));
  if (unsupportedRegion) {
    return {
      compatible: false,
      layout: model.styles.layout,
      reason: `Node "${unsupportedRegion.id}" is in region "${unsupportedRegion.region}", outside the LayoutConfig subset.`,
    };
  }
  const absoluteNode = model.nodes.find((node) => node.bbox || node.layout?.mode === "absolute");
  if (absoluteNode) {
    return {
      compatible: false,
      layout: model.styles.layout,
      reason: `Node "${absoluteNode.id}" uses positioned layout, outside the LayoutConfig subset.`,
    };
  }
  return { compatible: true, layout: model.styles.layout };
}

export function analysisToImportModel(
  analysis: Analysis & { jobId?: string },
  source: { kind?: "pdf" | "docx" | "image" | "unknown"; name?: string } = {},
): ImportModelV1 {
  if (analysis.importModel) {
    const sanitized = sanitizeImportModel(analysis.importModel);
    return sanitizeImportModel({
      ...sanitized,
      source: {
        ...sanitized.source,
        ...source,
        kind: source.kind ?? sanitized.source.kind,
      },
    });
  }

  const page = {
    id: "page-1",
    pageIndex: 0,
    widthPt: analysis.page.widthPt,
    heightPt: analysis.page.heightPt,
    rotation: 0,
  };
  const zones = analysis.regions.map((region, index) => ({
    id: `zone-${region.kind}-${index + 1}`,
    kind: region.kind === "page" ? "body" : region.kind,
    pageIndex: 0,
    bbox: regionToBBox(region),
    confidence: region.kind === "page" ? 1 : 0.75,
    provenance: "rendered-page",
  }));
  const objects: ImportObject[] = [
    ...analysis.regions.map((region, index) => ({
      id: `object-region-${region.kind}-${index + 1}`,
      type: "rasterRegion" as const,
      pageIndex: 0,
      bbox: regionToBBox(region),
      provenance: "rendered-page" as const,
      confidence: region.kind === "page" ? 1 : 0.75,
      zoneId: zones[index]?.id,
      raw: { vectorCandidate: region.vector },
    })),
    ...(analysis.assets ?? []).map((asset, index) => ({
      id: `object-asset-${index + 1}`,
      type: "image" as const,
      pageIndex: 0,
      bbox: {
        x: 0,
        y: 0,
        width: asset.widthPt || 1,
        height: asset.heightPt || 1,
      },
      provenance: "docx-media" as const,
      confidence: 1,
      assetId: `asset-${index + 1}`,
      raw: { entry: asset.id, kind: asset.kind, vector: asset.vector },
    })),
  ];

  return sanitizeImportModel({
    model: IMPORT_MODEL_KIND,
    version: IMPORT_MODEL_VERSION,
    source,
    pages: [page],
    zones,
    objects,
    assets: (analysis.assets ?? []).map((asset, index) => ({
      id: `asset-${index + 1}`,
      name: asset.name,
      bytes: asset.bytes,
      provenance: "docx-media",
    })),
    warnings: analysis.fontSubstitution
      ? [{
          code: "font-substitution",
          message: `${analysis.fontSubstitution} was replaced by the fallback font.`,
        }]
      : [],
  });
}

export function importModelToTemplateModelV2(
  importInput: ImportModelV1,
  layoutInput?: LayoutConfig,
): TemplateModelV2 {
  const model = sanitizeImportModel(importInput);
  const layout = sanitizeLayout(layoutInput ?? {});
  const zoneRegionIds = new Map(model.zones.map((zone, index) => [
    zone.id,
    `region-from-${zone.id || index + 1}`,
  ]));

  return sanitizeTemplateModelV2({
    model: TEMPLATE_MODEL_KIND,
    version: TEMPLATE_MODEL_V2_VERSION,
    page: {
      paper: layout.paper,
      orientation: layout.orientation,
      margins: layout.margins,
    },
    regions: model.zones.map((zone, index) => ({
      id: zoneRegionIds.get(zone.id) ?? `region-from-zone-${index + 1}`,
      kind: importZoneKindToTemplateRegion(zone.kind),
      label: zone.kind,
      bbox: zone.bbox,
      pageIndex: zone.pageIndex,
      scope: "all",
      locked: false,
      source: { kind: provenanceToTemplateSource(zone.provenance), objectIds: [], assetIds: [] },
      confidence: zone.confidence,
    })),
    nodes: model.objects.map((object, index) => importObjectToTemplateNodeV2(object, model, zoneRegionIds, index)),
    fields: [],
    fieldCandidates: detectFieldCandidates(model),
    assets: model.assets.map((asset) => ({
      id: asset.id,
      file: asset.file,
      name: asset.name,
      mimeType: asset.mimeType,
      bytes: asset.bytes,
      source: { kind: provenanceToTemplateSource(asset.provenance), objectIds: [], assetIds: [asset.id] },
    })),
    styles: { layout },
    metadata: {
      layoutConfigCompatible: false,
      sourceImportId: model.source.name,
      notes: [],
    },
  });
}

export function importModelToTemplateModel(
  importInput: ImportModelV1,
  layoutInput?: LayoutConfig,
): TemplateModelV1 {
  const model = sanitizeImportModel(importInput);
  const layout = sanitizeLayout(layoutInput ?? {});
  const regions = DEFAULT_REGIONS.map((region) => ({ ...region, id: regionId(region.kind) }));
  const nodes: TemplateNode[] = model.objects.map((object, index) => ({
    id: `node-from-${object.id || index + 1}`,
    type: objectTypeToNodeType(object.type),
    regionId: mapObjectRegion(object, model),
    scope: "all",
    bbox: object.bbox,
    sourceObjectIds: [object.id],
    locked: false,
    text: object.text,
    assetId: object.assetId,
    style: object.style,
  }));

  return sanitizeTemplateModel({
    model: TEMPLATE_MODEL_KIND,
    version: TEMPLATE_MODEL_VERSION,
    page: {
      paper: layout.paper,
      orientation: layout.orientation,
      margins: layout.margins,
    },
    regions,
    nodes,
    fields: [],
    assets: model.assets.map((asset) => ({
      id: asset.id,
      file: asset.file,
      name: asset.name,
      sourceObjectIds: [],
    })),
    styles: { layout },
    metadata: { layoutConfigCompatible: false },
  });
}

function regionToBBox(region: Region): ImportBBox {
  return {
    x: region.x,
    y: region.y,
    width: region.width,
    height: region.height,
  };
}

function objectTypeToNodeType(type: ImportObject["type"]): TemplateNode["type"] {
  if (type === "text") return "text";
  if (type === "image") return "image";
  if (type === "shape") return "shape";
  if (type === "line") return "line";
  if (type === "table") return "table";
  if (type === "rasterRegion") return "raster";
  return "raster";
}

function detectFieldCandidates(model: ImportModelV1): FieldCandidate[] {
  const candidates: FieldCandidate[] = [];
  const textObjects = model.objects.filter((object) => object.type === "text" && object.text?.trim());
  const imageObjects = model.objects.filter((object) => object.type === "image" && object.assetId);
  const firstPage = model.pages.find((page) => page.pageIndex === 0) ?? model.pages[0];

  for (const object of textObjects) {
    const text = normalizeText(object.text ?? "");
    if (!text) continue;

    const date = extractDateCandidate(text);
    if (date) {
      candidates.push(fieldCandidate("document.date", object, model, 0.72 * object.confidence, "Date-like text.", date));
    }

    const reference = extractReferenceCandidate(text);
    if (reference) {
      candidates.push(fieldCandidate("document.reference", object, model, 0.82 * object.confidence, "Reference-like text.", reference));
    }

    if (looksLikeAddress(text)) {
      candidates.push(fieldCandidate("recipient.address", object, model, 0.68 * object.confidence, "Address-like text.", text));
    }

    if (looksLikeRecipientName(text)) {
      candidates.push(fieldCandidate("recipient.name", object, model, 0.58 * object.confidence, "Recipient-like label.", text));
    }

    if (looksLikeOrganizationName(text) && objectRegionKind(object, model) === "header") {
      candidates.push(fieldCandidate("organization.name", object, model, 0.64 * object.confidence, "Organization-like header text.", text));
    }

    if (looksLikeSignatureText(text)) {
      candidates.push(fieldCandidate("signature.name", object, model, 0.56 * object.confidence, "Signature-like text.", text));
    }
  }

  const titleObject = textObjects
    .filter((object) => object.pageIndex === 0)
    .filter((object) => isTitleCandidate(object, model, firstPage?.heightPt))
    .sort((a, b) =>
      (styleNumber(b.style, "fontSize") ?? 0) - (styleNumber(a.style, "fontSize") ?? 0) ||
      a.bbox.y - b.bbox.y
    )[0];
  if (titleObject?.text) {
    candidates.push(fieldCandidate(
      "document.title",
      titleObject,
      model,
      0.62 * titleObject.confidence,
      "Prominent first-page text.",
      normalizeText(titleObject.text),
    ));
  }

  for (const object of imageObjects) {
    const region = objectRegionKind(object, model);
    if (region === "header") {
      candidates.push(fieldCandidate("organization.logo", object, model, 0.78 * object.confidence, "Header image.", object.assetId));
    }
    if (region === "footer" || isLowOnPage(object, firstPage?.heightPt)) {
      candidates.push(fieldCandidate("signature.image", object, model, 0.48 * object.confidence, "Footer or low-page image.", object.assetId));
    }
  }

  return bestFieldCandidates(candidates);
}

function fieldCandidate(
  fieldId: RegistryFieldId,
  object: ImportObject,
  model: ImportModelV1,
  confidence: number,
  reason: string,
  proposedValue?: string | number | boolean | null,
): FieldCandidate {
  const definition = fieldDefinitionForId(fieldId);
  const objectIds = [object.id];
  const assetIds = object.assetId ? [object.assetId] : [];
  return {
    id: `candidate-${fieldId.replace(/[^a-zA-Z0-9]+/g, "-")}-${object.id}`,
    fieldId,
    label: definition.label,
    type: definition.type,
    required: definition.required,
    defaultValue: definition.defaultValue,
    format: definition.format,
    proposedValue,
    sourceCandidate: {
      kind: importProvenanceToFieldSourceKind(object.provenance),
      objectIds,
      assetIds,
      confidence: Math.max(0, Math.min(1, confidence)),
      importModelId: model.source.name,
    },
    sourceObjectIds: objectIds,
    bbox: object.bbox,
    confidence: Math.max(0, Math.min(1, confidence)),
    reason,
  };
}

function bestFieldCandidates(candidates: readonly FieldCandidate[]): FieldCandidate[] {
  const byField = new Map<string, FieldCandidate>();
  for (const candidate of candidates) {
    const current = byField.get(candidate.fieldId);
    if (!current || candidate.confidence > current.confidence) {
      byField.set(candidate.fieldId, candidate);
    }
  }
  return [...byField.values()].sort((a, b) => a.fieldId.localeCompare(b.fieldId));
}

function normalizeText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function extractDateCandidate(text: string): string | undefined {
  return text.match(/\b(\d{4}-\d{2}-\d{2}|\d{1,2}[/-]\d{1,2}[/-]\d{2,4})\b/)?.[1];
}

function extractReferenceCandidate(text: string): string | undefined {
  return text.match(/\b(?:ref(?:erence)?|no|numero|dossier|invoice|facture)\s*[:#-]?\s*([A-Z0-9][A-Z0-9._/-]{2,})\b/i)?.[1];
}

function looksLikeAddress(text: string): boolean {
  return /\b\d{1,5}\s+(?:rue|avenue|av\.?|boulevard|bd\.?|chemin|route|place|street|road)\b/i.test(text) ||
    /\b\d{5}\s+[A-Za-z][A-Za-z -]{2,}\b/.test(text);
}

function looksLikeRecipientName(text: string): boolean {
  return /\b(?:madame|monsieur|m\.|mme|destinataire|attention|attn)\b/i.test(text);
}

function looksLikeOrganizationName(text: string): boolean {
  return /\b(?:ministere|mairie|commune|societe|company|association|direction|service)\b/i.test(text);
}

function looksLikeSignatureText(text: string): boolean {
  return /\b(?:signature|signataire|signed by|pour accord)\b/i.test(text);
}

function styleNumber(style: Record<string, unknown> | undefined, key: string): number | undefined {
  const value = style?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function isTitleCandidate(object: ImportObject, model: ImportModelV1, pageHeight?: number): boolean {
  const text = normalizeText(object.text ?? "");
  if (text.length < 3 || text.length > 140) return false;
  if (extractDateCandidate(text) || extractReferenceCandidate(text) || looksLikeAddress(text)) return false;
  const region = objectRegionKind(object, model);
  if (region === "header") return true;
  return pageHeight ? object.bbox.y < pageHeight * 0.25 : object.bbox.y < 220;
}

function isLowOnPage(object: ImportObject, pageHeight?: number): boolean {
  return pageHeight ? object.bbox.y > pageHeight * 0.7 : object.bbox.y > 600;
}

function importZoneKindToTemplateRegion(kind: ImportModelV1["zones"][number]["kind"]): TemplateRegionKindV2 {
  if (kind === "header") return "header";
  if (kind === "footer") return "footer";
  if (kind === "background") return "background";
  if (kind === "custom") return "custom";
  return "body";
}

function provenanceToTemplateSource(provenance: ImportObject["provenance"]): TemplateSourceKindV2 {
  if (provenance === "manual") return "user";
  return provenance;
}

function shapeKindV2(value: unknown): TemplateShapeKindV2 {
  return ["rect", "ellipse", "polygon", "path", "unknown"].includes(String(value))
    ? (value as TemplateShapeKindV2)
    : "unknown";
}

function objectRegionKind(object: ImportObject, model: ImportModelV1): ImportModelV1["zones"][number]["kind"] | undefined {
  return object.zoneId
    ? model.zones.find((candidate) => candidate.id === object.zoneId)?.kind
    : undefined;
}

function importObjectToTemplateNodeV2(
  object: ImportObject,
  model: ImportModelV1,
  zoneRegionIds: ReadonlyMap<string, string>,
  index: number,
): TemplateNodeV2 {
  const zone = object.zoneId
    ? model.zones.find((candidate) => candidate.id === object.zoneId)
    : undefined;
  const region = zone ? importZoneKindToTemplateRegion(zone.kind) : "body";
  const regionId = object.zoneId ? (zoneRegionIds.get(object.zoneId) ?? regionIdV2(region)) : regionIdV2(region);
  const styleSample = object.type === "text" && region === "body";
  const source = {
    kind: provenanceToTemplateSource(object.provenance),
    objectIds: [object.id],
    assetIds: object.assetId ? [object.assetId] : [],
  };
  const common = {
    id: `node-from-${object.id || index + 1}`,
    region,
    regionId,
    pageIndex: object.pageIndex,
    scope: "all" as const,
    bbox: object.bbox,
    layout: {
      mode: "absolute" as const,
      x: object.bbox.x,
      y: object.bbox.y,
      width: object.bbox.width,
      height: object.bbox.height,
    },
    style: {
      ...(object.style ?? {}),
      purpose: styleSample ? "style-sample" : "template-object",
      hidden: styleSample ? true : object.style?.hidden,
    },
    source,
    confidence: object.confidence,
    locked: styleSample,
    order: index,
  };

  if (object.type === "text") {
    return {
      ...common,
      type: "text",
      text: object.text ?? "",
    };
  }
  if (object.type === "image" || object.type === "rasterRegion") {
    return {
      ...common,
      type: "image",
      imageKind: object.type === "rasterRegion" || object.provenance === "rendered-page" ? "raster-region" : "embedded",
      assetId: object.assetId,
      alt: object.text,
    };
  }
  if (object.type === "shape") {
    const raw = object.raw ?? {};
    return {
      ...common,
      type: "shape",
      shape: shapeKindV2(raw.shape),
      fill: typeof object.style?.fill === "string" ? object.style.fill : undefined,
      stroke: typeof object.style?.stroke === "string" ? object.style.stroke : undefined,
    };
  }
  if (object.type === "line") {
    const raw = object.raw ?? {};
    return {
      ...common,
      type: "line",
      x1: typeof raw.x1 === "number" ? raw.x1 : object.bbox.x,
      y1: typeof raw.y1 === "number" ? raw.y1 : object.bbox.y,
      x2: typeof raw.x2 === "number" ? raw.x2 : object.bbox.x + object.bbox.width,
      y2: typeof raw.y2 === "number" ? raw.y2 : object.bbox.y + object.bbox.height,
    };
  }
  if (object.type === "table") {
    const rows = tableRowsFromRaw(object.raw?.rows);
    return {
      ...common,
      type: "table",
      columns: tableColumnsFromRows(rows),
      rows,
    };
  }
  return {
    ...common,
    type: "shape",
    shape: "unknown",
  };
}

function tableRowsFromRaw(rawRows: unknown): Array<Array<{ text: string; rowSpan: number; colSpan: number }>> {
  return Array.isArray(rawRows)
    ? rawRows.map((row) =>
        Array.isArray(row)
          ? row.map((cell) => {
              if (cell && typeof cell === "object" && !Array.isArray(cell)) {
                const item = cell as Record<string, unknown>;
                return {
                  text: typeof item.text === "string" ? item.text : String(item.value ?? ""),
                  rowSpan: typeof item.rowSpan === "number" ? item.rowSpan : 1,
                  colSpan: typeof item.colSpan === "number" ? item.colSpan : 1,
                };
              }
              return { text: String(cell ?? ""), rowSpan: 1, colSpan: 1 };
            })
          : []
      )
    : [];
}

function tableColumnsFromRows(rows: readonly (readonly unknown[])[]) {
  const count = rows.reduce((max, row) => Math.max(max, row.length), 0);
  return Array.from({ length: count }, (_, index) => ({ id: `column-${index + 1}` }));
}

function mapObjectRegion(object: ImportObject, model: ImportModelV1): string {
  const zone = object.zoneId
    ? model.zones.find((candidate) => candidate.id === object.zoneId)
    : undefined;
  if (zone?.kind === "header") return regionId("header");
  if (zone?.kind === "footer") return regionId("footer");
  return regionId("body");
}
