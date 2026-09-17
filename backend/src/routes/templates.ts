import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
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
  // No blocks: an empty band renders nothing, the direct equivalent of the old `enabled: false`.
  header: defaultLayout().header,
  footer: defaultLayout().footer,
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

/** A logo sits well under this; it's not meant to hold a whole scanned document. */
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
/** Base64 runs ~1.34x the raw size; the JSON body needs the room. */
const IMAGE_BODY_LIMIT = 8 * 1024 * 1024;

/**
 * The image's real type, read from its bytes rather than its name — a
 * renamed .jpg must not pass as a .png. Same principle as /api/ingest.
 */
export function sniffImageExt(bytes: Buffer): "png" | "jpeg" | "svg" | null {
  const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(PNG_MAGIC)) return "png";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpeg";
  // SVG is text and may open with a comment or an XML declaration before <svg>,
  // so this looks for the tag rather than requiring an exact prefix.
  if (bytes.subarray(0, 1024).toString("utf8").toLowerCase().includes("<svg")) return "svg";
  return null;
}

/** Readable, collision-free, nothing coming from the client. */
function uploadedAssetName(ext: string): string {
  return `logo-${randomBytes(4).toString("hex")}.${ext}`;
}

/** Image names are already filtered by sanitizeLayout; here the file must also exist. */
async function withExistingLogo(cfg: LayoutConfig): Promise<LayoutConfig> {
  const assets = await listAssets();
  for (const band of [cfg.header, cfg.footer]) {
    for (const block of band.blocks) {
      if (block.image && !assets.includes(block.image)) block.image = null;
    }
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

  /**
   * Direct upload of a visual (PNG/JPEG/SVG): unlike /api/ingest, there is
   * nothing to crop, the file lands in the shared assets as it is.
   */
  app.post<{ Body: { fileBase64?: string; filename?: string } }>(
    "/api/templates/assets",
    { bodyLimit: IMAGE_BODY_LIMIT },
    async (req, reply) => {
      const session = await requireSession(req, reply);
      if (!session) return;

      const { fileBase64 } = req.body ?? {};
      if (typeof fileBase64 !== "string" || !fileBase64) {
        return reply.code(400).send({ error: "fileBase64 requis" });
      }
      const data = fileBase64.replace(/^data:[^,]*,/, "").replace(/\s/g, "");
      if (!/^[A-Za-z0-9+/]+=*$/.test(data)) {
        return reply.code(400).send({ error: "fileBase64 n'est pas du base64" });
      }
      const bytes = Buffer.from(data, "base64");
      if (bytes.length === 0) return reply.code(400).send({ error: "Fichier vide" });
      if (bytes.length > MAX_IMAGE_BYTES) {
        return reply
          .code(413)
          .send({ code: "too_large", error: "Image trop volumineuse : 5 Mo au plus" });
      }
      const ext = sniffImageExt(bytes);
      if (!ext) {
        return reply
          .code(415)
          .send({ code: "unsupported_format", error: "PNG, JPEG ou SVG uniquement" });
      }

      const file = uploadedAssetName(ext);
      await mkdir(TEMPLATES_ASSETS_DIR, { recursive: true });
      await writeFile(path.join(TEMPLATES_ASSETS_DIR, file), bytes);
      return reply.code(201).send({ file });
    },
  );

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
