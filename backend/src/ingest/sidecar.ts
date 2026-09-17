/**
 * Appel du script Python d'extraction (backend/ingest/extract.py).
 *
 * PyMuPDF n'existe pas en JavaScript avec les mêmes commodités (géométrie
 * vectorielle, masques, ordre de tracé) : l'extraction reste en Python et le
 * backend la lance en sous-processus. Les arguments passent en tableau
 * (execFile, jamais de chaîne shell) parce que l'entrée vient d'un fichier
 * téléversé.
 */
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const HERE = path.dirname(fileURLToPath(import.meta.url));
/** src/ingest/ (source) comme dist/ingest/ (build) sont à deux niveaux de backend/. */
const BACKEND_DIR = path.resolve(HERE, "../..");
const SCRIPT = path.join(BACKEND_DIR, "ingest", "extract.py");
const VENV_PYTHON = path.join(BACKEND_DIR, "ingest", ".venv", "bin", "python3");

/** A DOCX analysis renders both the source and its three-page probe. */
const TIMEOUT_MS = 260_000;
const MAX_OUTPUT = 4 * 1024 * 1024;

export class SidecarError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
  }
}

/** Interpréteur : variable d'environnement, puis venv du dossier ingest, puis python3 du PATH. */
function interpreter(): string {
  const configured = process.env.DOTS_PYTHON;
  if (configured) return configured;
  if (existsSync(VENV_PYTHON)) return VENV_PYTHON;
  return "python3";
}

export interface Region {
  kind: "header" | "footer" | "page";
  x: number;
  y: number;
  width: number;
  height: number;
  /** Vrai quand la zone est dessinée (tracés) et non posée en bitmap. */
  vector: boolean;
}

export type DocxBandScope = "all" | "first" | "except-first";

/** Full-width visual composed by Word/LibreOffice, never a loose media file. */
export interface DocxBand {
  kind: "header" | "footer";
  scope: DocxBandScope;
  /** Private file in the ingest job, copied to template assets only on confirmation. */
  file: string;
  widthPt: number;
  heightPt: number;
  bytes: number;
}

export interface DocxPagination {
  kind: "header" | "footer";
  scope: DocxBandScope;
  numbering: "n" | "n-of-total" | "page-n-of-total";
  align: "left" | "center" | "right";
}

export interface DocxAnalysis {
  bands: DocxBand[];
  /** Dynamic fields removed from the raster probe; PR 2 maps these to LayoutConfig. */
  pagination: DocxPagination[];
  differentFirstPage: boolean;
  evenOddDifferent: boolean;
  sectionCount: number;
  warnings: string[];
}

export interface Analysis {
  mode: "page";
  page: {
    widthPt: number;
    heightPt: number;
    count: number;
    previewScale: number;
    preview: string | null;
  };
  regions: Region[];
  /** Renseigné pour un DOCX rendu ; absent pour un PDF. */
  docx?: DocxAnalysis;
  /** Sous-ensemble de LayoutConfig relevé sur la page : pas d'en-tête ni de pied. */
  layout: {
    paper: string;
    orientation: string;
    margins: { top: number; bottom: number; left: number; right: number };
    font: string;
    fontSize: number;
    lineHeight: number;
    headings: { scale: string; color: string };
  };
  /** Police du document absente du serveur, remplacée par Marianne. */
  fontSubstitution: string | null;
  counts: { text: number; shapes: number; images: number };
}

export interface Fragment {
  file: string;
  widthPt: number;
  heightPt: number;
  bytes: number;
}

async function run<T>(args: string[]): Promise<T> {
  let stdout = "";
  try {
    ({ stdout } = await execFileAsync(interpreter(), [SCRIPT, ...args], {
      timeout: TIMEOUT_MS,
      maxBuffer: MAX_OUTPUT,
    }));
  } catch (error) {
    const err = error as { stdout?: string; stderr?: string; code?: string };
    // Le script signale ses erreurs attendues en JSON sur stdout avant de sortir en 1.
    const reported = parse(err.stdout ?? "");
    if (reported && reported.ok === false) {
      throw new SidecarError(String(reported.error), String(reported.code ?? "extract_failed"));
    }
    if (err.code === "ENOENT") {
      throw new SidecarError(
        "Python introuvable sur le serveur : voir backend/ingest/README.md.",
        "no_python",
      );
    }
    const detail = (err.stderr ?? "").trim().split("\n").slice(-1)[0] || String(error);
    throw new SidecarError(`Extraction impossible : ${detail}`, "extract_failed");
  }
  const parsed = parse(stdout);
  if (!parsed || parsed.ok !== true) {
    throw new SidecarError("Réponse inattendue de l'extracteur", "bad_output");
  }
  return parsed as T;
}

function parse(raw: string): (Record<string, unknown> & { ok?: unknown }) | null {
  try {
    const value = JSON.parse(raw.trim());
    return value && typeof value === "object" ? value : null;
  } catch {
    return null;
  }
}

export async function analyzeDocument(input: string, outDir: string): Promise<Analysis> {
  return run<Analysis>(["analyze", "--input", input, "--out", outDir]);
}

export interface CropRequest {
  input: string;
  outDir: string;
  rect: { x: number; y: number; width: number; height: number };
  vector: boolean;
  name: string;
}

export async function cropRegion(request: CropRequest): Promise<Fragment> {
  const { x, y, width, height } = request.rect;
  const rect = [x, y, x + width, y + height].map((v) => v.toFixed(2)).join(",");
  const args = ["crop", "--input", request.input, "--out", request.outDir, "--rect", rect, "--name", request.name];
  if (request.vector) args.push("--vector");
  return run<Fragment>(args);
}
