import { describe, expect, it } from "vitest";
import { defaultLayout, newBlock, sanitizeLayout, type LayoutConfig } from "../layout/layoutConfig.js";
import {
  analysisToImportModel,
  importModelToTemplateModel,
  layoutConfigToTemplateModel,
  templateModelToLayoutConfig,
} from "./adapters.js";
import { sanitizeImportModel } from "./importModel.js";
import { sanitizeTemplateModel } from "./templateModel.js";
import type { Analysis } from "../ingest/sidecar.js";

function layoutWithHeader(): LayoutConfig {
  const layout = defaultLayout();
  const block = {
    ...newBlock("custom", "#0659c5"),
    title: "Ministere",
    subtitle: "Direction",
    image: "logo-ministere.png",
    rule: { on: true, color: "#0659c5", widthPt: 1 },
  };
  return sanitizeLayout({
    ...layout,
    header: { ...layout.header, blocks: [block] },
  });
}

describe("template model contracts", () => {
  it("sanitizes ImportModel without trusting arbitrary values", () => {
    const model = sanitizeImportModel({
      source: { kind: "exe", bytes: -4 },
      pages: [{ id: "../page", widthPt: -1, heightPt: 0, rotation: 45 }],
      objects: [{
        id: "bad path",
        type: "script",
        bbox: { width: -2, height: 4 },
        confidence: 7,
        provenance: "shell",
        text: "ok",
      }],
      warnings: [{ code: "bad code!", message: 5 }],
    });

    expect(model).toMatchObject({
      model: "import",
      version: 1,
      source: { kind: "unknown", bytes: 0 },
      pages: [{ id: "page-1", widthPt: 1, heightPt: 1, rotation: 0 }],
      objects: [{ id: "object-1", type: "unknown", confidence: 1, provenance: "manual" }],
      warnings: [{ code: "warning-1", message: "" }],
    });
  });

  it("sanitizes TemplateModel and keeps future nodes outside LayoutConfig compatible mode", () => {
    const model = sanitizeTemplateModel({
      metadata: { layoutConfigCompatible: false },
      nodes: [{
        id: "signature",
        type: "field",
        regionId: "missing",
        fieldId: "signature.name",
        scope: "last",
      }],
      fields: [{ id: "signature.name", type: "date", confidence: 2 }],
    });

    expect(model.metadata.layoutConfigCompatible).toBe(false);
    expect(model.nodes[0]).toMatchObject({
      id: "signature",
      type: "field",
      regionId: "region-body",
      scope: "all",
      fieldId: "signature.name",
    });
    expect(model.fields[0]).toMatchObject({
      id: "signature.name",
      type: "date",
      confidence: 1,
    });
  });

  it("projects LayoutConfig into TemplateModel and back without changing the simple layout", () => {
    const layout = layoutWithHeader();
    const model = layoutConfigToTemplateModel(layout, { name: "Simple" });
    const projected = templateModelToLayoutConfig(model);

    expect(model.metadata).toMatchObject({
      name: "Simple",
      layoutConfigCompatible: true,
    });
    expect(model.nodes.map((node) => node.type)).toEqual(["image", "text", "text", "line", "pageNumber"]);
    expect(projected.compatible).toBe(true);
    expect(projected.layout).toEqual(layout);
  });

  it("marks advanced TemplateModel nodes as incompatible with LayoutConfig projection", () => {
    const model = sanitizeTemplateModel({
      ...layoutConfigToTemplateModel(defaultLayout()),
      nodes: [{ id: "field-node", type: "field", regionId: "region-body", fieldId: "custom.ref" }],
    });
    const projected = templateModelToLayoutConfig(model);

    expect(projected.compatible).toBe(false);
    expect(projected.reason).toContain("field-node");
  });

  it("adapts current ingest analysis to ImportModel, then to a non-compatible TemplateModel proposal", () => {
    const analysis: Analysis = {
      mode: "page",
      page: { widthPt: 595.28, heightPt: 841.89, count: 1, previewScale: 2, preview: "page-1.png" },
      regions: [
        { kind: "header", x: 0, y: 0, width: 595.28, height: 80, vector: true },
        { kind: "page", x: 0, y: 0, width: 595.28, height: 841.89, vector: false },
      ],
      layout: {
        paper: "a4",
        orientation: "portrait",
        margins: { top: 25, bottom: 20, left: 20, right: 20 },
        font: "Marianne",
        fontSize: 11,
        lineHeight: 1.2,
        headings: { scale: "normal", color: "#0659c5" },
      },
      fontSubstitution: null,
      counts: { text: 2, shapes: 1, images: 0 },
    };

    const importModel = analysisToImportModel(analysis, { kind: "pdf", name: "letter.pdf" });
    const templateModel = importModelToTemplateModel(importModel, sanitizeLayout(analysis.layout));

    expect(importModel.pages).toHaveLength(1);
    expect(importModel.objects.map((object) => object.type)).toEqual(["rasterRegion", "rasterRegion"]);
    expect(templateModel.metadata.layoutConfigCompatible).toBe(false);
    expect(templateModel.nodes[0]).toMatchObject({
      type: "raster",
      regionId: "region-header",
      sourceObjectIds: ["object-region-header-1"],
    });
  });
});
