import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { writeFileSync } from "node:fs";

// Écran ① — import d'un .typ (ImportTemplateModal, ouverte depuis le menu du
// bouton scindé « Nouveau gabarit » du panneau gauche).
// Tourne contre les serveurs déjà lancés par `make dev` : Vite :3002 (UI), Fastify :4000 (API).

const API = process.env.E2E_API_URL ?? "http://localhost:4000/api";
const TYP = "/Users/abel/Documents/doc-to-pdf/backend/templates/collectivite.typ";
const IMPORTED_NAME = "collectivite"; // nom prérempli = nom du fichier sans .typ
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function defaultTemplateId(request: APIRequestContext): Promise<string | null> {
  const res = await request.get(`${API}/templates/default`);
  return res.ok() ? ((await res.json()) as { id: string }).id : null;
}

/** Ouvre la modale depuis /templates et renvoie son locator. */
async function openImportModal(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Autres façons de créer un gabarit" }).click();
  await page.getByRole("menuitem", { name: "Importer un .typ" }).click();
  const dialog = page.getByRole("dialog", { name: "Importer un gabarit Typst" });
  await expect(dialog).toBeVisible();
  return dialog;
}

test.describe("Import d'un gabarit .typ", () => {
  let defaultBefore: string | null = null;

  test.beforeEach(async ({ request }) => {
    defaultBefore = await defaultTemplateId(request);
  });

  // Remise en état : suppression de tout gabarit importé (uuid, nommé comme le
  // fichier — le semis « collectivite » a un id sans uuid et un nom « Collectivité »),
  // puis contrôle que le gabarit par défaut n'a pas bougé.
  test.afterEach(async ({ request }) => {
    const all = (await (await request.get(`${API}/templates`)).json()) as { id: string; name: string }[];
    for (const t of all) {
      if (t.name === IMPORTED_NAME && UUID_RE.test(t.id)) {
        const del = await request.delete(`${API}/templates/${t.id}`);
        expect(del.status(), `suppression du gabarit importé ${t.id}`).toBe(204);
      }
    }
    expect(await defaultTemplateId(request), "le gabarit par défaut n'a pas changé").toBe(defaultBefore);
  });

  test("ouvre la modale depuis le menu du bouton scindé", async ({ page }) => {
    const dialog = await openImportModal(page);
    await expect(dialog.getByRole("heading", { name: "Importer un gabarit Typst" })).toBeVisible();
    await expect(dialog.getByText("Déposez un fichier .typ", { exact: true })).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Importer", exact: true })).toBeDisabled();
    // Le menu s'est refermé derrière la modale.
    await expect(page.getByRole("menu")).toHaveCount(0);
  });

  test("importe collectivite.typ : compilation de test, nom prérempli, redirection vers la mise en page", async ({
    page,
    request,
  }) => {
    const dialog = await openImportModal(page);

    // FileUploader du kit : l'input file est masqué (display: none) et sans libellé,
    // la zone de dépôt est un bouton ; setInputFiles atteint l'input caché.
    await dialog.locator('input[type="file"]').setInputFiles(TYP);

    await expect(dialog.getByText("collectivite.typ")).toBeVisible();
    await expect(dialog.getByText("Compilation de test réussie")).toBeVisible();
    await expect(dialog.getByText(/\d+ ms, \d+ pages?/)).toBeVisible();
    await expect(dialog.getByText("Test effectué sur le document d'exemple « Simple note »")).toBeVisible();

    const nameField = dialog.getByLabel("Nom du gabarit");
    await expect(nameField).toHaveValue(IMPORTED_NAME);

    const makeDefault = dialog.getByRole("checkbox", { name: "Définir comme gabarit par défaut" });
    if (await makeDefault.isChecked()) await makeDefault.uncheck();
    await expect(makeDefault).not.toBeChecked();

    const importBtn = dialog.getByRole("button", { name: "Importer", exact: true });
    await expect(importBtn).toBeEnabled();
    const createdRes = page.waitForResponse(
      (r) => r.request().method() === "POST" && new URL(r.url()).pathname === "/api/templates",
    );
    await importBtn.click();
    const created = (await (await createdRes).json()) as { id: string; name: string };
    expect(created.id).toMatch(UUID_RE);
    expect(created.name).toBe(IMPORTED_NAME);

    await expect(page).toHaveURL(new RegExp(`/t/${created.id}/layout$`));
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Mise en page" })).toHaveAttribute("aria-current", "page");
    await expect(page.getByRole("textbox", { name: "Nom du gabarit" })).toHaveValue(IMPORTED_NAME);

    // Côté API : la source enregistrée est celle du fichier, et le défaut n'a pas bougé.
    const detail = (await (await request.get(`${API}/templates/${created.id}`)).json()) as {
      source: string;
      description: string;
      isDefault?: boolean;
    };
    expect(detail.source).toContain('image("assets/logo-collectivite.png", width: 1.3cm)');
    expect(detail.description).toBe("Importé depuis collectivite.typ");
    expect(detail.isDefault ?? false).toBe(false);
  });

  test("un .typ cassé affiche l'erreur de compilation et bloque l'import", async ({ page }) => {
    // Fichier écrit dans test-results/<test>/casse.typ (outputPath crée le dossier).
    const broken = test.info().outputPath("casse.typ");
    writeFileSync(broken, "#set page(\n");

    const dialog = await openImportModal(page);
    await dialog.locator('input[type="file"]').setInputFiles(broken);

    await expect(dialog.getByText("casse.typ")).toBeVisible();
    const alert = dialog.getByRole("alert");
    await expect(alert).toBeVisible();
    await expect(alert).toContainText("typst compile failed");
    await expect(alert).toContainText("unclosed delimiter");
    await expect(dialog.getByText("Compilation de test réussie")).toHaveCount(0);

    await expect(dialog.getByLabel("Nom du gabarit")).toHaveValue("casse");
    await expect(dialog.getByRole("button", { name: "Importer", exact: true })).toBeDisabled();
  });

  test("Échap ferme la modale et rend le focus au chevron", async ({ page }) => {
    const dialog = await openImportModal(page);
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Autres façons de créer un gabarit" })).toBeFocused();
    await expect(page).toHaveURL(/\/templates$/);
  });
});
