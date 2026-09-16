import type { FastifyInstance } from "fastify";
import { getFixture, FIXTURES_DIR } from "../registry/fixtures.js";
import { getTemplateSource, TEMPLATES_ASSETS_DIR } from "../registry/templates.js";
import { TypstCompileError } from "../compile/typstCompile.js";
import {
  renderBlocksToPdf,
  UnsupportedBodyImagesError,
} from "../render/renderBlocks.js";

interface RenderBody {
  fixtureId?: string;
  templateId?: string;
  templateSource?: string;
}

export async function renderRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Body: RenderBody }>("/api/render", async (req, reply) => {
    const { fixtureId, templateId, templateSource } = req.body ?? {};

    if (!fixtureId) {
      return reply.code(400).send({ error: "fixtureId is required" });
    }
    if (!templateId && !templateSource) {
      return reply.code(400).send({ error: "templateId or templateSource is required" });
    }

    const fixture = await getFixture(fixtureId);
    if (!fixture) {
      return reply.code(404).send({ error: `fixture "${fixtureId}" not found` });
    }

    let resolvedTemplateSource: string;
    if (templateSource) {
      resolvedTemplateSource = templateSource;
    } else {
      const source = await getTemplateSource(templateId!);
      if (!source) {
        return reply.code(404).send({ error: `template "${templateId}" not found` });
      }
      resolvedTemplateSource = source;
    }

    try {
      const result = await renderBlocksToPdf({
        blocks: fixture.blocks,
        templateSource: resolvedTemplateSource,
        templateAssetsDir: TEMPLATES_ASSETS_DIR,
        bodyImagesDir: FIXTURES_DIR,
      });
      reply.header("Content-Type", "application/pdf");
      reply.header("X-Dots-Block-Count", String(result.blockCount));
      reply.header("X-Dots-Unsupported-Blocks", JSON.stringify(result.unsupported));
      return reply.send(result.pdf);
    } catch (err) {
      if (err instanceof UnsupportedBodyImagesError) {
        return reply.code(422).send({ error: "Les images distantes ne sont pas encore prises en charge." });
      }
      if (err instanceof TypstCompileError) {
        return reply.code(422).send({ error: "typst compile failed", details: err.stderr });
      }
      throw err;
    }
  });
}
