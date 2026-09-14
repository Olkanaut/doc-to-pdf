import type { FastifyInstance } from "fastify";
import path from "node:path";
import { readFile } from "node:fs/promises";
import { getFixture, FIXTURES_DIR } from "../registry/fixtures.js";
import { getTemplate, templatePath, TEMPLATES_ASSETS_DIR } from "../registry/templates.js";
import { blocksToTypst } from "../convert/blocksToTypst.js";
import { compileToPdf, TypstCompileError } from "../compile/typstCompile.js";

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
      const template = getTemplate(templateId!);
      if (!template) {
        return reply.code(404).send({ error: `template "${templateId}" not found` });
      }
      resolvedTemplateSource = await readFile(templatePath(template), "utf8");
    }

    const { typst, images } = blocksToTypst(fixture.blocks);
    const resolvedImages = images.map((img) => ({
      ...img,
      src: path.resolve(FIXTURES_DIR, img.src),
    }));

    try {
      const pdf = await compileToPdf({
        templateSource: resolvedTemplateSource,
        templateAssetsDir: TEMPLATES_ASSETS_DIR,
        bodyTypst: typst,
        bodyImages: resolvedImages,
      });
      reply.header("Content-Type", "application/pdf");
      return reply.send(pdf);
    } catch (err) {
      if (err instanceof TypstCompileError) {
        return reply.code(422).send({ error: "typst compile failed", details: err.stderr });
      }
      throw err;
    }
  });
}
