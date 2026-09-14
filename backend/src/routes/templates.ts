import type { FastifyInstance } from "fastify";
import {
  listTemplates,
  getTemplateMeta,
  getTemplateSource,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  getThumbnail,
} from "../registry/templates.js";

const DEFAULT_SOURCE = `#set page(
  paper: "a4",
  margin: 2.5cm,
  footer: [
    #align(center)[#context counter(page).display("1 / 1", both: true)]
  ],
)

#include "body.typ"
`;

interface CreateBody {
  name?: string;
  description?: string;
  source?: string;
}

interface UpdateBody {
  name?: string;
  description?: string;
  source?: string;
}

export async function templatesRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/templates", async () => {
    return listTemplates();
  });

  app.get<{ Params: { id: string } }>("/api/templates/:id", async (req, reply) => {
    const meta = await getTemplateMeta(req.params.id);
    if (!meta) return reply.code(404).send({ error: "template not found" });
    const source = await getTemplateSource(req.params.id);
    return { ...meta, source };
  });

  app.post<{ Body: CreateBody }>("/api/templates", async (req, reply) => {
    const { name, description, source } = req.body ?? {};
    const created = await createTemplate({
      name: name?.trim() || "Nouveau gabarit",
      description: description?.trim() ?? "",
      source: source ?? DEFAULT_SOURCE,
    });
    return reply.code(201).send(created);
  });

  app.put<{ Params: { id: string }; Body: UpdateBody }>(
    "/api/templates/:id",
    async (req, reply) => {
      const updated = await updateTemplate(req.params.id, req.body ?? {});
      if (!updated) return reply.code(404).send({ error: "template not found" });
      return updated;
    },
  );

  app.delete<{ Params: { id: string } }>("/api/templates/:id", async (req, reply) => {
    const ok = await deleteTemplate(req.params.id);
    if (!ok) return reply.code(404).send({ error: "template not found" });
    return reply.code(204).send();
  });

  app.get<{ Params: { id: string } }>("/api/templates/:id/thumbnail", async (req, reply) => {
    const png = await getThumbnail(req.params.id);
    if (!png) return reply.code(404).send();
    reply.header("Cache-Control", "public, max-age=31536000, immutable");
    reply.header("Content-Type", "image/png");
    return reply.send(png);
  });
}
