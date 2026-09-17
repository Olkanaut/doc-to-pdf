import { describe, expect, it } from "vitest";
import { defaultLayout, newBlock, sanitizeLayout, type LayoutConfig } from "../layout/layoutConfig.js";
import {
  analysisToImportModel,
  importModelToTemplateModel,
  importModelToTemplateModelV2,
  layoutConfigToTemplateModel,
  layoutConfigToTemplateModelV2,
  templateModelToLayoutConfig,
  templateModelV2ToLayoutConfig,
} from "./adapters.js";
import {
  BUILTIN_FIELD_DEFINITIONS,
  fieldDefinitionForId,
  isBuiltinFieldId,
  isCustomFieldId,
  sanitizeFieldCandidate,
  sanitizeFieldDefinition,
  sanitizeFieldId,
} from "./fieldRegistry.js";
import { sanitizeImportModel } from "./importModel.js";
import {
  migrateTemplateModelToV2,
  sanitizeTemplateModel,
  sanitizeTemplateModelV2,
} from "./templateModel.js";
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

  it("accepts table observations while keeping them outside the LayoutConfig subset", () => {
    const model = sanitizeTemplateModel({
      nodes: [{ id: "table-node", type: "table", regionId: "region-body" }],
    });
    const projected = templateModelToLayoutConfig(model);

    expect(model.nodes[0]).toMatchObject({ id: "table-node", type: "table" });
    expect(projected.compatible).toBe(false);
  });

  it("defines typed built-in fields while keeping custom fields namespaced", () => {
    expect(BUILTIN_FIELD_DEFINITIONS.map((field) => field.id)).toEqual([
      "document.title",
      "document.reference",
      "document.date",
      "organization.name",
      "organization.logo",
      "recipient.name",
      "recipient.address",
      "signature.name",
      "signature.image",
    ]);
    expect(isBuiltinFieldId("document.date")).toBe(true);
    expect(isCustomFieldId("custom.invoice.total")).toBe(true);
    expect(sanitizeFieldId("recipient.email", "custom.fallback")).toBe("custom.fallback");
    expect(fieldDefinitionForId("custom.invoice.total")).toMatchObject({
      id: "custom.invoice.total",
      label: "Total",
      type: "text",
      required: false,
    });
    expect(sanitizeFieldDefinition({ id: "custom.amount", type: "number", required: true })).toMatchObject({
      id: "custom.amount",
      type: "number",
      required: true,
    });
    expect(sanitizeFieldCandidate({
      id: "candidate-ref",
      fieldId: "document.reference",
      type: "email",
      sourceCandidate: { kind: "pdf-text", objectIds: ["text-1"], confidence: 0.6 },
    })).toMatchObject({
      id: "candidate-ref",
      fieldId: "document.reference",
      type: "text",
      sourceObjectIds: ["text-1"],
    });
  });

  it("sanitizes TemplateModel v2 with editable nodes, richer scopes, and permissive fields", () => {
    const model = sanitizeTemplateModelV2({
      version: 2,
      nodes: [
        {
          id: "header-title",
          type: "text",
          region: "header",
          scope: "odd",
          text: "Ministere",
          source: { kind: "pdf-text", objectIds: ["pdf-text-1"], assetIds: [] },
          confidence: 0.82,
          bbox: { x: 20, y: 12, width: 180, height: 16 },
        },
        {
          id: "recipient-mail",
          type: "field",
          region: "body",
          fieldId: "recipient.address",
          fieldType: "address",
          label: "Adresse",
          binding: { path: "recipient.address" },
        },
        {
          id: "watermark-logo",
          type: "image",
          region: "watermark",
          assetId: "logo.png",
          imageKind: "embedded",
          source: { kind: "docx-media" },
        },
        { id: "signature-box", type: "shape", region: "signature", shape: "rect" },
        { id: "separator", type: "line", region: "header", x1: 0, y1: 80, x2: 595, y2: 80 },
        { id: "header-group", type: "group", region: "header", children: ["header-title", "separator"] },
        {
          id: "rates-table",
          type: "table",
          region: "body",
          columns: [{ id: "label" }, { id: "value" }],
          rows: [[{ text: "TVA" }, { text: "20%" }]],
        },
        {
          id: "last-page",
          type: "pageNumber",
          region: "footer",
          scope: "last",
          numbering: "page-n-of-total",
          align: "right",
        },
      ],
      fields: [{
        id: "recipient.address",
        label: "Adresse destinataire",
        type: "address",
        aliases: ["adresse", "domicile"],
      }],
      fieldCandidates: [{
        id: "candidate-ref",
        fieldId: "document.reference",
        proposedValue: "ABC-123",
        sourceCandidate: { kind: "pdf-text", objectIds: ["pdf-text-1"], confidence: 0.7 },
      }],
      assets: [{ id: "logo.png", file: "logo.png", source: { kind: "docx-media" } }],
      metadata: { layoutConfigCompatible: false },
    });

    expect(model.version).toBe(2);
    expect(model.regions.map((region) => region.kind)).toEqual(
      expect.arrayContaining(["header", "footer", "body", "sidebar", "watermark", "signature"]),
    );
    expect(model.nodes.map((node) => node.type)).toEqual([
      "text",
      "field",
      "image",
      "shape",
      "line",
      "group",
      "table",
      "pageNumber",
    ]);
    expect(model.nodes[0]).toMatchObject({
      scope: "odd",
      source: { kind: "pdf-text", objectIds: ["pdf-text-1"] },
      layout: { mode: "absolute", x: 20 },
    });
    expect(model.nodes[1]).toMatchObject({ fieldId: "recipient.address", fieldType: "address" });
    expect(model.nodes[2]).toMatchObject({
      region: "watermark",
      source: { kind: "docx-media", assetIds: ["logo.png"] },
    });
    expect(model.nodes[7]).toMatchObject({ scope: "last", numbering: "page-n-of-total" });
    expect(model.fields[0]).toMatchObject({
      id: "recipient.address",
      type: "address",
      aliases: ["adresse", "domicile"],
      sourceCandidate: { kind: "user" },
    });
    expect(model.fieldCandidates[0]).toMatchObject({
      id: "candidate-ref",
      fieldId: "document.reference",
      proposedValue: "ABC-123",
      sourceCandidate: { kind: "pdf-text", objectIds: ["pdf-text-1"] },
    });
  });

  it("migrates TemplateModel v1 to v2 while keeping the simple LayoutConfig projection", () => {
    const layout = layoutWithHeader();
    const v1 = layoutConfigToTemplateModel(layout, { name: "Simple" });
    const v2 = migrateTemplateModelToV2(v1);
    const projected = templateModelV2ToLayoutConfig(v2);

    expect(v2).toMatchObject({
      version: 2,
      metadata: {
        name: "Simple",
        layoutConfigCompatible: true,
        migratedFromVersion: 1,
      },
    });
    expect(v2.nodes.map((node) => node.type)).toEqual(["image", "text", "text", "line", "pageNumber"]);
    expect(projected.compatible).toBe(true);
    expect(projected.layout).toEqual(layout);
  });

  it("projects LayoutConfig directly into TemplateModel v2 without changing the simple layout", () => {
    const layout = layoutWithHeader();
    const model = layoutConfigToTemplateModelV2(layout, { name: "Simple v2" });
    const projected = templateModelV2ToLayoutConfig(model);

    expect(model.metadata).toMatchObject({
      name: "Simple v2",
      layoutConfigCompatible: true,
    });
    expect(model.nodes.map((node) => node.type)).toEqual(["image", "text", "text", "line", "pageNumber"]);
    expect(projected.compatible).toBe(true);
    expect(projected.layout).toEqual(layout);
  });

  it("adapts rich ImportModel observations to editable TemplateModel v2 nodes", () => {
    const importModel = sanitizeImportModel({
      source: { kind: "pdf", name: "source.pdf" },
      pages: [{ id: "page-1", pageIndex: 0, widthPt: 595.28, heightPt: 841.89, rotation: 0 }],
      zones: [{
        id: "zone-header",
        kind: "header",
        pageIndex: 0,
        bbox: { x: 0, y: 0, width: 595.28, height: 90 },
        confidence: 0.9,
        provenance: "pdf-text",
      }],
      objects: [
        {
          id: "pdf-title-1",
          type: "text",
          pageIndex: 0,
          bbox: { x: 20, y: 30, width: 120, height: 12 },
          provenance: "pdf-text",
          confidence: 0.98,
          zoneId: "zone-header",
          text: "Convention cadre",
          style: { font: "Arial", fontSize: 18 },
        },
        {
          id: "pdf-ref-1",
          type: "text",
          pageIndex: 0,
          bbox: { x: 20, y: 54, width: 120, height: 12 },
          provenance: "pdf-text",
          confidence: 0.98,
          zoneId: "zone-header",
          text: "Reference: ABC-123",
          style: { font: "Arial", fontSize: 11 },
        },
        {
          id: "pdf-date-1",
          type: "text",
          pageIndex: 0,
          bbox: { x: 20, y: 100, width: 120, height: 12 },
          provenance: "pdf-text",
          confidence: 0.9,
          text: "Paris, le 12/09/2026",
          style: { font: "Arial", fontSize: 11 },
        },
        {
          id: "pdf-address-1",
          type: "text",
          pageIndex: 0,
          bbox: { x: 20, y: 220, width: 160, height: 40 },
          provenance: "pdf-text",
          confidence: 0.8,
          text: "12 rue Victor Hugo 75001 Paris",
          style: { font: "Arial", fontSize: 11 },
        },
        {
          id: "pdf-signature-1",
          type: "text",
          pageIndex: 0,
          bbox: { x: 360, y: 720, width: 120, height: 12 },
          provenance: "pdf-text",
          confidence: 0.7,
          text: "Signature: Jean Dupont",
          style: { font: "Arial", fontSize: 11 },
        },
        {
          id: "pdf-image-1",
          type: "image",
          pageIndex: 0,
          bbox: { x: 420, y: 20, width: 80, height: 40 },
          provenance: "pdf-image",
          confidence: 0.86,
          zoneId: "zone-header",
          assetId: "asset-logo",
        },
        {
          id: "docx-table-1",
          type: "table",
          pageIndex: 0,
          bbox: { x: 30, y: 140, width: 300, height: 80 },
          provenance: "docx-xml",
          confidence: 0.75,
          raw: { rows: [["A", "B"], ["1", "2"]] },
        },
      ],
      assets: [{ id: "asset-logo", name: "logo.png", provenance: "pdf-image" }],
      warnings: [],
    });

    const model = importModelToTemplateModelV2(importModel);
    const projected = templateModelV2ToLayoutConfig(model);

    expect(model.metadata.layoutConfigCompatible).toBe(false);
    expect(model.fields).toEqual([]);
    expect(model.fieldCandidates.map((candidate) => candidate.fieldId)).toEqual(expect.arrayContaining([
      "document.date",
      "document.reference",
      "document.title",
      "organization.logo",
      "recipient.address",
      "signature.name",
    ]));
    expect(model.fieldCandidates.find((candidate) => candidate.fieldId === "document.reference")).toMatchObject({
      proposedValue: "ABC-123",
      sourceCandidate: { kind: "pdf-text", objectIds: ["pdf-ref-1"] },
    });
    expect(model.fieldCandidates.find((candidate) => candidate.fieldId === "organization.logo")).toMatchObject({
      proposedValue: "asset-logo",
      sourceCandidate: { kind: "pdf-image", assetIds: ["asset-logo"] },
    });
    expect(model.nodes[0]).toMatchObject({
      type: "text",
      region: "header",
      text: "Convention cadre",
      source: { kind: "pdf-text", objectIds: ["pdf-title-1"] },
      layout: { mode: "absolute", x: 20 },
    });
    expect(model.nodes.find((node) => node.type === "image")).toMatchObject({
      type: "image",
      imageKind: "embedded",
      assetId: "asset-logo",
      source: { kind: "pdf-image", assetIds: ["asset-logo"] },
    });
    expect(model.nodes.find((node) => node.type === "table")).toMatchObject({
      type: "table",
      source: { kind: "docx-xml" },
    });
    const table = model.nodes.find((node) => node.type === "table");
    expect(table?.type === "table" ? table.rows[0]?.[0]?.text : undefined).toBe("A");
    expect(projected.compatible).toBe(false);
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

  it("preserves rich sidecar ImportModel objects when they are already present", () => {
    const analysis: Analysis = {
      mode: "page",
      page: { widthPt: 595.28, heightPt: 841.89, count: 1, previewScale: 2, preview: "page-1.png" },
      regions: [{ kind: "page", x: 0, y: 0, width: 595.28, height: 841.89, vector: false }],
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
      counts: { text: 1, shapes: 0, images: 0 },
      importModel: {
        model: "import",
        version: 1,
        source: { kind: "pdf" },
        pages: [{ id: "page-1", pageIndex: 0, widthPt: 595.28, heightPt: 841.89, rotation: 0 }],
        zones: [{
          id: "region-body",
          kind: "body",
          pageIndex: 0,
          bbox: { x: 0, y: 0, width: 595.28, height: 841.89 },
          confidence: 1,
          provenance: "pdf-text",
        }],
        objects: [{
          id: "pdf-text-1",
          type: "text",
          pageIndex: 0,
          bbox: { x: 20, y: 30, width: 120, height: 12 },
          provenance: "pdf-text",
          confidence: 1,
          zoneId: "region-body",
          text: "Reference",
          style: { font: "Arial", fontSize: 11, color: "#000000" },
        }],
        assets: [],
        warnings: [],
      },
    };

    const importModel = analysisToImportModel(analysis, { name: "source.pdf" });

    expect(importModel.source).toMatchObject({ kind: "pdf", name: "source.pdf" });
    expect(importModel.objects).toEqual(analysis.importModel!.objects);
  });
});
