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
import { ingestRoutes } from "./routes/ingest.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

for (const envFile of [
  path.resolve(__dirname, "../../.env"),
  path.resolve(__dirname, "../.env"),
]) {
  try {
    process.loadEnvFile(envFile);
  } catch {
    // Optional local env file.
  }
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
await app.register(ingestRoutes);

const port = Number(process.env.PORT ?? 4000);
app.listen({ port, host: "0.0.0.0" }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
