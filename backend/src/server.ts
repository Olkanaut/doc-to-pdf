import path from "node:path";
import { fileURLToPath } from "node:url";
import Fastify from "fastify";
import cors from "@fastify/cors";
import { authRoutes } from "./routes/auth.js";
import { templatesRoutes } from "./routes/templates.js";
import { fixturesRoutes } from "./routes/fixtures.js";
import { renderRoutes } from "./routes/render.js";
import { sessionRoutes } from "./routes/session.js";
import { documentRoutes } from "./routes/documents.js";
import { aiRoutes } from "./routes/ai.js";

// Clé de l'assistant IA (backend/.env, ignoré par git). Sans fichier : rien à charger, la route répond 503.
try {
  process.loadEnvFile(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../.env"));
} catch {
  // pas de backend/.env
}

const app = Fastify({ logger: true });

await app.register(cors, {
  origin: process.env.APP_ORIGIN ?? "http://localhost:3002",
  credentials: true,
});
await app.register(authRoutes);
await app.register(templatesRoutes);
await app.register(fixturesRoutes);
await app.register(renderRoutes);
await app.register(sessionRoutes);
await app.register(documentRoutes);
await app.register(aiRoutes);

const port = Number(process.env.PORT ?? 4000);
app.listen({ port, host: "0.0.0.0" }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
