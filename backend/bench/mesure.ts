import { resolve } from "node:path";
/**
 * Ce que le PDF montre vraiment : encre, mots, pages.
 *
 * Un document peut compiler sans un avertissement et être vide à l'œil — texte
 * blanc, taille 3, marges nulles. L'écart entre « des mots extractibles » et
 * « zéro pixel encré » est la signature de ces dégâts-là.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, symlinkSync, writeFileSync, existsSync } from "node:fs";
import { blocksToTypst } from "../src/convert/blocksToTypst.js";
import { getFixture } from "../src/registry/fixtures.js";

const TMP = resolve(import.meta.dirname, "rendu");

export interface Mesure {
  ok: boolean;
  /** Pixels sombres de la première page, à 100 ppi. */
  encre: number;
  /** Mots que `pdftotext` sort du PDF entier. */
  mots: number;
  pages: number;
}

let prepare = false;
async function atelier(fixtureId: string): Promise<void> {
  if (prepare) return;
  rmSync(TMP, { recursive: true, force: true });
  mkdirSync(TMP, { recursive: true });
  symlinkSync(resolve(import.meta.dirname, "../templates/assets"), `${TMP}/assets`);
  const fixture = await getFixture(fixtureId);
  writeFileSync(`${TMP}/body.typ`, blocksToTypst(fixture!.blocks).typst);
  prepare = true;
}

export async function mesurer(source: string, tag: string, fixtureId = "simple-note"): Promise<Mesure> {
  await atelier(fixtureId);
  writeFileSync(`${TMP}/${tag}.typ`, source);
  try {
    execFileSync("typst", ["compile", `${TMP}/${tag}.typ`, `${TMP}/${tag}.pdf`], { stdio: "pipe" });
  } catch {
    return { ok: false, encre: -1, mots: -1, pages: -1 };
  }
  execFileSync("pdftoppm", ["-r", "100", "-png", "-f", "1", "-l", "1", `${TMP}/${tag}.pdf`, `${TMP}/${tag}`]);
  const encre = Number(
    execFileSync("python3", ["-c",
      `from PIL import Image\nim=Image.open("${TMP}/${tag}-1.png").convert("L")\nprint(sum(1 for p in im.getdata() if p<200))`,
    ]).toString().trim(),
  );
  const texte = execFileSync("pdftotext", [`${TMP}/${tag}.pdf`, "-"]).toString();
  const pages = (texte.match(/\f/g) ?? []).length || 1;
  return { ok: true, encre, mots: texte.split(/\s+/).filter(Boolean).length, pages };
}
