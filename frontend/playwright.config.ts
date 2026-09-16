import { defineConfig } from "@playwright/test";

// Les tests tournent contre les serveurs de dev déjà lancés par `make dev`
// (backend :4000, Vite :3002 — README.md « URLs », Makefile, vite.config.ts).
// Un seul worker : les scénarios modifient des données partagées (gabarit par défaut, source).
export default defineConfig({
  testDir: "./e2e",
  // Connexion OpenID jouée une fois, avant la suite. Sans elle, tout part sur /login.
  globalSetup: "./e2e/auth.setup.ts",
  workers: 1,
  fullyParallel: false,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3002",
    viewport: { width: 1440, height: 900 },
    locale: "fr-FR",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { browserName: "chromium", storageState: "e2e/.auth/dots.json" },
    },
  ],
});
