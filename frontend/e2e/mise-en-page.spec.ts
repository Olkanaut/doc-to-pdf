import { expect, test, type Page, type Response } from "@playwright/test";

// Écran ⑤ — éditeur de mise en page (src/pages/LayoutEditorPage.tsx + components/layout/LayoutPanel.tsx).
// Travaille sur le gabarit « minimal ». La section « Tableaux » n'est volontairement pas touchée.

const API = process.env.E2E_API_URL ?? "http://localhost:4000/api";
const ID = "minimal";
const LAYOUT_URL = `/t/${ID}/layout`;

let original: { name: string; description: string; source: string };

const isRender = (r: Response) =>
  r.url().endsWith("/api/render") && r.request().method() === "POST" && r.status() === 200;
const isCompose = (r: Response) =>
  r.url().endsWith("/api/layout/compose") && r.request().method() === "POST" && r.status() === 200;

/** Ouvre l'éditeur et attend le premier aperçu (POST /api/render 200). */
async function openLayoutEditor(page: Page) {
  const firstRender = page.waitForResponse(isRender);
  await page.goto(LAYOUT_URL);
  await firstRender;
}

test.beforeAll(async ({ request }) => {
  const res = await request.get(`${API}/templates/${ID}`);
  expect(res.ok()).toBe(true);
  const t = await res.json();
  original = { name: t.name, description: t.description, source: t.source };
  // Le test ① attend un gabarit sans bloc de mise en page : un run précédent interrompu l'aurait laissé géré.
  expect(
    original.source,
    "le gabarit « minimal » contient déjà un bloc dots:layout : restaurer sa source avant de lancer ce spec",
  ).not.toContain("// dots:layout begin");
});

test.afterAll(async ({ request }) => {
  if (!original) return;
  const res = await request.put(`${API}/templates/${ID}`, { data: original });
  expect(res.ok()).toBe(true);
});

test("① en-tête, avis « pas encore de bloc », état Enregistré, aperçu rendu", async ({ page }) => {
  await openLayoutEditor(page);

  await expect(page.getByRole("textbox", { name: "Nom du gabarit" })).toHaveValue("Minimal");

  const nav = page.getByRole("navigation", { name: "Mode d'édition" });
  await expect(nav.getByRole("link", { name: "Mise en page" })).toHaveAttribute("aria-current", "page");
  await expect(nav.getByRole("link", { name: "Code Typst" })).toHaveAttribute("href", `/t/${ID}`);

  await expect(page.getByText("Ce gabarit n'a pas encore de bloc de mise en page")).toBeVisible();
  await expect(page.getByText("Enregistré", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Enregistrer", exact: true })).toBeDisabled();

  await expect(page.getByTitle("Aperçu du PDF")).toBeVisible();
  await expect(page.getByText(/recompilé à chaque réglage \(\d+ ms\)/)).toBeVisible();
});

test("② marge Haut = 30 → non enregistré, recompilé ; Enregistrer → source avec bloc dots:layout", async ({
  page,
  request,
}) => {
  await openLayoutEditor(page);
  await expect(page.getByText("Enregistré", { exact: true })).toBeVisible();

  const top = page.getByLabel("Haut", { exact: true });
  await expect(top).toHaveValue("25");

  const composed = page.waitForResponse(isCompose);
  const rerendered = page.waitForResponse(isRender);
  await top.fill("30");
  await expect(top).toHaveValue("30");

  const composeBody = await (await composed).json();
  expect(composeBody.source).toContain("top: 30mm");

  await expect(page.getByText("Modifications non enregistrées")).toBeVisible();
  // Le premier réglage ajoute le bloc : l'avis disparaît.
  await expect(page.getByText("Ce gabarit n'a pas encore de bloc de mise en page")).toBeHidden();

  await rerendered;
  await expect(page.getByText(/recompilé à chaque réglage \(\d+ ms\)/)).toBeVisible();

  const saved = page.waitForResponse(
    (r) => r.url().endsWith(`/api/templates/${ID}`) && r.request().method() === "PUT" && r.status() === 200,
  );
  await page.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await saved;
  await expect(page.getByText("Enregistré", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Enregistrer", exact: true })).toBeDisabled();

  const detail = await (await request.get(`${API}/templates/${ID}`)).json();
  expect(detail.source).toContain("// dots:layout begin");
  expect(detail.source).toContain("top: 30mm");
  expect(detail.source).toContain("// dots:layout end");
  expect(detail.source).toContain('#include "body.typ"');
});

test("③ « Code Typst » mène à /t/minimal ; « Mise en page » ramène", async ({ page }) => {
  await openLayoutEditor(page);

  const nav = page.getByRole("navigation", { name: "Mode d'édition" });
  await nav.getByRole("link", { name: "Code Typst" }).click();
  await expect(page).toHaveURL(/\/t\/minimal$/);
  await expect(page.getByRole("heading", { name: "Modifier le gabarit", level: 1 })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Code Typst" })).toHaveAttribute("aria-current", "page");

  await nav.getByRole("link", { name: "Mise en page" }).click();
  await expect(page).toHaveURL(/\/t\/minimal\/layout$/);
  await expect(nav.getByRole("link", { name: "Mise en page" })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("textbox", { name: "Nom du gabarit" })).toHaveValue("Minimal");
});

test("④ /template/editor?id=minimal redirige vers /t/minimal/layout", async ({ page }) => {
  await page.goto(`/template/editor?id=${ID}`);
  await expect(page).toHaveURL(/\/t\/minimal\/layout$/);
  await expect(page.getByRole("textbox", { name: "Nom du gabarit" })).toHaveValue("Minimal");
  await expect(
    page.getByRole("navigation", { name: "Mode d'édition" }).getByRole("link", { name: "Mise en page" }),
  ).toHaveAttribute("aria-current", "page");
});
