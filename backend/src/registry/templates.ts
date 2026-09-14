import path from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { mkdir, readdir, readFile, writeFile, rm, stat } from "node:fs/promises";
import { compileToThumbnail, TypstCompileError } from "../compile/typstCompile.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Shared logo/font assets, reusable by any template (seeded or user-created). */
export const TEMPLATES_ASSETS_DIR = path.resolve(__dirname, "../../templates/assets");

/** Where the seed .typ files ship from (read-only source material for first run). */
const SEED_DIR = path.resolve(__dirname, "../../templates");

/** Where live template data (editable, deletable) is persisted. */
const DATA_DIR = path.resolve(__dirname, "../../data/templates");

export interface TemplateMeta {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
}

const SEEDS: { id: string; name: string; description: string; file: string }[] = [
  {
    id: "minimal",
    name: "Minimal",
    description: "Marges classiques, pagination centrée, sans en-tête.",
    file: "minimal.typ",
  },
  {
    id: "ministere",
    name: "Ministère",
    description: "En-tête avec logo et bandeau bleu, pagination en pied de page.",
    file: "ministere.typ",
  },
  {
    id: "collectivite",
    name: "Collectivité",
    description: "En-tête avec logo et bandeau vert.",
    file: "collectivite.typ",
  },
];

let seeded = false;

async function ensureSeeded(): Promise<void> {
  if (seeded) return;
  seeded = true;

  const exists = await stat(DATA_DIR)
    .then((s) => s.isDirectory())
    .catch(() => false);
  if (exists) return;

  await mkdir(DATA_DIR, { recursive: true });
  const now = new Date().toISOString();
  for (const seed of SEEDS) {
    const source = await readFile(path.join(SEED_DIR, seed.file), "utf8");
    await writeTemplateDir(seed.id, {
      id: seed.id,
      name: seed.name,
      description: seed.description,
      createdAt: now,
      updatedAt: now,
    }, source);
    await regenerateThumbnail(seed.id, source);
  }
}

function templateDir(id: string): string {
  return path.join(DATA_DIR, id);
}

async function writeTemplateDir(id: string, meta: TemplateMeta, source: string): Promise<void> {
  const dir = templateDir(id);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, "meta.json"), JSON.stringify(meta, null, 2), "utf8");
  await writeFile(path.join(dir, "template.typ"), source, "utf8");
}

async function regenerateThumbnail(id: string, source: string): Promise<void> {
  try {
    const png = await compileToThumbnail({
      templateSource: source,
      templateAssetsDir: TEMPLATES_ASSETS_DIR,
    });
    await writeFile(path.join(templateDir(id), "thumbnail.png"), png);
  } catch (err) {
    const reason = err instanceof TypstCompileError ? err.stderr : String(err);
    console.error(`[templates] thumbnail generation failed for "${id}": ${reason}`);
  }
}

export async function getThumbnail(id: string): Promise<Buffer | undefined> {
  await ensureSeeded();
  try {
    return await readFile(path.join(templateDir(id), "thumbnail.png"));
  } catch {
    return undefined;
  }
}

export async function listTemplates(): Promise<TemplateMeta[]> {
  await ensureSeeded();
  const entries = await readdir(DATA_DIR, { withFileTypes: true });
  const metas = await Promise.all(
    entries
      .filter((e) => e.isDirectory())
      .map(async (e) => {
        try {
          const raw = await readFile(path.join(templateDir(e.name), "meta.json"), "utf8");
          return JSON.parse(raw) as TemplateMeta;
        } catch {
          return null;
        }
      }),
  );
  return metas
    .filter((m): m is TemplateMeta => m !== null)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function getTemplateMeta(id: string): Promise<TemplateMeta | undefined> {
  await ensureSeeded();
  try {
    const raw = await readFile(path.join(templateDir(id), "meta.json"), "utf8");
    return JSON.parse(raw) as TemplateMeta;
  } catch {
    return undefined;
  }
}

export async function getTemplateSource(id: string): Promise<string | undefined> {
  await ensureSeeded();
  try {
    return await readFile(path.join(templateDir(id), "template.typ"), "utf8");
  } catch {
    return undefined;
  }
}

export async function createTemplate(input: {
  name: string;
  description: string;
  source: string;
}): Promise<TemplateMeta> {
  await ensureSeeded();
  const id = randomUUID();
  const now = new Date().toISOString();
  const meta: TemplateMeta = {
    id,
    name: input.name,
    description: input.description,
    createdAt: now,
    updatedAt: now,
  };
  await writeTemplateDir(id, meta, input.source);
  await regenerateThumbnail(id, input.source);
  return meta;
}

export async function updateTemplate(
  id: string,
  patch: { name?: string; description?: string; source?: string },
): Promise<TemplateMeta | undefined> {
  const existing = await getTemplateMeta(id);
  if (!existing) return undefined;

  const source = patch.source ?? (await getTemplateSource(id)) ?? "";
  const meta: TemplateMeta = {
    ...existing,
    name: patch.name ?? existing.name,
    description: patch.description ?? existing.description,
    updatedAt: new Date().toISOString(),
  };
  await writeTemplateDir(id, meta, source);
  if (patch.source !== undefined) {
    await regenerateThumbnail(id, source);
  }
  return meta;
}

export async function deleteTemplate(id: string): Promise<boolean> {
  const existing = await getTemplateMeta(id);
  if (!existing) return false;
  await rm(templateDir(id), { recursive: true, force: true });
  return true;
}
