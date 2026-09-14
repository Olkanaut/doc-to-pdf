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
