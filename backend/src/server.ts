import Fastify from "fastify";
import cors from "@fastify/cors";
import { templatesRoutes } from "./routes/templates.js";
import { fixturesRoutes } from "./routes/fixtures.js";
import { renderRoutes } from "./routes/render.js";

const app = Fastify({ logger: true });

await app.register(cors, { origin: true });
await app.register(templatesRoutes);
await app.register(fixturesRoutes);
await app.register(renderRoutes);

const port = Number(process.env.PORT ?? 4000);
app.listen({ port, host: "0.0.0.0" }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
