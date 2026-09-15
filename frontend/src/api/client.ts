export interface TemplateSummary {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
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

function apiFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
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

export async function fetchDocumentContent(documentId: string): Promise<DocsDocumentContent> {
  return asJson(
    await apiFetch(`/api/documents/${encodeURIComponent(documentId)}/content`),
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

export async function renderPdf(req: RenderRequest): Promise<RenderResult | RenderError> {
  const res = await apiFetch("/api/render", {
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
