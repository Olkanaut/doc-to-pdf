import path from "node:path";
import { compileToPdf } from "../compile/typstCompile.js";
import { blocksToTypst } from "../convert/blocksToTypst.js";
import type { Block } from "../types/blocks.js";

const SUPPORTED_BLOCK_TYPES = new Set([
  "heading",
  "paragraph",
  "bulletListItem",
  "numberedListItem",
  "table",
  "image",
]);

export interface RenderInfo {
  blockCount: number;
  unsupported: Record<string, number>;
}

export interface RenderedPdf extends RenderInfo {
  pdf: Buffer;
}

export class UnsupportedBodyImagesError extends Error {
  constructor() {
    super("Document images are not supported yet");
    this.name = "UnsupportedBodyImagesError";
  }
}

function inspectBlocks(blocks: Block[]): RenderInfo {
  let blockCount = 0;
  const unsupported: Record<string, number> = {};

  const walk = (items: Block[]) => {
    for (const block of items) {
      blockCount += 1;
      if (!SUPPORTED_BLOCK_TYPES.has(block.type)) {
        unsupported[block.type] = (unsupported[block.type] ?? 0) + 1;
      }
      if ("children" in block && block.children) walk(block.children);
    }
  };

  walk(blocks);
  return { blockCount, unsupported };
}

interface RenderBlocksInput {
  blocks: Block[];
  templateSource: string;
  templateAssetsDir?: string;
  /** Only local fixtures have an image directory. Docs images are rejected for now. */
  bodyImagesDir?: string;
}

export async function renderBlocksToPdf(input: RenderBlocksInput): Promise<RenderedPdf> {
  const { typst, images } = blocksToTypst(input.blocks);
  const hasRemoteImage = images.some((image) => /^https?:\/\//i.test(image.src));

  if (images.length > 0 && (!input.bodyImagesDir || hasRemoteImage)) {
    throw new UnsupportedBodyImagesError();
  }

  const bodyImages = images.map((image) => ({
    ...image,
    src: path.resolve(input.bodyImagesDir!, image.src),
  }));
  const pdf = await compileToPdf({
    templateSource: input.templateSource,
    templateAssetsDir: input.templateAssetsDir,
    bodyTypst: typst,
    bodyImages,
  });

  return { pdf, ...inspectBlocks(input.blocks) };
}
