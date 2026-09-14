export interface TemplateSummary {
  id: string;
  name: string;
  description: string;
}

export interface FixtureSummary {
  id: string;
  name: string;
}

export async function fetchTemplates(): Promise<TemplateSummary[]> {
  const res = await fetch("/api/templates");
  if (!res.ok) throw new Error("Failed to load templates");
  return res.json();
}

export async function fetchFixtures(): Promise<FixtureSummary[]> {
  const res = await fetch("/api/fixtures");
  if (!res.ok) throw new Error("Failed to load fixtures");
  return res.json();
}

export async function fetchTemplateSource(id: string): Promise<string> {
  const res = await fetch(`/api/templates/${id}/source`);
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
