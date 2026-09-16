/**
 * Escapes characters that are meaningful to Typst markup so that arbitrary
 * user/document text is always rendered literally, never interpreted as
 * markup or code (e.g. a literal "#" must not open code mode, a literal "*"
 * must not toggle bold).
 */
const SPECIAL_CHARS = /[\\*_`#<>@$\[\]]/g;

export function escapeTypstText(text: string): string {
  return text.replace(SPECIAL_CHARS, (ch) => `\\${ch}`);
}

/**
 * Échappe une valeur destinée à une CHAÎNE Typst ("..."), pas à du markup.
 * Seuls le guillemet et l'antislash y sont spéciaux. Appliquer l'échappement
 * markup à une URL la casse : `_` deviendrait `\_` à l'intérieur du lien.
 */
export function escapeTypstString(value: string): string {
  return value.replace(/[\\"]/g, (ch) => `\\${ch}`);
}
