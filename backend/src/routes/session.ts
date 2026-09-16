import type { FastifyInstance } from "fastify";
import { getAuthSession } from "./auth.js";

export async function sessionRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/session", async (req, reply) => {
    const session = await getAuthSession(req, reply);
    if (!session) return { authenticated: false, user: null };

    return { authenticated: true, user: session.user };
  });
}
