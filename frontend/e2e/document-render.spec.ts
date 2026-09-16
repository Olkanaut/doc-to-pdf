import { expect, test } from "@playwright/test";

const DOCUMENT_ID = "a372f33f-25a1-4595-b6b6-d8de64c5ac00";
const TEMPLATE_ONE = "cfa3f6aa-f024-47b3-94bf-407c850debf1";
const TEMPLATE_TWO = "9ea83649-a2ed-4e2d-819f-72a8fe71456d";
const NOW = "2026-09-15T14:45:00Z";

const templates = [
  {
    id: TEMPLATE_ONE,
    name: "Standard",
    description: "Gabarit standard",
    createdAt: NOW,
    updatedAt: NOW,
    isDefault: true,
  },
  {
    id: TEMPLATE_TWO,
    name: "Moderne",
    description: "Gabarit moderne",
    createdAt: NOW,
    updatedAt: NOW,
  },
];

test("renders Docs content with the selected database template", async ({ page }) => {
  const renderedTemplateIds: string[] = [];

  // Le motif ne vise que l'API : `**/api/**` attrapait aussi le module
  // `/src/api/client.ts` servi par Vite, et la page restait blanche.
  await page.route(/\/api\/(auth|session|templates|documents)/, async (route) => {
    const request = route.request();
    const url = new URL(request.url());

    if (url.pathname === "/api/auth/me") {
      return route.fulfill({
        json: {
          authenticated: true,
          user: { sub: "user-id", name: "Ismael" },
        },
      });
    }
    if (url.pathname === "/api/templates" && request.method() === "GET") {
      return route.fulfill({ json: templates });
    }
    if (url.pathname === "/api/templates/default") {
      return route.fulfill({ json: templates[0] });
    }
    if (url.pathname === `/api/documents/${DOCUMENT_ID}/content`) {
      return route.fulfill({
        json: {
          id: DOCUMENT_ID,
          title: "Document de démonstration",
          blocks: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "Contenu Docs" }],
            },
          ],
          createdAt: NOW,
          updatedAt: NOW,
        },
      });
    }
    if (url.pathname === `/api/documents/${DOCUMENT_ID}/render`) {
      renderedTemplateIds.push(request.postDataJSON().templateId);
      return route.fulfill({
        status: 200,
        contentType: "application/pdf",
        headers: {
          "X-Dots-Block-Count": "1",
          "X-Dots-Unsupported-Blocks": "{}",
        },
        body: Buffer.from("%PDF-1.4\n%%EOF"),
      });
    }

    const templateMatch = url.pathname.match(/^\/api\/templates\/([^/]+)$/);
    if (templateMatch) {
      const template = templates.find((item) => item.id === templateMatch[1]);
      return template
        ? route.fulfill({ json: { ...template, source: '#include "body.typ"' } })
        : route.fulfill({ status: 404, json: { error: "Template not found" } });
    }

    return route.fulfill({ status: 404 });
  });

  await page.goto(`/docs/${DOCUMENT_ID}`);

  // Le nom du document vit dans le rail, avec le ⓘ qui porte le détail.
  await expect(page.getByText("Document de démonstration")).toBeVisible();
  const download = page.getByRole("link", { name: "Télécharger" });
  await expect(download).toHaveAttribute("href", /^blob:/);
  await expect(download).toHaveAttribute("download", `${DOCUMENT_ID}.pdf`);
  await expect(page.getByRole("group", { name: "Aperçu du PDF" })).toBeVisible();

  await page.getByRole("button", { name: "Informations sur le document" }).click();
  await expect(page.getByRole("dialog").getByText(DOCUMENT_ID)).toBeVisible();
  await page.keyboard.press("Escape");
  expect(renderedTemplateIds).toEqual([TEMPLATE_ONE]);

  await page.getByRole("radio", { name: "Moderne" }).click();
  await expect.poll(() => renderedTemplateIds.at(-1)).toBe(TEMPLATE_TWO);
  await expect(download).toHaveAttribute("href", /^blob:/);
});
