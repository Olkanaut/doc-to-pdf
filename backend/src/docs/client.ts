/**
 * Lecture d'un document Docs (La Suite) par son API REST, au format BlockNote :
 * les blocs renvoyés ont la même forme que ceux des fixtures (backend/fixtures).
 * `fetch` natif, pas de SDK. L'URL de l'API vient de DOCS_API_URL (backend/.env).
 */
import type { Block } from "../types/blocks.js";

/** Même forme qu'une fixture, plus le nombre de blocs (enfants compris). */
export interface DocsDocument {
  id: string;
  name: string;
  blocks: Block[];
  blockCount: number;
}

/** Une ligne de GET /api/v1.0/documents/ : ce que l'accueil affiche. */
export interface DocsListItem {
  id: string;
  title: string;
  updatedAt: string;
  role: "reader" | "commenter" | "editor" | "administrator" | "owner" | null;
}

export interface DocsList {
  items: DocsListItem[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

/**
 * Erreur montrable à l'utilisateur, avec le code HTTP que la route doit renvoyer.
 * Le message ne contient jamais le cookie de session.
 */
export class DocsApiError extends Error {
  constructor(
    public readonly status: 400 | 403 | 404 | 422 | 429 | 502,
    message: string,
  ) {
    super(message);
  }
}

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TIMEOUT_MS = 15_000;

function apiUrl(): string {
  return (process.env.DOCS_API_URL ?? "http://localhost:8071").replace(/\/+$/, "");
}

/**
 * Extrait `docs_sessionid=…` de l'en-tête Cookie reçu du navigateur (le cookie
 * Django de Docs, posé sur l'hôte localhost sans port). Seul ce cookie est relayé
 * à Docs ; les autres restent ici. Renvoie undefined s'il est absent.
 */
export function docsSessionCookie(cookieHeader: string | undefined): string | undefined {
  const match = cookieHeader?.match(/(?:^|;\s*)docs_sessionid=([^;]+)/);
  return match ? `docs_sessionid=${match[1].trim()}` : undefined;
}

/**
 * GET vers Docs avec le cookie de session s'il est fourni, timeout de 15 s.
 * Réseau injoignable ou délai dépassé → DocsApiError 502 ; les statuts HTTP
 * restent à interpréter par l'appelant.
 */
async function fetchDocs(url: string, sessionCookie?: string): Promise<Response> {
  try {
    return await fetch(url, {
      headers: {
        accept: "application/json",
        ...(sessionCookie ? { cookie: sessionCookie } : {}),
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    const base = apiUrl();
    const name = (err as { name?: string }).name;
    const cause = (err as { cause?: { code?: string } }).cause?.code;
    throw new DocsApiError(
      502,
      name === "TimeoutError" || name === "AbortError"
        ? `Docs injoignable (${base} : délai dépassé après ${TIMEOUT_MS / 1000} s)`
        : `Docs injoignable (${base}${cause ? ` : ${cause}` : ""})`,
    );
  }
}

/** Corps JSON d'une réponse Docs, ou DocsApiError 502 si ce n'en est pas. */
async function docsJson<T>(res: Response): Promise<T> {
  try {
    return await res.json();
  } catch {
    throw new DocsApiError(502, `Docs injoignable (${apiUrl()} : réponse non JSON)`);
  }
}

function countBlocks(blocks: Block[]): number {
  let count = 0;
  for (const block of blocks) {
    count++;
    if ("children" in block && block.children) count += countBlocks(block.children);
  }
  return count;
}

/**
 * GET /api/v1.0/documents/:id/formatted-content/?content_format=json. Anonyme si
 * le lien du document est public, sinon avec le cookie de session Docs du navigateur.
 */
export async function getDocsDocument(id: string, sessionCookie?: string): Promise<DocsDocument> {
  if (!UUID_V4.test(id)) {
    throw new DocsApiError(400, "Identifiant de document invalide : un uuid Docs est attendu.");
  }

  const base = apiUrl();
  const res = await fetchDocs(`${base}/api/v1.0/documents/${id}/formatted-content/?content_format=json`, sessionCookie);

  if (res.status === 401 || res.status === 403) {
    throw new DocsApiError(
      403,
      "Document non accessible : connectez-vous à Docs dans ce navigateur ou rendez son lien public.",
    );
  }
  if (res.status === 404) throw new DocsApiError(404, "Document introuvable dans Docs.");
  if (!res.ok) throw new DocsApiError(502, `Docs injoignable (${base} : HTTP ${res.status})`);

  const data = await docsJson<{ id?: string; title?: string; content?: Block[] | null }>(res);
  if (!Array.isArray(data.content)) {
    throw new DocsApiError(
      422,
      "Ce document n'a jamais été ouvert dans l'éditeur Docs, il n'a pas encore de contenu.",
    );
  }

  return {
    id: data.id ?? id,
    name: data.title?.trim() || "Document sans titre",
    blocks: data.content,
    blockCount: countBlocks(data.content),
  };
}

const ROLES = ["reader", "commenter", "editor", "administrator", "owner"] as const;
const LIST_PAGE_SIZE_MAX = 50;

/**
 * GET /api/v1.0/documents/?title=&page=&page_size= : les documents visibles par
 * la session Docs du navigateur (Docs trie par -updated_at, on ne passe pas
 * `ordering`). Anonyme, Docs répond 200 avec une liste vide.
 */
export async function listDocsDocuments(
  query: { title?: string; page?: number; pageSize?: number },
  sessionCookie?: string,
): Promise<DocsList> {
  const title = (query.title ?? "").trim().slice(0, 200);
  const page = Math.max(1, Math.floor(query.page ?? 1));
  const pageSize = Math.min(LIST_PAGE_SIZE_MAX, Math.max(1, Math.floor(query.pageSize ?? 8)));

  const params = new URLSearchParams();
  if (title) params.set("title", title);
  params.set("page", String(page));
  params.set("page_size", String(pageSize));

  const base = apiUrl();
  const res = await fetchDocs(`${base}/api/v1.0/documents/?${params}`, sessionCookie);

  if (res.status === 401 || res.status === 403) {
    throw new DocsApiError(403, "Connectez-vous à Docs dans ce navigateur pour voir vos documents.");
  }
  if (res.status === 404) throw new DocsApiError(404, "Page inexistante.");
  if (res.status === 429) {
    throw new DocsApiError(429, "Trop de requêtes vers Docs : réessayez dans une minute.");
  }
  if (!res.ok) throw new DocsApiError(502, `Docs injoignable (${base} : HTTP ${res.status})`);

  const data = await docsJson<{
    count?: number;
    next?: string | null;
    results?: { id?: string; title?: string | null; updated_at?: string; user_role?: string | null }[];
  }>(res);
  if (!Array.isArray(data.results)) {
    throw new DocsApiError(502, `Docs injoignable (${base} : liste de documents absente)`);
  }

  return {
    items: data.results.map((row) => ({
      id: row.id ?? "",
      title: row.title?.trim() || "Document sans titre",
      updatedAt: row.updated_at ?? "",
      role: (ROLES as readonly string[]).includes(row.user_role ?? "") ? (row.user_role as DocsListItem["role"]) : null,
    })),
    total: data.count ?? data.results.length,
    page,
    pageSize,
    hasMore: data.next != null,
  };
}
