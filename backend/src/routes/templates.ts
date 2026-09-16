import type { FastifyInstance } from "fastify";
import { readdir } from "node:fs/promises";
import {
  listTemplates,
  getTemplateMeta,
  getTemplateSource,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  getThumbnail,
  getDefaultTemplate,
  setDefaultTemplate,
  TEMPLATES_ASSETS_DIR,
} from "../registry/templates.js";
import { checkTemplateSource } from "../layout/check.js";
import { sanitizeLayout, type LayoutConfig } from "../layout/layoutConfig.js";
import { applyLayout, readLayout } from "../layout/layoutTypst.js";

const DEFAULT_SOURCE = `#set page(
  paper: "a4",
  margin: 2.5cm,
  footer: [
    #align(center)[#context counter(page).display("1 / 1", both: true)]
  ],
)

#include "body.typ"
`;

interface CreateBody {
  name?: string;
  description?: string;
  source?: string;
}

interface UpdateBody {
  name?: string;
  description?: string;
  source?: string;
}

const ASSET_RE = /\.(png|jpe?g|svg)$/i;

/** Images du dossier d'assets partagé, utilisables comme logo. */
async function listAssets(): Promise<string[]> {
  const entries = await readdir(TEMPLATES_ASSETS_DIR, { withFileTypes: true }).catch(() => []);
  return entries
    .filter((e) => e.isFile() && ASSET_RE.test(e.name))
    .map((e) => e.name)
    .sort();
}

/** Le nom du logo est déjà filtré par sanitizeLayout ; ici on exige que le fichier existe. */
async function withExistingLogo(cfg: LayoutConfig): Promise<LayoutConfig> {
  if (cfg.header.logo && !(await listAssets()).includes(cfg.header.logo)) {
    cfg.header.logo = null;
  }
  return cfg;
}

export async function templatesRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/templates", async () => {
    return listTemplates();
  });

  // Routes statiques sous /api/templates/… : find-my-way les préfère à `:id`
  // quel que soit l'ordre d'enregistrement ; elles sont groupées ici pour la lisibilité.
  app.get("/api/templates/default", async (_req, reply) => {
    const meta = await getDefaultTemplate();
    if (!meta) return reply.code(404).send({ error: "no default template" });
    return meta;
  });

  app.put<{ Body: { templateId?: unknown } }>("/api/templates/default", async (req, reply) => {
    const id = req.body?.templateId;
    // Un id est un uuid ou un nom de semis : jamais de chemin (`a/../b` passerait le contrôle d'existence).
    if (typeof id !== "string" || !/^[\w-]+$/.test(id)) {
      return reply.code(400).send({ error: "templateId requis" });
    }
    const meta = await setDefaultTemplate(id);
    if (!meta) return reply.code(404).send({ error: "template not found" });
    return meta;
  });

  app.post<{ Body: { source: string; fixtureId?: string } }>(
    "/api/templates/check",
    async (req, reply) => {
      const result = await checkTemplateSource(req.body ?? { source: "" });
      return reply.code(result.ok ? 200 : 422).send(result);
    },
  );

  app.get("/api/templates/assets", async () => {
    return { assets: (await listAssets()).map((file) => ({ file })) };
  });

  app.get<{ Params: { id: string } }>("/api/templates/:id", async (req, reply) => {
    const meta = await getTemplateMeta(req.params.id);
    if (!meta) return reply.code(404).send({ error: "template not found" });
    const source = await getTemplateSource(req.params.id);
    return { ...meta, source };
  });

  app.post<{ Body: CreateBody }>("/api/templates", async (req, reply) => {
    const { name, description, source } = req.body ?? {};
    const created = await createTemplate({
      name: name?.trim() || "Nouveau gabarit",
      description: description?.trim() ?? "",
      source: source ?? DEFAULT_SOURCE,
    });
    return reply.code(201).send(created);
  });

  app.put<{ Params: { id: string }; Body: UpdateBody }>(
    "/api/templates/:id",
    async (req, reply) => {
      const updated = await updateTemplate(req.params.id, req.body ?? {});
      if (!updated) return reply.code(404).send({ error: "template not found" });
      return updated;
    },
  );

  app.delete<{ Params: { id: string } }>("/api/templates/:id", async (req, reply) => {
    const ok = await deleteTemplate(req.params.id);
    if (!ok) return reply.code(404).send({ error: "template not found" });
    return reply.code(204).send();
  });

  app.get<{ Params: { id: string } }>("/api/templates/:id/thumbnail", async (req, reply) => {
    const png = await getThumbnail(req.params.id);
    if (!png) return reply.code(404).send();
    reply.header("Cache-Control", "public, max-age=31536000, immutable");
    reply.header("Content-Type", "image/png");
    return reply.send(png);
  });

  // ── Mise en page (bloc « dots:layout » du .typ) ────────────────────────────

  app.get<{ Params: { id: string } }>("/api/templates/:id/layout", async (req, reply) => {
    const source = await getTemplateSource(req.params.id);
    if (source === undefined) return reply.code(404).send({ error: "template not found" });
    return readLayout(source);
  });

  app.put<{ Params: { id: string }; Body: { layout?: unknown } }>(
    "/api/templates/:id/layout",
    async (req, reply) => {
      const layout = req.body?.layout;
      if (!layout || typeof layout !== "object") {
        return reply.code(400).send({ error: "layout is required" });
      }
      const current = await getTemplateSource(req.params.id);
      if (current === undefined) return reply.code(404).send({ error: "template not found" });
      const cfg = await withExistingLogo(sanitizeLayout(layout));
      const source = applyLayout(current, cfg);
      const meta = await updateTemplate(req.params.id, { source });
      if (!meta) return reply.code(404).send({ error: "template not found" });
      return { meta, source };
    },
  );

  /** Pur : rien n'est enregistré. */
  app.post<{ Body: { source?: unknown; layout?: unknown } }>(
    "/api/layout/compose",
    async (req, reply) => {
      const { source, layout } = req.body ?? {};
      if (typeof source !== "string") return reply.code(400).send({ error: "source is required" });
      const cfg = await withExistingLogo(sanitizeLayout(layout));
      return { source: applyLayout(source, cfg) };
    },
  );

  app.post<{ Body: { source?: unknown } }>("/api/layout/read", async (req, reply) => {
    const source = req.body?.source;
    if (typeof source !== "string") return reply.code(400).send({ error: "source is required" });
    return readLayout(source);
  });
}
