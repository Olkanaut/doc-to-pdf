import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { readdir } from "node:fs/promises";
import {
  TEMPLATES_ASSETS_DIR,
} from "../registry/templates.js";
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
import { sanitizeLayout, type LayoutConfig } from "../layout/layoutConfig.js";
import { applyLayout, readLayout } from "../layout/layoutTypst.js";
import {
  clearDefaultTemplateId,
  readDefaultTemplateId,
  writeDefaultTemplateId,
} from "../templates/defaultTemplate.js";
import { getCachedTemplateThumbnail } from "../templates/thumbnailCache.js";

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

  const defaultId = storedDefaultExists ? storedDefaultId : (templates[0]?.id ?? null);
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
      const meta = await getDefaultTemplateFromExternal(session.user.sub, session.accessToken);
      if (!meta) return reply.code(404).send({ error: "no default template" });
      return meta;
    } catch (error) {
      return sendTemplatesError(req, reply, error);
    }
  });

  app.put<{ Body: { templateId?: unknown } }>("/api/templates/default", async (req, reply) => {
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
    const session = await requireSession(req, reply);
    if (!session) return;

    try {
      const template = await getExternalTemplate(req.params.id, session.accessToken);
      return withDefaultFlag(session.user.sub, template);
    } catch (error) {
      return sendTemplatesError(req, reply, error);
    }
  });

  app.post<{ Body: CreateBody }>("/api/templates", async (req, reply) => {
    const session = await requireSession(req, reply);
    if (!session) return;

    const { name, description, source } = req.body ?? {};
    try {
      const created = await createExternalTemplate(
        {
          name: name?.trim() || "Nouveau gabarit",
          description: description?.trim() ?? "",
          source: source ?? DEFAULT_SOURCE,
        },
        session.accessToken,
      );
      return reply.code(201).send(await withDefaultFlag(session.user.sub, created));
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

  app.delete<{ Params: { id: string } }>("/api/templates/:id", async (req, reply) => {
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
  });

  app.get<{ Params: { id: string } }>("/api/templates/:id/thumbnail", async (req, reply) => {
    const session = await requireSession(req, reply);
    if (!session) return;

    try {
      const template = await getExternalTemplate(req.params.id, session.accessToken);
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
  });

  // ── Mise en page (bloc « dots:layout » du .typ) ────────────────────────────

  app.get<{ Params: { id: string } }>("/api/templates/:id/layout", async (req, reply) => {
    const session = await requireSession(req, reply);
    if (!session) return;

    try {
      const template = await getExternalTemplate(req.params.id, session.accessToken);
      return readLayout(template.source);
    } catch (error) {
      return sendTemplatesError(req, reply, error);
    }
  });

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
        const current = await getExternalTemplate(req.params.id, session.accessToken);
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
