import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { compileToThumbnail, TypstCompileError } from "../compile/typstCompile.js";
import { TEMPLATES_ASSETS_DIR } from "../registry/templates.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = path.resolve(__dirname, "../../data/template-thumbnails");

function safeTemplateId(templateId: string): string {
  return templateId.replace(/[^a-zA-Z0-9_-]/g, "_");
}

function updatedAtHash(updatedAt: string): string {
  return createHash("sha256").update(updatedAt).digest("hex").slice(0, 16);
}

function cacheFileName(templateId: string, updatedAt: string): string {
  return `${safeTemplateId(templateId)}-${updatedAtHash(updatedAt)}.png`;
}

function cachePath(templateId: string, updatedAt: string): string {
  return path.join(CACHE_DIR, cacheFileName(templateId, updatedAt));
}

async function cleanupOldThumbnails(templateId: string, keepFile: string): Promise<void> {
  const prefix = `${safeTemplateId(templateId)}-`;
  const entries = await readdir(CACHE_DIR).catch(() => []);
  await Promise.all(
    entries
      .filter((name) => name.startsWith(prefix) && name.endsWith(".png") && name !== keepFile)
      .map((name) => rm(path.join(CACHE_DIR, name), { force: true })),
  );
}

export async function getCachedTemplateThumbnail(input: {
  templateId: string;
  updatedAt: string;
  source: string;
}): Promise<Buffer | undefined> {
  const fileName = cacheFileName(input.templateId, input.updatedAt);
  const filePath = cachePath(input.templateId, input.updatedAt);

  try {
    return await readFile(filePath);
  } catch {
    // Cache miss: generate below.
  }

  let png: Buffer;
  try {
    png = await compileToThumbnail({
      templateSource: input.source,
      templateAssetsDir: TEMPLATES_ASSETS_DIR,
    });
  } catch (error) {
    const reason = error instanceof TypstCompileError ? error.stderr : String(error);
    console.warn(`[templates] thumbnail generation failed for "${input.templateId}": ${reason}`);
    return undefined;
  }

  await mkdir(CACHE_DIR, { recursive: true });
  await writeFile(filePath, png);
  await cleanupOldThumbnails(input.templateId, fileName);
  return png;
}
