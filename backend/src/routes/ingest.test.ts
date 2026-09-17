/**
 * Les routes d'import, appelées en HTTP (app.inject) sur un vrai PDF fabriqué
 * avec typst : dépôt, aperçu, découpe, création du template. Ce qui est vérifié
 * ici, c'est le contrat des routes ; le relevé lui-même l'est dans
 * ingest/ingest.test.ts.
 */
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import Fastify from "fastify";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type { TemplateDetail } from "../clients/templatesClient.js";
import { TEMPLATES_ASSETS_DIR } from "../registry/templates.js";
import type { AuthSession } from "./auth.js";
import { ingestRoutes } from "./ingest.js";

const execFileAsync = promisify(execFile);

const SESSION: AuthSession = {
  accessToken: "user-access-token",
  expiresAt: Date.now() + 60_000,
  user: { sub: "user-id" },
};

const DOC = `#set page(
  paper: "a4",
  margin: (top: 40mm, bottom: 20mm, left: 25mm, right: 25mm),
  header: place(top + left, dx: -25mm, rect(width: 100% + 50mm, height: 22mm, fill: rgb("#000091"))),
)
#set text(font: "Libertinus Serif", size: 11pt)

= Titre

Corps du document, assez long pour que les marges et l'interligne se mesurent
sur plusieurs lignes de texte courant.

Un second paragraphe, pour la même raison.
`;

async function available(): Promise<boolean> {
  const python = process.env.DOTS_PYTHON ?? "python3";
  return Promise.all([
    execFileAsync("typst", ["--version"]),
    execFileAsync(python, ["-c", "import pymupdf"]),
  ]).then(
    () => true,
    () => false,
  );
}

const enabled = await available();

/** Assets créés par les tests, retirés du dossier partagé à la fin. */
const written: string[] = [];

describe.skipIf(!enabled)("routes d'import", () => {
  let dir = "";
  let pdfBase64 = "";
  let created: TemplateDetail | null = null;

  async function buildApp(overrides: Parameters<typeof ingestRoutes>[1] = {}) {
    const app = Fastify();
    await app.register(ingestRoutes, {
      getSession: async () => SESSION,
      createTemplate: async (input: {
        name: string;
        description: string;
        source: string;
      }) => {
        created = {
          id: "11111111-2222-3333-4444-555555555555",
          name: input.name,
          description: input.description,
          source: input.source,
          createdAt: "2026-09-16T00:00:00Z",
          updatedAt: "2026-09-16T00:00:00Z",
        };
        return created;
      },
      ...overrides,
    });
    return app;
  }

  async function ingest(app: Awaited<ReturnType<typeof buildApp>>) {
    const res = await app.inject({
      method: "POST",
      url: "/api/ingest",
      payload: { fileBase64: pdfBase64, filename: "lettre.pdf" },
    });
    expect(res.statusCode).toBe(200);
    return res.json();
  }

  beforeAll(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "dots-routes-"));
    const src = path.join(dir, "doc.typ");
    const pdf = path.join(dir, "doc.pdf");
    await writeFile(src, DOC, "utf8");
    await execFileAsync("typst", ["compile", "--root", dir, src, pdf]);
    pdfBase64 = (await readFile(pdf)).toString("base64");
  });

  afterEach(() => {
    created = null;
  });

  afterAll(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
    // Les fragments partent dans le dossier d'assets partagé : on les retire.
    await Promise.all(
      written.map((file) =>
        unlink(path.join(TEMPLATES_ASSETS_DIR, file)).catch(() => {}),
      ),
    );
  });

  it("exige une session", async () => {
    const app = await buildApp({ getSession: async () => null });
    const res = await app.inject({
      method: "POST",
      url: "/api/ingest",
      payload: { fileBase64: "AA==" },
    });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it("refuse ce qui n'est pas du base64, et ce qui est trop gros", async () => {
    const app = await buildApp();

    const bad = await app.inject({
      method: "POST",
      url: "/api/ingest",
      payload: { fileBase64: "pas du base64 !" },
    });
    expect(bad.statusCode).toBe(400);

    const huge = await app.inject({
      method: "POST",
      url: "/api/ingest",
      payload: { fileBase64: "A".repeat(14 * 1024 * 1024) },
    });
    expect(huge.statusCode).toBe(413);
    expect(huge.json().code).toBe("too_large");

    await app.close();
  });

  it("refuse un fichier dont les octets ne sont ni PDF ni docx", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/ingest",
      // Extension trompeuse : le type se lit sur le contenu.
      payload: {
        fileBase64: Buffer.from("texte brut").toString("base64"),
        filename: "faux.pdf",
      },
    });
    expect(res.statusCode).toBe(415);
    expect(res.json().code).toBe("unsupported_format");
    await app.close();
  });

  it("dépose, relève la page et sert son aperçu", async () => {
    const app = await buildApp();
    const body = await ingest(app);

    expect(body.jobId).toMatch(/^[0-9a-f-]{36}$/);
    expect(body.page.widthPt).toBeCloseTo(595.28, 1);
    expect(
      body.regions.some((r: { kind: string }) => r.kind === "header"),
    ).toBe(true);
    expect(body.layout.margins.left).toBeCloseTo(25, 0);

    const preview = await app.inject({
      method: "GET",
      url: `/api/ingest/${body.jobId}/preview`,
    });
    expect(preview.statusCode).toBe(200);
    expect(preview.headers["content-type"]).toBe("image/png");
    expect(preview.rawPayload.subarray(1, 4).toString()).toBe("PNG");

    await app.close();
  });

  it("répond 404 pour un import inconnu, sans toucher au disque", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/api/ingest/../../etc/preview",
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
  it("découpe une zone et la range dans les assets", async () => {
    const app = await buildApp();
    const body = await ingest(app);
    const header = body.regions.find(
      (r: { kind: string }) => r.kind === "header",
    );

    const res = await app.inject({
      method: "POST",
      url: `/api/ingest/${body.jobId}/fragment`,
      payload: { rect: header, vector: false, kind: "en-tete" },
    });
    expect(res.statusCode).toBe(200);
    const fragment = res.json();
    written.push(fragment.file);

    // Nom tiré par le serveur : jamais celui du client, et sans collision.
    expect(fragment.file).toMatch(/^en-tete-[0-9a-f]{8}\.png$/);
    expect(fragment.widthPt).toBeCloseTo(595.28, 1);
    const bytes = await readFile(
      path.join(TEMPLATES_ASSETS_DIR, fragment.file),
    );
    expect(bytes.subarray(1, 4).toString()).toBe("PNG");

    await app.close();
  });

  it("crée un template dont la marge haute loge le bandeau", async () => {
    const app = await buildApp();
    const body = await ingest(app);
    const header = body.regions.find(
      (r: { kind: string }) => r.kind === "header",
    );

    const res = await app.inject({
      method: "POST",
      url: `/api/ingest/${body.jobId}/template`,
      payload: { name: "Lettre type", header, vector: false },
    });
    expect(res.statusCode).toBe(201);
    const result = res.json();
    written.push(...result.fragments.map((f: { file: string }) => f.file));

    expect(created?.name).toBe("Lettre type");
    expect(created?.source).toContain("dots:layout");
    expect(created?.source).toContain("place(top + left");
    // Chemin relatif simple : typst refuse tout chemin qui remonte.
    expect(created?.source).not.toContain("..");

    const bandHeight =
      (210 * result.fragments[0].heightPt) / result.fragments[0].widthPt;
    expect(result.layout.margins.top).toBeGreaterThanOrEqual(bandHeight);
    expect(result.layout.header.blocks[0].imageHeightMm).toBe(0);

    await app.close();
  });

  it("crée un template sans bandeau quand aucune zone n'est retenue", async () => {
    const app = await buildApp();
    const body = await ingest(app);

    const res = await app.inject({
      method: "POST",
      url: `/api/ingest/${body.jobId}/template`,
      payload: { name: "Page entière", header: null, footer: null },
    });
    expect(res.statusCode).toBe(201);
    // No region kept: the band holds no blocks, which is what makes it render as nothing.
    expect(res.json().layout.header.blocks).toEqual([]);
    expect(created?.source).not.toContain("image(");

    await app.close();
  });
});
