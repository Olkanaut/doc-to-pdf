import { chromium, expect, type FullConfig, type FullProject } from "@playwright/test";

/**
 * Connexion OpenID faite UNE fois avant toute la suite, puis rejouée par cookie.
 *
 * Toutes les routes utiles sont derrière `ProtectedRoute` (src/App.tsx) : sans
 * cette étape, chaque test atterrit sur `/login?returnTo=…` et échoue une ligne
 * plus loin que là où on le croit — `LoginPage` porte le même `<h1>` que la page
 * d'accueil, donc l'assertion de titre passe sur la page de connexion.
 *
 * Motif repris de l'amont, déjà présent dans le dépôt :
 * docs/src/frontend/apps/e2e/__tests__/app-impress/auth.setup.ts (globalSetup +
 * `storageState` dans le `use` du projet, sans projet « setup » ni `dependencies`).
 */

// README.md « Users » et auth/realm-lasuite.json.
const USERNAME = process.env.E2E_USERNAME ?? "ismael";
const PASSWORD = process.env.E2E_PASSWORD ?? "ismael";
const REALM = process.env.E2E_REALM ?? "lasuite";

async function saveStorageState(project: FullProject): Promise<void> {
  const { storageState, ...useConfig } = project.use;
  if (typeof storageState !== "string") {
    throw new Error(`le projet « ${project.name} » doit déclarer use.storageState (un chemin)`);
  }

  const browser = await chromium.launch();
  const context = await browser.newContext(useConfig);
  const page = await context.newPage();

  try {
    // Le `ProConnectButton` du kit n'expose pas de nom accessible : on attaque
    // directement l'adresse qu'il ouvrirait (LoginPage.tsx), qui lance le flux
    // OpenID côté backend.
    await page.goto("/api/auth/login?returnTo=%2F");

    // Page de Keycloak. Le nom du realm est affiché dans l'en-tête du formulaire :
    // s'il ne correspond pas, c'est qu'on parle à la mauvaise instance.
    await expect(page.locator(".login-pf #kc-header-wrapper")).toContainText(REALM);

    const restart = page.getByLabel("Restart login");
    if (await restart.isVisible()) await restart.click();

    await page.getByRole("textbox", { name: "username" }).fill(USERNAME);
    await page.getByRole("textbox", { name: "password" }).fill(PASSWORD);
    await page.click('button[type="submit"]', { force: true });

    // Retour sur dots : `/auth/callback` échange le code, puis redirige vers `/`.
    // La galerie n'existe que derrière ProtectedRoute : son titre EST la preuve
    // que la session est établie.
    await expect(page.getByRole("heading", { name: "Gabarits", level: 1 })).toBeVisible({
      timeout: 30_000,
    });

    await context.storageState({ path: storageState });
  } finally {
    await browser.close();
  }
}

export default async function globalSetup(config: FullConfig): Promise<void> {
  const chromiumProject = config.projects.find((p) => p.name === "chromium");
  if (!chromiumProject) throw new Error("projet « chromium » absent de playwright.config.ts");
  await saveStorageState(chromiumProject);
}
