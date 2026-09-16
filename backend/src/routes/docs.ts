import type { FastifyInstance } from "fastify";
import { DocsApiError, docsSessionCookie, getDocsDocument, listDocsDocuments } from "../docs/client.js";

/** Entier positif depuis la querystring, undefined si absent ou non numérique (→ défaut du client). */
function intParam(value: string | undefined): number | undefined {
  if (value === undefined || !/^\d+$/.test(value)) return undefined;
  return Number(value);
}

export async function docsRoutes(app: FastifyInstance): Promise<void> {
  // Liste des documents Docs visibles par la session du navigateur (page d'accueil).
  app.get<{ Querystring: { title?: string; page?: string; page_size?: string } }>("/api/docs", async (req, reply) => {
    const cookie = docsSessionCookie(req.headers.cookie);
    // `?title=a&title=b` arrive en tableau : ignoré, comme un paramètre absent.
    const title = typeof req.query.title === "string" ? req.query.title : undefined;
    try {
      const list = await listDocsDocuments(
        { title, page: intParam(req.query.page), pageSize: intParam(req.query.page_size) },
        cookie,
      );
      return { ...list, hasSession: cookie !== undefined };
    } catch (err) {
      if (err instanceof DocsApiError) return reply.code(err.status).send({ error: err.message });
      throw err;
    }
  });

  app.get<{ Params: { id: string } }>("/api/docs/:id", async (req, reply) => {
    try {
      return await getDocsDocument(req.params.id, docsSessionCookie(req.headers.cookie));
    } catch (err) {
      if (err instanceof DocsApiError) return reply.code(err.status).send({ error: err.message });
      throw err;
    }
  });
}
