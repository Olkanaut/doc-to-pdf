import type { Block, InlineContent } from "../types/blocks.js";
import { escapeTypstString, escapeTypstText } from "./escapeTypst.js";

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

  let text = escapeTypstText(inline.text);
  if (inline.styles?.code) text = `\`${text}\``;
  if (inline.styles?.bold) text = `*${text}*`;
  if (inline.styles?.italic) text = `_${text}_`;
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
      const marker = "=".repeat(block.props.level);
      return `${marker} ${inlinesToTypst(block.content)}`;
    }
    case "paragraph":
      return inlinesToTypst(block.content);
    case "bulletListItem":
      return listItemToTypst("-", block.content, block.children, images, depth);
    case "numberedListItem":
      return listItemToTypst("+", block.content, block.children, images, depth);
    case "table": {
      const rows = block.content.rows;
      const columns = rows[0]?.cells.length ?? 0;
      const cells = rows
        .flatMap((row) => row.cells)
        .map((cell) => `[${inlinesToTypst(cell.content)}]`)
        .join(", ");
      return `#table(\n  columns: ${columns},\n  ${cells}\n)`;
    }
    case "image": {
      const dest = `assets/img-${images.length}${extensionOf(block.props.url)}`;
      images.push({ src: block.props.url, dest });
      const caption = block.props.caption
        ? `\n#align(center)[_${escapeTypstText(block.props.caption)}_]`
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
