import { defaultLayout, sanitizeLayout, type LayoutConfig } from "../layout/layoutConfig.js";
import type { ImportBBox } from "./importModel.js";

export const TEMPLATE_MODEL_KIND = "template" as const;
export const TEMPLATE_MODEL_VERSION = 1 as const;

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

const REGION_KINDS: readonly TemplateRegionKind[] = ["header", "footer", "body", "background", "custom"];
const NODE_TYPES: readonly TemplateNodeType[] = ["text", "field", "image", "shape", "line", "table", "group", "pageNumber", "raster"];
const SCOPES: readonly TemplateScope[] = ["all", "first", "except-first"];
const FIELD_TYPES: readonly FieldType[] = ["text", "date", "image", "number", "richText"];

export const DEFAULT_REGIONS: readonly TemplateRegion[] = [
  { id: "region-header", kind: "header", label: "En-tete" },
  { id: "region-body", kind: "body", label: "Corps" },
  { id: "region-footer", kind: "footer", label: "Pied de page" },
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

export function sanitizeTemplateModel(input: unknown): TemplateModelV1 {
  const raw = object(input);
  const layout = sanitizeLayout(object(raw.styles).layout ?? raw.layout ?? defaultLayout());
  const page = object(raw.page);
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
    page: {
      paper: oneOf(page.paper, ["a4", "a5", "us-letter"] as const, layout.paper),
      orientation: oneOf(page.orientation, ["portrait", "landscape"] as const, layout.orientation),
      margins: sanitizeLayout({ margins: page.margins ?? layout.margins }).margins,
    },
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

export function migrateTemplateModel(input: unknown): TemplateModelV1 {
  return sanitizeTemplateModel(input);
}
