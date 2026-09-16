import { expect, test } from "@playwright/test";

test("la coque et la liste des gabarits s'affichent", async ({ page }) => {
  await page.goto("/");
  // Coque du kit : en-tête (<header> du MainLayout) avec la marque.
  await expect(page.getByRole("banner")).toBeVisible();
  await expect(page.getByRole("banner").getByRole("link", { name: "dots" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Gabarits", level: 1 })).toBeVisible();
  await expect(page.getByText("Par défaut").first()).toBeVisible();
});

test("/docs/<uuid>/ (même chemin que Docs) ouvre la page Rendu sur ce document", async ({ page }) => {
  await page.goto("/docs/22ae79e0-1210-4c2e-9969-7f7f7c6466a0/");
  await expect(page).toHaveURL(/\/docs\/22ae79e0-1210-4c2e-9969-7f7f7c6466a0\/?$/);
  await page.goto("/docs/pas-un-uuid/");
  await expect(page).toHaveURL(/\/docs\/pas-un-uuid\/?$/);
});
