import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/** Au-dessous de ce niveau de gris (0 = noir, 255 = blanc), un pixel compte comme encré. */
const SOMBRE = 200;

/** Basse résolution : on cherche « la page s'est-elle vidée », pas un rendu fidèle. */
const PPP = 30;

/**
 * Hauteur des bandes mesurées à part, en fraction de la page : 8,5 % valent 25 mm
 * sur une A4, la marge haute par défaut. Plus large, la bande attrape le corps du
 * texte et un en-tête perdu n'y paraît plus — mesuré sur un en-tête disparu :
 * 0,0 % à 8,5 %, mais 6,8 % contre 9,4 % à 15 %, écart trop faible pour décider.
 */
const BANDE = 0.085;

/**
 * Parts de pixels encrés, sur la page entière et sur ses deux bandes.
 *
 * La mesure par bande est ce qui distingue un en-tête disparu d'un document
 * inchangé : sur une page A4, une bande d'en-tête vidée ne coûte que quelques
 * pour cent de l'encre TOTALE — mesuré 5,45 % → 5,07 %, invisible à ce niveau —
 * alors que la bande, elle, passe de son encre habituelle à zéro.
 */
export interface Ink {
  page: number;
  /** Les 15 % du haut, où vit l'en-tête. */
  top: number;
  /** Les 15 % du bas, où vit le pied. */
  bottom: number;
}

/**
 * Part de pixels encrés de la première page, entre 0 et 1.
 *
 * Sert à repérer ce qu'aucun autre contrôle ne voit : un gabarit qui compile,
 * dont le JSON est cohérent, et dont la page est blanche — texte passé en blanc,
 * police à 3 pt, ou bandeau posé hors de la page par un `#place` négatif. Typst
 * n'avertit d'aucun des trois.
 *
 * `pdftoppm -gray` écrit du PGM binaire (P5) sur la sortie standard : en-tête
 * texte « P5 <largeur> <hauteur> <max> » puis un octet par pixel. Pas de
 * bibliothèque d'images à installer.
 *
 * Renvoie `null` si la mesure échoue : c'est un indice, jamais un motif de refus.
 */
export async function inkRatio(pdf: Buffer): Promise<Ink | null> {
  // pdftoppm ne lit pas l'entrée standard : il lui faut un fichier.
  const dir = await mkdtemp(path.join(tmpdir(), "dots-ink-"));
  try {
    const src = path.join(dir, "in.pdf");
    await writeFile(src, pdf);
    const { stdout } = await execFileAsync(
      "pdftoppm",
      ["-gray", "-r", String(PPP), "-f", "1", "-l", "1", src],
      { encoding: "buffer", maxBuffer: 64 * 1024 * 1024 },
    );
    return pgmInkRatio(stdout as unknown as Buffer);
  } catch {
    return null;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** Exporté pour le test : la part de pixels sombres d'un PGM binaire (P5). */
export function pgmInkRatio(pgm: Buffer): Ink | null {
  if (pgm.length < 2 || pgm[0] !== 0x50 || pgm[1] !== 0x35) return null; // "P5"
  // Trois entiers (largeur, hauteur, max), séparés par des blancs, commentaires « # » ignorés.
  let i = 2;
  const nombres: number[] = [];
  while (nombres.length < 3 && i < pgm.length) {
    const c = pgm[i];
    if (c === 0x23) {
      while (i < pgm.length && pgm[i] !== 0x0a) i++;
    } else if (c >= 0x30 && c <= 0x39) {
      let n = 0;
      while (i < pgm.length && pgm[i] >= 0x30 && pgm[i] <= 0x39) n = n * 10 + (pgm[i++] - 0x30);
      nombres.push(n);
    } else i++;
  }
  if (nombres.length < 3) return null;
  const [largeur, hauteur] = nombres;
  const pixels = pgm.subarray(i + 1, i + 1 + largeur * hauteur);
  if (pixels.length < largeur * hauteur) return null;
  const hautFin = Math.floor(hauteur * BANDE) * largeur;
  const basDebut = Math.floor(hauteur * (1 - BANDE)) * largeur;
  let page = 0;
  let haut = 0;
  let bas = 0;
  for (let p = 0; p < pixels.length; p++) {
    if (pixels[p] >= SOMBRE) continue;
    page++;
    if (p < hautFin) haut++;
    else if (p >= basDebut) bas++;
  }
  return {
    page: page / pixels.length,
    top: haut / (hautFin || 1),
    bottom: bas / (pixels.length - basDebut || 1),
  };
}

/**
 * Nombre de mots extractibles du PDF entier.
 *
 * Complète `inkRatio` : une bande poussée hors de la page par un décalage négatif
 * ne fait presque pas bouger l'encre (le corps domine), mais ses mots disparaissent.
 * Mesuré sur un en-tête de trois mots : encre 5,45 % → 5,07 %, mots 166 → 163.
 */
export async function wordCount(pdf: Buffer): Promise<number | null> {
  const dir = await mkdtemp(path.join(tmpdir(), "dots-mots-"));
  try {
    const src = path.join(dir, "in.pdf");
    await writeFile(src, pdf);
    const { stdout } = await execFileAsync("pdftotext", [src, "-"], { maxBuffer: 32 * 1024 * 1024 });
    return stdout.split(/\s+/).filter(Boolean).length;
  } catch {
    return null;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
