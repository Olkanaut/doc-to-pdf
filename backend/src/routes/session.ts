import type { FastifyInstance } from "fastify";

/**
 * Stub session endpoint. Phase 2 replaces this with a real check against the
 * signed session cookie set by /auth/callback (Keycloak OIDC flow) — the
 * frontend's AuthProvider only ever talks to this one endpoint, so swapping
 * the implementation later needs no changes on the frontend/routing side.
 */
export async function sessionRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/session", async () => {
    return {
      authenticated: true,
      user: { id: "demo-user", name: "Utilisateur de démonstration" },
    };
  });
}
