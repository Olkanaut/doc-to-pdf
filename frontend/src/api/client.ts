export interface TemplateSummary {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  /** Posé par le backend : ce gabarit est celui appliqué par défaut. */
  isDefault?: boolean;
}

export interface TemplateDetail extends TemplateSummary {
  source: string;
}

export interface FixtureSummary {
  id: string;
  name: string;
}

export interface SessionInfo {
  authenticated: boolean;
  user: { id: string; name: string } | null;
}

async function asJson<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const data = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(data.error ?? `Request failed (${res.status})`);
  }
  return res.json();
}

export async function fetchSession(): Promise<SessionInfo> {
  const res = await fetch("/api/session");
  return asJson(res);
}

export async function fetchTemplates(): Promise<TemplateSummary[]> {
  return asJson(await fetch("/api/templates"));
}

export async function fetchTemplateDetail(id: string): Promise<TemplateDetail> {
  return asJson(await fetch(`/api/templates/${id}`));
}

export async function createTemplate(input: {
  name: string;
  description: string;
  source?: string;
}): Promise<TemplateSummary> {
  return asJson(
    await fetch("/api/templates", {
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
    await fetch(`/api/templates/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    }),
  );
}

export async function deleteTemplate(id: string): Promise<void> {
  const res = await fetch(`/api/templates/${id}`, { method: "DELETE" });
  if (!res.ok && res.status !== 204) {
    const data = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(data.error ?? `Request failed (${res.status})`);
  }
}

export async function fetchFixtures(): Promise<FixtureSummary[]> {
  return asJson(await fetch("/api/fixtures"));
}

export interface RenderRequest {
  /** Document d'exemple embarqué (`backend/fixtures`). `fixtureId` ou `docId`, l'un des deux. */
  fixtureId?: string;
  /** Document Docs (uuid), lu par le backend via DOCS_API_URL, à la place de `fixtureId`. */
  docId?: string;
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

export async function renderPdf(req: RenderRequest): Promise<RenderResult | RenderError> {
  const res = await fetch("/api/render", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({ error: "Unknown error" }));
    return { ok: false, error: data.error ?? "Unknown error", details: data.details };
  }
  const blob = await res.blob();
  return { ok: true, blob };
}

// ── Gabarit par défaut ────────────────────────────────────────────────────────

export async function fetchDefaultTemplate(): Promise<TemplateSummary | null> {
  const res = await fetch("/api/templates/default");
  if (res.status === 404) return null;
  return asJson(res);
}

export async function setDefaultTemplate(templateId: string): Promise<TemplateSummary> {
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

export async function fetchTemplateAssets(): Promise<{ file: string }[]> {
  const data = await asJson<{ assets: { file: string }[] }>(await fetch("/api/templates/assets"));
  return data.assets;
}

// ── Mise en page (bloc « dots:layout » du .typ) ───────────────────────────────

export type PaperSize = "a4" | "a5" | "us-letter";
export type Align = "left" | "center" | "right";
export type Numbering = "none" | "n" | "n-of-total" | "page-n-of-total";

export interface LayoutConfig {
  paper: PaperSize;
  orientation: "portrait" | "landscape";
  /** Millimètres. */
  margins: { top: number; bottom: number; left: number; right: number };
  font: string;
  /** Points. */
  fontSize: number;
  lineHeight: number;
  header: { enabled: boolean; text: string; logo: string | null; align: Align; rule: boolean };
  footer: {
    enabled: boolean;
    text: string;
    numbering: Numbering;
    align: Align;
    firstPage: boolean;
    rule: boolean;
  };
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
  /** Type de bloc → nombre d'occurrences rendues en paragraphe simple. */
  unsupported: Record<string, number>;
}

/** Comme renderPdf, plus les en-têtes X-Dots-* posés par /api/render. */
export async function renderPdfWithInfo(
  req: RenderRequest,
): Promise<(RenderResult & { info: RenderInfo }) | RenderError> {
  const res = await fetch("/api/render", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({ error: "Unknown error" }));
    return { ok: false, error: data.error ?? "Unknown error", details: data.details };
  }
  let unsupported: Record<string, number> = {};
  try {
    unsupported = JSON.parse(res.headers.get("X-Dots-Unsupported-Blocks") ?? "{}");
  } catch {
    // en-tête absent ou mal formé : on affiche simplement rien
  }
  const blockCount = Number(res.headers.get("X-Dots-Block-Count") ?? 0);
  return { ok: true, blob: await res.blob(), info: { blockCount, unsupported } };
}

// ── Documents Docs (La Suite) ─────────────────────────────────────────────────

export interface DocsDocument {
  id: string;
  /** Titre du document dans Docs. */
  name: string;
  /** Blocs BlockNote, même forme que les fixtures. */
  blocks: unknown[];
  blockCount: number;
}

/**
 * GET /api/docs/:id. Lève une Error portant le message `error` du serveur : 403 (document
 * non accessible), 404 (introuvable), 422 (jamais ouvert dans l'éditeur), 502 (Docs injoignable).
 */
export async function fetchDocsDocument(id: string): Promise<DocsDocument> {
  return asJson(await fetch(`/api/docs/${encodeURIComponent(id)}`));
}
