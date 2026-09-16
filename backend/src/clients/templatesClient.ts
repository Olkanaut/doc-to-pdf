const DEFAULT_DOCS_API_BASE_URL = "http://localhost:8071/external_api/v1.0/";
const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_RESPONSE_BYTES = 5 * 1024 * 1024;

export interface TemplateSummary {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  isDefault?: boolean;
}

export interface TemplateDetail extends TemplateSummary {
  source: string;
}

interface ExternalTemplateSummary {
  id: string;
  name: string;
  description: string;
  creator: string;
  created_at: string;
  updated_at: string;
}

interface ExternalTemplateDetail extends ExternalTemplateSummary {
  source: string;
}

interface ExternalListResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: ExternalTemplateSummary[];
}

export class TemplatesApiError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "TemplatesApiError";
  }
}

function positiveInteger(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function templatesApiBaseUrl(): URL {
  const configured =
    process.env.TYPST_TEMPLATES_API_BASE_URL ??
    new URL("typst-templates/", process.env.DOCS_API_BASE_URL ?? DEFAULT_DOCS_API_BASE_URL)
      .toString();
  const value = configured.endsWith("/") ? configured : `${configured}/`;

  let url: URL;
  try {
    url = new URL(value);
  } catch (error) {
    throw new TemplatesApiError("Templates API is not configured correctly", 500, {
      cause: error,
    });
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new TemplatesApiError("Templates API is not configured correctly", 500);
  }

  return url;
}

async function readLimitedBody(response: Response, maxBytes: number): Promise<string> {
  const contentLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    await response.body?.cancel();
    throw new TemplatesApiError("Templates API returned a response that is too large", 502);
  }

  if (!response.body) return "";

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      throw new TemplatesApiError("Templates API returned a response that is too large", 502);
    }
    chunks.push(value);
  }

  return Buffer.concat(chunks, size).toString("utf8");
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isExternalTemplateSummary(value: unknown): value is ExternalTemplateSummary {
  return (
    isObject(value) &&
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    typeof value.description === "string" &&
    typeof value.creator === "string" &&
    typeof value.created_at === "string" &&
    typeof value.updated_at === "string"
  );
}

function isExternalTemplateDetail(value: unknown): value is ExternalTemplateDetail {
  return (
    isExternalTemplateSummary(value) &&
    isObject(value) &&
    typeof value.source === "string"
  );
}

function parseJson(body: string): unknown {
  try {
    return JSON.parse(body);
  } catch (error) {
    throw new TemplatesApiError("Templates API returned invalid JSON", 502, { cause: error });
  }
}

function parseList(body: string): ExternalListResponse {
  const value = parseJson(body);
  if (
    !isObject(value) ||
    typeof value.count !== "number" ||
    (value.next !== null && typeof value.next !== "string") ||
    (value.previous !== null && typeof value.previous !== "string") ||
    !Array.isArray(value.results) ||
    !value.results.every(isExternalTemplateSummary)
  ) {
    throw new TemplatesApiError("Templates API returned an invalid template list", 502);
  }
  return value as unknown as ExternalListResponse;
}

function parseDetail(body: string): ExternalTemplateDetail {
  const value = parseJson(body);
  if (!isExternalTemplateDetail(value)) {
    throw new TemplatesApiError("Templates API returned an invalid template", 502);
  }
  return value;
}

function toSummary(template: ExternalTemplateSummary): TemplateSummary {
  return {
    id: template.id,
    name: template.name,
    description: template.description,
    createdAt: template.created_at,
    updatedAt: template.updated_at,
  };
}

function toDetail(template: ExternalTemplateDetail): TemplateDetail {
  return {
    ...toSummary(template),
    source: template.source,
  };
}

function upstreamError(status: number): TemplatesApiError {
  if (status === 400) return new TemplatesApiError("Invalid template request", 400);
  if (status === 401) return new TemplatesApiError("Authentication with Templates API has expired", 401);
  if (status === 403) return new TemplatesApiError("You are not allowed to access this template", 403);
  if (status === 404) return new TemplatesApiError("Template not found", 404);
  return new TemplatesApiError("Templates API could not return templates", 502);
}

function nextPageUrl(value: string, baseUrl: URL): URL {
  const next = new URL(value, baseUrl);
  if (next.origin !== baseUrl.origin) {
    throw new TemplatesApiError("Templates API returned an invalid pagination URL", 502);
  }
  return next;
}

async function requestTemplatesApi(
  path: string | URL,
  accessToken: string,
  init: RequestInit = {},
): Promise<Response> {
  const baseUrl = templatesApiBaseUrl();
  const url = path instanceof URL ? path : new URL(path, baseUrl);
  const timeoutMs = positiveInteger(
    process.env.TYPST_TEMPLATES_API_TIMEOUT_MS,
    positiveInteger(process.env.DOCS_API_TIMEOUT_MS, DEFAULT_TIMEOUT_MS),
  );
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  headers.set("Authorization", `Bearer ${accessToken}`);

  try {
    return await fetch(url, {
      ...init,
      headers,
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      throw new TemplatesApiError("Templates API request timed out", 504, { cause: error });
    }
    throw new TemplatesApiError("Templates API is unavailable", 502, { cause: error });
  }
}

async function readJsonResponse(response: Response): Promise<string> {
  const maxBytes = positiveInteger(
    process.env.TYPST_TEMPLATES_API_MAX_RESPONSE_BYTES,
    positiveInteger(process.env.DOCS_API_MAX_RESPONSE_BYTES, DEFAULT_MAX_RESPONSE_BYTES),
  );

  if (!response.ok) {
    await response.body?.cancel();
    throw upstreamError(response.status);
  }

  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.includes("application/json")) {
    await response.body?.cancel();
    throw new TemplatesApiError("Templates API returned an unsupported response", 502);
  }

  return readLimitedBody(response, maxBytes);
}

export async function listExternalTemplates(accessToken: string): Promise<TemplateSummary[]> {
  const baseUrl = templatesApiBaseUrl();
  const templates: TemplateSummary[] = [];
  let url: URL | null = new URL("", baseUrl);
  let pages = 0;

  while (url) {
    pages += 1;
    if (pages > 50) throw new TemplatesApiError("Templates API pagination is too deep", 502);

    const response = await requestTemplatesApi(url, accessToken);
    const page = parseList(await readJsonResponse(response));
    templates.push(...page.results.map(toSummary));
    url = page.next ? nextPageUrl(page.next, baseUrl) : null;
  }

  return templates;
}

export async function getExternalTemplate(
  templateId: string,
  accessToken: string,
): Promise<TemplateDetail> {
  const response = await requestTemplatesApi(`${encodeURIComponent(templateId)}/`, accessToken);
  return toDetail(parseDetail(await readJsonResponse(response)));
}

export async function createExternalTemplate(
  input: { name: string; description: string; source: string },
  accessToken: string,
): Promise<TemplateDetail> {
  const response = await requestTemplatesApi("", accessToken, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return toDetail(parseDetail(await readJsonResponse(response)));
}

export async function updateExternalTemplate(
  templateId: string,
  patch: { name?: string; description?: string; source?: string },
  accessToken: string,
): Promise<TemplateDetail> {
  const response = await requestTemplatesApi(`${encodeURIComponent(templateId)}/`, accessToken, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  return toDetail(parseDetail(await readJsonResponse(response)));
}

export async function deleteExternalTemplate(
  templateId: string,
  accessToken: string,
): Promise<void> {
  const response = await requestTemplatesApi(`${encodeURIComponent(templateId)}/`, accessToken, {
    method: "DELETE",
  });
  if (response.status === 204) {
    await response.body?.cancel();
    return;
  }
  if (!response.ok) {
    await response.body?.cancel();
    throw upstreamError(response.status);
  }
  await response.body?.cancel();
}
