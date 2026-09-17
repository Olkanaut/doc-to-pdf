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
import type { ImportModelV1 } from "../template-model/importModel.js";

const execFileAsync = promisify(execFile);

const HERE = path.dirname(fileURLToPath(import.meta.url));
/** src/ingest/ (source) comme dist/ingest/ (build) sont à deux niveaux de backend/. */
const BACKEND_DIR = path.resolve(HERE, "../..");
const SCRIPT = path.join(BACKEND_DIR, "ingest", "extract.py");
const VENV_PYTHON = path.join(BACKEND_DIR, "ingest", ".venv", "bin", "python3");

const TIMEOUT_MS = 60_000;
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

/** Visuel sorti tel quel d'un .docx : aucun recadrage ne s'y applique. */
export interface DocxAsset {
  /** Chemin dans le zip, seule forme acceptée pour le ressortir. */
  id: string;
  name: string;
  kind: "header" | "footer" | "body";
  vector: boolean;
  bytes: number;
  widthPt: number;
  heightPt: number;
}

export interface Analysis {
  /**
   * « page » : une page est rendue, des bandes y sont proposées, tout se joue
   * au recadrage. « assets » : les visuels viennent du zip d'un .docx, il n'y a
   * ni rendu ni recadrage — seulement un choix.
   */
  mode: "page" | "assets";
  page: {
    widthPt: number;
    heightPt: number;
    count: number;
    previewScale: number;
    preview: string | null;
  };
  regions: Region[];
  /** Renseigné en mode « assets » seulement. */
  assets?: DocxAsset[];
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
  /** Observation structurée du document, plus riche que les zones de recadrage historiques. */
  importModel?: ImportModelV1;
}

export interface PreparedPage {
  id: string;
  pageIndex: number;
  widthPt: number;
  heightPt: number;
  rotation: 0 | 90 | 180 | 270;
  thumbnail?: string | null;
}

export interface PreparedAnalysis {
  prepared: true;
  mode: "prepared";
  page: {
    widthPt: number;
    heightPt: number;
    count: number;
    previewScale: number;
    preview: string | null;
  };
  pages: PreparedPage[];
  warnings: Array<{ code: string; message: string }>;
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

export async function inspectDocument(input: string, outDir: string): Promise<PreparedAnalysis> {
  return run<PreparedAnalysis>(["inspect", "--input", input, "--out", outDir]);
}

export async function analyzeDocument(
  input: string,
  outDir: string,
  pageIndexes?: readonly number[],
): Promise<Analysis> {
  const args = ["analyze", "--input", input, "--out", outDir];
  if (pageIndexes?.length) args.push("--pages", pageIndexes.join(","));
  return run<Analysis>(args);
}

/** Sort un visuel d'un .docx sans le recoder ni composer le document. */
export async function takeAsset(
  input: string,
  outDir: string,
  entry: string,
  name: string,
): Promise<Fragment> {
  return run<Fragment>(["asset", "--input", input, "--out", outDir, "--entry", entry, "--name", name]);
}

export interface CropRequest {
  input: string;
  outDir: string;
  rect: { x: number; y: number; width: number; height: number };
  pageIndex?: number;
  vector: boolean;
  name: string;
}

export async function cropRegion(request: CropRequest): Promise<Fragment> {
  const { x, y, width, height } = request.rect;
  const rect = [x, y, x + width, y + height].map((v) => v.toFixed(2)).join(",");
  const pageIndex = Number.isInteger(request.pageIndex) ? request.pageIndex : 0;
  const args = [
    "crop",
    "--input",
    request.input,
    "--out",
    request.outDir,
    "--rect",
    rect,
    "--name",
    request.name,
    "--page-index",
    String(pageIndex),
  ];
  if (request.vector) args.push("--vector");
  return run<Fragment>(args);
}
