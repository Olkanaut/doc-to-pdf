export interface TemplateSummary {
  id: string;
  name: string;
  description: string;
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

export type AuthState =
  | { authenticated: false }
  | { authenticated: true; user: AuthUser };

export interface AuthCallbackResult {
  authenticated: true;
  user: AuthUser;
  returnTo: string;
}

export async function fetchAuthMe(): Promise<AuthState> {
  const res = await fetch("/api/auth/me", { credentials: "include" });
  if (!res.ok) throw new Error("Failed to load authenticated user");
  return res.json();
}

export async function completeLogin(
  code: string,
  state: string,
): Promise<AuthCallbackResult> {
  const res = await fetch("/api/auth/callback", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, state }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({ error: "OIDC callback failed" }));
    throw new Error(data.error ?? "OIDC callback failed");
  }

  return res.json();
}

export async function logout(): Promise<void> {
  const res = await fetch("/api/auth/logout", {
    method: "POST",
    credentials: "include",
  });
  if (!res.ok) throw new Error("Failed to logout");
}

export async function fetchTemplates(): Promise<TemplateSummary[]> {
  const res = await fetch("/api/templates", { credentials: "include" });
  if (!res.ok) throw new Error("Failed to load templates");
  return res.json();
}

export async function fetchFixtures(): Promise<FixtureSummary[]> {
  const res = await fetch("/api/fixtures", { credentials: "include" });
  if (!res.ok) throw new Error("Failed to load fixtures");
  return res.json();
}

export async function fetchTemplateSource(id: string): Promise<string> {
  const res = await fetch(`/api/templates/${id}/source`, { credentials: "include" });
  if (!res.ok) throw new Error("Failed to load template source");
  const data = await res.json();
  return data.source;
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
  const res = await fetch("/api/render", {
    method: "POST",
    credentials: "include",
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
