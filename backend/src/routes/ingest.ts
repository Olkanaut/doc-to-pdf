/**
 * Import d'un PDF ou d'un .docx comme template Typst.
 *
 * Trois temps, un dossier de travail par import (ingest/jobs.ts) :
 *   POST /api/ingest                → dépôt, analyse, zones proposées
 *   GET  /api/ingest/:id/preview    → rendu de la première page (pour le recadrage)
 *   POST /api/ingest/:id/fragment   → découpe une zone, la range dans les assets
 *   POST /api/ingest/:id/template   → découpe puis crée le template dans Docs
 *
 * Le fichier arrive en base64 dans du JSON, comme /api/ai/template-from-pdf :
 * pas de dépendance multipart pour un seul champ.
 */
import { randomBytes } from "node:crypto";
import { copyFile, readFile } from "node:fs/promises";
import path from "node:path";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { TEMPLATES_ASSETS_DIR } from "../registry/templates.js";
import {
  createExternalTemplate,
  TemplatesApiError,
} from "../clients/templatesClient.js";
import { getAuthSession, type AuthSession } from "./auth.js";
import {
  analyzeDocument,
  cropRegion,
  SidecarError,
  takeAsset,
  type Analysis,
  type Region,
} from "../ingest/sidecar.js";
import {
  cacheAnalysis,
  createJob,
  findJob,
  readCachedAnalysis,
  type Job,
} from "../ingest/jobs.js";
import {
  buildLayout,
  buildSource,
  type Placement,
} from "../ingest/templateFromAnalysis.js";

/** 10 Mo de fichier ≈ 13,4 Mo de base64 ; la limite Fastify laisse la marge. */
const MAX_BYTES = 10 * 1024 * 1024;
/** Part de la largeur de page au-delà de laquelle une zone est un bandeau. */
const FULL_WIDTH_RATIO = 0.9;
const BODY_LIMIT = 16 * 1024 * 1024;

interface IngestBody {
  fileBase64?: string;
  filename?: string;
}

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface FragmentBody {
  rect?: Rect;
  /** Mode « assets » : chemin du visuel dans le zip, au lieu d'une zone. */
  asset?: string;
  vector?: boolean;
  kind?: string;
}

interface TemplateBody {
  name?: string;
  header?: Rect | null;
  footer?: Rect | null;
  /** Mode « assets » : visuel à poser en en-tête. */
  headerAsset?: string | null;
  vector?: boolean;
}

/** Points d'injection, comme documentRoutes : les tests branchent une session et Docs. */
export interface IngestRoutesOptions {
  getSession?: (
    req: FastifyRequest,
    reply: FastifyReply,
  ) => Promise<AuthSession | null>;
  createTemplate?: typeof createExternalTemplate;
}

/** Nom de fichier d'asset : lisible, sans collision, sans rien qui vienne du client. */
function assetName(kind: string, ext: string): string {
  const slug = /^[a-z-]{1,20}$/.test(kind) ? kind : "fragment";
  return `${slug}-${randomBytes(4).toString("hex")}.${ext}`;
}

/** Zone reçue du client, bornée à la page : hors page, la découpe serait vide. */
function sanitizeRect(raw: unknown, analysis: Analysis): Rect | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const num = (v: unknown) =>
    typeof v === "number" && Number.isFinite(v) ? v : NaN;
  const x = Math.max(0, num(r.x));
  const y = Math.max(0, num(r.y));
  const width = num(r.width);
  const height = num(r.height);
  if ([x, y, width, height].some(Number.isNaN)) return null;
  const clampedW = Math.min(width, analysis.page.widthPt - x);
  const clampedH = Math.min(height, analysis.page.heightPt - y);
  if (clampedW < 1 || clampedH < 1) return null;
  return { x, y, width: clampedW, height: clampedH };
}

function sendSidecarError(reply: FastifyReply, error: unknown): FastifyReply {
  if (error instanceof SidecarError) {
    // Format refusé ou LibreOffice absent : la demande est recevable, le fichier non.
    const status = error.code === "unsupported_format" ? 415 : 422;
    return reply
      .code(status)
      .send({ ok: false, code: error.code, error: error.message });
  }
  if (error instanceof TemplatesApiError) {
    return reply
      .code(error.statusCode)
      .send({ ok: false, error: error.message });
  }
  return reply.code(500).send({ ok: false, error: (error as Error).message });
}

export async function ingestRoutes(
  app: FastifyInstance,
  options: IngestRoutesOptions = {},
): Promise<void> {
  const getSession = options.getSession ?? getAuthSession;
  const createTemplate = options.createTemplate ?? createExternalTemplate;

  async function requireSession(
    req: FastifyRequest,
    reply: FastifyReply,
  ): Promise<AuthSession | null> {
    const session = await getSession(req, reply);
    if (!session) {
      reply.code(401).send({ error: "Authentication required" });
      return null;
    }
    return session;
  }

  /** Analyse : dépose le fichier, rend la page 1, propose les zones. */
  app.post<{ Body: IngestBody }>(
    "/api/ingest",
    { bodyLimit: BODY_LIMIT },
    async (req, reply) => {
      const session = await requireSession(req, reply);
      if (!session) return;

      const { fileBase64, filename } = req.body ?? {};
      if (typeof fileBase64 !== "string" || !fileBase64) {
        return reply.code(400).send({ ok: false, error: "fileBase64 requis" });
      }
      const data = fileBase64.replace(/^data:[^,]*,/, "").replace(/\s/g, "");
      if (!/^[A-Za-z0-9+/]+=*$/.test(data)) {
        return reply
          .code(400)
          .send({ ok: false, error: "fileBase64 n'est pas du base64" });
      }
      const bytes = Buffer.from(data, "base64");
      if (bytes.length === 0)
        return reply.code(400).send({ ok: false, error: "Fichier vide" });
      if (bytes.length > MAX_BYTES) {
        return reply.code(413).send({
          ok: false,
          code: "too_large",
          error: "Fichier trop volumineux : 10 Mo au plus",
        });
      }

      const job = await createJob(
        bytes,
        typeof filename === "string" ? filename : "source.pdf",
      );
      try {
        const analysis = await analyzeDocument(job.input, job.dir);
        await cacheAnalysis(job, analysis);
        return { ok: true, jobId: job.id, ...analysis };
      } catch (error) {
        return sendSidecarError(reply, error);
      }
    },
  );

  /** Rendu de la première page, affiché derrière le rectangle de recadrage. */
  app.get<{ Params: { id: string } }>(
    "/api/ingest/:id/preview",
    async (req, reply) => {
      const session = await requireSession(req, reply);
      if (!session) return;

      const job = await findJob(req.params.id);
      if (!job)
        return reply
          .code(404)
          .send({ ok: false, error: "Import inconnu ou expiré" });
      const bytes = await readFile(path.join(job.dir, "page-1.png")).catch(
        () => null,
      );
      if (!bytes)
        return reply
          .code(404)
          .send({ ok: false, error: "Aperçu indisponible" });
      return reply
        .type("image/png")
        .header("Cache-Control", "private, max-age=600")
        .send(bytes);
    },
  );

  /**
   * Octets d'un visuel du .docx, pour la vignette du choix. L'index vaut
   * indirection : aucun chemin venant du client n'atteint le zip.
   */
  app.get<{ Params: { id: string; index: string } }>(
    "/api/ingest/:id/asset/:index",
    async (req, reply) => {
      const session = await requireSession(req, reply);
      if (!session) return;

      const job = await findJob(req.params.id);
      if (!job)
        return reply
          .code(404)
          .send({ ok: false, error: "Import inconnu ou expiré" });

      try {
        const analysis = await loadAnalysis(job);
        const index = Number(req.params.index);
        const asset = Number.isInteger(index)
          ? analysis.assets?.[index]
          : undefined;
        if (!asset)
          return reply.code(404).send({ ok: false, error: "Visuel inconnu" });

        // Sorti une fois puis relu : la vignette et le choix final le demandent.
        const name = `preview-${index}`;
        const fragment = await takeAsset(job.input, job.dir, asset.id, name);
        const bytes = await readFile(path.join(job.dir, fragment.file));
        const type = fragment.file.endsWith(".svg")
          ? "image/svg+xml"
          : /\.jpe?g$/i.test(fragment.file)
            ? "image/jpeg"
            : "image/png";
        return reply
          .type(type)
          .header("Cache-Control", "private, max-age=600")
          .send(bytes);
      } catch (error) {
        return sendSidecarError(reply, error);
      }
    },
  );

  /** Découpe une zone et la range dans les assets partagés (galerie de l'éditeur). */
  app.post<{ Params: { id: string }; Body: FragmentBody }>(
    "/api/ingest/:id/fragment",
    async (req, reply) => {
      const session = await requireSession(req, reply);
      if (!session) return;

      const job = await findJob(req.params.id);
      if (!job)
        return reply
          .code(404)
          .send({ ok: false, error: "Import inconnu ou expiré" });

      try {
        const analysis = await loadAnalysis(job);
        const kind = req.body?.kind;

        if (req.body?.asset) {
          const placement = await pickAsset(
            job,
            analysis,
            req.body.asset,
            kind,
          );
          if (!placement)
            return reply.code(400).send({ ok: false, error: "Visuel inconnu" });
          return { ok: true, ...placement };
        }

        const rect = sanitizeRect(req.body?.rect, analysis);
        if (!rect)
          return reply.code(400).send({ ok: false, error: "Zone invalide" });

        const placement = await extract(
          job.input,
          job.dir,
          rect,
          req.body?.vector === true,
          kind,
          analysis.page.widthPt,
        );
        return { ok: true, ...placement };
      } catch (error) {
        return sendSidecarError(reply, error);
      }
    },
  );

  /** Crée le template : zones découpées + relevé de la page → .typ dans Docs. */
  app.post<{ Params: { id: string }; Body: TemplateBody }>(
    "/api/ingest/:id/template",
    async (req, reply) => {
      const session = await requireSession(req, reply);
      if (!session) return;

      const job = await findJob(req.params.id);
      if (!job)
        return reply
          .code(404)
          .send({ ok: false, error: "Import inconnu ou expiré" });

      try {
        const analysis = await loadAnalysis(job);
        const vector = req.body?.vector === true;
        const headerRect = sanitizeRect(req.body?.header, analysis);
        const footerRect = sanitizeRect(req.body?.footer, analysis);

        const header = req.body?.headerAsset
          ? ((await pickAsset(
              job,
              analysis,
              req.body.headerAsset,
              "en-tete",
            )) ?? undefined)
          : headerRect
            ? await extract(
                job.input,
                job.dir,
                headerRect,
                vector,
                "en-tete",
                analysis.page.widthPt,
              )
            : undefined;
        const footer = footerRect
          ? await extract(
              job.input,
              job.dir,
              footerRect,
              vector,
              "pied-de-page",
              analysis.page.widthPt,
            )
          : undefined;

        const layout = buildLayout({ analysis, header, footer });
        const created = await createTemplate(
          {
            name: (req.body?.name ?? "").trim() || "Template importée",
            description: "Déduit d'un document importé",
            source: buildSource(layout),
          },
          session.accessToken,
        );
        return reply.code(201).send({
          ok: true,
          id: created.id,
          layout,
          fragments: [header, footer].filter(Boolean),
          fontSubstitution: analysis.fontSubstitution,
        });
      } catch (error) {
        return sendSidecarError(reply, error);
      }
    },
  );
}

/** Relevé de l'import, mis en cache au dépôt ; refait si le cache a disparu. */
async function loadAnalysis(job: Job): Promise<Analysis> {
  const cached = await readCachedAnalysis<Analysis>(job);
  if (cached) return cached;
  const analysis = await analyzeDocument(job.input, job.dir);
  await cacheAnalysis(job, analysis);
  return analysis;
}

/**
 * Mode « assets » : le visuel demandé doit être l'un de ceux que l'analyse a
 * listés — c'est ce qui empêche un chemin quelconque d'atteindre le zip.
 */
async function pickAsset(
  job: Job,
  analysis: Analysis,
  entry: string,
  kind: string | undefined,
): Promise<Placement | null> {
  const known = analysis.assets?.find((a) => a.id === entry);
  if (!known) return null;
  const base = kind && /^[a-z-]{1,20}$/.test(kind) ? kind : "fragment";
  const fragment = await takeAsset(job.input, job.dir, known.id, base);
  const file = assetName(base, fragment.file.split(".").pop() ?? "png");
  await copyFile(
    path.join(job.dir, fragment.file),
    path.join(TEMPLATES_ASSETS_DIR, file),
  );
  // Le .docx ne dit pas à quelle largeur le visuel était posé : un logo étiré
  // sur la page serait grotesque, donc placement normal, à hauteur fixe.
  return {
    file,
    widthPt: fragment.widthPt,
    heightPt: fragment.heightPt,
    fullBleed: false,
  };
}

/** Découpe puis range le fragment à côté des logos, d'où typst le recopie. */
async function extract(
  input: string,
  dir: string,
  rect: Rect,
  vector: boolean,
  kind: string | undefined,
  pageWidthPt: number,
): Promise<Placement> {
  const base = kind && /^[a-z-]{1,20}$/.test(kind) ? kind : "fragment";
  const fragment = await cropRegion({
    input,
    outDir: dir,
    rect,
    vector,
    name: base,
  });
  const ext = fragment.file.endsWith(".svg") ? "svg" : "png";
  const file = assetName(base, ext);
  await copyFile(
    path.join(dir, fragment.file),
    path.join(TEMPLATES_ASSETS_DIR, file),
  );
  return {
    file,
    widthPt: fragment.widthPt,
    heightPt: fragment.heightPt,
    // Une bande prise sur toute la largeur de la page est un bandeau ; une zone
    // plus étroite est un visuel, à poser dans la marge sans l'étirer.
    fullBleed: rect.width >= pageWidthPt * FULL_WIDTH_RATIO,
  };
}

export type { Region };
