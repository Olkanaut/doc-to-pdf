import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  mkdtemp,
  mkdir,
  copyFile,
  writeFile,
  readFile,
  rm,
} from "node:fs/promises";
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

export interface CompileOutput {
  bytes: Buffer;
  /** stderr de typst sur succès : y figurent les `warning:` (police absente, etc.). */
  stderr: string;
}

/**
 * Sets up a per-request sandbox (template + body + assets), shells out to
 * `typst compile` with the given output filename and extra CLI flags, and
 * returns the compiled bytes. Shared by PDF export and thumbnail export.
 */
async function runTypstCompile(
  request: Pick<
    CompileRequest,
    "templateSource" | "templateAssetsDir" | "bodyTypst" | "bodyImages"
  >,
  outFileName: string,
  extraArgs: string[] = [],
): Promise<Buffer> {
  return (await runTypstCompileDetailed(request, outFileName, extraArgs)).bytes;
}

async function runTypstCompileDetailed(
  request: Pick<
    CompileRequest,
    "templateSource" | "templateAssetsDir" | "bodyTypst" | "bodyImages"
  >,
  outFileName: string,
  extraArgs: string[] = [],
): Promise<CompileOutput> {
  const dir = await mkdtemp(path.join(tmpdir(), "doc-pdf-"));
  try {
    const templateName = "template.typ";
    await writeFile(
      path.join(dir, templateName),
      request.templateSource,
      "utf8",
    );

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

    const outPath = path.join(dir, outFileName);
    let stderr = "";
    try {
      ({ stderr } = await execFileAsync("typst", [
        "compile",
        "--root",
        dir,
        ...extraArgs,
        path.join(dir, templateName),
        outPath,
      ]));
    } catch (err: any) {
      throw new TypstCompileError(err.stderr ?? String(err));
    }

    return { bytes: await readFile(outPath), stderr: stderr ?? "" };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export async function compileToPdf(request: CompileRequest): Promise<Buffer> {
  return runTypstCompile(request, "out.pdf");
}

/** Comme compileToPdf, avec le stderr de typst (avertissements) en plus. */
export async function compileToPdfDetailed(
  request: CompileRequest,
): Promise<CompileOutput> {
  return runTypstCompileDetailed(request, "out.pdf");
}

export const THUMBNAIL_PPI = 120;

const THUMBNAIL_SWATCH_BODY = `= Note de synthèse

#text(size: 9pt)[Publié le 17 septembre 2026]

Ce document donne un aperçu fidèle de la template avec un contenu administratif court. Il permet de comparer les marges, les en-têtes, les pieds de page, les titres, les tableaux et les listes en un coup d'œil.

== Décisions

- Valider le calendrier de déploiement.
- Consolider les retours des équipes pilotes.
- Préparer la communication aux services concernés.

== Suivi budgétaire

#table(
  columns: (1.4fr, .8fr, 1fr),
  table.header([Objet], [Montant], [Statut]),
  [Accompagnement], [12 500 €], [Validé],
  [Formation], [8 200 €], [En cours],
  [Documentation], [3 600 €], [À planifier],
)

#align(right)[
  #strong[Signature] \
  Direction générale
]
`;

export interface ThumbnailRequest {
  templateSource: string;
  templateAssetsDir?: string;
}

export async function compileToThumbnail(
  request: ThumbnailRequest,
): Promise<Buffer> {
  return runTypstCompile(
    {
      templateSource: request.templateSource,
      templateAssetsDir: request.templateAssetsDir,
      bodyTypst: THUMBNAIL_SWATCH_BODY,
      bodyImages: [],
    },
    "thumbnail.png",
    ["--format", "png", "--ppi", String(THUMBNAIL_PPI), "--pages", "1"],
  );
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
