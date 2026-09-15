import type { FastifyInstance } from "fastify";
import { DocsApiError, fetchDocsDocumentContent } from "../clients/docsClient.js";
import { getAuthSession } from "./auth.js";

const DOCUMENT_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface DocumentParams {
  documentId: string;
}

export async function documentRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: DocumentParams }>(
    "/api/documents/:documentId/content",
    async (req, reply) => {
      const session = getAuthSession(req, reply);
      if (!session) {
        return reply.code(401).send({ error: "Authentication required" });
      }

      const { documentId } = req.params;
      if (!DOCUMENT_ID_PATTERN.test(documentId)) {
        return reply.code(400).send({ error: "Invalid document ID" });
      }

      try {
        const document = await fetchDocsDocumentContent(documentId, session.accessToken);
        return reply.send(document);
      } catch (error) {
        if (error instanceof DocsApiError) {
          if (error.statusCode >= 500) {
            req.log.warn({ err: error, documentId }, "Docs API request failed");
          }
          return reply.code(error.statusCode).send({ error: error.message });
        }
        throw error;
      }
    },
  );
}
