export interface TemplateSummary {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  /** Posé par le backend : cette template est celle appliquée par défaut. */
  isDefault?: boolean;
}

export interface TemplateDetail extends TemplateSummary {
  source: string;
}

export interface FixtureSummary {
  id: string;
  name: string;
}

export interface AuthUser {
  sub: string;
  email?: string;
  name?: string;
  preferredUsername?: string;
  givenName?: string;
  familyName?: string;
}

export interface SessionInfo {
  authenticated: boolean;
  user: AuthUser | null;
}

export interface DocsDocumentContent {
  id: string;
  title: string;
  blocks: Record<string, unknown>[];
  createdAt: string;
  updatedAt: string;
}

export interface DocsDocumentSummary {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface AuthCallbackResult {
  authenticated: true;
  user: AuthUser;
  returnTo: string;
}

async function asJson<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const data = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(data.error ?? `Request failed (${res.status})`);
  }
  return res.json();
}

function apiFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
): Promise<Response> {
  return fetch(input, {
    ...init,
    credentials: "include",
  });
}

export async function fetchSession(): Promise<SessionInfo> {
  const res = await apiFetch("/api/auth/me");
  const data = await asJson<SessionInfo>(res);
  return {
    authenticated: data.authenticated,
    user: data.authenticated ? data.user : null,
  };
}

export async function completeLogin(
  code: string,
  state: string,
): Promise<AuthCallbackResult> {
  return asJson(
    await apiFetch("/api/auth/callback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, state }),
    }),
  );
}

export async function logout(): Promise<void> {
  const res = await apiFetch("/api/auth/logout", { method: "POST" });
  if (!res.ok) throw new Error("Failed to logout");
}

export async function fetchTemplates(): Promise<TemplateSummary[]> {
  return asJson(await apiFetch("/api/templates"));
}

export async function fetchTemplateDetail(id: string): Promise<TemplateDetail> {
  return asJson(await apiFetch(`/api/templates/${id}`));
}

export async function createTemplate(input: {
  name: string;
  description: string;
  source?: string;
}): Promise<TemplateSummary> {
  return asJson(
    await apiFetch("/api/templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),
  );
}

export async function updateTemplate(
  id: string,
  patch: { name?: string; description?: string; source?: string },
): Promise<TemplateSummary> {
  return asJson(
    await apiFetch(`/api/templates/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    }),
  );
}

export async function deleteTemplate(id: string): Promise<void> {
  const res = await apiFetch(`/api/templates/${id}`, { method: "DELETE" });
  if (!res.ok && res.status !== 204) {
    const data = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(data.error ?? `Request failed (${res.status})`);
  }
}

export async function fetchFixtures(): Promise<FixtureSummary[]> {
  return asJson(await apiFetch("/api/fixtures"));
}

export async function fetchDocumentContent(
  documentId: string,
): Promise<DocsDocumentContent> {
  return asJson(
    await apiFetch(`/api/documents/${encodeURIComponent(documentId)}/content`),
  );
}

export async function searchDocsDocuments(
  query: string,
  limit = 8,
  signal?: AbortSignal,
): Promise<DocsDocumentSummary[]> {
  const params = new URLSearchParams({
    q: query,
    limit: String(limit),
  });
  return asJson(
    await apiFetch(`/api/documents/search?${params.toString()}`, { signal }),
  );
}

export interface RenderRequest {
  fixtureId: string;
  templateId?: string;
  templateSource?: string;
}

export interface RenderResult {
  ok: true;
  blob: Blob;
}

export interface RenderError {
  ok: false;
  error: string;
  details?: string;
}

export async function renderPdf(
  req: RenderRequest,
): Promise<RenderResult | RenderError> {
  const res = await apiFetch("/api/render", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({ error: "Unknown error" }));
    return {
      ok: false,
      error: data.error ?? "Unknown error",
      details: data.details,
    };
  }
  const blob = await res.blob();
  return { ok: true, blob };
}

// ── Template par défaut ───────────────────────────────────────────────────────

export async function fetchDefaultTemplate(): Promise<TemplateSummary | null> {
  const res = await fetch("/api/templates/default");
  if (res.status === 404) return null;
  return asJson(res);
}

export async function setDefaultTemplate(
  templateId: string,
): Promise<TemplateSummary> {
  return asJson(
    await fetch("/api/templates/default", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ templateId }),
    }),
  );
}

// ── Compilation de test (import, assistant) ───────────────────────────────────

export interface CheckResult {
  ok: true;
  /** Durée de `typst compile`, en ms. */
  ms: number;
  pages: number;
  /** Lignes `warning:` de Typst, telles quelles (police absente, etc.). */
  warnings: string[];
}
export interface CheckFailure {
  ok: false;
  error: string;
  details?: string;
}

export async function checkTemplateSource(input: {
  source: string;
  fixtureId?: string;
}): Promise<CheckResult | CheckFailure> {
  const res = await fetch("/api/templates/check", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return res.json();
}

export interface TemplateAssets {
  assets: { file: string }[];
  /** True when DOTS_ENABLE_ASSET_DELETE is enabled on the backend: deletion is possible. */
  canDelete: boolean;
}

export async function fetchTemplateAssets(): Promise<TemplateAssets> {
  return asJson(await fetch("/api/templates/assets"));
}

/** URL des octets d'un asset : vignettes de la galerie d'en-tête et de pied de page. */
export function assetUrl(file: string): string {
  return `/api/templates/assets/${encodeURIComponent(file)}`;
}

/** Only available when DOTS_ENABLE_ASSET_DELETE=1 (demo cleanup). */
export async function deleteTemplateAsset(file: string): Promise<void> {
  const res = await apiFetch(
    `/api/templates/assets/${encodeURIComponent(file)}`,
    { method: "DELETE" },
  );
  if (!res.ok && res.status !== 204) {
    const data = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(data.error ?? `Request failed (${res.status})`);
  }
}

/** Dépose un PNG, JPEG ou SVG tel quel dans les assets partagés : pas de recadrage, juste un logo. */
export async function uploadTemplateAsset(file: File): Promise<{ file: string }> {
  const fileBase64 = await toBase64(file);
  return asJson(
    await apiFetch("/api/templates/assets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fileBase64, filename: file.name }),
    }),
  );
}

// ── Import d'un PDF ou d'un .docx ─────────────────────────────────────────────

export interface IngestRegion {
  kind: "header" | "footer" | "page";
  /** Points, repère de la page PDF (origine en haut à gauche). */
  x: number;
  y: number;
  width: number;
  height: number;
  /** La zone est dessinée (tracés) et non posée en bitmap : extractible en SVG. */
  vector: boolean;
}

export interface IngestRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Visuel sorti tel quel d'un .docx : il n'y a pas de page à recadrer. */
export interface IngestAsset {
  id: string;
  name: string;
  kind: "header" | "footer" | "body";
  vector: boolean;
  bytes: number;
  widthPt: number;
  heightPt: number;
}

export interface IngestAnalysis {
  jobId: string;
  /**
   * « page » : la première page est rendue et des bandes y sont proposées.
   * « assets » : le .docx portait ses visuels en clair, ils sont repris tels
   * quels — rien n'est rendu, donc il n'y a rien à recadrer.
   */
  mode: "page" | "assets";
  page: {
    widthPt: number;
    heightPt: number;
    count: number;
    previewScale: number;
  };
  regions: IngestRegion[];
  assets?: IngestAsset[];
  layout: Pick<
    LayoutConfig,
    "paper" | "orientation" | "margins" | "font" | "fontSize" | "lineHeight"
  > & {
    headings: LayoutConfig["headings"];
  };
  /** Police du document absente du serveur, remplacée par Marianne. */
  fontSubstitution: string | null;
  counts: { text: number; shapes: number; images: number };
  /** Observation structurée du document importé, plus riche que les zones historiques. */
  importModel: ImportModelV1;
  /** Proposition éditable initiale, construite côté backend depuis l'ImportModel. */
  templateModel: TemplateModelV2;
}

export interface IngestFragment {
  file: string;
  widthPt: number;
  heightPt: number;
}

export type ImportSourceKind = "pdf" | "docx" | "image" | "unknown";
export type ImportZoneKind = "header" | "footer" | "body" | "background" | "custom";
export type ImportObjectType =
  | "text"
  | "image"
  | "shape"
  | "line"
  | "table"
  | "rasterRegion"
  | "unknown";
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
  x: number;
  y: number;
  width: number;
  height: number;
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
  model: "import";
  version: 1;
  source: {
    kind: ImportSourceKind;
    name?: string;
    bytes?: number;
    mimeType?: string;
  };
  pages: ImportPage[];
  zones: ImportZone[];
  objects: ImportObject[];
  assets: ImportAsset[];
  warnings: ImportWarning[];
}

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
export type TypedFieldType = "text" | "date" | "image" | "address" | "number" | "richText";
export type RegistryFieldId =
  | "document.title"
  | "document.reference"
  | "document.date"
  | "organization.name"
  | "organization.logo"
  | "recipient.name"
  | "recipient.address"
  | "signature.name"
  | "signature.image"
  | `custom.${string}`;

export interface TemplateSourceV2 {
  kind: TemplateSourceKindV2;
  objectIds: string[];
  assetIds: string[];
  importModelId?: string;
  note?: string;
}

export interface FieldSourceCandidate {
  kind:
    | "pdf-text"
    | "pdf-image"
    | "pdf-vector"
    | "docx-xml"
    | "docx-media"
    | "metadata"
    | "filename"
    | "rendered-page"
    | "user"
    | "ai";
  objectIds: string[];
  assetIds: string[];
  confidence: number;
  importModelId?: string;
  note?: string;
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

export interface TemplateNodeLayoutV2 {
  mode: "absolute" | "flow" | "anchored" | "inline" | "unknown";
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

export interface TemplateBaseNodeV2 {
  id: string;
  type: TemplateNodeTypeV2;
  region: TemplateRegionKindV2;
  regionId: string;
  pageIndex?: number;
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

export interface TextNode extends TemplateBaseNodeV2 {
  type: "text";
  text: string;
}
export interface FieldNode extends TemplateBaseNodeV2 {
  type: "field";
  fieldId: RegistryFieldId;
  fieldType: TypedFieldType;
  label?: string;
  placeholder?: string;
  binding?: Record<string, unknown>;
}
export interface ImageNode extends TemplateBaseNodeV2 {
  type: "image";
  imageKind: "embedded" | "linked" | "raster-region" | "placeholder";
  assetId?: string;
  alt?: string;
  fit?: "contain" | "cover" | "fill" | "none";
  crop?: Record<string, unknown>;
}
export interface ShapeNode extends TemplateBaseNodeV2 {
  type: "shape";
  shape: "rect" | "ellipse" | "polygon" | "path" | "unknown";
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
export interface TableNode extends TemplateBaseNodeV2 {
  type: "table";
  columns: Array<{ id: string; label?: string; width?: number; style?: Record<string, unknown> }>;
  rows: Array<Array<{ text?: string; fieldId?: RegistryFieldId; rowSpan: number; colSpan: number }>>;
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
  id: RegistryFieldId;
  label: string;
  type: TypedFieldType;
  required: boolean;
  defaultValue?: string | number | boolean | null;
  format?: string;
  source: TemplateSourceV2;
  sourceCandidate: FieldSourceCandidate;
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
  model: "template";
  version: 2;
  page: {
    paper: LayoutConfig["paper"];
    orientation: LayoutConfig["orientation"];
    margins: LayoutConfig["margins"];
  };
  regions: TemplateRegionV2[];
  nodes: TemplateNodeV2[];
  fields: TemplateFieldV2[];
  fieldCandidates: FieldCandidate[];
  assets: TemplateAssetV2[];
  styles: { layout: LayoutConfig; tokens?: Record<string, unknown> };
  metadata: {
    name?: string;
    layoutConfigCompatible: boolean;
    migratedFromVersion?: number;
    sourceImportId?: string;
    notes: string[];
  };
}

/** Dépose le fichier et relève sa première page. Le fichier part en base64. */
export async function analyzeDocument(file: File): Promise<IngestAnalysis> {
  const fileBase64 = await toBase64(file);
  return asJson(
    await apiFetch("/api/ingest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fileBase64, filename: file.name }),
    }),
  );
}

export function ingestPreviewUrl(jobId: string, pageIndex = 0): string {
  return pageIndex === 0
    ? `/api/ingest/${jobId}/preview`
    : `/api/ingest/${jobId}/preview/${pageIndex}`;
}

/** Vignette d'un visuel sorti d'un .docx, désigné par son rang dans `assets`. */
export function ingestAssetUrl(jobId: string, index: number): string {
  return `/api/ingest/${jobId}/asset/${index}`;
}

/** Découpe une zone et la range dans les assets : elle devient choisissable comme visuel. */
export async function extractFragment(
  jobId: string,
  input: {
    /** Mode « page » : la zone découpée. Mode « assets » : `asset` à la place. */
    rect?: IngestRect;
    asset?: string;
    pageIndex?: number;
    vector?: boolean;
    kind: "en-tete" | "pied-de-page" | "fragment";
  },
): Promise<IngestFragment> {
  return asJson(
    await apiFetch(`/api/ingest/${jobId}/fragment`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),
  );
}

/** Crée la template : zones découpées + relevé de la page. */
export async function createTemplateFromIngest(
  jobId: string,
  input: {
    name: string;
    header?: IngestRect | null;
    footer?: IngestRect | null;
    /** Mode « assets » : visuel du .docx à poser en en-tête. */
    headerAsset?: string | null;
    vector?: boolean;
    templateModel?: TemplateModelV2;
  },
): Promise<{
  id: string;
  layout: LayoutConfig;
  fontSubstitution: string | null;
}> {
  return asJson(
    await apiFetch(`/api/ingest/${jobId}/template`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),
  );
}

export async function previewTemplateFromIngest(
  jobId: string,
  templateModel: TemplateModelV2,
): Promise<RenderResult | RenderError> {
  const res = await apiFetch(`/api/ingest/${jobId}/preview-template`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ templateModel }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({ error: "Unknown error" }));
    return {
      ok: false,
      error: data.error ?? "Unknown error",
      details: data.details,
    };
  }
  return { ok: true, blob: await res.blob() };
}

/** FileReader plutôt qu'une boucle sur les octets : un PDF de 10 Mo saturerait la pile. */
function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Lecture du fichier impossible"));
    reader.onload = () => {
      const result = String(reader.result);
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.readAsDataURL(file);
  });
}

// ── Mise en page (bloc « dots:layout » du .typ) ───────────────────────────────

export type PaperSize = "a4" | "a5" | "us-letter";
export type Align = "left" | "center" | "right";
export type Numbering = "none" | "n" | "n-of-total" | "page-n-of-total";
export type TextStyleKey = "body" | "h1" | "h2" | "h3";
export type BlockScope = "all" | "first" | "except-first";
export type BlockKind = "image-text" | "text-image" | "centered" | "custom";
export type ImagePosition = "left" | "center" | "right";

export interface TextStyle {
  font: string;
  /** Points. */
  fontSize: number;
  color: string;
}

export interface BlockRule {
  on: boolean;
  color: string;
  /** Points. */
  widthPt: number;
}

/**
 * One piece of a header or footer. Several stack inside a single Typst
 * `header:`/`footer:` argument — they are not separate page bands.
 * Same type as backend/src/layout/layoutConfig.ts.
 */
export interface Block {
  kind: BlockKind;
  scope: BlockScope;
  /** A file of /api/templates/assets. */
  image: string | null;
  imagePosition: ImagePosition;
  /** Millimetres; 0 spans the full width of the page, margins included. */
  imageHeightMm: number;
  title: string;
  subtitle: string;
  align: Align;
  /** Millimetres of clear space above/below, independent of whether rule.on draws a line in it. */
  spaceAboveMm: number;
  spaceBelowMm: number;
  rule: BlockRule;
}

export interface BandSpacing {
  /** Millimetres. */
  top: number;
  left: number;
  right: number;
  /** Distance between the band and the body text. */
  gap: number;
}

export interface Band {
  blocks: Block[];
  spacing: BandSpacing;
}

export interface FooterBand extends Band {
  numbering: Numbering;
  numberingAlign: Align;
  numberingScope: BlockScope;
}

export interface LayoutConfig {
  paper: PaperSize;
  orientation: "portrait" | "landscape";
  /** Millimètres. */
  margins: { top: number; bottom: number; left: number; right: number };
  font: string;
  /** Points. */
  fontSize: number;
  lineHeight: number;
  textStyles: Record<TextStyleKey, TextStyle>;
  header: Band;
  footer: FooterBand;
  headings: { scale: "compact" | "normal" | "large"; color: string };
  /** Allure des tableaux ; leur structure (colonnes, fusions, contenu) vient du document. */
  table: {
    stroke: "none" | "light" | "full";
    headerFill: "none" | "grey" | "brand";
    zebra: boolean;
    fontSize: "inherit" | "small";
  };
}

export async function fetchTemplateLayout(
  id: string,
): Promise<{ layout: LayoutConfig; managed: boolean }> {
  return asJson(await fetch(`/api/templates/${id}/layout`));
}

/** Source + réglages → source avec le bloc régénéré. Pur, rien n'est enregistré. */
export async function composeLayout(input: {
  source: string;
  layout: LayoutConfig;
}): Promise<{ source: string }> {
  return asJson(
    await fetch("/api/layout/compose", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),
  );
}

/** Relit les réglages portés par le bloc « dots:layout » d'une source (après une édition IA). */
export async function readLayoutFromSource(
  source: string,
): Promise<{ layout: LayoutConfig; managed: boolean }> {
  return asJson(
    await fetch("/api/layout/read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source }),
    }),
  );
}

export async function saveTemplateLayout(
  id: string,
  layout: LayoutConfig,
): Promise<{ meta: TemplateSummary; source: string }> {
  return asJson(
    await fetch(`/api/templates/${id}/layout`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ layout }),
    }),
  );
}

// ── Assistant IA ──────────────────────────────────────────────────────────────

export interface AiResult {
  ok: true;
  source: string;
  summary: string;
  changes: string[];
  check: CheckResult | CheckFailure;
}
export interface AiError {
  ok: false;
  error: string;
  /** Vrai quand la clé API manque côté serveur : l'UI cache l'assistant. */
  unavailable?: boolean;
}

export async function aiEditTemplate(input: {
  source: string;
  instruction: string;
  fixtureId?: string;
}): Promise<AiResult | AiError> {
  const res = await fetch("/api/ai/template", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return res.json();
}

export async function aiTemplateFromPdf(input: {
  pdfBase64: string;
  name?: string;
}): Promise<AiResult | AiError> {
  const res = await fetch("/api/ai/template-from-pdf", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return res.json();
}

// ── Rendu : blocs sans équivalent Typst ───────────────────────────────────────

export interface RenderInfo {
  /** Nombre de blocs du document. */
  blockCount: number;
  /** Type de bloc → nombre d'occurrences absentes du PDF. */
  unsupported: Record<string, number>;
}

async function renderResponse(
  res: Response,
): Promise<(RenderResult & { info: RenderInfo }) | RenderError> {
  if (!res.ok) {
    const data = await res.json().catch(() => ({ error: "Unknown error" }));
    return {
      ok: false,
      error: data.error ?? "Unknown error",
      details: data.details,
    };
  }
  let unsupported: Record<string, number> = {};
  try {
    unsupported = JSON.parse(
      res.headers.get("X-Dots-Unsupported-Blocks") ?? "{}",
    );
  } catch {
    // Un en-tête absent ou mal formé ne doit pas empêcher l'affichage du PDF.
  }
  const blockCount = Number(res.headers.get("X-Dots-Block-Count") ?? 0);
  return {
    ok: true,
    blob: await res.blob(),
    info: { blockCount, unsupported },
  };
}

/** Comme renderPdf, plus les en-têtes X-Dots-* posés par /api/render. */
export async function renderPdfWithInfo(
  req: RenderRequest,
): Promise<(RenderResult & { info: RenderInfo }) | RenderError> {
  const res = await apiFetch("/api/render", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
  return renderResponse(res);
}

export async function renderDocumentPdf(
  documentId: string,
  templateId: string,
  signal?: AbortSignal,
): Promise<(RenderResult & { info: RenderInfo }) | RenderError> {
  const res = await apiFetch(
    `/api/documents/${encodeURIComponent(documentId)}/render`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ templateId }),
      signal,
    },
  );
  return renderResponse(res);
}
