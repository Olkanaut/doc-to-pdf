import type { FastifyInstance } from "fastify";
import { listFixtures } from "../registry/fixtures.js";

export async function fixturesRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/fixtures", async () => {
    return listFixtures();
  });
}
