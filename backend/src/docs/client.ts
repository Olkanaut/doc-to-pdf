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

/**
 * Erreur montrable à l'utilisateur, avec le code HTTP que la route doit renvoyer.
 * Le message ne contient jamais le cookie de session.
 */
export class DocsApiError extends Error {
  constructor(
    public readonly status: 400 | 403 | 404 | 422 | 502,
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
  let res: Response;
  try {
    res = await fetch(`${base}/api/v1.0/documents/${id}/formatted-content/?content_format=json`, {
      headers: {
        accept: "application/json",
        ...(sessionCookie ? { cookie: sessionCookie } : {}),
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    const name = (err as { name?: string }).name;
    const cause = (err as { cause?: { code?: string } }).cause?.code;
    throw new DocsApiError(
      502,
      name === "TimeoutError" || name === "AbortError"
        ? `Docs injoignable (${base} : délai dépassé après ${TIMEOUT_MS / 1000} s)`
        : `Docs injoignable (${base}${cause ? ` : ${cause}` : ""})`,
    );
  }

  if (res.status === 401 || res.status === 403) {
    throw new DocsApiError(
      403,
      "Document non accessible : connectez-vous à Docs dans ce navigateur ou rendez son lien public.",
    );
  }
  if (res.status === 404) throw new DocsApiError(404, "Document introuvable dans Docs.");
  if (!res.ok) throw new DocsApiError(502, `Docs injoignable (${base} : HTTP ${res.status})`);

  let data: { id?: string; title?: string; content?: Block[] | null };
  try {
    data = await res.json();
  } catch {
    throw new DocsApiError(502, `Docs injoignable (${base} : réponse non JSON)`);
  }
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
