import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DocsApiError,
  type DocsDocumentContent,
  type DocsDocumentSummary,
} from "../clients/docsClient.js";
import {
  TemplatesApiError,
  type TemplateDetail,
} from "../clients/templatesClient.js";
import { TypstCompileError } from "../compile/typstCompile.js";
import { UnsupportedBodyImagesError } from "../render/renderBlocks.js";
import type { AuthSession } from "./auth.js";
import { documentRoutes, type DocumentRoutesOptions } from "./documents.js";

const DOCUMENT_ID = "a372f33f-25a1-4595-b6b6-d8de64c5ac00";
const TEMPLATE_ID = "cfa3f6aa-f024-47b3-94bf-407c850debf1";
const PDF = Buffer.from("%PDF-1.7 test");

const SESSION: AuthSession = {
  accessToken: "user-access-token",
  expiresAt: Date.now() + 60_000,
  user: { sub: "user-id" },
};

const DOCUMENT: DocsDocumentContent = {
  id: DOCUMENT_ID,
  title: "Hello world",
  blocks: [
    {
      type: "paragraph",
      content: [{ type: "text", text: "Document content", styles: {} }],
      children: [],
    },
  ],
  createdAt: "2026-09-15T00:21:08.979814Z",
  updatedAt: "2026-09-15T15:42:10.115420Z",
};

const SEARCH_RESULTS: DocsDocumentSummary[] = [
  {
    id: DOCUMENT_ID,
    title: "Hello world",
    createdAt: "2026-09-15T00:21:08.979814Z",
    updatedAt: "2026-09-15T15:42:10.115420Z",
  },
];

const TEMPLATE: TemplateDetail = {
  id: TEMPLATE_ID,
  name: "Standard invoice",
  description: "A4 invoice template",
  source: '#include "body.typ"',
  createdAt: "2026-09-15T14:30:00Z",
  updatedAt: "2026-09-15T14:45:00Z",
};

const apps: ReturnType<typeof Fastify>[] = [];

async function buildApp(overrides: DocumentRoutesOptions = {}) {
  const app = Fastify();
  apps.push(app);
  await app.register(documentRoutes, {
    getSession: async () => SESSION,
    fetchDocument: async () => DOCUMENT,
    searchDocuments: async () => SEARCH_RESULTS,
    fetchTemplate: async () => TEMPLATE,
    renderBlocks: async () => ({
      pdf: PDF,
      blockCount: 1,
      unsupported: {},
    }),
    ...overrides,
  });
  await app.ready();
  return app;
}

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
  vi.restoreAllMocks();
});

describe("GET /api/documents/search", () => {
  it("requires a Dots session", async () => {
    const app = await buildApp({ getSession: async () => null });

    const response = await app.inject({
      method: "GET",
      url: "/api/documents/search?q=hello",
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: "Authentication required" });
  });

  it("returns an empty list for short queries", async () => {
    const searchDocuments = vi.fn(async () => SEARCH_RESULTS);
    const app = await buildApp({ searchDocuments });

    const response = await app.inject({
      method: "GET",
      url: "/api/documents/search?q=h",
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.json()).toEqual([]);
    expect(searchDocuments).not.toHaveBeenCalled();
  });

  it("searches Docs with the user token and a capped limit", async () => {
    const searchDocuments = vi.fn(async () => SEARCH_RESULTS);
    const app = await buildApp({ searchDocuments });

    const response = await app.inject({
      method: "GET",
      url: "/api/documents/search?q=%20hello%20world%20&limit=99",
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.json()).toEqual(SEARCH_RESULTS);
    expect(searchDocuments).toHaveBeenCalledWith(
      "hello world",
      SESSION.accessToken,
      10,
    );
  });

  it("preserves Docs API status codes", async () => {
    const app = await buildApp({
      searchDocuments: async () => {
        throw new DocsApiError("Docs request timed out", 504);
      },
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/documents/search?q=hello",
    });

    expect(response.statusCode).toBe(504);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.json()).toEqual({ error: "Docs request timed out" });
  });
});

describe("POST /api/documents/:documentId/render", () => {
  it("requires a Dots session", async () => {
    const app = await buildApp({ getSession: async () => null });

    const response = await app.inject({
      method: "POST",
      url: `/api/documents/${DOCUMENT_ID}/render`,
      payload: { templateId: TEMPLATE_ID },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: "Authentication required" });
  });

  it("validates the document and template identifiers", async () => {
    const app = await buildApp();

    const invalidDocument = await app.inject({
      method: "POST",
      url: "/api/documents/not-a-uuid/render",
      payload: { templateId: TEMPLATE_ID },
    });
    const missingTemplate = await app.inject({
      method: "POST",
      url: `/api/documents/${DOCUMENT_ID}/render`,
      payload: {},
    });
    const invalidTemplate = await app.inject({
      method: "POST",
      url: `/api/documents/${DOCUMENT_ID}/render`,
      payload: { templateId: "not-a-uuid" },
    });

    expect(invalidDocument.statusCode).toBe(400);
    expect(missingTemplate.statusCode).toBe(400);
    expect(invalidTemplate.statusCode).toBe(400);
  });

  it("fetches the document and template with the same user token", async () => {
    const fetchDocument = vi.fn(async () => DOCUMENT);
    const fetchTemplate = vi.fn(async () => TEMPLATE);
    const renderBlocks = vi.fn(async () => ({
      pdf: PDF,
      blockCount: 1,
      unsupported: { codeBlock: 2 },
    }));
    const app = await buildApp({ fetchDocument, fetchTemplate, renderBlocks });

    const response = await app.inject({
      method: "POST",
      url: `/api/documents/${DOCUMENT_ID}/render`,
      payload: { templateId: TEMPLATE_ID },
    });

    expect(fetchDocument).toHaveBeenCalledWith(DOCUMENT_ID, SESSION.accessToken);
    expect(fetchTemplate).toHaveBeenCalledWith(TEMPLATE_ID, SESSION.accessToken);
    expect(renderBlocks).toHaveBeenCalledWith(
      expect.objectContaining({
        blocks: DOCUMENT.blocks,
        templateSource: TEMPLATE.source,
      }),
    );
    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("application/pdf");
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.headers["x-dots-block-count"]).toBe("1");
    expect(response.headers["x-dots-unsupported-blocks"]).toBe('{"codeBlock":2}');
    expect(response.rawPayload).toEqual(PDF);
  });

  it("preserves Docs and Templates API status codes", async () => {
    const docsApp = await buildApp({
      fetchDocument: async () => {
        throw new DocsApiError("You do not have access to this document", 403);
      },
    });
    const templateApp = await buildApp({
      fetchTemplate: async () => {
        throw new TemplatesApiError("Template not found", 404);
      },
    });

    const [docsResponse, templateResponse] = await Promise.all([
      docsApp.inject({
        method: "POST",
        url: `/api/documents/${DOCUMENT_ID}/render`,
        payload: { templateId: TEMPLATE_ID },
      }),
      templateApp.inject({
        method: "POST",
        url: `/api/documents/${DOCUMENT_ID}/render`,
        payload: { templateId: TEMPLATE_ID },
      }),
    ]);

    expect(docsResponse.statusCode).toBe(403);
    expect(templateResponse.statusCode).toBe(404);
  });

  it("returns Typst diagnostics without turning them into a 500", async () => {
    const app = await buildApp({
      renderBlocks: async () => {
        throw new TypstCompileError("error: unknown variable");
      },
    });

    const response = await app.inject({
      method: "POST",
      url: `/api/documents/${DOCUMENT_ID}/render`,
      payload: { templateId: TEMPLATE_ID },
    });

    expect(response.statusCode).toBe(422);
    expect(response.json()).toEqual({
      error: "typst compile failed",
      details: "error: unknown variable",
    });
  });

  it("returns an explicit error for Docs images", async () => {
    const app = await buildApp({
      renderBlocks: async () => {
        throw new UnsupportedBodyImagesError();
      },
    });

    const response = await app.inject({
      method: "POST",
      url: `/api/documents/${DOCUMENT_ID}/render`,
      payload: { templateId: TEMPLATE_ID },
    });

    expect(response.statusCode).toBe(422);
    expect(response.json()).toEqual({
      error: "Les images des documents Docs ne sont pas encore prises en charge.",
    });
  });
});
