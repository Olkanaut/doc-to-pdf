import path from "node:path";
import { getFixture, FIXTURES_DIR } from "../registry/fixtures.js";
import { TEMPLATES_ASSETS_DIR } from "../templates/assets.js";
import { blocksToTypst } from "../convert/blocksToTypst.js";
import {
  compileToPdfDetailed,
  TypstCompileError,
} from "../compile/typstCompile.js";
import { inkRatio, wordCount, type Ink } from "./ink.js";

/**
 * Le pendant de CheckResult / CheckFailure dans frontend/src/api/client.ts, qui
 * n'en déclare que ce qu'il affiche : `ink` et `words` servent au garde-fou de
 * l'assistant (routes/ai.ts), qui en tire des lignes de `warnings` — la seule
 * chose qui traverse jusqu'au navigateur.
 */
export interface CheckResult {
  ok: true;
  ms: number;
  pages: number;
  warnings: string[];
  /** Parts de pixels encrés, page entière et bandes. `null` si la mesure a échoué. */
  ink: Ink | null;
  /** Mots extractibles du PDF. `null` si la mesure a échoué. */
  words: number | null;
}
export interface CheckFailure {
  ok: false;
  error: string;
  details?: string;
}

export const DEFAULT_CHECK_FIXTURE = "simple-note";

/**
 * Compte les objets `/Type /Page` (pas `/Pages`) du PDF. Typst écrit ses
 * dictionnaires de page en clair, sans flux d'objets : le comptage textuel suffit.
 */
export function countPdfPages(pdf: Buffer): number {
  const m = pdf.toString("latin1").match(/\/Type\s*\/Page(?![s\w])/g);
  return m ? m.length : 0;
}

/**
 * Extrait les avertissements de typst : la ligne `warning: …` et, si elle suit,
 * la ligne de position `┌─ template.typ:3:12`.
 */
export function typstWarnings(stderr: string): string[] {
  const lines = stderr.split(/\r?\n/);
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line.startsWith("warning:")) continue;
    const loc = lines[i + 1]?.trim();
    out.push(
      loc && loc.startsWith("┌─")
        ? `${line} (${loc.replace(/^┌─\s*/, "")})`
        : line,
    );
  }
  return out;
}

/**
 * Compilation de test d'une source de template sur une fixture : c'est ce que
 * l'import et l'assistant IA appellent avant de proposer quoi que ce soit.
 */
export async function checkTemplateSource(input: {
  source: string;
  fixtureId?: string;
}): Promise<CheckResult | CheckFailure> {
  if (typeof input.source !== "string" || input.source.trim() === "") {
    return { ok: false, error: "source vide" };
  }
  const fixtureId = input.fixtureId ?? DEFAULT_CHECK_FIXTURE;
  const fixture = await getFixture(fixtureId);
  if (!fixture)
    return { ok: false, error: `fixture "${fixtureId}" introuvable` };

  const { typst, images } = blocksToTypst(fixture.blocks);
  const t0 = performance.now();
  try {
    const { bytes, stderr } = await compileToPdfDetailed({
      templateSource: input.source,
      templateAssetsDir: TEMPLATES_ASSETS_DIR,
      bodyTypst: typst,
      bodyImages: images.map((img) => ({
        ...img,
        src: path.resolve(FIXTURES_DIR, img.src),
      })),
    });
    const [ink, words] = await Promise.all([inkRatio(bytes), wordCount(bytes)]);
    return {
      ok: true,
      ms: Math.round(performance.now() - t0),
      pages: countPdfPages(bytes),
      warnings: typstWarnings(stderr),
      ink,
      words,
    };
  } catch (err) {
    if (err instanceof TypstCompileError) {
      return { ok: false, error: "typst compile failed", details: err.stderr };
    }
    throw err;
  }
}
