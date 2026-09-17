import { sanitizeLayout, type Block, type LayoutConfig } from "../layout/layoutConfig.js";
import type { Analysis, Region } from "../ingest/sidecar.js";
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
  TEMPLATE_MODEL_KIND,
  TEMPLATE_MODEL_VERSION,
  sanitizeTemplateModel,
  type TemplateModelV1,
  type TemplateNode,
} from "./templateModel.js";

function regionId(kind: "header" | "footer" | "body" | "background" | "custom"): string {
  return `region-${kind}`;
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

export function analysisToImportModel(
  analysis: Analysis & { jobId?: string },
  source: { kind: "pdf" | "docx" | "unknown"; name?: string } = { kind: "unknown" },
): ImportModelV1 {
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
  if (type === "rasterRegion") return "raster";
  return "raster";
}

function mapObjectRegion(object: ImportObject, model: ImportModelV1): string {
  const zone = object.zoneId
    ? model.zones.find((candidate) => candidate.id === object.zoneId)
    : undefined;
  if (zone?.kind === "header") return regionId("header");
  if (zone?.kind === "footer") return regionId("footer");
  return regionId("body");
}
