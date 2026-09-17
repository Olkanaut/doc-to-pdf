const DEFAULT_DOCS_API_BASE_URL = "http://localhost:8071/external_api/v1.0/";
const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_RESPONSE_BYTES = 5 * 1024 * 1024;

export type DocsBlock = Record<string, unknown>;

export interface DocsDocumentContent {
  id: string;
  title: string;
  blocks: DocsBlock[];
  createdAt: string;
  updatedAt: string;
}

export interface DocsDocumentSummary {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

interface DocsFormattedContentResponse {
  id: string;
  title: string;
  content: DocsBlock[] | null;
  created_at: string;
  updated_at: string;
}

interface DocsDocumentSummaryResponse {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export class DocsApiError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "DocsApiError";
  }
}

function positiveInteger(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function docsApiBaseUrl(): URL {
  const configured = process.env.DOCS_API_BASE_URL ?? DEFAULT_DOCS_API_BASE_URL;
  const value = configured.endsWith("/") ? configured : `${configured}/`;
  let url: URL;
  try {
    url = new URL(value);
  } catch (error) {
    throw new DocsApiError("Docs API is not configured correctly", 500, {
      cause: error,
    });
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new DocsApiError("Docs API is not configured correctly", 500);
  }

  return url;
}

async function readLimitedBody(response: Response, maxBytes: number): Promise<string> {
  const contentLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    await response.body?.cancel();
    throw new DocsApiError("Docs returned a response that is too large", 502);
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
      throw new DocsApiError("Docs returned a response that is too large", 502);
    }
    chunks.push(value);
  }

  return Buffer.concat(chunks, size).toString("utf8");
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseDocumentContent(body: string): DocsDocumentContent {
  let value: unknown;
  try {
    value = JSON.parse(body);
  } catch (error) {
    throw new DocsApiError("Docs returned invalid JSON", 502, { cause: error });
  }

  if (
    !isObject(value) ||
    typeof value.id !== "string" ||
    typeof value.title !== "string" ||
    typeof value.created_at !== "string" ||
    typeof value.updated_at !== "string" ||
    (value.content !== null && !Array.isArray(value.content)) ||
    (Array.isArray(value.content) && !value.content.every(isObject))
  ) {
    throw new DocsApiError("Docs returned an invalid document", 502);
  }

  const document = value as unknown as DocsFormattedContentResponse;
  return {
    id: document.id,
    title: document.title,
    blocks: document.content ?? [],
    createdAt: document.created_at,
    updatedAt: document.updated_at,
  };
}

function readJson(body: string): unknown {
  try {
    return JSON.parse(body);
  } catch (error) {
    throw new DocsApiError("Docs returned invalid JSON", 502, { cause: error });
  }
}

function parseDocumentSummary(value: unknown): DocsDocumentSummary {
  if (
    !isObject(value) ||
    typeof value.id !== "string" ||
    typeof value.title !== "string" ||
    typeof value.created_at !== "string" ||
    typeof value.updated_at !== "string"
  ) {
    throw new DocsApiError("Docs returned an invalid document list", 502);
  }

  const document = value as unknown as DocsDocumentSummaryResponse;
  return {
    id: document.id,
    title: document.title,
    createdAt: document.created_at,
    updatedAt: document.updated_at,
  };
}

function parseDocumentSearch(body: string): DocsDocumentSummary[] {
  const value = readJson(body);

  if (Array.isArray(value)) {
    return value.map(parseDocumentSummary);
  }

  if (isObject(value) && Array.isArray(value.results)) {
    return value.results.map(parseDocumentSummary);
  }

  throw new DocsApiError("Docs returned an invalid document list", 502);
}

function upstreamError(status: number): DocsApiError {
  if (status === 401) return new DocsApiError("Authentication with Docs has expired", 401);
  if (status === 403) return new DocsApiError("You do not have access to this document", 403);
  if (status === 404) return new DocsApiError("Document not found", 404);
  return new DocsApiError("Docs could not return the document", 502);
}

async function fetchDocsJson(url: URL, accessToken: string): Promise<string> {
  const timeoutMs = positiveInteger(process.env.DOCS_API_TIMEOUT_MS, DEFAULT_TIMEOUT_MS);
  const maxBytes = positiveInteger(
    process.env.DOCS_API_MAX_RESPONSE_BYTES,
    DEFAULT_MAX_RESPONSE_BYTES,
  );

  let response: Response;
  try {
    response = await fetch(url, {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      throw new DocsApiError("Docs request timed out", 504, { cause: error });
    }
    throw new DocsApiError("Docs is unavailable", 502, { cause: error });
  }

  if (!response.ok) {
    await response.body?.cancel();
    throw upstreamError(response.status);
  }

  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.includes("application/json")) {
    await response.body?.cancel();
    throw new DocsApiError("Docs returned an unsupported response", 502);
  }

  return readLimitedBody(response, maxBytes);
}

export async function fetchDocsDocumentContent(
  documentId: string,
  accessToken: string,
): Promise<DocsDocumentContent> {
  const baseUrl = docsApiBaseUrl();
  const url = new URL(
    `documents/${encodeURIComponent(documentId)}/formatted-content/`,
    baseUrl,
  );
  url.searchParams.set("content_format", "json");

  return parseDocumentContent(await fetchDocsJson(url, accessToken));
}

export async function searchDocsDocuments(
  query: string,
  accessToken: string,
  limit: number,
): Promise<DocsDocumentSummary[]> {
  const baseUrl = docsApiBaseUrl();
  const url = new URL("documents/", baseUrl);
  url.searchParams.set("q", query);
  url.searchParams.set("page_size", String(limit));

  return parseDocumentSearch(await fetchDocsJson(url, accessToken));
}
