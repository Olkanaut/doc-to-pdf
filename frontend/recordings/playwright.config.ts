import { defineConfig } from "@playwright/test";
import { AUTH_STATE, OUT_DIR } from "./paths";

// Demo recordings (GIF / MP4), not tests: see recordings/README.md.
// Runs against the app already started (Dots :3002, Docs :3000, Keycloak :8083).
export default defineConfig({
  testDir: ".",
  outputDir: `${OUT_DIR}/.playwright`,
  workers: 1,
  fullyParallel: false,
  timeout: 10 * 60_000,
  expect: { timeout: 30_000 },
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: process.env.DOTS_URL ?? "http://localhost:3002",
    viewport: { width: 1440, height: 900 },
    // Sharp frames: captured in device pixels, scaled down afterwards.
    deviceScaleFactor: 2,
    locale: "fr-FR",
    colorScheme: "light",
    // A selector that no longer matches should fail fast, not after 10 minutes.
    actionTimeout: 15_000,
    // Visible window: headless Chrome only screencasts at 1× (1440×900), even at deviceScaleFactor 2.
    headless: process.env.HEADLESS === "1",
  },
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    {
      name: "record",
      testMatch: /scenarios\.spec\.ts/,
      dependencies: ["setup"],
      use: { storageState: AUTH_STATE },
    },
  ],
});
