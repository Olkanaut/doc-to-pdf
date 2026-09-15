import type { FastifyInstance } from "fastify";
import { DocsApiError, docsSessionCookie, getDocsDocument } from "../docs/client.js";

export async function docsRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { id: string } }>("/api/docs/:id", async (req, reply) => {
    try {
      return await getDocsDocument(req.params.id, docsSessionCookie(req.headers.cookie));
    } catch (err) {
      if (err instanceof DocsApiError) return reply.code(err.status).send({ error: err.message });
      throw err;
    }
  });
}
