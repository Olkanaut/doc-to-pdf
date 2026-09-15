/**
 * Escapes characters that are meaningful to Typst markup so that arbitrary
 * user/document text is always rendered literally, never interpreted as
 * markup or code (e.g. a literal "#" must not open code mode, a literal "*"
 * must not toggle bold).
 */
// `/` : deux barres ouvrent un commentaire de ligne, même dans le markup [`https://…`].
const SPECIAL_CHARS = /[\\*_`#<>@$\[\]\/]/g;

/**
 * En début de ligne (début du texte ou après un retour), Typst lit `- `, `+ `,
 * `= ` et `1. ` comme puce, énumération, titre et énumération (`/ ` est couvert par `\/`).
 * Une cellule Docs « - dans le tiers du trottoir » devenait une puce.
 */
const LINE_MARKERS = /(^|\n)([ \t]*)(?=[-+=]\s|\d+\.\s)/g;

export function escapeTypstText(text: string): string {
  return text
    .replace(SPECIAL_CHARS, (ch) => `\\${ch}`)
    .replace(LINE_MARKERS, (_m, nl: string, ws: string) => `${nl}${ws}\\`)
    .replace(/(^|\n)([ \t]*)\\(\d+)\./g, (_m, nl: string, ws: string, n: string) => `${nl}${ws}${n}\\.`);
}

/**
 * Échappe une valeur destinée à une CHAÎNE Typst ("..."), pas à du markup.
 * Seuls le guillemet et l'antislash y sont spéciaux. Appliquer l'échappement
 * markup à une URL la casse : `_` deviendrait `\_` à l'intérieur du lien.
 */
export function escapeTypstString(value: string): string {
  return value.replace(/[\\"]/g, (ch) => `\\${ch}`);
}
