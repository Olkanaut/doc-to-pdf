/**
 * Lecture de la réponse de l'assistant. Trois balises sont attendues :
 * <summary>, <changes><item>…</item></changes> et <typst>. Le modèle ne les
 * respecte pas toujours, d'où les tolérances : <typst> non fermée, source
 * enveloppée dans un bloc de code Markdown, ou réponse sans balise du tout
 * quand elle ressemble à un template (elle contient `#include "body.typ"`).
 */

export interface AiReply {
  summary: string;
  changes: string[];
  /** Chemin complet : la template réécrite. Exclusif avec `layout`. */
  source?: string;
  /** Chemin abrégé : les seuls champs modifiés du JSON du bloc. Exclusif avec `source`. */
  layout?: Record<string, unknown>;
}

export const BODY_INCLUDE = '#include "body.typ"';

/** Contenu de <name>…</name> ; si la fermeture manque, jusqu'à la fin du texte. */
function tag(text: string, name: string): string | undefined {
  const open = text.indexOf(`<${name}>`);
  if (open === -1) return undefined;
  const start = open + name.length + 2;
  const close = text.indexOf(`</${name}>`, start);
  return close === -1 ? text.slice(start) : text.slice(start, close);
}

/** Retire un éventuel bloc de code Markdown (```typst … ```) autour de la source. */
function unfence(s: string): string {
  const m = s.trim().match(/^```[a-z]*\r?\n([\s\S]*?)\r?\n?```$/);
  return m ? m[1] : s;
}

/**
 * Fusion en profondeur d'un correctif sur une config : les objets se fusionnent
 * clé par clé, tout le reste — tableaux compris — remplace. Même sémantique que
 * JSON Merge Patch, moins le `null` qui efface : `sanitizeLayout` valide derrière,
 * et un `null` sur un champ non nullable y serait de toute façon écarté.
 */
export function mergePatch(
  base: unknown,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> =
    isPlainObject(base) ? { ...base } : {};
  for (const [k, v] of Object.entries(patch)) {
    out[k] =
      isPlainObject(v) && isPlainObject(out[k])
        ? mergePatch(out[k], v)
        : v;
  }
  return out;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * null = réponse inexploitable : ni correctif, ni template reconnaissable. Une
 * source sans `#include "body.typ"` est refusée aussi : elle compilerait, mais
 * sans le corps.
 */
export function parseAiReply(text: string): AiReply | null {
  const patch = tag(text, "layout");
  if (patch !== undefined) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(unfence(patch).trim());
    } catch {
      parsed = undefined;
    }
    // Un correctif vide ne dit rien : on retombe sur <typst> s'il y en a un.
    if (isPlainObject(parsed) && Object.keys(parsed).length > 0)
      return { ...head(text), layout: parsed };
  }

  let source = tag(text, "typst");
  if (source === undefined) {
    if (!text.includes(BODY_INCLUDE)) return null;
    source = text;
  }
  source = unfence(source).trim();
  if (!source.includes(BODY_INCLUDE)) return null;

  return { ...head(text), source: source + "\n" };
}

/** `<summary>` et `<changes>`, communs aux deux formes de réponse. */
function head(text: string): { summary: string; changes: string[] } {
  return {
    summary: (tag(text, "summary") ?? "").trim(),
    changes: [
      ...(tag(text, "changes") ?? "").matchAll(/<item>([\s\S]*?)<\/item>/g),
    ]
      .map((m) => m[1].trim())
      .filter(Boolean),
  };
}
