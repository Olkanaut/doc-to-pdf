import { expect, test as setup, type Page } from "@playwright/test";
import { AUTH_STATE } from "./paths";

// Logs into Dots, then Docs (same Keycloak), once and off camera.
// scenarios.spec.ts reuses the session through storageState.

const USER = process.env.DEMO_USER ?? "demo1";
const PASSWORD = process.env.DEMO_PASSWORD ?? USER;
const DOCS_URL = process.env.DOCS_URL ?? "http://localhost:3000";
const DOCS_API = process.env.DOCS_API ?? "http://localhost:8071/api/v1.0/";

/** Fills in the Keycloak form if it shows up (it doesn't when the SSO session is already open). */
async function keycloakLogin(page: Page) {
  const username = page.locator("#username");
  const shown = await username
    .waitFor({ state: "visible", timeout: 10_000 })
    .then(() => true)
    .catch(() => false);
  if (!shown) return;
  await username.fill(USER);
  await page.locator("#password").fill(PASSWORD);
  await page.locator("#kc-login").click();
}

setup("connexion Dots + Docs", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: "Se connecter", exact: true }).click();
  await keycloakLogin(page);
  await expect(page.getByRole("heading", { name: "Mes templates" })).toBeVisible();

  // Docs: straight to its OIDC entry point; the Keycloak session opened by Dots is usually enough.
  await page.goto(`${DOCS_API}authenticate/?returnTo=${encodeURIComponent(DOCS_URL)}`);
  await keycloakLogin(page);
  await page.waitForURL((url) => url.origin === new URL(DOCS_URL).origin, { timeout: 30_000 });

  // Check the session with the API, not on screen.
  await expect
    .poll(async () => (await page.request.get(`${DOCS_API}users/me/`)).status(), {
      timeout: 30_000,
    })
    .toBe(200);

  await page.context().storageState({ path: AUTH_STATE });
});
