import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, mkdir, copyFile, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { ImageAsset } from "../convert/blocksToTypst.js";

const execFileAsync = promisify(execFile);

export interface CompileRequest {
  /** Full Typst source of the template (must `#include "body.typ"` somewhere). */
  templateSource: string;
  /** Absolute path to the template's assets directory (logo, fonts), copied alongside. */
  templateAssetsDir?: string;
  /** Generated Typst markup for the document body. */
  bodyTypst: string;
  /** Images referenced by the body, to be copied into an `assets/` subfolder. */
  bodyImages: ImageAsset[];
}

export class TypstCompileError extends Error {
  constructor(public readonly stderr: string) {
    super("typst compile failed");
  }
}

export async function compileToPdf(request: CompileRequest): Promise<Buffer> {
  const dir = await mkdtemp(path.join(tmpdir(), "doc-pdf-"));
  try {
    const templateName = "template.typ";
    await writeFile(path.join(dir, templateName), request.templateSource, "utf8");

    if (request.templateAssetsDir) {
      await copyDir(request.templateAssetsDir, path.join(dir, "assets"));
    }

    await writeFile(path.join(dir, "body.typ"), request.bodyTypst, "utf8");

    if (request.bodyImages.length > 0) {
      await mkdir(path.join(dir, "assets"), { recursive: true });
      for (const image of request.bodyImages) {
        await copyFile(image.src, path.join(dir, image.dest));
      }
    }

    const outPath = path.join(dir, "out.pdf");
    try {
      await execFileAsync("typst", [
        "compile",
        "--root",
        dir,
        path.join(dir, templateName),
        outPath,
      ]);
    } catch (err: any) {
      throw new TypstCompileError(err.stderr ?? String(err));
    }

    return await readFile(outPath);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function copyDir(src: string, dest: string): Promise<void> {
  await mkdir(dest, { recursive: true });
  const { readdir } = await import("node:fs/promises");
  const entries = await readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      await copyDir(srcPath, destPath);
    } else {
      await copyFile(srcPath, destPath);
    }
  }
}
