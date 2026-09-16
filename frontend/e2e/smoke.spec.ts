import { expect, test } from "@playwright/test";

test("la coque et la liste des gabarits s'affichent", async ({ page }) => {
  await page.goto("/templates");
  await expect(page.getByRole("heading", { name: "Gabarits", level: 1 })).toBeVisible();
  await expect(page.getByText("Par défaut").first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Documents" })).toBeVisible();
});
