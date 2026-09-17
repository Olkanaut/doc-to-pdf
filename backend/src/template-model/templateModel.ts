import { defaultLayout, sanitizeLayout, type Align, type LayoutConfig, type Numbering } from "../layout/layoutConfig.js";
import type { ImportBBox } from "./importModel.js";

export const TEMPLATE_MODEL_KIND = "template" as const;
export const TEMPLATE_MODEL_VERSION = 1 as const;
export const TEMPLATE_MODEL_V2_VERSION = 2 as const;

export type TemplateRegionKind = "header" | "footer" | "body" | "background" | "custom";
export type TemplateNodeType =
  | "text"
  | "field"
  | "image"
  | "shape"
  | "line"
  | "table"
  | "group"
  | "pageNumber"
  | "raster";
export type TemplateScope = "all" | "first" | "except-first";
export type FieldType = "text" | "date" | "image" | "number" | "richText";

export type TemplateRegionKindV2 =
  | "header"
  | "footer"
  | "body"
  | "sidebar"
  | "watermark"
  | "signature"
  | "background"
  | "custom";
export type TemplateNodeTypeV2 =
  | "text"
  | "field"
  | "image"
  | "shape"
  | "line"
  | "group"
  | "table"
  | "pageNumber";
export type TemplateScopeV2 = "all" | "first" | "except-first" | "odd" | "even" | "last";
export type TemplateSourceKindV2 =
  | "pdf-text"
  | "pdf-image"
  | "pdf-vector"
  | "docx-xml"
  | "docx-media"
  | "ocr"
  | "rendered-page"
  | "user"
  | "ai";
export type TemplateLayoutModeV2 = "absolute" | "flow" | "anchored" | "inline" | "unknown";
export type TemplateShapeKindV2 = "rect" | "ellipse" | "polygon" | "path" | "unknown";
export type TemplateImageKindV2 = "embedded" | "linked" | "raster-region" | "placeholder";

export interface TemplatePage {
  paper: LayoutConfig["paper"];
  orientation: LayoutConfig["orientation"];
  margins: LayoutConfig["margins"];
}

export interface TemplateRegion {
  id: string;
  kind: TemplateRegionKind;
  label: string;
}

export interface TemplateNode {
  id: string;
  type: TemplateNodeType;
  regionId: string;
  scope: TemplateScope;
  bbox?: ImportBBox;
  style?: Record<string, unknown>;
  sourceObjectIds: string[];
  locked: boolean;
  visibleWhen?: string;
  text?: string;
  fieldId?: string;
  assetId?: string;
  children?: string[];
}

export interface TemplateField {
  id: string;
  label: string;
  type: FieldType;
  required: boolean;
  defaultValue?: string | number | boolean | null;
  format?: string;
  sourceObjectIds: string[];
  confidence: number;
}

export interface TemplateAsset {
  id: string;
  file?: string;
  name?: string;
  sourceObjectIds: string[];
}

export interface TemplateModelV1 {
  model: typeof TEMPLATE_MODEL_KIND;
  version: typeof TEMPLATE_MODEL_VERSION;
  page: TemplatePage;
  regions: TemplateRegion[];
  nodes: TemplateNode[];
  fields: TemplateField[];
  assets: TemplateAsset[];
  styles: {
    layout: LayoutConfig;
  };
  metadata: {
    name?: string;
    layoutConfigCompatible: boolean;
  };
}

export interface TemplateSourceV2 {
  kind: TemplateSourceKindV2;
  objectIds: string[];
  assetIds: string[];
  importModelId?: string;
  note?: string;
}

export interface TemplateNodeLayoutV2 {
  mode: TemplateLayoutModeV2;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  zIndex?: number;
  rotation?: number;
  anchor?: string;
  constraints?: Record<string, unknown>;
  raw?: Record<string, unknown>;
}

export interface TemplateRegionV2 {
  id: string;
  kind: TemplateRegionKindV2;
  label: string;
  bbox?: ImportBBox;
  pageIndex?: number;
  scope: TemplateScopeV2;
  locked: boolean;
  source: TemplateSourceV2;
  confidence: number;
  metadata?: Record<string, unknown>;
}

export interface TemplateBaseNodeV2 {
  id: string;
  type: TemplateNodeTypeV2;
  region: TemplateRegionKindV2;
  regionId: string;
  scope: TemplateScopeV2;
  bbox?: ImportBBox;
  layout?: TemplateNodeLayoutV2;
  style?: Record<string, unknown>;
  source: TemplateSourceV2;
  confidence: number;
  locked: boolean;
  visibleWhen?: string;
  order: number;
}

export interface TemplateTextRunV2 {
  text: string;
  style?: Record<string, unknown>;
  source?: TemplateSourceV2;
  confidence?: number;
}

export interface TextNode extends TemplateBaseNodeV2 {
  type: "text";
  text: string;
  runs?: TemplateTextRunV2[];
}

export interface FieldNode extends TemplateBaseNodeV2 {
  type: "field";
  fieldId: string;
  fieldType: string;
  label?: string;
  placeholder?: string;
  binding?: Record<string, unknown>;
}

export interface ImageNode extends TemplateBaseNodeV2 {
  type: "image";
  imageKind: TemplateImageKindV2;
  assetId?: string;
  alt?: string;
  fit?: "contain" | "cover" | "fill" | "none";
  crop?: Record<string, unknown>;
}

export interface ShapeNode extends TemplateBaseNodeV2 {
  type: "shape";
  shape: TemplateShapeKindV2;
  path?: string;
  fill?: string;
  stroke?: string;
}

export interface LineNode extends TemplateBaseNodeV2 {
  type: "line";
  x1?: number;
  y1?: number;
  x2?: number;
  y2?: number;
}

export interface GroupNode extends TemplateBaseNodeV2 {
  type: "group";
  children: string[];
  groupKind?: string;
  clipping: boolean;
}

export interface TemplateTableColumnV2 {
  id: string;
  label?: string;
  width?: number;
  style?: Record<string, unknown>;
}

export interface TemplateTableCellV2 {
  id?: string;
  text?: string;
  fieldId?: string;
  rowSpan: number;
  colSpan: number;
  style?: Record<string, unknown>;
  source?: TemplateSourceV2;
  confidence?: number;
}

export interface TableNode extends TemplateBaseNodeV2 {
  type: "table";
  columns: TemplateTableColumnV2[];
  rows: TemplateTableCellV2[][];
}

export interface PageNumberNode extends TemplateBaseNodeV2 {
  type: "pageNumber";
  numbering: Numbering;
  align: Align;
  format?: string;
}

export type TemplateNodeV2 =
  | TextNode
  | FieldNode
  | ImageNode
  | ShapeNode
  | LineNode
  | GroupNode
  | TableNode
  | PageNumberNode;

export interface TemplateFieldV2 {
  id: string;
  label: string;
  type: string;
  required: boolean;
  defaultValue?: string | number | boolean | null;
  format?: string;
  source: TemplateSourceV2;
  confidence: number;
  aliases: string[];
  validation?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface TemplateAssetV2 {
  id: string;
  file?: string;
  name?: string;
  mimeType?: string;
  bytes?: number;
  source: TemplateSourceV2;
  metadata?: Record<string, unknown>;
}

export interface TemplateModelV2 {
  model: typeof TEMPLATE_MODEL_KIND;
  version: typeof TEMPLATE_MODEL_V2_VERSION;
  page: TemplatePage;
  regions: TemplateRegionV2[];
  nodes: TemplateNodeV2[];
  fields: TemplateFieldV2[];
  assets: TemplateAssetV2[];
  styles: {
    layout: LayoutConfig;
    tokens?: Record<string, unknown>;
  };
  metadata: {
    name?: string;
    layoutConfigCompatible: boolean;
    migratedFromVersion?: number;
    sourceImportId?: string;
    notes: string[];
  };
}

const REGION_KINDS: readonly TemplateRegionKind[] = ["header", "footer", "body", "background", "custom"];
const NODE_TYPES: readonly TemplateNodeType[] = ["text", "field", "image", "shape", "line", "table", "group", "pageNumber", "raster"];
const SCOPES: readonly TemplateScope[] = ["all", "first", "except-first"];
const FIELD_TYPES: readonly FieldType[] = ["text", "date", "image", "number", "richText"];

const REGION_KINDS_V2: readonly TemplateRegionKindV2[] = [
  "header",
  "footer",
  "body",
  "sidebar",
  "watermark",
  "signature",
  "background",
  "custom",
];
const NODE_TYPES_V2: readonly TemplateNodeTypeV2[] = [
  "text",
  "field",
  "image",
  "shape",
  "line",
  "group",
  "table",
  "pageNumber",
];
const SCOPES_V2: readonly TemplateScopeV2[] = ["all", "first", "except-first", "odd", "even", "last"];
const SOURCE_KINDS_V2: readonly TemplateSourceKindV2[] = [
  "pdf-text",
  "pdf-image",
  "pdf-vector",
  "docx-xml",
  "docx-media",
  "ocr",
  "rendered-page",
  "user",
  "ai",
];
const LAYOUT_MODES_V2: readonly TemplateLayoutModeV2[] = ["absolute", "flow", "anchored", "inline", "unknown"];
const SHAPES_V2: readonly TemplateShapeKindV2[] = ["rect", "ellipse", "polygon", "path", "unknown"];
const IMAGE_KINDS_V2: readonly TemplateImageKindV2[] = ["embedded", "linked", "raster-region", "placeholder"];
const IMAGE_FITS_V2 = ["contain", "cover", "fill", "none"] as const;

export const DEFAULT_REGIONS: readonly TemplateRegion[] = [
  { id: "region-header", kind: "header", label: "En-tete" },
  { id: "region-body", kind: "body", label: "Corps" },
  { id: "region-footer", kind: "footer", label: "Pied de page" },
];

function userSourceV2(): TemplateSourceV2 {
  return { kind: "user", objectIds: [], assetIds: [] };
}

export const DEFAULT_REGIONS_V2: readonly TemplateRegionV2[] = [
  { id: "region-header", kind: "header", label: "En-tete", scope: "all", locked: false, source: userSourceV2(), confidence: 1 },
  { id: "region-body", kind: "body", label: "Corps", scope: "all", locked: false, source: userSourceV2(), confidence: 1 },
  { id: "region-footer", kind: "footer", label: "Pied de page", scope: "all", locked: false, source: userSourceV2(), confidence: 1 },
  { id: "region-sidebar", kind: "sidebar", label: "Barre laterale", scope: "all", locked: false, source: userSourceV2(), confidence: 1 },
  { id: "region-watermark", kind: "watermark", label: "Filigrane", scope: "all", locked: false, source: userSourceV2(), confidence: 1 },
  { id: "region-signature", kind: "signature", label: "Signature", scope: "all", locked: false, source: userSourceV2(), confidence: 1 },
];

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return (allowed as readonly string[]).includes(value as string) ? (value as T) : fallback;
}

function num(value: unknown, fallback: number, min: number, max: number): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function optionalNum(value: unknown, min: number, max: number): number | undefined {
  if (value === undefined) return undefined;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return undefined;
  return Math.min(max, Math.max(min, n));
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function str(value: unknown, fallback = "", max = 500): string {
  return typeof value === "string" ? value.slice(0, max) : fallback;
}

function id(value: unknown, fallback: string): string {
  const raw = str(value, fallback, 120).trim();
  return /^[a-zA-Z0-9_.:-]+$/.test(raw) ? raw : fallback;
}

function looseId(value: unknown, fallback: string): string {
  const raw = str(value, fallback, 160).trim();
  return /^[a-zA-Z0-9_.:-]+$/.test(raw) ? raw : fallback;
}

function fieldId(value: unknown, fallback: string): string {
  const raw = id(value, fallback);
  return /^(document|organization|recipient|signature|custom)\.[a-zA-Z0-9_.:-]+$/.test(raw)
    ? raw
    : fallback;
}

function stringIds(value: unknown): string[] {
  return array(value)
    .map((entry, index) => id(entry, `item-${index + 1}`))
    .filter(Boolean);
}

function bbox(value: unknown): ImportBBox | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const box = value as Record<string, unknown>;
  return {
    x: num(box.x, 0, -100_000, 100_000),
    y: num(box.y, 0, -100_000, 100_000),
    width: num(box.width, 1, 0, 100_000),
    height: num(box.height, 1, 0, 100_000),
  };
}

function plainRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function defaultValue(value: unknown): string | number | boolean | null | undefined {
  if (value === null) return null;
  if (["string", "number", "boolean"].includes(typeof value)) return value as string | number | boolean;
  return undefined;
}

function sourceKindV2(value: unknown, fallback: TemplateSourceKindV2): TemplateSourceKindV2 {
  if (value === "manual") return "user";
  return oneOf(value, SOURCE_KINDS_V2, fallback);
}

function sourceObjectV2(
  input: unknown,
  fallback: TemplateSourceV2 = { kind: "user", objectIds: [], assetIds: [] },
): TemplateSourceV2 {
  if (typeof input === "string") {
    return { ...fallback, kind: sourceKindV2(input, fallback.kind) };
  }
  const raw = object(input);
  const objectIds = stringIds(raw.objectIds ?? raw.sourceObjectIds);
  const assetIds = stringIds(raw.assetIds);
  return {
    kind: sourceKindV2(raw.kind, fallback.kind),
    objectIds: objectIds.length ? objectIds : fallback.objectIds,
    assetIds: assetIds.length ? assetIds : fallback.assetIds,
    importModelId: raw.importModelId === undefined ? fallback.importModelId : id(raw.importModelId, fallback.importModelId ?? ""),
    note: raw.note === undefined ? fallback.note : str(raw.note, "", 500),
  };
}

function layoutV2(input: unknown, fallbackBBox?: ImportBBox): TemplateNodeLayoutV2 | undefined {
  if (!input && !fallbackBBox) return undefined;
  const raw = object(input);
  return {
    mode: oneOf(raw.mode, LAYOUT_MODES_V2, fallbackBBox ? "absolute" : "unknown"),
    x: optionalNum(raw.x, -100_000, 100_000) ?? fallbackBBox?.x,
    y: optionalNum(raw.y, -100_000, 100_000) ?? fallbackBBox?.y,
    width: optionalNum(raw.width, 0, 100_000) ?? fallbackBBox?.width,
    height: optionalNum(raw.height, 0, 100_000) ?? fallbackBBox?.height,
    zIndex: optionalNum(raw.zIndex, -100_000, 100_000),
    rotation: optionalNum(raw.rotation, -360, 360),
    anchor: raw.anchor === undefined ? undefined : str(raw.anchor, "", 120),
    constraints: plainRecord(raw.constraints),
    raw: plainRecord(raw.raw),
  };
}

function pageFromInput(raw: Record<string, unknown>, layout: LayoutConfig): TemplatePage {
  const page = object(raw.page);
  return {
    paper: oneOf(page.paper, ["a4", "a5", "us-letter"] as const, layout.paper),
    orientation: oneOf(page.orientation, ["portrait", "landscape"] as const, layout.orientation),
    margins: sanitizeLayout({ margins: page.margins ?? layout.margins }).margins,
  };
}

function sanitizeRegionV2(entry: unknown, index: number): TemplateRegionV2 {
  const region = object(entry);
  const kind = oneOf(region.kind, REGION_KINDS_V2, "custom");
  const regionBBox = bbox(region.bbox);
  return {
    id: id(region.id, `region-${kind}-${index + 1}`),
    kind,
    label: str(region.label, kind, 200),
    bbox: regionBBox,
    pageIndex: region.pageIndex === undefined ? undefined : Math.trunc(num(region.pageIndex, 0, 0, 10_000)),
    scope: oneOf(region.scope, SCOPES_V2, "all"),
    locked: bool(region.locked, false),
    source: sourceObjectV2(region.source, { kind: "user", objectIds: stringIds(region.sourceObjectIds), assetIds: [] }),
    confidence: num(region.confidence, 1, 0, 1),
    metadata: plainRecord(region.metadata),
  };
}

function regionsV2(input: unknown): TemplateRegionV2[] {
  const provided = array(input).map((entry, index) => sanitizeRegionV2(entry, index));
  const regions = provided.length ? [...provided] : [];
  for (const defaultRegion of DEFAULT_REGIONS_V2) {
    if (!regions.some((region) => region.kind === defaultRegion.kind)) {
      regions.push({ ...defaultRegion, source: { ...defaultRegion.source } });
    }
  }
  return regions;
}

function resolveRegionV2(
  node: Record<string, unknown>,
  regions: readonly TemplateRegionV2[],
): { regionId: string; region: TemplateRegionKindV2 } {
  const fallback = regions.find((region) => region.kind === "body") ?? regions[0]!;
  const requestedId = id(node.regionId, "");
  const byId = requestedId ? regions.find((region) => region.id === requestedId) : undefined;
  const requestedKind = oneOf(node.region, REGION_KINDS_V2, fallback.kind);
  const byKind = regions.find((region) => region.kind === requestedKind);
  const resolved = byId ?? byKind ?? fallback;
  return { regionId: resolved.id, region: resolved.kind };
}

function textRunsV2(input: unknown): TemplateTextRunV2[] | undefined {
  const runs = array(input).map((entry) => {
    const run = object(entry);
    return {
      text: str(run.text, "", 10_000),
      style: plainRecord(run.style),
      source: run.source === undefined ? undefined : sourceObjectV2(run.source),
      confidence: run.confidence === undefined ? undefined : num(run.confidence, 1, 0, 1),
    };
  });
  return runs.length ? runs : undefined;
}

function tableColumnsV2(input: unknown): TemplateTableColumnV2[] {
  return array(input).map((entry, index) => {
    const column = object(entry);
    return {
      id: id(column.id, `column-${index + 1}`),
      label: column.label === undefined ? undefined : str(column.label, "", 200),
      width: column.width === undefined ? undefined : num(column.width, 0, 0, 100_000),
      style: plainRecord(column.style),
    };
  });
}

function tableCellsV2(input: unknown): TemplateTableCellV2[][] {
  return array(input).map((row) =>
    array(row).map((entry) => {
      const cell = object(entry);
      return {
        id: cell.id === undefined ? undefined : id(cell.id, ""),
        text: cell.text === undefined ? undefined : str(cell.text, "", 10_000),
        fieldId: cell.fieldId === undefined ? undefined : looseId(cell.fieldId, ""),
        rowSpan: Math.trunc(num(cell.rowSpan, 1, 1, 1_000)),
        colSpan: Math.trunc(num(cell.colSpan, 1, 1, 1_000)),
        style: plainRecord(cell.style),
        source: cell.source === undefined ? undefined : sourceObjectV2(cell.source),
        confidence: cell.confidence === undefined ? undefined : num(cell.confidence, 1, 0, 1),
      };
    })
  );
}

function sanitizeNodeV2(entry: unknown, index: number, regions: readonly TemplateRegionV2[]): TemplateNodeV2 {
  const node = object(entry);
  const type = oneOf(node.type, NODE_TYPES_V2, "text");
  const nodeBBox = bbox(node.bbox);
  const region = resolveRegionV2(node, regions);
  const assetId = node.assetId === undefined ? undefined : id(node.assetId, "");
  const common = {
    id: id(node.id, `node-${index + 1}`),
    region: region.region,
    regionId: region.regionId,
    scope: oneOf(node.scope, SCOPES_V2, "all"),
    bbox: nodeBBox,
    layout: layoutV2(node.layout, nodeBBox),
    style: plainRecord(node.style),
    source: sourceObjectV2(node.source, {
      kind: "user",
      objectIds: stringIds(node.sourceObjectIds),
      assetIds: assetId ? [assetId] : [],
    }),
    confidence: num(node.confidence, 1, 0, 1),
    locked: bool(node.locked, false),
    visibleWhen: node.visibleWhen === undefined ? undefined : str(node.visibleWhen, "", 500),
    order: Math.trunc(num(node.order, index, 0, 100_000)),
  };

  if (type === "field") {
    return {
      ...common,
      type,
      fieldId: looseId(node.fieldId, `field-${index + 1}`),
      fieldType: looseId(node.fieldType ?? node.valueType, "text"),
      label: node.label === undefined ? undefined : str(node.label, "", 200),
      placeholder: node.placeholder === undefined ? undefined : str(node.placeholder, "", 500),
      binding: plainRecord(node.binding),
    };
  }
  if (type === "image") {
    return {
      ...common,
      type,
      imageKind: oneOf(node.imageKind, IMAGE_KINDS_V2, assetId ? "embedded" : "placeholder"),
      assetId,
      alt: node.alt === undefined ? undefined : str(node.alt, "", 500),
      fit: node.fit === undefined ? undefined : oneOf(node.fit, IMAGE_FITS_V2, "contain"),
      crop: plainRecord(node.crop),
    };
  }
  if (type === "shape") {
    return {
      ...common,
      type,
      shape: oneOf(node.shape, SHAPES_V2, "unknown"),
      path: node.path === undefined ? undefined : str(node.path, "", 10_000),
      fill: node.fill === undefined ? undefined : str(node.fill, "", 200),
      stroke: node.stroke === undefined ? undefined : str(node.stroke, "", 200),
    };
  }
  if (type === "line") {
    return {
      ...common,
      type,
      x1: optionalNum(node.x1, -100_000, 100_000),
      y1: optionalNum(node.y1, -100_000, 100_000),
      x2: optionalNum(node.x2, -100_000, 100_000),
      y2: optionalNum(node.y2, -100_000, 100_000),
    };
  }
  if (type === "group") {
    return {
      ...common,
      type,
      children: stringIds(node.children),
      groupKind: node.groupKind === undefined ? undefined : looseId(node.groupKind, "group"),
      clipping: bool(node.clipping, false),
    };
  }
  if (type === "table") {
    return {
      ...common,
      type,
      columns: tableColumnsV2(node.columns),
      rows: tableCellsV2(node.rows),
    };
  }
  if (type === "pageNumber") {
    return {
      ...common,
      type,
      numbering: oneOf(node.numbering, ["none", "n", "n-of-total", "page-n-of-total"] as const, "n-of-total"),
      align: oneOf(node.align, ["left", "center", "right"] as const, "center"),
      format: node.format === undefined ? undefined : str(node.format, "", 200),
    };
  }
  return {
    ...common,
    type: "text",
    text: str(node.text, "", 10_000),
    runs: textRunsV2(node.runs),
  };
}

function sanitizeFieldV2(entry: unknown, index: number): TemplateFieldV2 {
  const field = object(entry);
  return {
    id: looseId(field.id, `field-${index + 1}`),
    label: str(field.label, str(field.id, `Champ ${index + 1}`, 120), 200),
    type: looseId(field.type, "text"),
    required: bool(field.required, false),
    defaultValue: defaultValue(field.defaultValue),
    format: field.format === undefined ? undefined : str(field.format, "", 120),
    source: sourceObjectV2(field.source, {
      kind: "user",
      objectIds: stringIds(field.sourceObjectIds),
      assetIds: [],
    }),
    confidence: num(field.confidence, 1, 0, 1),
    aliases: array(field.aliases).map((alias) => str(alias, "", 200)).filter(Boolean),
    validation: plainRecord(field.validation),
    metadata: plainRecord(field.metadata),
  };
}

function sanitizeAssetV2(entry: unknown, index: number): TemplateAssetV2 {
  const asset = object(entry);
  const assetId = id(asset.id, `asset-${index + 1}`);
  return {
    id: assetId,
    file: asset.file === undefined ? undefined : str(asset.file, "", 500),
    name: asset.name === undefined ? undefined : str(asset.name, "", 500),
    mimeType: asset.mimeType === undefined ? undefined : str(asset.mimeType, "", 120),
    bytes: asset.bytes === undefined ? undefined : num(asset.bytes, 0, 0, 1024 * 1024 * 1024),
    source: sourceObjectV2(asset.source, {
      kind: "user",
      objectIds: stringIds(asset.sourceObjectIds),
      assetIds: [assetId],
    }),
    metadata: plainRecord(asset.metadata),
  };
}

export function sanitizeTemplateModel(input: unknown): TemplateModelV1 {
  const raw = object(input);
  const layout = sanitizeLayout(object(raw.styles).layout ?? raw.layout ?? defaultLayout());
  const metadata = object(raw.metadata);
  const regions = array(raw.regions).length
    ? array(raw.regions).map((entry, index) => {
        const region = object(entry);
        const kind = oneOf(region.kind, REGION_KINDS, "custom");
        return {
          id: id(region.id, `region-${index + 1}`),
          kind,
          label: str(region.label, kind, 200),
        };
      })
    : DEFAULT_REGIONS.map((region) => ({ ...region }));
  const regionIds = new Set(regions.map((region) => region.id));
  const fallbackRegion = regions.find((region) => region.kind === "body")?.id ?? regions[0]!.id;

  return {
    model: TEMPLATE_MODEL_KIND,
    version: TEMPLATE_MODEL_VERSION,
    page: pageFromInput(raw, layout),
    regions,
    nodes: array(raw.nodes).map((entry, index) => {
      const node = object(entry);
      const regionId = id(node.regionId, fallbackRegion);
      return {
        id: id(node.id, `node-${index + 1}`),
        type: oneOf(node.type, NODE_TYPES, "text"),
        regionId: regionIds.has(regionId) ? regionId : fallbackRegion,
        scope: oneOf(node.scope, SCOPES, "all"),
        bbox: bbox(node.bbox),
        style: plainRecord(node.style),
        sourceObjectIds: stringIds(node.sourceObjectIds),
        locked: bool(node.locked, false),
        visibleWhen: node.visibleWhen === undefined ? undefined : str(node.visibleWhen, "", 500),
        text: node.text === undefined ? undefined : str(node.text, "", 10_000),
        fieldId: node.fieldId === undefined ? undefined : fieldId(node.fieldId, "custom.field"),
        assetId: node.assetId === undefined ? undefined : id(node.assetId, ""),
        children: node.children === undefined ? undefined : stringIds(node.children),
      };
    }),
    fields: array(raw.fields).map((entry, index) => {
      const field = object(entry);
      return {
        id: fieldId(field.id, `custom.field_${index + 1}`),
        label: str(field.label, str(field.id, `Champ ${index + 1}`, 120), 200),
        type: oneOf(field.type, FIELD_TYPES, "text"),
        required: bool(field.required, false),
        defaultValue: defaultValue(field.defaultValue),
        format: field.format === undefined ? undefined : str(field.format, "", 120),
        sourceObjectIds: stringIds(field.sourceObjectIds),
        confidence: num(field.confidence, 1, 0, 1),
      };
    }),
    assets: array(raw.assets).map((entry, index) => {
      const asset = object(entry);
      return {
        id: id(asset.id, `asset-${index + 1}`),
        file: asset.file === undefined ? undefined : str(asset.file, "", 500),
        name: asset.name === undefined ? undefined : str(asset.name, "", 500),
        sourceObjectIds: stringIds(asset.sourceObjectIds),
      };
    }),
    styles: { layout },
    metadata: {
      name: metadata.name === undefined ? undefined : str(metadata.name, "", 500),
      layoutConfigCompatible: bool(metadata.layoutConfigCompatible, true),
    },
  };
}

export function sanitizeTemplateModelV2(input: unknown): TemplateModelV2 {
  const raw = object(input);
  if (raw.version === TEMPLATE_MODEL_VERSION) {
    return templateModelV1ToV2(sanitizeTemplateModel(raw));
  }

  const layout = sanitizeLayout(object(raw.styles).layout ?? raw.layout ?? defaultLayout());
  const metadata = object(raw.metadata);
  const regions = regionsV2(raw.regions);

  return {
    model: TEMPLATE_MODEL_KIND,
    version: TEMPLATE_MODEL_V2_VERSION,
    page: pageFromInput(raw, layout),
    regions,
    nodes: array(raw.nodes).map((entry, index) => sanitizeNodeV2(entry, index, regions)),
    fields: array(raw.fields).map((entry, index) => sanitizeFieldV2(entry, index)),
    assets: array(raw.assets).map((entry, index) => sanitizeAssetV2(entry, index)),
    styles: {
      layout,
      tokens: plainRecord(object(raw.styles).tokens),
    },
    metadata: {
      name: metadata.name === undefined ? undefined : str(metadata.name, "", 500),
      layoutConfigCompatible: bool(metadata.layoutConfigCompatible, true),
      migratedFromVersion: metadata.migratedFromVersion === undefined
        ? undefined
        : Math.trunc(num(metadata.migratedFromVersion, TEMPLATE_MODEL_VERSION, 1, TEMPLATE_MODEL_V2_VERSION)),
      sourceImportId: metadata.sourceImportId === undefined ? undefined : id(metadata.sourceImportId, ""),
      notes: array(metadata.notes).map((note) => str(note, "", 500)).filter(Boolean),
    },
  };
}

function v1RegionKindToV2(kind: TemplateRegionKind): TemplateRegionKindV2 {
  return kind;
}

function v1ScopeToV2(scope: TemplateScope): TemplateScopeV2 {
  return scope;
}

function v1RegionsToV2(regions: readonly TemplateRegion[]): TemplateRegionV2[] {
  return regionsV2(regions.map((region) => ({
    ...region,
    kind: v1RegionKindToV2(region.kind),
    scope: "all",
    locked: false,
    source: { kind: "user", objectIds: [], assetIds: [] },
    confidence: 1,
  })));
}

function v1NodeToV2(
  node: TemplateNode,
  index: number,
  regions: readonly TemplateRegionV2[],
  fields: readonly TemplateField[],
): TemplateNodeV2 {
  const region = resolveRegionV2({ regionId: node.regionId }, regions);
  const common = {
    id: node.id,
    region: region.region,
    regionId: region.regionId,
    scope: v1ScopeToV2(node.scope),
    bbox: node.bbox,
    layout: layoutV2(undefined, node.bbox),
    style: node.style,
    source: sourceObjectV2({ kind: "user", objectIds: node.sourceObjectIds, assetIds: node.assetId ? [node.assetId] : [] }),
    confidence: 1,
    locked: node.locked,
    visibleWhen: node.visibleWhen,
    order: index,
  };
  if (node.type === "field") {
    const field = fields.find((candidate) => candidate.id === node.fieldId);
    return {
      ...common,
      type: "field",
      fieldId: node.fieldId ?? `field-${index + 1}`,
      fieldType: field?.type ?? "text",
      label: field?.label,
    };
  }
  if (node.type === "image" || node.type === "raster") {
    return {
      ...common,
      type: "image",
      imageKind: node.type === "raster" ? "raster-region" : "embedded",
      assetId: node.assetId,
      alt: node.text,
    };
  }
  if (node.type === "shape") {
    return { ...common, type: "shape", shape: "unknown" };
  }
  if (node.type === "line") {
    return { ...common, type: "line" };
  }
  if (node.type === "table") {
    return { ...common, type: "table", columns: [], rows: [] };
  }
  if (node.type === "group") {
    return { ...common, type: "group", children: node.children ?? [], clipping: false };
  }
  if (node.type === "pageNumber") {
    const style = object(node.style);
    return {
      ...common,
      type: "pageNumber",
      numbering: oneOf(style.numbering, ["none", "n", "n-of-total", "page-n-of-total"] as const, "n-of-total"),
      align: oneOf(style.align, ["left", "center", "right"] as const, "center"),
    };
  }
  return { ...common, type: "text", text: node.text ?? "" };
}

export function templateModelV1ToV2(input: TemplateModelV1): TemplateModelV2 {
  const v1 = sanitizeTemplateModel(input);
  const regions = v1RegionsToV2(v1.regions);
  return sanitizeTemplateModelV2({
    model: TEMPLATE_MODEL_KIND,
    version: TEMPLATE_MODEL_V2_VERSION,
    page: v1.page,
    regions,
    nodes: v1.nodes.map((node, index) => v1NodeToV2(node, index, regions, v1.fields)),
    fields: v1.fields.map((field) => ({
      id: field.id,
      label: field.label,
      type: field.type,
      required: field.required,
      defaultValue: field.defaultValue,
      format: field.format,
      source: { kind: "user", objectIds: field.sourceObjectIds, assetIds: [] },
      confidence: field.confidence,
      aliases: [],
    })),
    assets: v1.assets.map((asset) => ({
      id: asset.id,
      file: asset.file,
      name: asset.name,
      source: { kind: "user", objectIds: asset.sourceObjectIds, assetIds: [asset.id] },
    })),
    styles: v1.styles,
    metadata: {
      ...v1.metadata,
      migratedFromVersion: TEMPLATE_MODEL_VERSION,
      notes: ["Migrated from TemplateModel v1."],
    },
  });
}

export function isTemplateModelV1(input: unknown): input is TemplateModelV1 {
  const raw = input as Partial<TemplateModelV1> | null;
  return Boolean(
    raw &&
      raw.model === TEMPLATE_MODEL_KIND &&
      raw.version === TEMPLATE_MODEL_VERSION &&
      raw.page &&
      Array.isArray(raw.regions) &&
      Array.isArray(raw.nodes) &&
      Array.isArray(raw.fields) &&
      Array.isArray(raw.assets) &&
      raw.styles,
  );
}

export function isTemplateModelV2(input: unknown): input is TemplateModelV2 {
  const raw = input as Partial<TemplateModelV2> | null;
  return Boolean(
    raw &&
      raw.model === TEMPLATE_MODEL_KIND &&
      raw.version === TEMPLATE_MODEL_V2_VERSION &&
      raw.page &&
      Array.isArray(raw.regions) &&
      Array.isArray(raw.nodes) &&
      Array.isArray(raw.fields) &&
      Array.isArray(raw.assets) &&
      raw.styles,
  );
}

export function migrateTemplateModel(input: unknown): TemplateModelV1 {
  return sanitizeTemplateModel(input);
}

export function migrateTemplateModelToV2(input: unknown): TemplateModelV2 {
  return sanitizeTemplateModelV2(input);
}
