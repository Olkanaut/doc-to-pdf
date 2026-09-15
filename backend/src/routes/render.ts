import type { FastifyInstance } from "fastify";
import path from "node:path";
import { getFixture, FIXTURES_DIR } from "../registry/fixtures.js";
import { getTemplateSource, TEMPLATES_ASSETS_DIR } from "../registry/templates.js";
import { blocksToTypst } from "../convert/blocksToTypst.js";
import { compileToPdf, TypstCompileError } from "../compile/typstCompile.js";
import { DocsApiError, docsSessionCookie, getDocsDocument } from "../docs/client.js";
import type { Block } from "../types/blocks.js";

// Types de blocs rendus par le `switch` de blocksToTypst.ts : à tenir à jour avec
// lui. Tout autre type est ignoré par le convertisseur, donc ABSENT du PDF.
const SUPPORTED = new Set(["heading", "paragraph", "bulletListItem", "numberedListItem", "table", "image"]);

/** Compte tous les blocs (enfants inclus) et, par type, ceux que le convertisseur ignore. */
function inspectBlocks(blocks: Block[]): { count: number; unsupported: Record<string, number> } {
  let count = 0;
  const unsupported: Record<string, number> = {};
  const walk = (list: Block[]) => {
    for (const block of list) {
      count++;
      if (!SUPPORTED.has(block.type)) unsupported[block.type] = (unsupported[block.type] ?? 0) + 1;
      if ("children" in block && block.children) walk(block.children);
    }
  };
  walk(blocks);
  return { count, unsupported };
}

interface RenderBody {
  /** L'un des deux : une fixture locale, ou un document Docs par son uuid. */
  fixtureId?: string;
  docId?: string;
  templateId?: string;
  templateSource?: string;
}

export async function renderRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Body: RenderBody }>("/api/render", async (req, reply) => {
    const { fixtureId, docId, templateId, templateSource } = req.body ?? {};

    if (!fixtureId && !docId) {
      return reply.code(400).send({ error: "fixtureId or docId is required" });
    }
    if (!templateId && !templateSource) {
      return reply.code(400).send({ error: "templateId or templateSource is required" });
    }

    let fixture: { blocks: Block[] };
    if (docId) {
      try {
        fixture = await getDocsDocument(docId, docsSessionCookie(req.headers.cookie));
      } catch (err) {
        if (err instanceof DocsApiError) return reply.code(err.status).send({ error: err.message });
        throw err;
      }
    } else {
      const found = await getFixture(fixtureId!);
      if (!found) {
        return reply.code(404).send({ error: `fixture "${fixtureId}" not found` });
      }
      fixture = found;
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

    const { typst, images } = blocksToTypst(fixture.blocks);
    // Les images d'un document Docs sont des URL (http://…/media/…), pas des fichiers de
    // FIXTURES_DIR : les résoudre comme un chemin local finit en ENOENT, donc en 500 avec
    // l'arborescence du serveur dans la réponse. Refus explicite tant que le téléchargement
    // des images Docs n'est pas implémenté ; un document Docs n'a jamais d'image locale.
    if ((docId && images.length > 0) || images.some((img) => /^https?:\/\//i.test(img.src))) {
      return reply.code(422).send({ error: "Les images des documents Docs ne sont pas encore prises en charge." });
    }
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
      const { count, unsupported } = inspectBlocks(fixture.blocks);
      reply.header("Content-Type", "application/pdf");
      reply.header("X-Dots-Block-Count", String(count));
      reply.header("X-Dots-Unsupported-Blocks", JSON.stringify(unsupported));
      return reply.send(pdf);
    } catch (err) {
      if (err instanceof TypstCompileError) {
        return reply.code(422).send({ error: "typst compile failed", details: err.stderr });
      }
      throw err;
    }
  });
}
