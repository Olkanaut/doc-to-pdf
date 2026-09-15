import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

/**
 * Écran ④ — assistant IA (LayoutEditorPage + AiPanel), gabarit « minimal ».
 *
 * L'appel à /api/ai/template est RÉEL (clé API côté serveur, ≈ 5-15 s) : on n'en fait
 * qu'UN SEUL dans tout le fichier. Les quatre tests s'enchaînent donc en série sur la
 * même page. Ni « Appliquer » ni « Enregistrer » ne sont cliqués : la source du gabarit
 * ne doit pas changer, mais on la sauvegarde/restaure quand même par l'API.
 */

const API = process.env.E2E_API_URL ?? "http://localhost:4000/api";
const TEMPLATE_ID = "minimal";
const AI_TIMEOUT_MS = 60_000;

test.describe.configure({ mode: "serial" });

test.describe("assistant IA — éditeur de mise en page", () => {
  let page: Page;
  let api: APIRequestContext;
  let saved: { name: string; description: string; source: string };

  test.beforeAll(async ({ browser, playwright }) => {
    api = await playwright.request.newContext();
    const res = await api.get(`${API}/templates/${TEMPLATE_ID}`);
    expect(res.ok(), `GET /templates/${TEMPLATE_ID} → ${res.status()}`).toBe(true);
    const t = await res.json();
    saved = { name: t.name, description: t.description ?? "", source: t.source };

    page = await browser.newPage();
    await page.goto(`/templates/${TEMPLATE_ID}/layout`);
    await expect(page.getByRole("textbox", { name: "Nom du gabarit" })).toHaveValue(saved.name);
  });

  test.afterAll(async () => {
    await page?.close();
    // Restauration « au cas où » : rien n'est appliqué ni enregistré, la source ne doit pas
    // avoir bougé. On ne réécrit (PUT bouge updatedAt) que si elle a effectivement changé.
    const current = await (await api.get(`${API}/templates/${TEMPLATE_ID}`)).json();
    if (current.source !== saved.source || current.name !== saved.name || current.description !== saved.description) {
      const res = await api.put(`${API}/templates/${TEMPLATE_ID}`, { data: saved });
      expect(res.ok(), `PUT /templates/${TEMPLATE_ID} → ${res.status()}`).toBe(true);
      const after = await (await api.get(`${API}/templates/${TEMPLATE_ID}`)).json();
      expect(after.source).toBe(saved.source);
    }
    await api.dispose();
  });

  test("le bouton « Assistant IA » ouvre le panneau", async () => {
    const panel = page.getByRole("complementary", { name: "Assistant IA" });
    await expect(panel).toBeHidden();

    const toggle = page.getByRole("button", { name: "Assistant IA" });
    await expect(toggle).toHaveAttribute("aria-pressed", "false");
    await toggle.click();

    await expect(toggle).toHaveAttribute("aria-pressed", "true");
    await expect(panel).toBeVisible();
    await expect(panel.getByText("Assistant IA", { exact: true })).toBeVisible();
    await expect(panel.getByPlaceholder("Demandez une modification…")).toBeVisible();
    await expect(panel.getByPlaceholder("Demandez une modification…")).toBeEnabled();
    await expect(panel.getByRole("button", { name: "Envoyer" })).toBeDisabled(); // champ vide

    // Puces de suggestion (AiPanel.tsx, SUGGESTIONS)
    for (const chip of ["Logo en en-tête", "Passer en Marianne", "En-tête à droite", "Pagination dès la page 2"]) {
      await expect(panel.getByRole("button", { name: chip, exact: true })).toBeVisible();
    }
    await expect(panel.getByText("Décrivez la modification souhaitée")).toBeVisible();
  });

  test("une demande produit une proposition, rendue mais non enregistrée", async () => {
    test.setTimeout(AI_TIMEOUT_MS + 30_000);
    const panel = page.getByRole("complementary", { name: "Assistant IA" });
    const input = panel.getByPlaceholder("Demandez une modification…");

    await input.fill("Réduis les marges à 2 cm");
    const aiResponse = page.waitForResponse(
      (r) => r.url().endsWith("/api/ai/template") && r.request().method() === "POST",
      { timeout: AI_TIMEOUT_MS },
    );
    await panel.getByRole("button", { name: "Envoyer" }).click();

    // Écho de la demande + état d'attente, puis verrouillage de la saisie.
    // L'écho est ciblé par sa bulle : la TextArea du kit garde aussi le texte envoyé
    // comme contenu du nœud <textarea>, ce qui rendrait getByText ambigu.
    await expect(panel.locator(".ai-msg--user", { hasText: "Réduis les marges à 2 cm" })).toBeVisible();
    await expect(panel.getByRole("status").filter({ hasText: "L'assistant réfléchit…" })).toBeVisible();
    await expect(input).toBeDisabled();

    const res = await aiResponse;
    expect(res.status(), `POST /api/ai/template → ${res.status()}`).toBe(200);
    const body = await res.json();
    expect(body.ok, `réponse IA : ${JSON.stringify(body).slice(0, 300)}`).toBe(true);

    // Carte de proposition (ProposalCard) : titre, compilation OK, actions.
    const card = panel.getByText(/modifications? proposée/);
    await expect(card).toBeVisible({ timeout: AI_TIMEOUT_MS });
    await expect(panel.getByText(/Compilé en \d+ ms/)).toBeVisible();
    await expect(panel.getByRole("button", { name: "Appliquer" })).toBeVisible();
    await expect(panel.getByRole("button", { name: "Ignorer" })).toBeVisible();
    await expect(panel.getByText("Rien n'est enregistré tant que vous n'appliquez pas")).toBeVisible();

    // L'aperçu rend la proposition, étiquetée comme telle.
    const preview = page.getByRole("region", { name: "Aperçu" });
    await expect(preview.getByText("Proposition — non enregistrée")).toBeVisible();

    // Rien n'est modifié tant qu'on n'applique pas : statut « Enregistré », bouton inactif.
    await expect(page.getByText("Modifications non enregistrées")).toHaveCount(0);
    await expect(page.getByText("Enregistré", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Enregistrer" })).toBeDisabled();

    // Pendant une proposition, une nouvelle demande est bloquée.
    await expect(input).toBeDisabled();
  });

  test("« Ignorer » retire l'étiquette de proposition", async () => {
    const panel = page.getByRole("complementary", { name: "Assistant IA" });
    const preview = page.getByRole("region", { name: "Aperçu" });

    await panel.getByRole("button", { name: "Ignorer" }).click();

    await expect(preview.getByText("Proposition — non enregistrée")).toHaveCount(0);
    await expect(panel.getByText("Ignorée", { exact: true })).toBeVisible();
    await expect(panel.getByRole("button", { name: "Appliquer" })).toHaveCount(0);
    await expect(panel.getByPlaceholder("Demandez une modification…")).toBeEnabled();
    await expect(page.getByText("Modifications non enregistrées")).toHaveCount(0);
    await expect(page.getByText("Enregistré", { exact: true })).toBeVisible();
  });

  test("le bouton de fermeture masque le panneau", async () => {
    const panel = page.getByRole("complementary", { name: "Assistant IA" });
    await panel.getByRole("button", { name: "Fermer l'assistant" }).click();

    await expect(panel).toBeHidden();
    await expect(page.getByRole("button", { name: "Assistant IA" })).toHaveAttribute("aria-pressed", "false");
    // Le fil survit à la fermeture (AiPanel toujours monté) : rouvrir montre encore la proposition ignorée.
    await page.getByRole("button", { name: "Assistant IA" }).click();
    await expect(panel).toBeVisible();
    await expect(panel.getByText("Ignorée", { exact: true })).toBeVisible();
    await panel.getByRole("button", { name: "Fermer l'assistant" }).click();
    await expect(panel).toBeHidden();
  });
});
