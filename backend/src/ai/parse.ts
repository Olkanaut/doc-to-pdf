/**
 * Lecture de la réponse de l'assistant. Trois balises sont attendues :
 * <summary>, <changes><item>…</item></changes> et <typst>. Le modèle ne les
 * respecte pas toujours, d'où les tolérances : <typst> non fermée, source
 * enveloppée dans un bloc de code Markdown, ou réponse sans balise du tout
 * quand elle ressemble à un gabarit (elle contient `#include "body.typ"`).
 */

export interface AiReply {
  summary: string;
  changes: string[];
  source: string;
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
 * null = réponse inexploitable : aucun gabarit reconnaissable. Une source sans
 * `#include "body.typ"` est refusée aussi : elle compilerait, mais sans le corps.
 */
export function parseAiReply(text: string): AiReply | null {
  let source = tag(text, "typst");
  if (source === undefined) {
    if (!text.includes(BODY_INCLUDE)) return null;
    source = text;
  }
  source = unfence(source).trim();
  if (!source.includes(BODY_INCLUDE)) return null;

  const summary = (tag(text, "summary") ?? "").trim();
  const changes = [...(tag(text, "changes") ?? "").matchAll(/<item>([\s\S]*?)<\/item>/g)]
    .map((m) => m[1].trim())
    .filter(Boolean);
  return { summary, changes, source: source + "\n" };
}
