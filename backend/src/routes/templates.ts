import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import path from "node:path";
import { readdir, readFile, rm } from "node:fs/promises";
import { TEMPLATES_ASSETS_DIR } from "../registry/templates.js";
import {
  createExternalTemplate,
  deleteExternalTemplate,
  getExternalTemplate,
  listExternalTemplates,
  TemplatesApiError,
  updateExternalTemplate,
  type TemplateDetail,
  type TemplateSummary,
} from "../clients/templatesClient.js";
import { getAuthSession, type AuthSession } from "./auth.js";
import { checkTemplateSource } from "../layout/check.js";
import { defaultLayout, sanitizeLayout, type LayoutConfig } from "../layout/layoutConfig.js";
import { applyLayout, readLayout } from "../layout/layoutTypst.js";
import {
  clearDefaultTemplateId,
  readDefaultTemplateId,
  writeDefaultTemplateId,
} from "../templates/defaultTemplate.js";
import { getCachedTemplateThumbnail } from "../templates/thumbnailCache.js";

/**
 * Point de départ d'un gabarit créé depuis l'éditeur : corps en serif, titres en
 * sans-serif bleu, tableaux à filets pleins et en-tête en gras, sans bande.
 *
 * Engendré par `applyLayout` plutôt qu'écrit à la main : le bloc « dots:layout » et
 * son JSON ne peuvent donc pas diverger, et le panneau de mise en page pilote tous
 * ces réglages dès la création.
 */
const HEADING_BLUE = "#2e5c8a";

const DEFAULT_SOURCE = applyLayout('#include "body.typ"\n', {
  ...defaultLayout(),
  margins: { top: 25, bottom: 25, left: 25, right: 25 },
  font: "Libertinus Serif",
  fontSize: 11,
  lineHeight: 1.3,
  textStyles: {
    body: { font: "Libertinus Serif", fontSize: 11, color: "#000000" },
    h1: { font: "Arial", fontSize: 15, color: HEADING_BLUE },
    h2: { font: "Arial", fontSize: 13, color: HEADING_BLUE },
    h3: { font: "Arial", fontSize: 10, color: HEADING_BLUE },
  },
  header: { ...defaultLayout().header, enabled: false },
  footer: { ...defaultLayout().footer, enabled: false },
  headings: { scale: "normal", color: HEADING_BLUE },
  table: { stroke: "full", headerFill: "none", zebra: false, fontSize: "inherit" },
});

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

async function requireSession(
  req: FastifyRequest,
  reply: FastifyReply,
): Promise<AuthSession | null> {
  const session = await getAuthSession(req, reply);
  if (!session) {
    reply.code(401).send({ error: "Authentication required" });
    return null;
  }
  return session;
}

function sendTemplatesError(
  req: FastifyRequest,
  reply: FastifyReply,
  error: unknown,
) {
  if (error instanceof TemplatesApiError) {
    if (error.statusCode >= 500) {
      req.log.warn({ err: error }, "Templates API request failed");
    }
    return reply.code(error.statusCode).send({ error: error.message });
  }
  throw error;
}

async function markDefaultTemplate(
  userId: string,
  templates: TemplateSummary[],
): Promise<TemplateSummary[]> {
  const storedDefaultId = await readDefaultTemplateId(userId);
  const storedDefaultExists = storedDefaultId
    ? templates.some((template) => template.id === storedDefaultId)
    : false;

  if (storedDefaultId && !storedDefaultExists) {
    await clearDefaultTemplateId(userId);
  }

  const defaultId = storedDefaultExists
    ? storedDefaultId
    : (templates[0]?.id ?? null);
  return templates.map((template) => ({
    ...template,
    isDefault: template.id === defaultId,
  }));
}

async function getDefaultTemplateFromExternal(
  userId: string,
  accessToken: string,
): Promise<TemplateSummary | null> {
  const templates = await markDefaultTemplate(
    userId,
    await listExternalTemplates(accessToken),
  );
  return templates.find((template) => template.isDefault) ?? null;
}

async function withDefaultFlag(
  userId: string,
  template: TemplateDetail,
): Promise<TemplateDetail> {
  const defaultId = await readDefaultTemplateId(userId);
  return {
    ...template,
    isDefault: template.id === defaultId,
  };
}

/** Images du dossier d'assets partagé, utilisables comme logo. */
async function listAssets(): Promise<string[]> {
  const entries = await readdir(TEMPLATES_ASSETS_DIR, {
    withFileTypes: true,
  }).catch(() => []);
  return entries
    .filter((e) => e.isFile() && ASSET_RE.test(e.name))
    .map((e) => e.name)
    .sort();
}

/**
 * Asset deletion: the folder is shared across all templates, so this is
 * gated behind an env flag (demo cleanup), not a public-facing feature.
 */
function assetDeleteEnabled(): boolean {
  return process.env.DOTS_ENABLE_ASSET_DELETE === "1";
}

/** Le nom du logo est déjà filtré par sanitizeLayout ; ici on exige que le fichier existe. */
async function withExistingLogo(cfg: LayoutConfig): Promise<LayoutConfig> {
  const assets = await listAssets();
  if (cfg.header.logo && !assets.includes(cfg.header.logo)) {
    cfg.header.logo = null;
  }
  if (cfg.header.first.logo && !assets.includes(cfg.header.first.logo)) {
    cfg.header.first.logo = null;
  }
  if (cfg.footer.logo && !assets.includes(cfg.footer.logo)) {
    cfg.footer.logo = null;
  }
  if (cfg.footer.first.logo && !assets.includes(cfg.footer.first.logo)) {
    cfg.footer.first.logo = null;
  }
  return cfg;
}

export async function templatesRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/templates", async (req, reply) => {
    const session = await requireSession(req, reply);
    if (!session) return;

    try {
      return markDefaultTemplate(
        session.user.sub,
        await listExternalTemplates(session.accessToken),
      );
    } catch (error) {
      return sendTemplatesError(req, reply, error);
    }
  });

  // Routes statiques sous /api/templates/… : find-my-way les préfère à `:id`
  // quel que soit l'ordre d'enregistrement ; elles sont groupées ici pour la lisibilité.
  app.get("/api/templates/default", async (req, reply) => {
    const session = await requireSession(req, reply);
    if (!session) return;

    try {
      const meta = await getDefaultTemplateFromExternal(
        session.user.sub,
        session.accessToken,
      );
      if (!meta) return reply.code(404).send({ error: "no default template" });
      return meta;
    } catch (error) {
      return sendTemplatesError(req, reply, error);
    }
  });

  app.put<{ Body: { templateId?: unknown } }>(
    "/api/templates/default",
    async (req, reply) => {
      const session = await requireSession(req, reply);
      if (!session) return;

      const id = req.body?.templateId;
      // Un id est un uuid ou un nom de semis : jamais de chemin (`a/../b` passerait le contrôle d'existence).
      if (typeof id !== "string" || !/^[\w-]+$/.test(id)) {
        return reply.code(400).send({ error: "templateId requis" });
      }

      try {
        const meta = await getExternalTemplate(id, session.accessToken);
        await writeDefaultTemplateId(session.user.sub, meta.id);
        return { ...meta, isDefault: true };
      } catch (error) {
        return sendTemplatesError(req, reply, error);
      }
    },
  );

  app.post<{ Body: { source: string; fixtureId?: string } }>(
    "/api/templates/check",
    async (req, reply) => {
      const result = await checkTemplateSource(req.body ?? { source: "" });
      return reply.code(result.ok ? 200 : 422).send(result);
    },
  );

  app.get("/api/templates/assets", async () => {
    return {
      assets: (await listAssets()).map((file) => ({ file })),
      canDelete: assetDeleteEnabled(),
    };
  });

  /** Octets d'un asset : vignettes de la galerie d'en-tête/pied de page. */
  app.get<{ Params: { file: string } }>(
    "/api/templates/assets/:file",
    async (req, reply) => {
      const { file } = req.params;
      // Le nom vient de l'URL : il doit être exactement un des fichiers listés.
      if (!(await listAssets()).includes(file)) {
        return reply.code(404).send({ error: "Asset inconnu" });
      }
      const bytes = await readFile(path.join(TEMPLATES_ASSETS_DIR, file));
      const type = file.endsWith(".svg")
        ? "image/svg+xml"
        : /\.jpe?g$/i.test(file)
          ? "image/jpeg"
          : "image/png";
      return reply
        .type(type)
        .header("Cache-Control", "private, max-age=3600")
        .send(bytes);
    },
  );

  /** Deletes a shared asset. Gated behind DOTS_ENABLE_ASSET_DELETE. */
  app.delete<{ Params: { file: string } }>(
    "/api/templates/assets/:file",
    async (req, reply) => {
      if (!assetDeleteEnabled())
        return reply.code(404).send({ error: "Not found" });

      const session = await requireSession(req, reply);
      if (!session) return;

      const { file } = req.params;
      // The name comes from the URL: it must be exactly one of the listed files.
      if (!(await listAssets()).includes(file)) {
        return reply.code(404).send({ error: "Asset inconnu" });
      }
      await rm(path.join(TEMPLATES_ASSETS_DIR, file));
      return reply.code(204).send();
    },
  );

  app.get<{ Params: { id: string } }>(
    "/api/templates/:id",
    async (req, reply) => {
      const session = await requireSession(req, reply);
      if (!session) return;

      try {
        const template = await getExternalTemplate(
          req.params.id,
          session.accessToken,
        );
        return withDefaultFlag(session.user.sub, template);
      } catch (error) {
        return sendTemplatesError(req, reply, error);
      }
    },
  );

  app.post<{ Body: CreateBody }>("/api/templates", async (req, reply) => {
    const session = await requireSession(req, reply);
    if (!session) return;

    const { name, description, source } = req.body ?? {};
    try {
      const created = await createExternalTemplate(
        {
          name: name?.trim() || "Nouveau template",
          description: description?.trim() ?? "",
          source: source ?? DEFAULT_SOURCE,
        },
        session.accessToken,
      );
      return reply
        .code(201)
        .send(await withDefaultFlag(session.user.sub, created));
    } catch (error) {
      return sendTemplatesError(req, reply, error);
    }
  });

  app.put<{ Params: { id: string }; Body: UpdateBody }>(
    "/api/templates/:id",
    async (req, reply) => {
      const session = await requireSession(req, reply);
      if (!session) return;

      try {
        const updated = await updateExternalTemplate(
          req.params.id,
          req.body ?? {},
          session.accessToken,
        );
        return withDefaultFlag(session.user.sub, updated);
      } catch (error) {
        return sendTemplatesError(req, reply, error);
      }
    },
  );

  app.delete<{ Params: { id: string } }>(
    "/api/templates/:id",
    async (req, reply) => {
      const session = await requireSession(req, reply);
      if (!session) return;

      try {
        await deleteExternalTemplate(req.params.id, session.accessToken);
        if ((await readDefaultTemplateId(session.user.sub)) === req.params.id) {
          await clearDefaultTemplateId(session.user.sub);
        }
        return reply.code(204).send();
      } catch (error) {
        return sendTemplatesError(req, reply, error);
      }
    },
  );

  app.get<{ Params: { id: string } }>(
    "/api/templates/:id/thumbnail",
    async (req, reply) => {
      const session = await requireSession(req, reply);
      if (!session) return;

      try {
        const template = await getExternalTemplate(
          req.params.id,
          session.accessToken,
        );
        const png = await getCachedTemplateThumbnail({
          templateId: template.id,
          updatedAt: template.updatedAt,
          source: template.source,
        });
        if (!png) return reply.code(404).send();
        reply.header("Cache-Control", "public, max-age=31536000, immutable");
        reply.header("Content-Type", "image/png");
        return reply.send(png);
      } catch (error) {
        return sendTemplatesError(req, reply, error);
      }
    },
  );

  // ── Mise en page (bloc « dots:layout » du .typ) ────────────────────────────

  app.get<{ Params: { id: string } }>(
    "/api/templates/:id/layout",
    async (req, reply) => {
      const session = await requireSession(req, reply);
      if (!session) return;

      try {
        const template = await getExternalTemplate(
          req.params.id,
          session.accessToken,
        );
        return readLayout(template.source);
      } catch (error) {
        return sendTemplatesError(req, reply, error);
      }
    },
  );

  app.put<{ Params: { id: string }; Body: { layout?: unknown } }>(
    "/api/templates/:id/layout",
    async (req, reply) => {
      const session = await requireSession(req, reply);
      if (!session) return;

      const layout = req.body?.layout;
      if (!layout || typeof layout !== "object") {
        return reply.code(400).send({ error: "layout is required" });
      }

      try {
        const current = await getExternalTemplate(
          req.params.id,
          session.accessToken,
        );
        const cfg = await withExistingLogo(sanitizeLayout(layout));
        const source = applyLayout(current.source, cfg);
        const meta = await updateExternalTemplate(
          req.params.id,
          { source },
          session.accessToken,
        );
        return { meta: await withDefaultFlag(session.user.sub, meta), source };
      } catch (error) {
        return sendTemplatesError(req, reply, error);
      }
    },
  );

  /** Pur : rien n'est enregistré. */
  app.post<{ Body: { source?: unknown; layout?: unknown } }>(
    "/api/layout/compose",
    async (req, reply) => {
      const { source, layout } = req.body ?? {};
      if (typeof source !== "string")
        return reply.code(400).send({ error: "source is required" });
      const cfg = await withExistingLogo(sanitizeLayout(layout));
      return { source: applyLayout(source, cfg) };
    },
  );

  app.post<{ Body: { source?: unknown } }>(
    "/api/layout/read",
    async (req, reply) => {
      const source = req.body?.source;
      if (typeof source !== "string")
        return reply.code(400).send({ error: "source is required" });
      return readLayout(source);
    },
  );
}
