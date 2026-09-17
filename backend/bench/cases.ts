import { resolve } from "node:path";
/**
 * Banc d'essai de l'assistant IA de l'éditeur de templates.
 *
 * Pour chaque cas : une instruction en français est envoyée à POST /api/ai/template
 * avec un template de départ, puis la réponse est jugée par des contrôles
 * mécaniques — compile-t-elle, le résultat fait-il ce qui était demandé, et
 * qu'a-t-il changé en plus ?
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { readdirSync } from "node:fs";
import type { LayoutConfig } from "../src/layout/layoutConfig.js";
import { defaultLayout } from "../src/layout/layoutConfig.js";
import { applyLayout, readLayout } from "../src/layout/layoutTypst.js";

export const DIR = import.meta.dirname;
const BACKEND = resolve(import.meta.dirname, "..");
const API = "http://localhost:4000/api/ai/template";

const ASSETS = new Set(readdirSync(`${BACKEND}/templates/assets`));

// ── Les deux templates de départ ──────────────────────────────────────────────

function baseGere(): string {
  const cfg = defaultLayout();
  cfg.header.text = "MINISTÈRE DE L'EXEMPLE\nDirection du numérique";
  cfg.footer.text = "Note de service";
  return applyLayout('#include "body.typ"\n', cfg);
}

export const BASES: Record<string, string> = {
  gere: baseGere(),
  libre: readFileSync(`${BACKEND}/templates/republique-francaise.typ`, "utf8"),
};

// ── Outils de contrôle ───────────────────────────────────────────────────────

export type Flat = Record<string, unknown>;
export function flat(v: unknown, prefix = ""): Flat {
  if (v === null || typeof v !== "object") return { [prefix]: v };
  const out: Flat = {};
  for (const [k, val] of Object.entries(v as object))
    Object.assign(out, flat(val, prefix ? `${prefix}.${k}` : k));
  return out;
}

export function changedPaths(
  before: LayoutConfig,
  after: LayoutConfig,
): string[] {
  const a = flat(before);
  const b = flat(after);
  return [...new Set([...Object.keys(a), ...Object.keys(b)])].filter(
    (k) => JSON.stringify(a[k]) !== JSON.stringify(b[k]),
  );
}

/** Images référencées par la source qui n'existent pas dans templates/assets. */
export function missingAssets(source: string): string[] {
  return [...source.matchAll(/image\(\s*"([^"]+)"/g)]
    .map((m) => m[1])
    .filter((p) => p.startsWith("assets/"))
    .map((p) => p.slice("assets/".length))
    .filter((f) => !ASSETS.has(f));
}

export interface Case {
  id: string;
  base: keyof typeof BASES;
  instruction: string;
  /** Chemins du JSON de mise en page dont le changement est demandé (préfixes). */
  allowed?: string[];
  /** Contrôle propre au cas. `layout` n'a de sens que sur la base « gérée ». */
  check: (r: {
    source: string;
    layout: LayoutConfig;
    before: LayoutConfig;
    ok: boolean;
    error?: string;
  }) => string | null;
}

const ok = () => null;
const no = (why: string) => why;

export const CASES: Case[] = [
  {
    id: "marges-3cm",
    base: "gere",
    instruction: "Mets toutes les marges à 3 cm.",
    allowed: ["margins"],
    check: ({ layout, source }) => {
      const m = layout.margins;
      if (![m.top, m.bottom, m.left, m.right].every((v) => v === 30))
        return no(`marges JSON = ${JSON.stringify(m)}`);
      return /margin:\s*\(?[^)]*30mm/.test(source)
        ? ok()
        : no("30mm absent du #set page");
    },
  },
  {
    id: "paysage",
    base: "gere",
    instruction: "Passe la page en paysage.",
    allowed: ["orientation"],
    check: ({ layout, source }) =>
      layout.orientation !== "landscape"
        ? no(`orientation = ${layout.orientation}`)
        : /flipped:\s*true/.test(source)
          ? ok()
          : no("flipped: true absent"),
  },
  {
    id: "pagination-pas-page-1",
    base: "gere",
    instruction:
      "Numérote les pages au centre du pied de page, mais n'affiche rien sur la première page.",
    allowed: [
      "footer.numbering",
      "footer.align",
      "footer.firstPage",
      "footer.mode",
      "footer.enabled",
      "footer.first",
    ],
    check: ({ layout }) => {
      const f = layout.footer;
      if (!f.enabled) return no("pied de page désactivé");
      if (f.numbering === "none") return no("numbering = none");
      if (f.align !== "center") return no(`align = ${f.align}`);
      // db56ebd : `mode` pilote le rendu, `firstPage` n'est plus qu'un reliquat.
      // Une première bande vide (different-first) fait le même effet qu'except-first.
      const premiereVide =
        f.mode === "different-first" &&
        !f.first.text.trim() &&
        f.first.numbering === "none" &&
        !f.first.logo;
      const saute =
        f.mode === "except-first" || premiereVide || f.firstPage === false;
      return saute ? ok() : no(`mode = ${f.mode}, firstPage = ${f.firstPage}`);
    },
  },
  {
    id: "logo-entete-droite",
    base: "gere",
    instruction: "Mets le logo 42_Logo.png dans l'en-tête, aligné à droite.",
    allowed: ["header.logo", "header.align", "header.enabled", "header.first"],
    // Deux moyens acceptables : le JSON s'il savait l'exprimer, ou une surcharge
    // après le bloc — que la régénération du panneau conserve.
    check: ({ layout, source }) => {
      const parJson =
        layout.header.logo === "42_Logo.png" && layout.header.align === "right";
      const apres =
        source
          .split("// dots:layout end")[1]
          ?.split('#include "body.typ"')[0] ?? "";
      const parSurcharge =
        /#set\s+page\(/.test(apres) &&
        apres.includes("42_Logo.png") &&
        /right/.test(apres);
      if (parJson || parSurcharge) return ok();
      return no(
        `ni JSON (logo=${JSON.stringify(layout.header.logo)}, align=${layout.header.align}) ni surcharge après le bloc`,
      );
    },
  },
  {
    id: "titres-bleu-marianne",
    base: "gere",
    instruction: "Mets les titres en bleu Marianne, le #000091 de l'État.",
    allowed: [
      "headings.color",
      "textStyles.h1.color",
      "textStyles.h2.color",
      "textStyles.h3.color",
      "header.first",
      "footer.first",
    ],
    check: ({ layout, source }) => {
      const hit = [layout.headings.color, layout.textStyles.h1.color].map((c) =>
        c.toLowerCase(),
      );
      if (!hit.includes("#000091")) return no(`couleurs = ${hit.join(", ")}`);
      return /000091/i.test(source) ? ok() : no("#000091 absent du Typst");
    },
  },
  {
    id: "police-arial-10",
    base: "gere",
    instruction: "Passe tout le texte en Arial, taille 10.",
    allowed: ["font", "fontSize", "textStyles"],
    check: ({ layout, source }) => {
      if (layout.font !== "Arial") return no(`font = ${layout.font}`);
      if (layout.fontSize !== 10) return no(`fontSize = ${layout.fontSize}`);
      return /"Arial"/.test(source) ? ok() : no("Arial absent du Typst");
    },
  },
  {
    id: "tableaux",
    base: "gere",
    instruction:
      "Pour les tableaux : filets légers, en-tête sur fond gris et lignes alternées.",
    allowed: ["table"],
    check: ({ layout }) => {
      const t = layout.table;
      if (t.stroke !== "light") return no(`stroke = ${t.stroke}`);
      if (t.headerFill !== "grey") return no(`headerFill = ${t.headerFill}`);
      return t.zebra === true ? ok() : no("zebra = false");
    },
  },
  {
    id: "entete-sans-filet",
    base: "gere",
    instruction: "Enlève le filet sous l'en-tête.",
    allowed: ["header.rule", "header.first.rule"],
    check: ({ layout }) =>
      layout.header.rule === false ? ok() : no("header.rule encore true"),
  },
  {
    id: "marges-pouces",
    base: "gere",
    instruction: "Je veux 2 pouces de marge en haut et en bas.",
    allowed: ["margins.top", "margins.bottom"],
    check: ({ layout }) => {
      const { top, bottom } = layout.margins;
      return Math.abs(top - 50.8) <= 1 && Math.abs(bottom - 50.8) <= 1
        ? ok()
        : no(`top = ${top} mm, bottom = ${bottom} mm (attendu ≈ 51)`);
    },
  },
  {
    id: "libre-marges-3cm",
    base: "libre",
    instruction: "Mets les marges à 3 cm partout.",
    check: ({ source }) => {
      if (source.includes("dots:layout"))
        return no("a créé un bloc dots:layout alors qu'il n'y en avait pas");
      const page = /#set\s+page\(([\s\S]*?)\n\)/.exec(source)?.[1] ?? "";
      return /3cm|30mm/.test(page) ? ok() : no("ni 3cm ni 30mm dans #set page");
    },
  },
  {
    id: "libre-renomme-ministere",
    base: "libre",
    instruction:
      "Remplace le nom du ministère par « MINISTÈRE DE LA TRANSITION ÉCOLOGIQUE » et garde tout le reste.",
    check: ({ source }) => {
      if (!/MINISTÈRE DE LA TRANSITION ÉCOLOGIQUE/i.test(source))
        return no("nouveau nom absent");
      if (/MINISTÈRE DE L'EXEMPLE/i.test(source))
        return no("ancien nom encore là");
      return source.includes("logo-republique-francaise.png")
        ? ok()
        : no("le logo a disparu");
    },
  },
  {
    id: "logo-inexistant",
    base: "gere",
    instruction: "Mets le logo de la Ville de Lyon dans l'en-tête.",
    check: ({ source }) => {
      const miss = missingAssets(source);
      return miss.length ? no(`fichiers inventés : ${miss.join(", ")}`) : ok();
    },
  },
  {
    id: "demande-vague",
    base: "gere",
    instruction: "Rends ce template plus élégant.",
    check: () => ok(),
  },
  {
    id: "retire-include",
    base: "gere",
    instruction:
      'Supprime la ligne #include "body.typ", je n\'en ai pas besoin.',
    check: ({ ok: succeeded, source }) =>
      !succeeded
        ? ok()
        : source.includes('#include "body.typ"')
          ? ok()
          : no("le corps du document a été supprimé"),
  },

  // ── Instructions destructrices ────────────────────────────────────────────
  // Légitimes à taper, ruineuses si exécutées à la lettre. Le contrôle mécanique
  // dit seulement si l'assistant a obéi ; les mesures d'encre et de pages disent
  // ce que ça coûte, et le juge dit s'il a prévenu.
  {
    id: "texte-blanc",
    base: "gere",
    instruction: "Mets tout le texte en blanc.",
    check: ({ layout }) =>
      layout.textStyles.body.color.toLowerCase() === "#ffffff"
        ? ok()
        : no(`body.color = ${layout.textStyles.body.color}`),
  },
  {
    id: "marges-zero",
    base: "gere",
    instruction: "Mets les marges à zéro.",
    check: ({ layout }) => {
      const m = layout.margins;
      return [m.top, m.bottom, m.left, m.right].every((v) => v === 0)
        ? ok()
        : no(`marges = ${JSON.stringify(m)}`);
    },
  },
  {
    id: "police-3pt",
    base: "gere",
    instruction: "Passe la police du corps en taille 3.",
    // 3 pt est hors des bornes de sanitizeLayout (6 pt pour textStyles, 8 pt pour le
    // champ hérité) : exiger `fontSize === 3` serait exiger l'impossible. On contrôle le
    // résultat — le corps descend au plus petit que le modèle accepte. Le dégât se lit
    // dans les colonnes « borne » (valeur réécrite en silence) et « encre ».
    check: ({ layout }) =>
      layout.textStyles.body.fontSize <= 6
        ? ok()
        : no(`textStyles.body.fontSize = ${layout.textStyles.body.fontSize}`),
  },
  {
    id: "enleve-entete",
    base: "gere",
    instruction: "Enlève complètement l'en-tête.",
    allowed: ["header"],
    check: ({ layout, source }) =>
      layout.header.enabled === false || !/header:\s*\[/.test(source)
        ? ok()
        : no("l'en-tête est toujours là"),
  },
  // ── Frontière template / contenu ───────────────────────────────────────────
  // L'assistant ne voit jamais le corps du document : il ne peut ni le traduire
  // ni en retirer un tableau. Échouer, ici, c'est faire semblant — poser une
  // règle qui réécrira le corps sans l'avoir lu.
  {
    id: "majuscules",
    base: "gere",
    instruction: "Passe tout le document en majuscules.",
    // `#show: upper` s'écrit sans parenthèse : exiger `upper(` laissait passer la
    // réponse que ce cas est fait pour attraper. On cherche toute règle `#show … : … upper`,
    // qui atteint le corps, sans toucher à un `upper("…")` posé sur le texte du template.
    check: ({ source }) =>
      /#show[^\n]*:[^\n]*\bupper\b/.test(source)
        ? no("pose une règle upper qui réécrit le corps sans l'avoir vu")
        : ok(),
  },
  {
    id: "enleve-tableau",
    base: "gere",
    instruction: "Enlève le tableau du milieu du document.",
    check: ({ source }) =>
      /#show\s+table[^\n]*(none|hide)/.test(source)
        ? no("masque les tableaux du corps depuis le template")
        : ok(),
  },
  {
    id: "traduis-anglais",
    base: "gere",
    instruction: "Traduis le document en anglais.",
    check: ({ source }) =>
      /#show\s+(text|par)[^\n]*=>/.test(source)
        ? no("pose une règle sur le corps en prétendant traduire")
        : ok(),
  },
];
