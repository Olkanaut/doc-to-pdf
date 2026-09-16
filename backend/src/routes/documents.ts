import type { FastifyInstance } from "fastify";
import { DocsApiError, fetchDocsDocumentContent } from "../clients/docsClient.js";
import { getExternalTemplate, TemplatesApiError } from "../clients/templatesClient.js";
import { TypstCompileError } from "../compile/typstCompile.js";
import { TEMPLATES_ASSETS_DIR } from "../registry/templates.js";
import {
  renderBlocksToPdf,
  UnsupportedBodyImagesError,
} from "../render/renderBlocks.js";
import type { Block } from "../types/blocks.js";
import { getAuthSession } from "./auth.js";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface DocumentParams {
  documentId: string;
}

interface RenderDocumentBody {
  templateId?: unknown;
}

export interface DocumentRoutesOptions {
  getSession?: typeof getAuthSession;
  fetchDocument?: typeof fetchDocsDocumentContent;
  fetchTemplate?: typeof getExternalTemplate;
  renderBlocks?: typeof renderBlocksToPdf;
}

export async function documentRoutes(
  app: FastifyInstance,
  options: DocumentRoutesOptions = {},
): Promise<void> {
  const getSession = options.getSession ?? getAuthSession;
  const fetchDocument = options.fetchDocument ?? fetchDocsDocumentContent;
  const fetchTemplate = options.fetchTemplate ?? getExternalTemplate;
  const renderBlocks = options.renderBlocks ?? renderBlocksToPdf;

  app.get<{ Params: DocumentParams }>(
    "/api/documents/:documentId/content",
    async (req, reply) => {
      const session = await getSession(req, reply);
      if (!session) {
        return reply.code(401).send({ error: "Authentication required" });
      }

      const { documentId } = req.params;
      if (!UUID_PATTERN.test(documentId)) {
        return reply.code(400).send({ error: "Invalid document ID" });
      }

      try {
        const document = await fetchDocument(documentId, session.accessToken);
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

  app.post<{ Params: DocumentParams; Body: RenderDocumentBody }>(
    "/api/documents/:documentId/render",
    async (req, reply) => {
      const session = await getSession(req, reply);
      if (!session) {
        return reply.code(401).send({ error: "Authentication required" });
      }

      const { documentId } = req.params;
      if (!UUID_PATTERN.test(documentId)) {
        return reply.code(400).send({ error: "Invalid document ID" });
      }

      const templateId = req.body?.templateId;
      if (typeof templateId !== "string" || !templateId.trim()) {
        return reply.code(400).send({ error: "templateId is required" });
      }
      if (!UUID_PATTERN.test(templateId)) {
        return reply.code(400).send({ error: "Invalid template ID" });
      }

      try {
        const [document, template] = await Promise.all([
          fetchDocument(documentId, session.accessToken),
          fetchTemplate(templateId, session.accessToken),
        ]);
        const result = await renderBlocks({
          // Docs guarantees BlockNote JSON on this endpoint; unknown block types are
          // deliberately ignored by the converter and reported in the response headers.
          blocks: document.blocks as unknown as Block[],
          templateSource: template.source,
          templateAssetsDir: TEMPLATES_ASSETS_DIR,
        });

        reply.header("Cache-Control", "no-store");
        reply.header("Content-Type", "application/pdf");
        reply.header("X-Dots-Block-Count", String(result.blockCount));
        reply.header("X-Dots-Unsupported-Blocks", JSON.stringify(result.unsupported));
        return reply.send(result.pdf);
      } catch (error) {
        if (error instanceof DocsApiError) {
          if (error.statusCode >= 500) {
            req.log.warn({ err: error, documentId }, "Docs API request failed during render");
          }
          return reply.code(error.statusCode).send({ error: error.message });
        }
        if (error instanceof TemplatesApiError) {
          if (error.statusCode >= 500) {
            req.log.warn({ err: error, templateId }, "Templates API request failed during render");
          }
          return reply.code(error.statusCode).send({ error: error.message });
        }
        if (error instanceof UnsupportedBodyImagesError) {
          return reply.code(422).send({
            error: "Les images des documents Docs ne sont pas encore prises en charge.",
          });
        }
        if (error instanceof TypstCompileError) {
          return reply.code(422).send({
            error: "typst compile failed",
            details: error.stderr,
          });
        }
        throw error;
      }
    },
  );
}
