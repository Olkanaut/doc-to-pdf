import type { ImportBBox, ImportProvenance } from "./importModel.js";

export const FIELD_TYPES = ["text", "date", "image", "address", "number", "richText"] as const;
export const FIELD_SOURCE_CANDIDATE_KINDS = [
  "pdf-text",
  "pdf-image",
  "pdf-vector",
  "docx-xml",
  "docx-media",
  "metadata",
  "filename",
  "rendered-page",
  "user",
  "ai",
] as const;

export type TypedFieldType = (typeof FIELD_TYPES)[number];
export type FieldSourceCandidateKind = (typeof FIELD_SOURCE_CANDIDATE_KINDS)[number];
export type BuiltinFieldId =
  | "document.title"
  | "document.reference"
  | "document.date"
  | "organization.name"
  | "organization.logo"
  | "recipient.name"
  | "recipient.address"
  | "signature.name"
  | "signature.image";
export type CustomFieldId = `custom.${string}`;
export type RegistryFieldId = BuiltinFieldId | CustomFieldId;

export interface FieldSourceCandidate {
  kind: FieldSourceCandidateKind;
  objectIds: string[];
  assetIds: string[];
  confidence: number;
  importModelId?: string;
  note?: string;
}

export interface FieldDefinition {
  id: RegistryFieldId;
  label: string;
  type: TypedFieldType;
  required: boolean;
  defaultValue?: string | number | boolean | null;
  format?: string;
  group: "document" | "organization" | "recipient" | "signature" | "custom";
  description?: string;
}

export interface FieldCandidate {
  id: string;
  fieldId: RegistryFieldId;
  label: string;
  type: TypedFieldType;
  required: boolean;
  defaultValue?: string | number | boolean | null;
  format?: string;
  proposedValue?: string | number | boolean | null;
  sourceCandidate: FieldSourceCandidate;
  sourceObjectIds: string[];
  bbox?: ImportBBox;
  confidence: number;
  reason?: string;
  metadata?: Record<string, unknown>;
}

export const BUILTIN_FIELD_DEFINITIONS: readonly FieldDefinition[] = [
  { id: "document.title", label: "Titre du document", type: "text", required: false, group: "document" },
  { id: "document.reference", label: "Reference", type: "text", required: false, group: "document" },
  { id: "document.date", label: "Date du document", type: "date", required: false, group: "document", format: "yyyy-mm-dd" },
  { id: "organization.name", label: "Organisation", type: "text", required: false, group: "organization" },
  { id: "organization.logo", label: "Logo organisation", type: "image", required: false, group: "organization" },
  { id: "recipient.name", label: "Nom destinataire", type: "text", required: false, group: "recipient" },
  { id: "recipient.address", label: "Adresse destinataire", type: "address", required: false, group: "recipient" },
  { id: "signature.name", label: "Nom signataire", type: "text", required: false, group: "signature" },
  { id: "signature.image", label: "Image signature", type: "image", required: false, group: "signature" },
];

const BUILTIN_FIELD_IDS = new Set<string>(BUILTIN_FIELD_DEFINITIONS.map((field) => field.id));
const FIELD_DEFINITIONS_BY_ID = new Map<string, FieldDefinition>(
  BUILTIN_FIELD_DEFINITIONS.map((field) => [field.id, field]),
);

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
  const raw = str(value, fallback, 160).trim();
  return /^[a-zA-Z0-9_.:-]+$/.test(raw) ? raw : fallback;
}

function stringIds(value: unknown): string[] {
  return array(value)
    .map((entry, index) => id(entry, `item-${index + 1}`))
    .filter(Boolean);
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

function bbox(value: unknown): ImportBBox | undefined {
  const raw = object(value);
  if (!Object.keys(raw).length) return undefined;
  return {
    x: num(raw.x, 0, -100_000, 100_000),
    y: num(raw.y, 0, -100_000, 100_000),
    width: num(raw.width, 1, 0, 100_000),
    height: num(raw.height, 1, 0, 100_000),
  };
}

function titleizeCustomField(id: string): string {
  const tail = id.replace(/^custom\./, "").split(/[.:_-]/).filter(Boolean).pop() ?? "field";
  return tail.charAt(0).toUpperCase() + tail.slice(1);
}

export function isBuiltinFieldId(value: unknown): value is BuiltinFieldId {
  return typeof value === "string" && BUILTIN_FIELD_IDS.has(value);
}

export function isCustomFieldId(value: unknown): value is CustomFieldId {
  return typeof value === "string" && /^custom\.[a-zA-Z0-9_-]+(?:[.:][a-zA-Z0-9_-]+)*$/.test(value);
}

export function isRegistryFieldId(value: unknown): value is RegistryFieldId {
  return isBuiltinFieldId(value) || isCustomFieldId(value);
}

export function sanitizeFieldId(value: unknown, fallback: RegistryFieldId = "custom.field"): RegistryFieldId {
  return isRegistryFieldId(value) ? value : fallback;
}

export function sanitizeFieldType(value: unknown, fallback: TypedFieldType = "text"): TypedFieldType {
  return oneOf(value, FIELD_TYPES, fallback);
}

export function fieldDefinitionForId(fieldId: RegistryFieldId): FieldDefinition {
  const builtin = FIELD_DEFINITIONS_BY_ID.get(fieldId);
  if (builtin) return { ...builtin };
  return {
    id: fieldId,
    label: titleizeCustomField(fieldId),
    type: "text",
    required: false,
    group: "custom",
  };
}

export function sanitizeFieldSourceCandidate(
  input: unknown,
  fallback: Partial<FieldSourceCandidate> = {},
): FieldSourceCandidate {
  const raw = object(input);
  const fallbackKind = fallback.kind ?? "user";
  return {
    kind: oneOf(raw.kind, FIELD_SOURCE_CANDIDATE_KINDS, fallbackKind),
    objectIds: stringIds(raw.objectIds ?? raw.sourceObjectIds).length
      ? stringIds(raw.objectIds ?? raw.sourceObjectIds)
      : (fallback.objectIds ?? []),
    assetIds: stringIds(raw.assetIds).length ? stringIds(raw.assetIds) : (fallback.assetIds ?? []),
    confidence: num(raw.confidence, fallback.confidence ?? 1, 0, 1),
    importModelId: raw.importModelId === undefined ? fallback.importModelId : id(raw.importModelId, fallback.importModelId ?? ""),
    note: raw.note === undefined ? fallback.note : str(raw.note, "", 500),
  };
}

export function sanitizeFieldDefinition(input: unknown): FieldDefinition {
  const raw = object(input);
  const fieldId = sanitizeFieldId(raw.id);
  const defaults = fieldDefinitionForId(fieldId);
  return {
    id: fieldId,
    label: str(raw.label, defaults.label, 200),
    type: sanitizeFieldType(raw.type, defaults.type),
    required: bool(raw.required, defaults.required),
    defaultValue: defaultValue(raw.defaultValue === undefined ? defaults.defaultValue : raw.defaultValue),
    format: raw.format === undefined ? defaults.format : str(raw.format, "", 120),
    group: oneOf(raw.group, ["document", "organization", "recipient", "signature", "custom"] as const, defaults.group),
    description: raw.description === undefined ? defaults.description : str(raw.description, "", 500),
  };
}

export function sanitizeFieldCandidate(input: unknown, index = 0): FieldCandidate {
  const raw = object(input);
  const fieldId = sanitizeFieldId(raw.fieldId ?? raw.id, `custom.candidate_${index + 1}`);
  const defaults = fieldDefinitionForId(fieldId);
  const type = sanitizeFieldType(raw.type, defaults.type);
  const candidateId = id(raw.id, `candidate-${fieldId.replace(/[^a-zA-Z0-9]+/g, "-")}-${index + 1}`);
  const sourceCandidate = sanitizeFieldSourceCandidate(raw.sourceCandidate, {
    kind: "user",
    objectIds: stringIds(raw.sourceObjectIds),
    assetIds: stringIds(raw.assetIds),
    confidence: num(raw.confidence, 1, 0, 1),
  });

  return {
    id: candidateId,
    fieldId,
    label: str(raw.label, defaults.label, 200),
    type,
    required: bool(raw.required, defaults.required),
    defaultValue: defaultValue(raw.defaultValue === undefined ? defaults.defaultValue : raw.defaultValue),
    format: raw.format === undefined ? defaults.format : str(raw.format, "", 120),
    proposedValue: defaultValue(raw.proposedValue),
    sourceCandidate,
    sourceObjectIds: stringIds(raw.sourceObjectIds).length
      ? stringIds(raw.sourceObjectIds)
      : sourceCandidate.objectIds,
    bbox: bbox(raw.bbox),
    confidence: num(raw.confidence, sourceCandidate.confidence, 0, 1),
    reason: raw.reason === undefined ? undefined : str(raw.reason, "", 500),
    metadata: plainRecord(raw.metadata),
  };
}

export function importProvenanceToFieldSourceKind(provenance: ImportProvenance): FieldSourceCandidateKind {
  if (provenance === "manual") return "user";
  if (provenance === "ocr") return "ai";
  return oneOf(provenance, FIELD_SOURCE_CANDIDATE_KINDS, "user");
}
