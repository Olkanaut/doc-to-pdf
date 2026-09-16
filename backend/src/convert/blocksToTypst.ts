import type { Block, InlineContent } from "../types/blocks.js";
import { escapeTypstString, escapeTypstText } from "./escapeTypst.js";
import { tableToTypst } from "./tableToTypst.js";

export interface ImageAsset {
  /** Absolute path on disk to the source image file. */
  src: string;
  /** Virtual filename to reference from the generated Typst markup. */
  dest: string;
}

export interface ConvertResult {
  /** Generated Typst markup for the document body (no page setup). */
  typst: string;
  /** Image files that must be copied into the compile sandbox. */
  images: ImageAsset[];
}

function inlineToTypst(inline: InlineContent): string {
  if (inline.type === "link") {
    const inner = (inline.content ?? []).map(inlineToTypst).join("");
    return `#link("${escapeTypstString(inline.href)}")[${inner}]`;
  }

  // Lien interne Docs : libellé dans props.title, aucun `text`.
  if (inline.type === "interlinkingLinkInline") {
    return escapeTypstText(inline.props?.title ?? "");
  }

  // Filet de sécurité : un inline inconnu et sans texte est ignoré, il ne doit
  // pas faire échouer le rendu de tout le document.
  if (typeof inline.text !== "string") return "";

  let text = inline.styles?.code
    ? `#raw("${escapeTypstString(inline.text)}")`
    : escapeTypstText(inline.text);
  if (inline.styles?.bold) text = `#strong[${text}]`;
  if (inline.styles?.italic) text = `#emph[${text}]`;
  if (inline.styles?.underline) text = `#underline[${text}]`;
  return text;
}

function inlinesToTypst(inlines: InlineContent[]): string {
  return inlines.map(inlineToTypst).join("");
}

function listItemToTypst(
  marker: "-" | "+",
  content: InlineContent[],
  children: Block[] | undefined,
  images: ImageAsset[],
  depth: number,
): string {
  const indent = "  ".repeat(depth);
  const line = `${indent}${marker} ${inlinesToTypst(content)}`;
  if (!children || children.length === 0) return line;
  const nested = children
    .map((child) => blockToTypst(child, images, depth + 1))
    .filter(Boolean)
    .join("\n");
  return `${line}\n${nested}`;
}

function blockToTypst(block: Block, images: ImageAsset[], depth = 0): string {
  switch (block.type) {
    case "heading": {
      const level = block.props.level === 2 || block.props.level === 3 ? block.props.level : 1;
      return `#heading(level: ${level})[${inlinesToTypst(block.content)}]`;
    }
    case "paragraph":
      return inlinesToTypst(block.content);
    case "bulletListItem":
      return listItemToTypst("-", block.content, block.children, images, depth);
    case "numberedListItem":
      return listItemToTypst("+", block.content, block.children, images, depth);
    case "table":
      // Fusions, en-tête, couleurs et alignements de Docs ; le style vient du gabarit (#set table).
      return tableToTypst(block, inlinesToTypst);
    case "image": {
      const dest = `assets/img-${images.length}${extensionOf(block.props.url)}`;
      images.push({ src: block.props.url, dest });
      const caption = block.props.caption
        ? `\n#align(center)[#emph[${escapeTypstText(block.props.caption)}]]`
        : "";
      return `#image("${dest}", width: 80%)${caption}`;
    }
    default:
      return "";
  }
}

function extensionOf(path: string): string {
  const match = /\.[a-zA-Z0-9]+$/.exec(path);
  return match ? match[0] : ".png";
}

export function blocksToTypst(blocks: Block[]): ConvertResult {
  const images: ImageAsset[] = [];
  const typst = blocks
    .map((block) => blockToTypst(block, images))
    .filter(Boolean)
    .join("\n\n");
  return { typst, images };
}
