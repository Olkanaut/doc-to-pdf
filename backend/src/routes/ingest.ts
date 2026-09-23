/**
 * Import d'un PDF ou d'un .docx comme template Typst.
 *
 * Trois temps, un dossier de travail par import (ingest/jobs.ts) :
 *   POST /api/ingest                → dépôt, analyse, zones proposées
 *   GET  /api/ingest/:id/preview    → rendu de la première page (pour le recadrage)
 *   POST /api/ingest/:id/fragment   → importe une zone PDF ou un bandeau DOCX
 *   POST /api/ingest/:id/template   → compose puis crée le template dans Docs
 *
 * Le fichier arrive en base64 dans du JSON, comme /api/ai/template-from-pdf :
 * pas de dépendance multipart pour un seul champ.
 */
import { randomBytes } from "node:crypto";
import { copyFile, readFile } from "node:fs/promises";
import path from "node:path";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { TEMPLATES_ASSETS_DIR } from "../templates/assets.js";
import {
  createExternalTemplate,
  TemplatesApiError,
} from "../clients/templatesClient.js";
import { getAuthSession, type AuthSession } from "./auth.js";
import {
  analyzeDocument,
  cropRegion,
  SidecarError,
  type Analysis,
  type DocxBand,
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
  type PaginationPlacement,
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
  /** Rendered DOCX band; the server chooses the known private file. */
  docxBand?: "header" | "footer";
  vector?: boolean;
  kind?: string;
}

interface DocxTemplateSelection {
  header?: boolean;
  footer?: boolean;
  differentFirstPage?: boolean;
}

interface TemplateBody {
  name?: string;
  header?: Rect | null;
  footer?: Rect | null;
  docx?: DocxTemplateSelection;
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

  /** Importe une zone PDF ou un bandeau DOCX dans les assets de l'éditeur. */
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

        if (req.body?.docxBand) {
          if (!analysis.docx)
            return reply.code(400).send({ ok: false, error: "Cet import n'est pas un DOCX" });
          const selected = selectDocxBands(analysis, req.body.docxBand, false)[0];
          if (!selected)
            return reply.code(400).send({ ok: false, error: "Bandeau absent du DOCX" });
          const placement = await copyDocxBand(job, selected, "all");
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
        let layout: ReturnType<typeof buildLayout>;
        let fragments: Placement[];

        if (req.body?.docx !== undefined) {
          if (!analysis.docx)
            return reply.code(400).send({ ok: false, error: "Cet import n'est pas un DOCX" });
          if (!req.body.docx || typeof req.body.docx !== "object")
            return reply.code(400).send({ ok: false, error: "Sélection DOCX invalide" });
          const differentFirstPage =
            req.body.docx.differentFirstPage === true && analysis.docx.differentFirstPage;
          const headerBands = req.body.docx.header === true
            ? selectDocxBands(analysis, "header", differentFirstPage)
            : [];
          const footerBands = req.body.docx.footer === true
            ? selectDocxBands(analysis, "footer", differentFirstPage)
            : [];
          const headers = await Promise.all(
            headerBands.map((band) => copyDocxBand(job, band, band.scope)),
          );
          const footers = await Promise.all(
            footerBands.map((band) => copyDocxBand(job, band, band.scope)),
          );
          const pagination = req.body.docx.footer === true
            ? selectDocxPagination(analysis, differentFirstPage)
            : null;
          fragments = [...headers, ...footers];
          layout = buildLayout({ analysis, headers, footers, pagination });
        } else {
          const vector = req.body?.vector === true;
          const headerRect = sanitizeRect(req.body?.header, analysis);
          const footerRect = sanitizeRect(req.body?.footer, analysis);
          const header = headerRect
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
          fragments = [header, footer].filter((item): item is Placement => Boolean(item));
          layout = buildLayout({ analysis, header, footer });
        }

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
          fragments,
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

function selectDocxBands(
  analysis: Analysis,
  kind: DocxBand["kind"],
  differentFirstPage: boolean,
): DocxBand[] {
  const bands = analysis.docx?.bands.filter((band) => band.kind === kind) ?? [];
  const all = bands.find((band) => band.scope === "all");
  if (all) return [all];
  if (differentFirstPage) {
    return ["first", "except-first"]
      .map((scope) => bands.find((band) => band.scope === scope))
      .filter((band): band is DocxBand => Boolean(band));
  }
  const normal =
    bands.find((band) => band.scope === "except-first") ??
    bands.find((band) => band.scope === "first");
  return normal ? [{ ...normal, scope: "all" }] : [];
}

function selectDocxPagination(
  analysis: Analysis,
  differentFirstPage: boolean,
): PaginationPlacement | null {
  const choices = analysis.docx?.pagination.filter((item) => item.kind === "footer") ?? [];
  const selected =
    choices.find((item) => item.scope === "all") ??
    choices.find((item) => item.scope === "except-first") ??
    choices.find((item) => item.scope === "first");
  if (!selected) return null;
  return {
    numbering: selected.numbering,
    align: selected.align,
    scope: differentFirstPage ? selected.scope : "all",
  };
}

async function copyDocxBand(
  job: Job,
  band: DocxBand,
  scope: Placement["scope"],
): Promise<Placement> {
  if (
    path.basename(band.file) !== band.file ||
    !/^docx-(header|footer)-(all|first|except-first)\.png$/.test(band.file)
  ) {
    throw new SidecarError("Bandeau DOCX invalide", "invalid_docx_band");
  }
  const base = `${band.kind === "header" ? "docx-h" : "docx-f"}-${scope ?? "all"}`;
  const file = assetName(base, "png");
  await copyFile(path.join(job.dir, band.file), path.join(TEMPLATES_ASSETS_DIR, file));
  return {
    file,
    widthPt: band.widthPt,
    heightPt: band.heightPt,
    fullBleed: true,
    scope,
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
