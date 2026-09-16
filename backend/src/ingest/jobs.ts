/**
 * Dossier de travail d'un import : le fichier déposé, le rendu de sa première
 * page et les fragments découpés. Un dossier par import, nommé par un UUID
 * tiré ici — jamais par un nom venant du client.
 *
 * Les fragments retenus sont ensuite copiés dans backend/templates/assets,
 * d'où typstCompile les recopie à chaque compilation ; le dossier d'import,
 * lui, est jetable.
 */
import { randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.DOTS_DATA_DIR
  ? path.join(process.env.DOTS_DATA_DIR, "..", "ingest")
  : path.resolve(__dirname, "../../data/ingest");

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Au-delà, un import est abandonné : on le supprime au prochain passage. */
const MAX_AGE_MS = 2 * 60 * 60 * 1000;

export interface Job {
  id: string;
  dir: string;
  /** Fichier déposé, tel que reçu. */
  input: string;
}

export async function createJob(bytes: Buffer, filename: string): Promise<Job> {
  await sweep();
  const id = randomUUID();
  const dir = path.join(DATA_DIR, id);
  await mkdir(dir, { recursive: true });
  // L'extension vient du nom d'origine mais n'est jamais crue : le script
  // Python reconnaît le type sur les octets du fichier.
  const ext = /\.(pdf|docx)$/i.exec(filename)?.[1].toLowerCase() ?? "bin";
  const input = path.join(dir, `source.${ext}`);
  await writeFile(input, bytes);
  return { id, dir, input };
}

/** `null` quand l'identifiant n'est pas un UUID ou que le dossier n'existe plus. */
export async function findJob(id: string): Promise<Job | null> {
  if (!UUID_RE.test(id)) return null;
  const dir = path.join(DATA_DIR, id);
  const entries = await readdir(dir).catch(() => null);
  if (!entries) return null;
  const source = entries.find((name) => /^source\./.test(name));
  if (!source) return null;
  return { id, dir, input: path.join(dir, source) };
}

/** Supprime les imports abandonnés. Appelé à chaque nouvel import, sans bloquer dessus. */
async function sweep(): Promise<void> {
  const entries = await readdir(DATA_DIR, { withFileTypes: true }).catch(() => []);
  const now = Date.now();
  await Promise.all(
    entries
      .filter((entry) => entry.isDirectory() && UUID_RE.test(entry.name))
      .map(async (entry) => {
        const dir = path.join(DATA_DIR, entry.name);
        const info = await stat(dir).catch(() => null);
        if (info && now - info.mtimeMs > MAX_AGE_MS) {
          await rm(dir, { recursive: true, force: true }).catch(() => {});
        }
      }),
  );
}

/**
 * L'analyse est relue par les appels suivants (découpe, création) plutôt que
 * refaite : elle re-rendrait la page à chaque fois.
 */
export async function cacheAnalysis(job: Job, analysis: unknown): Promise<void> {
  await writeFile(path.join(job.dir, "analysis.json"), JSON.stringify(analysis), "utf8");
}

export async function readCachedAnalysis<T>(job: Job): Promise<T | null> {
  const raw = await readFile(path.join(job.dir, "analysis.json"), "utf8").catch(() => null);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}
