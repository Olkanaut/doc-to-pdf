import type { FastifyInstance } from "fastify";
import { readFile } from "node:fs/promises";
import { TEMPLATES, getTemplate, templatePath } from "../registry/templates.js";

export async function templatesRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/templates", async () => {
    return TEMPLATES.map(({ id, name, description }) => ({ id, name, description }));
  });

  app.get<{ Params: { id: string } }>("/api/templates/:id/source", async (req, reply) => {
    const template = getTemplate(req.params.id);
    if (!template) {
      return reply.code(404).send({ error: "template not found" });
    }
    const source = await readFile(templatePath(template), "utf8");
    return { id: template.id, source };
  });
}
