import {
  newBlock,
  sanitizeLayout,
  type Block,
  type LayoutConfig,
} from "../layout/layoutConfig.js";
import { buildSource } from "../ingest/templateFromAnalysis.js";
import {
  sanitizeTemplateModelV2,
  type FieldNode,
  type ImageNode,
  type LineNode,
  type PageNumberNode,
  type TemplateModelV2,
  type TemplateNodeV2,
  type TextNode,
} from "./templateModel.js";

export interface TemplateModelTypstResult {
  source: string;
  layout: LayoutConfig;
  warnings: string[];
}

const MAX_BAND_BLOCKS = 6;

export function templateModelV2ToTypstSource(input: unknown): TemplateModelTypstResult {
  const model = sanitizeTemplateModelV2(input);
  const layout = templateModelV2ToSimpleLayout(model);
  return {
    source: buildSource(layout),
    layout,
    warnings: unsupportedWarnings(model.nodes),
  };
}

function templateModelV2ToSimpleLayout(model: TemplateModelV2): LayoutConfig {
  const base = sanitizeLayout({
    ...model.styles.layout,
    paper: model.page.paper,
    orientation: model.page.orientation,
    margins: model.page.margins,
  });
  const ruleColor = base.headings.color;
  const headerBlocks = bandBlocks(model.nodes, "header", ruleColor);
  const footerBlocks = bandBlocks(model.nodes, "footer", ruleColor);
  const pageNumber = model.nodes.find(
    (node): node is PageNumberNode => node.type === "pageNumber" && node.region === "footer" && !node.locked,
  );

  return sanitizeLayout({
    ...base,
    header: {
      ...base.header,
      blocks: headerBlocks.length ? headerBlocks : base.header.blocks,
    },
    footer: {
      ...base.footer,
      blocks: footerBlocks.length ? footerBlocks : base.footer.blocks,
      numbering: pageNumber?.numbering ?? base.footer.numbering,
      numberingAlign: pageNumber?.align ?? base.footer.numberingAlign,
      numberingScope: pageNumber?.scope === "odd" || pageNumber?.scope === "even" || pageNumber?.scope === "last"
        ? "all"
        : (pageNumber?.scope ?? base.footer.numberingScope),
    },
  });
}

function bandBlocks(
  nodes: readonly TemplateNodeV2[],
  region: "header" | "footer",
  ruleColor: string,
): Block[] {
  return nodes
    .filter((node) => node.region === region && !node.locked)
    .sort((a, b) => a.order - b.order)
    .flatMap((node) => nodeToBlock(node, ruleColor))
    .slice(0, MAX_BAND_BLOCKS);
}

function nodeToBlock(node: TemplateNodeV2, ruleColor: string): Block[] {
  if (node.type === "text") return [textBlock(node, ruleColor)];
  if (node.type === "field") return [fieldBlock(node, ruleColor)];
  if (node.type === "image") {
    const block = imageBlock(node, ruleColor);
    return block ? [block] : [];
  }
  if (node.type === "line") return [lineBlock(node, ruleColor)];
  return [];
}

function scope(node: TemplateNodeV2): Block["scope"] {
  return node.scope === "first" || node.scope === "except-first" ? node.scope : "all";
}

function align(style: Record<string, unknown> | undefined): Block["align"] {
  return style?.align === "center" || style?.align === "right" ? style.align : "left";
}

function textBlock(node: TextNode, ruleColor: string): Block {
  return {
    ...newBlock("custom", ruleColor),
    scope: scope(node),
    title: node.text,
    subtitle: "",
    align: align(node.style),
    rule: { on: false, color: ruleColor, widthPt: 1 },
  };
}

function fieldBlock(node: FieldNode, ruleColor: string): Block {
  return {
    ...newBlock("custom", ruleColor),
    scope: scope(node),
    title: `{{${node.fieldId}}}`,
    subtitle: "",
    align: align(node.style),
    rule: { on: false, color: ruleColor, widthPt: 1 },
  };
}

function imageBlock(node: ImageNode, ruleColor: string): Block | null {
  const file = assetFile(node.assetId);
  if (!file) return null;
  const imagePosition = node.style?.imagePosition === "center" || node.style?.imagePosition === "right"
    ? node.style.imagePosition
    : "left";
  const imageHeightMm = typeof node.style?.imageHeightMm === "number"
    ? node.style.imageHeightMm
    : node.imageKind === "raster-region"
      ? 0
      : 12;
  return {
    ...newBlock("custom", ruleColor),
    scope: scope(node),
    image: file,
    imagePosition,
    imageHeightMm,
    title: "",
    subtitle: "",
    align: imagePosition,
    rule: { on: false, color: ruleColor, widthPt: 1 },
  };
}

function lineBlock(node: LineNode, ruleColor: string): Block {
  return {
    ...newBlock("custom", ruleColor),
    scope: scope(node),
    title: "",
    subtitle: "",
    rule: {
      on: true,
      color: typeof node.style?.color === "string" ? node.style.color : ruleColor,
      widthPt: typeof node.style?.widthPt === "number" ? node.style.widthPt : 1,
    },
  };
}

function assetFile(value: unknown): string | null {
  return typeof value === "string" && /^[\w.-]+\.(png|jpe?g|svg)$/i.test(value) ? value : null;
}

function unsupportedWarnings(nodes: readonly TemplateNodeV2[]): string[] {
  const unsupported = nodes
    .filter((node) => !node.locked)
    .filter((node) => !(
      (node.region === "header" || node.region === "footer") &&
      ["text", "field", "image", "line", "pageNumber"].includes(node.type)
    ));
  return unsupported.map((node) =>
    `Node "${node.id}" (${node.type}/${node.region}) is kept in TemplateModel but not rendered by the simple Typst adapter.`,
  );
}
