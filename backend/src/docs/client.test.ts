import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Fastify from "fastify";
import { DocsApiError, docsSessionCookie, getDocsDocument, listDocsDocuments } from "./client.js";
import { docsRoutes } from "../routes/docs.js";
import { renderRoutes } from "../routes/render.js";

const ID = "22ae79e0-1210-4c2e-9969-7f7f7c6466a0";
const URL = `http://localhost:8071/api/v1.0/documents/${ID}/formatted-content/?content_format=json`;

/** Réponse Docs telle que renvoyée par formatted-content (blocs BlockNote, enfants vides). */
const DOC = {
  id: ID,
  title: "Note de service — test dots",
  content: [
    { id: "b1", type: "heading", props: { level: 1 }, content: [{ type: "text", text: "Titre", styles: {} }], children: [] },
    {
      id: "b2",
      type: "bulletListItem",
      props: {},
      content: [{ type: "text", text: "parent", styles: {} }],
      children: [
        { id: "b3", type: "bulletListItem", props: {}, content: [{ type: "text", text: "enfant", styles: {} }], children: [] },
      ],
    },
  ],
  created_at: "2026-09-15T10:00:00Z",
  updated_at: "2026-09-15T10:00:00Z",
};

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

async function failure(promise: Promise<unknown>): Promise<DocsApiError> {
  try {
    await promise;
  } catch (err) {
    expect(err).toBeInstanceOf(DocsApiError);
    return err as DocsApiError;
  }
  throw new Error("aurait dû lever DocsApiError");
}

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.DOCS_API_URL;
});

describe("getDocsDocument", () => {
  it("200 → { id, name, blocks, blockCount } avec les enfants comptés", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, DOC));
    const doc = await getDocsDocument(ID);
    expect(doc).toEqual({ id: ID, name: DOC.title, blocks: DOC.content, blockCount: 3 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(URL);
  });

  it("lit DOCS_API_URL (barre finale tolérée)", async () => {
    process.env.DOCS_API_URL = "http://docs.example:9000/";
    fetchMock.mockResolvedValue(jsonResponse(200, DOC));
    await getDocsDocument(ID);
    expect(fetchMock.mock.calls[0][0]).toBe(
      `http://docs.example:9000/api/v1.0/documents/${ID}/formatted-content/?content_format=json`,
    );
  });

  it("401 et 403 de Docs → 403 avec le message de connexion", async () => {
    for (const status of [401, 403]) {
      fetchMock.mockResolvedValueOnce(jsonResponse(status, { detail: "Authentication credentials were not provided." }));
      const err = await failure(getDocsDocument(ID));
      expect(err.status).toBe(403);
      expect(err.message).toBe(
        "Document non accessible : connectez-vous à Docs dans ce navigateur ou rendez son lien public.",
      );
    }
  });

  it("404 → 404 « Document introuvable dans Docs. »", async () => {
    fetchMock.mockResolvedValue(jsonResponse(404, { detail: "No Document matches the given query." }));
    const err = await failure(getDocsDocument(ID));
    expect(err.status).toBe(404);
    expect(err.message).toBe("Document introuvable dans Docs.");
  });

  it("content null → 422", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { ...DOC, content: null }));
    const err = await failure(getDocsDocument(ID));
    expect(err.status).toBe(422);
    expect(err.message).toBe(
      "Ce document n'a jamais été ouvert dans l'éditeur Docs, il n'a pas encore de contenu.",
    );
  });

  it("uuid invalide → 400 sans appeler Docs", async () => {
    for (const bad of ["abc", "22ae79e0-1210-1c2e-9969-7f7f7c6466a0", `${ID}/x`, ""]) {
      const err = await failure(getDocsDocument(bad));
      expect(err.status).toBe(400);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fetch qui échoue → 502 « Docs injoignable (…) »", async () => {
    fetchMock.mockRejectedValue(Object.assign(new TypeError("fetch failed"), { cause: { code: "ECONNREFUSED" } }));
    const err = await failure(getDocsDocument(ID));
    expect(err.status).toBe(502);
    expect(err.message).toBe("Docs injoignable (http://localhost:8071 : ECONNREFUSED)");
  });

  it("délai dépassé → 502", async () => {
    fetchMock.mockRejectedValue(Object.assign(new Error("timeout"), { name: "TimeoutError" }));
    const err = await failure(getDocsDocument(ID));
    expect(err.status).toBe(502);
    expect(err.message).toBe("Docs injoignable (http://localhost:8071 : délai dépassé après 15 s)");
  });

  it("autre statut (500, 429) → 502", async () => {
    fetchMock.mockResolvedValue(new Response("Too Many Requests", { status: 429 }));
    const err = await failure(getDocsDocument(ID));
    expect(err.status).toBe(502);
    expect(err.message).toBe("Docs injoignable (http://localhost:8071 : HTTP 429)");
  });

  it("transmet le cookie de session tel quel, et rien sans cookie", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, DOC));
    await getDocsDocument(ID, "docs_sessionid=abc123");
    expect((fetchMock.mock.calls[0][1] as RequestInit).headers).toMatchObject({ cookie: "docs_sessionid=abc123" });

    fetchMock.mockResolvedValue(jsonResponse(200, DOC));
    await getDocsDocument(ID);
    expect((fetchMock.mock.calls[1][1] as RequestInit).headers).not.toHaveProperty("cookie");
  });
});

describe("docsSessionCookie", () => {
  it("ne garde que docs_sessionid parmi les cookies du navigateur", () => {
    expect(docsSessionCookie("csrftoken=xyz; docs_sessionid=abc123; other=1")).toBe("docs_sessionid=abc123");
    expect(docsSessionCookie("docs_sessionid=abc123")).toBe("docs_sessionid=abc123");
    expect(docsSessionCookie("csrftoken=xyz")).toBeUndefined();
    expect(docsSessionCookie(undefined)).toBeUndefined();
    // un cookie dont le nom finit par docs_sessionid n'est pas le bon
    expect(docsSessionCookie("xdocs_sessionid=nope")).toBeUndefined();
  });
});

describe("routes /api/docs/:id et /api/render { docId }", () => {
  const TEMPLATE = '#set page(paper: "a4")\n#include "body.typ"\n';

  async function build() {
    const app = Fastify();
    await app.register(docsRoutes);
    await app.register(renderRoutes);
    return app;
  }

  it("GET /api/docs/:id → 200 et relaie uniquement docs_sessionid", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, DOC));
    const app = await build();
    const res = await app.inject({
      method: "GET",
      url: `/api/docs/${ID}`,
      headers: { cookie: "csrftoken=xyz; docs_sessionid=abc123" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ id: ID, name: DOC.title, blocks: DOC.content, blockCount: 3 });
    expect((fetchMock.mock.calls[0][1] as RequestInit).headers).toMatchObject({ cookie: "docs_sessionid=abc123" });
  });

  it("GET /api/docs/:id → 400 / 403 / 404 / 422 / 502 en JSON { error }", async () => {
    const app = await build();
    expect((await app.inject({ method: "GET", url: "/api/docs/not-a-uuid" })).statusCode).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();

    fetchMock.mockResolvedValueOnce(jsonResponse(401, {}));
    let res = await app.inject({ method: "GET", url: `/api/docs/${ID}` });
    expect(res.statusCode).toBe(403);
    expect(res.json().error).toMatch(/connectez-vous à Docs/);

    fetchMock.mockResolvedValueOnce(jsonResponse(404, {}));
    res = await app.inject({ method: "GET", url: `/api/docs/${ID}` });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: "Document introuvable dans Docs." });

    fetchMock.mockResolvedValueOnce(jsonResponse(200, { ...DOC, content: null }));
    res = await app.inject({ method: "GET", url: `/api/docs/${ID}` });
    expect(res.statusCode).toBe(422);

    fetchMock.mockRejectedValueOnce(new TypeError("fetch failed"));
    res = await app.inject({ method: "GET", url: `/api/docs/${ID}` });
    expect(res.statusCode).toBe(502);
    expect(res.json().error).toMatch(/^Docs injoignable \(/);
  });

  it("POST /api/render { docId, templateSource } → PDF avec les en-têtes de comptage", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, DOC));
    const app = await build();
    const res = await app.inject({
      method: "POST",
      url: "/api/render",
      headers: { cookie: "docs_sessionid=abc123" },
      payload: { docId: ID, templateSource: TEMPLATE },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toBe("application/pdf");
    expect(res.headers["x-dots-block-count"]).toBe("3");
    expect(res.headers["x-dots-unsupported-blocks"]).toBe("{}");
    expect(res.rawPayload.subarray(0, 5).toString()).toBe("%PDF-");
    expect((fetchMock.mock.calls[0][1] as RequestInit).headers).toMatchObject({ cookie: "docs_sessionid=abc123" });
  });

  it("POST /api/render { docId } avec un bloc image → 422 sans chemin du serveur", async () => {
    const app = await build();
    // URL Docs réelle, chemin racine, et tentative de sortie de FIXTURES_DIR : tous refusés.
    for (const url of ["http://localhost:8071/media/abc/photo.png", "/media/abc/photo.png", "../.env"]) {
      const image = { id: "b4", type: "image", props: { url, caption: "" }, children: [] };
      fetchMock.mockResolvedValueOnce(jsonResponse(200, { ...DOC, content: [...DOC.content, image] }));
      const res = await app.inject({ method: "POST", url: "/api/render", payload: { docId: ID, templateSource: TEMPLATE } });
      expect(res.statusCode, url).toBe(422);
      expect(res.json()).toEqual({ error: "Les images des documents Docs ne sont pas encore prises en charge." });
      expect(res.body).not.toMatch(/ENOENT|\/Users\/|fixtures/);
    }
  });

  it("POST /api/render : erreurs Docs et corps incomplet", async () => {
    const app = await build();
    let res = await app.inject({ method: "POST", url: "/api/render", payload: { templateSource: TEMPLATE } });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: "fixtureId or docId is required" });

    res = await app.inject({ method: "POST", url: "/api/render", payload: { docId: "nope", templateSource: TEMPLATE } });
    expect(res.statusCode).toBe(400);

    fetchMock.mockResolvedValueOnce(jsonResponse(404, {}));
    res = await app.inject({ method: "POST", url: "/api/render", payload: { docId: ID, templateSource: TEMPLATE } });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: "Document introuvable dans Docs." });

    fetchMock.mockResolvedValueOnce(jsonResponse(403, {}));
    res = await app.inject({ method: "POST", url: "/api/render", payload: { docId: ID, templateSource: TEMPLATE } });
    expect(res.statusCode).toBe(403);

    fetchMock.mockResolvedValueOnce(jsonResponse(200, { ...DOC, content: null }));
    res = await app.inject({ method: "POST", url: "/api/render", payload: { docId: ID, templateSource: TEMPLATE } });
    expect(res.statusCode).toBe(422);
  });
});

/** Réponse Docs de GET /api/v1.0/documents/ (page 1 sur 2, un titre vide, un rôle inconnu). */
const LIST_URL = "http://localhost:8071/api/v1.0/documents/";
const LIST = {
  count: 11,
  next: `${LIST_URL}?page=2&page_size=8`,
  previous: null,
  results: [
    { id: ID, title: "Note de service — test dots", updated_at: "2026-09-15T10:00:00Z", user_role: "owner", extra: 1 },
    { id: "aaaaaaaa-1111-4222-8333-444444444444", title: "", updated_at: "2026-09-14T08:00:00Z", user_role: "editor" },
    { id: "bbbbbbbb-1111-4222-8333-444444444444", title: "  Brouillon ", updated_at: "2026-09-13T08:00:00Z", user_role: "superuser" },
  ],
};

function calledUrl(index = 0): string {
  return String(fetchMock.mock.calls[index][0]);
}

describe("listDocsDocuments", () => {
  it("200 → { items, total, page, pageSize, hasMore } ; titre vide → « Document sans titre », rôle inconnu → null", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, LIST));
    const list = await listDocsDocuments({ title: "note" });
    expect(list).toEqual({
      items: [
        { id: ID, title: "Note de service — test dots", updatedAt: "2026-09-15T10:00:00Z", role: "owner" },
        { id: "aaaaaaaa-1111-4222-8333-444444444444", title: "Document sans titre", updatedAt: "2026-09-14T08:00:00Z", role: "editor" },
        { id: "bbbbbbbb-1111-4222-8333-444444444444", title: "Brouillon", updatedAt: "2026-09-13T08:00:00Z", role: null },
      ],
      total: 11,
      page: 1,
      pageSize: 8,
      hasMore: true,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("next null → hasMore false, count → total", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { ...LIST, count: 3, next: null }));
    const list = await listDocsDocuments({});
    expect(list.hasMore).toBe(false);
    expect(list.total).toBe(3);
  });

  it("URL : title encodé, page, page_size ; défauts page=1 page_size=8", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, LIST));
    await listDocsDocuments({ title: "réunion & co", page: 2, pageSize: 20 });
    expect(calledUrl(0)).toBe(`${LIST_URL}?title=r%C3%A9union+%26+co&page=2&page_size=20`);

    fetchMock.mockResolvedValue(jsonResponse(200, LIST));
    await listDocsDocuments({});
    expect(calledUrl(1)).toBe(`${LIST_URL}?page=1&page_size=8`);
  });

  it("URL : title vide ou blanc omis, tronqué à 200 caractères, espaces rognés", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, LIST));
    await listDocsDocuments({ title: "   " });
    expect(calledUrl(0)).toBe(`${LIST_URL}?page=1&page_size=8`);

    fetchMock.mockResolvedValue(jsonResponse(200, LIST));
    await listDocsDocuments({ title: ` ${"a".repeat(250)} ` });
    expect(new URLSearchParams(calledUrl(1).split("?")[1]).get("title")).toBe("a".repeat(200));
  });

  it("URL : page_size borné à [1, 50], page ≥ 1", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, LIST));
    await listDocsDocuments({ page: 0, pageSize: 500 });
    expect(calledUrl(0)).toBe(`${LIST_URL}?page=1&page_size=50`);

    fetchMock.mockResolvedValue(jsonResponse(200, LIST));
    await listDocsDocuments({ page: -3, pageSize: 0 });
    expect(calledUrl(1)).toBe(`${LIST_URL}?page=1&page_size=1`);
  });

  it("lit DOCS_API_URL (barre finale tolérée) et ne passe pas ordering", async () => {
    process.env.DOCS_API_URL = "http://docs.example:9000/";
    fetchMock.mockResolvedValue(jsonResponse(200, LIST));
    await listDocsDocuments({});
    expect(calledUrl(0)).toBe("http://docs.example:9000/api/v1.0/documents/?page=1&page_size=8");
    expect(calledUrl(0)).not.toMatch(/ordering/);
  });

  it("transmet le cookie de session tel quel, et rien sans cookie", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, LIST));
    await listDocsDocuments({}, "docs_sessionid=abc123");
    expect((fetchMock.mock.calls[0][1] as RequestInit).headers).toMatchObject({
      accept: "application/json",
      cookie: "docs_sessionid=abc123",
    });

    fetchMock.mockResolvedValue(jsonResponse(200, LIST));
    await listDocsDocuments({});
    expect((fetchMock.mock.calls[1][1] as RequestInit).headers).not.toHaveProperty("cookie");
  });

  it("401 et 403 → 403 « Connectez-vous à Docs… »", async () => {
    for (const status of [401, 403]) {
      fetchMock.mockResolvedValueOnce(jsonResponse(status, { detail: "Authentication credentials were not provided." }));
      const err = await failure(listDocsDocuments({}));
      expect(err.status).toBe(403);
      expect(err.message).toBe("Connectez-vous à Docs dans ce navigateur pour voir vos documents.");
    }
  });

  it("404 (page hors limite) → 404 « Page inexistante. »", async () => {
    fetchMock.mockResolvedValue(jsonResponse(404, { detail: "Invalid page." }));
    const err = await failure(listDocsDocuments({ page: 99 }));
    expect(err.status).toBe(404);
    expect(err.message).toBe("Page inexistante.");
  });

  it("429 → 429 « Trop de requêtes… »", async () => {
    fetchMock.mockResolvedValue(new Response("Too Many Requests", { status: 429 }));
    const err = await failure(listDocsDocuments({}));
    expect(err.status).toBe(429);
    expect(err.message).toBe("Trop de requêtes vers Docs : réessayez dans une minute.");
  });

  it("500 → 502 « Docs injoignable (… : HTTP 500) »", async () => {
    fetchMock.mockResolvedValue(new Response("boom", { status: 500 }));
    const err = await failure(listDocsDocuments({}));
    expect(err.status).toBe(502);
    expect(err.message).toBe("Docs injoignable (http://localhost:8071 : HTTP 500)");
  });

  it("réponse non JSON → 502", async () => {
    fetchMock.mockResolvedValue(new Response("<html>", { status: 200, headers: { "content-type": "text/html" } }));
    const err = await failure(listDocsDocuments({}));
    expect(err.status).toBe(502);
    expect(err.message).toBe("Docs injoignable (http://localhost:8071 : réponse non JSON)");
  });

  it("results absent ou non tableau → 502", async () => {
    for (const body of [{ count: 0 }, { count: 0, results: null }, { count: 0, results: "x" }]) {
      fetchMock.mockResolvedValueOnce(jsonResponse(200, body));
      const err = await failure(listDocsDocuments({}));
      expect(err.status).toBe(502);
      expect(err.message).toBe("Docs injoignable (http://localhost:8071 : liste de documents absente)");
    }
  });

  it("fetch qui échoue ou délai dépassé → 502", async () => {
    fetchMock.mockRejectedValueOnce(Object.assign(new TypeError("fetch failed"), { cause: { code: "ECONNREFUSED" } }));
    let err = await failure(listDocsDocuments({}));
    expect(err.status).toBe(502);
    expect(err.message).toBe("Docs injoignable (http://localhost:8071 : ECONNREFUSED)");

    fetchMock.mockRejectedValueOnce(Object.assign(new Error("timeout"), { name: "TimeoutError" }));
    err = await failure(listDocsDocuments({}));
    expect(err.status).toBe(502);
    expect(err.message).toBe("Docs injoignable (http://localhost:8071 : délai dépassé après 15 s)");
  });
});

describe("GET /api/docs", () => {
  async function build() {
    const app = Fastify();
    await app.register(docsRoutes);
    return app;
  }

  it("sans cookie → 200, hasSession false, Docs appelé anonymement", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, LIST));
    const app = await build();
    const res = await app.inject({ method: "GET", url: "/api/docs?title=note" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.hasSession).toBe(false);
    expect(body.total).toBe(11);
    expect(body.hasMore).toBe(true);
    expect(body.items).toHaveLength(3);
    expect(body.items[0]).toEqual({ id: ID, title: "Note de service — test dots", updatedAt: "2026-09-15T10:00:00Z", role: "owner" });
    expect(calledUrl(0)).toBe(`${LIST_URL}?title=note&page=1&page_size=8`);
    expect((fetchMock.mock.calls[0][1] as RequestInit).headers).not.toHaveProperty("cookie");
  });

  it("avec cookie → hasSession true et Docs reçoit exactement docs_sessionid=abc", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, LIST));
    const app = await build();
    const res = await app.inject({
      method: "GET",
      url: "/api/docs?title=note&page=2&page_size=20",
      headers: { cookie: "docs_sessionid=abc; autre=1" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().hasSession).toBe(true);
    expect(res.json().page).toBe(2);
    expect(res.json().pageSize).toBe(20);
    expect(calledUrl(0)).toBe(`${LIST_URL}?title=note&page=2&page_size=20`);
    expect((fetchMock.mock.calls[0][1] as RequestInit).headers).toMatchObject({ cookie: "docs_sessionid=abc" });
  });

  it("page et page_size non numériques → défauts (1, 8)", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, LIST));
    const app = await build();
    const res = await app.inject({ method: "GET", url: "/api/docs?page=abc&page_size=abc" });
    expect(res.statusCode).toBe(200);
    expect(res.json().page).toBe(1);
    expect(res.json().pageSize).toBe(8);
    expect(calledUrl(0)).toBe(`${LIST_URL}?page=1&page_size=8`);
  });

  it("title répété (tableau) → ignoré, pas de 500", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, LIST));
    const app = await build();
    const res = await app.inject({ method: "GET", url: "/api/docs?title=a&title=b&page=1&page=2" });
    expect(res.statusCode).toBe(200);
    expect(calledUrl(0)).toBe(`${LIST_URL}?page=1&page_size=8`);
  });

  it("erreurs Docs → code et { error }, jamais le cookie dans le message", async () => {
    const app = await build();
    const headers = { cookie: "docs_sessionid=secret-cookie-value" };

    fetchMock.mockResolvedValueOnce(jsonResponse(403, {}));
    let res = await app.inject({ method: "GET", url: "/api/docs", headers });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({ error: "Connectez-vous à Docs dans ce navigateur pour voir vos documents." });

    fetchMock.mockResolvedValueOnce(jsonResponse(404, { detail: "Invalid page." }));
    res = await app.inject({ method: "GET", url: "/api/docs?page=99", headers });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: "Page inexistante." });

    fetchMock.mockResolvedValueOnce(new Response("", { status: 429 }));
    res = await app.inject({ method: "GET", url: "/api/docs", headers });
    expect(res.statusCode).toBe(429);
    expect(res.json()).toEqual({ error: "Trop de requêtes vers Docs : réessayez dans une minute." });

    fetchMock.mockRejectedValueOnce(new TypeError("fetch failed"));
    res = await app.inject({ method: "GET", url: "/api/docs", headers });
    expect(res.statusCode).toBe(502);
    expect(res.json().error).toMatch(/^Docs injoignable \(/);

    fetchMock.mockResolvedValueOnce(jsonResponse(200, { count: 0 }));
    res = await app.inject({ method: "GET", url: "/api/docs", headers });
    expect(res.statusCode).toBe(502);

    for (const call of fetchMock.mock.calls) expect(String(call[0])).not.toMatch(/secret-cookie-value/);
  });

  it("la route par id reste servie à côté de la liste", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, DOC));
    const app = await build();
    const res = await app.inject({ method: "GET", url: `/api/docs/${ID}` });
    expect(res.statusCode).toBe(200);
    expect(res.json().blockCount).toBe(3);
    expect(calledUrl(0)).toBe(URL);
  });
});
