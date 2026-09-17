export const IMPORT_MODEL_KIND = "import" as const;
export const IMPORT_MODEL_VERSION = 1 as const;

export type ImportSourceKind = "pdf" | "docx" | "image" | "unknown";
export type ImportZoneKind = "header" | "footer" | "body" | "background" | "custom";
export type ImportObjectType = "text" | "image" | "shape" | "line" | "rasterRegion" | "unknown";
export type ImportProvenance =
  | "pdf-text"
  | "pdf-image"
  | "pdf-vector"
  | "docx-xml"
  | "docx-media"
  | "ocr"
  | "rendered-page"
  | "manual"
  | "ai";

export interface ImportBBox {
  /** Points, origin at the top-left of the page. */
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ImportSource {
  kind: ImportSourceKind;
  name?: string;
  bytes?: number;
  mimeType?: string;
}

export interface ImportPage {
  id: string;
  pageIndex: number;
  widthPt: number;
  heightPt: number;
  rotation: 0 | 90 | 180 | 270;
}

export interface ImportZone {
  id: string;
  kind: ImportZoneKind;
  pageIndex: number;
  bbox: ImportBBox;
  confidence: number;
  provenance: ImportProvenance;
}

export interface ImportObject {
  id: string;
  type: ImportObjectType;
  pageIndex: number;
  bbox: ImportBBox;
  provenance: ImportProvenance;
  confidence: number;
  zoneId?: string;
  text?: string;
  assetId?: string;
  style?: Record<string, unknown>;
  raw?: Record<string, unknown>;
}

export interface ImportAsset {
  id: string;
  name?: string;
  file?: string;
  mimeType?: string;
  bytes?: number;
  provenance: ImportProvenance;
}

export interface ImportWarning {
  code: string;
  message: string;
  objectId?: string;
}

export interface ImportModelV1 {
  model: typeof IMPORT_MODEL_KIND;
  version: typeof IMPORT_MODEL_VERSION;
  source: ImportSource;
  pages: ImportPage[];
  zones: ImportZone[];
  objects: ImportObject[];
  assets: ImportAsset[];
  warnings: ImportWarning[];
}

const SOURCE_KINDS: readonly ImportSourceKind[] = ["pdf", "docx", "image", "unknown"];
const ZONE_KINDS: readonly ImportZoneKind[] = ["header", "footer", "body", "background", "custom"];
const OBJECT_TYPES: readonly ImportObjectType[] = ["text", "image", "shape", "line", "rasterRegion", "unknown"];
const PROVENANCES: readonly ImportProvenance[] = [
  "pdf-text",
  "pdf-image",
  "pdf-vector",
  "docx-xml",
  "docx-media",
  "ocr",
  "rendered-page",
  "manual",
  "ai",
];
const ROTATIONS = [0, 90, 180, 270] as const;

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

function rotation(value: unknown): ImportPage["rotation"] {
  return (ROTATIONS as readonly unknown[]).includes(value) ? (value as ImportPage["rotation"]) : 0;
}

function num(value: unknown, fallback: number, min: number, max: number): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function str(value: unknown, fallback = "", max = 500): string {
  return typeof value === "string" ? value.slice(0, max) : fallback;
}

function id(value: unknown, fallback: string): string {
  const raw = str(value, fallback, 120).trim();
  return /^[a-zA-Z0-9_.:-]+$/.test(raw) ? raw : fallback;
}

function bbox(value: unknown): ImportBBox {
  const box = object(value);
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

export function sanitizeImportModel(input: unknown): ImportModelV1 {
  const raw = object(input);
  const source = object(raw.source);

  return {
    model: IMPORT_MODEL_KIND,
    version: IMPORT_MODEL_VERSION,
    source: {
      kind: oneOf(source.kind, SOURCE_KINDS, "unknown"),
      name: source.name === undefined ? undefined : str(source.name, "", 500),
      bytes: source.bytes === undefined ? undefined : num(source.bytes, 0, 0, 1024 * 1024 * 1024),
      mimeType: source.mimeType === undefined ? undefined : str(source.mimeType, "", 120),
    },
    pages: array(raw.pages).map((entry, index) => {
      const page = object(entry);
      return {
        id: id(page.id, `page-${index + 1}`),
        pageIndex: Math.trunc(num(page.pageIndex, index, 0, 10_000)),
        widthPt: num(page.widthPt, 595.28, 1, 100_000),
        heightPt: num(page.heightPt, 841.89, 1, 100_000),
        rotation: rotation(page.rotation),
      };
    }),
    zones: array(raw.zones).map((entry, index) => {
      const zone = object(entry);
      return {
        id: id(zone.id, `zone-${index + 1}`),
        kind: oneOf(zone.kind, ZONE_KINDS, "custom"),
        pageIndex: Math.trunc(num(zone.pageIndex, 0, 0, 10_000)),
        bbox: bbox(zone.bbox),
        confidence: num(zone.confidence, 1, 0, 1),
        provenance: oneOf(zone.provenance, PROVENANCES, "manual"),
      };
    }),
    objects: array(raw.objects).map((entry, index) => {
      const item = object(entry);
      return {
        id: id(item.id, `object-${index + 1}`),
        type: oneOf(item.type, OBJECT_TYPES, "unknown"),
        pageIndex: Math.trunc(num(item.pageIndex, 0, 0, 10_000)),
        bbox: bbox(item.bbox),
        provenance: oneOf(item.provenance, PROVENANCES, "manual"),
        confidence: num(item.confidence, 1, 0, 1),
        zoneId: item.zoneId === undefined ? undefined : id(item.zoneId, ""),
        text: item.text === undefined ? undefined : str(item.text, "", 10_000),
        assetId: item.assetId === undefined ? undefined : id(item.assetId, ""),
        style: plainRecord(item.style),
        raw: plainRecord(item.raw),
      };
    }),
    assets: array(raw.assets).map((entry, index) => {
      const asset = object(entry);
      return {
        id: id(asset.id, `asset-${index + 1}`),
        name: asset.name === undefined ? undefined : str(asset.name, "", 500),
        file: asset.file === undefined ? undefined : str(asset.file, "", 500),
        mimeType: asset.mimeType === undefined ? undefined : str(asset.mimeType, "", 120),
        bytes: asset.bytes === undefined ? undefined : num(asset.bytes, 0, 0, 1024 * 1024 * 1024),
        provenance: oneOf(asset.provenance, PROVENANCES, "manual"),
      };
    }),
    warnings: array(raw.warnings).map((entry, index) => {
      const warning = object(entry);
      return {
        code: id(warning.code, `warning-${index + 1}`),
        message: str(warning.message, "", 2_000),
        objectId: warning.objectId === undefined ? undefined : id(warning.objectId, ""),
      };
    }),
  };
}

export function isImportModelV1(input: unknown): input is ImportModelV1 {
  const raw = input as Partial<ImportModelV1> | null;
  return Boolean(
    raw &&
      raw.model === IMPORT_MODEL_KIND &&
      raw.version === IMPORT_MODEL_VERSION &&
      raw.source &&
      Array.isArray(raw.pages) &&
      Array.isArray(raw.zones) &&
      Array.isArray(raw.objects) &&
      Array.isArray(raw.assets) &&
      Array.isArray(raw.warnings),
  );
}

export function migrateImportModel(input: unknown): ImportModelV1 {
  return sanitizeImportModel(input);
}
