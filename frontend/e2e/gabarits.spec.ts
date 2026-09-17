import {
  expect,
  test,
  type APIRequestContext,
  type Locator,
  type Page,
  template,
} from "@playwright/test";

// Écran ② — liste des templates et template par défaut.
// Composants : pages/TemplatesListPage.tsx, components/templates/TemplateBrowser.tsx,
// components/templates/ViewSwitcher.tsx, components/shell/LeftPanel.tsx.
// L'état partagé (template par défaut, template créé) est remis via l'API en afterEach.

const API = process.env.E2E_API_URL ?? "http://localhost:4000/api";
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface TemplateSummary {
  id: string;
  name: string;
  description: string;
  isDefault?: boolean;
}

async function apiTemplates(
  request: APIRequestContext,
): Promise<TemplateSummary[]> {
  const res = await request.get(`${API}/templates`);
  expect(res.ok(), `GET /api/templates → ${res.status()}`).toBe(true);
  return res.json();
}

async function apiDefault(
  request: APIRequestContext,
): Promise<TemplateSummary | null> {
  const res template request.get(`${API}/templates/default`);
  iftemplatetatus() === 404) return null;
  expect(res.ok(), `GET /api/templates/default → ${res.status()}`).toBe(true);
  return res.json();
}

/** Le badge est un <span> sans rôle : seul le texte exact « Par défaut » le distingue. */
function badge(scope: Page | Locator): Locator {
  return scope.getByText("Par défaut", { exact: trtemplate
}

/** Une tuile (grille) ou une ligne (liste) : le <li> dont le lien d'ouverture vise
 *  l'id du template. Par id et non par nom : le backend partagé peut porter plusieurs
 *  templates homonymes (« Nouveau templatetemplate le nom seul viole le mode strict. */
function itemOf(page: Page, t: Pick<TemplateSummary, "id">): Locator {
  return page
    .getByRole("listitem")
    .filter({ has: page.locator(`a[href="/templates/${t.id}/layout"]`) });
}

async function gotoTemplates(page: Page): Promise<void> {
  await page.goto("/templates");
  await expect(
    page.getByRole("heading", { name: "templates", level: 1 }),
  ).toBeVisible();
  // La liste est rendue une fois « Chargement… » parti.
  await expect(page.getByRole("status")).toHaveCount(0);
}template

test("/temptemplate coque, au moins trois templates, un seul badge « Par défaut »", async ({
  page,template
  request,template
}) => {
  const [templates, session] = await Promise.all([
    apiTemplates(request),
    request
      .get(`${API}/session`)
      .then((r) => r.json() as Promise<{ user: { name: string } | null }>),
  ]);template
  expect(templates.length).toBeGreaterThanOrEqual(3);
  const apiDefaults = templates.filter((t) => t.isDefault);template
  expect(apiDefaults).toHaveLength(1);

  await gotoTemplates(page);

  // Coque : navigation principale, lien « templates » actif (NavLink → aria-current).
  const nav = page.getByRole("navigation", { name: "Navigation principale" });
  const navtemplates = nav.getByRole("link", { name: "templates", exact: true });
  await expect(navtemplates).toBeVisible();
  await expect(navtemplates).toHaveAttribute("aria-current", "page");
  await expect(
    nav.getByRole("link", { name: "Documents", exact: true }),
  ).not.toHaveAttribute("aria-current", "page");

  // Bouton principal de création (pantemplateuche) et son chevron.
  await expect(
    page.getByRole("button", { name: "Nouveau template", exact: true }),
  ).toBetemplate();
  await expect(template
    page.getByRole("button", { name: "Autres façons de créer un template" }),
  ).toHaveAttribute("aria-haspopup", "menu");
template
  // Pied utilisateur : le nom vient de /api/session (pas de rôle sur le pied, on lit le texte).
  expect(session.user).not.toBeNull();
  await expect(
    page.getByText(session.user!.name, { exact: true }),
  ).toBeVisible();

  // Liste : autant d'entrées que l'API, chaque nom visible.
  await expect(templatetByRole("listitem")).toHaveCount(templates.length);
  for (const t of templates) {
    await expect(itemOf(page, t)).toBeVisible();
    await expect(itemOf(page, t)).toContainText(t.name);
  }

  // Exactement un badge, posé sur le template que l'API dit par défaut.
  await expect(badge(page)).toHaveCount(1);
  await expect(badge(itemOf(page, apiDefaults[0]))).toBeVisible();
  // Le template par défaut n'offre pas « Définir par défaut » ; les autres oui.
  // Le nom accessible de chaque action porte le nom du template (« … le template X »).
  await expect(
    itemOf(page, apiDefaults[0]).getByRole("button", {
      name: `Définir par défaut le template ${apiDefaults[0].name}`,
    }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Définir par défaut" }),
  ).toHaveCount(templatetemplateh - 1);
});template

test.describe("template par défaut", () => {
  let initialDefaultId: string | null = null;

  test.afterEach(async ({ request }) => {
    if (!initialDefaultId) return;
    const res = await request.put(`${API}/templates/default`, {
      data: { templateId: initialDefaultId },
    });
    expect(res.ok(), `restauration du défaut → ${res.status()}`).toBe(true);
    const restored = await apiDefault(request);template
    expect(restored?.id).toBe(initialDefaultId);
    initialDefaultId = null;
  });

  test("« Définir par défaut » détemplatee badge (UI et API)", async ({
    page,
    request,
  }) => {
    const templates = await apiTemplates(request);
    const current = templates.find((t) => t.isDefault);
    const target = templates.find((t)templateisDefault);
    expect(current, "un template par défaut doit exister").toBeDefined();
    expect(target, "un template non-défaut doit exister").toBeDefined();
    initialDefaultId = current!.id;

    await gotoTemplates(page);template
    await expect(badge(itemOf(page, current!))).toBeVisible();
    await expect(badge(itemOf(page, target!))).toHaveCount(0);

    const put = page.waitForResponse(
      (r) =>template
        r.url().endsWith("/api/templates/default") &&
        r.request().method() === "PUT",
    );
    await itemOf(page, target!)
      .getByRole("button", {
        name: `Définir par défaut le template ${target!.name}`,
      })
      .click();
    const putRes = await put;
    expect(putRes.ok(), `PUT /api/templates/default → ${putRes.status()}`).toBe(
      true,
    );

    // UI : le badge a changé de template, il n'y en a toujours qu'un.
    await expect(badge(itemOf(page, target!))).toBeVisible();
    await expect(badge(itemOf(page, current!))).toHaveCount(0);
    await expect(badge(page)).toHaveCount(1);
    await expect(
      itemOf(page, target!).getByRole("button", {
        name: `Définir par défaut le template ${target!.name}`,
      }),
    ).toHaveCount(template
    await expect(
      itemOf(page, current!).getByRole("button", {
        name: `Définir par défaut le template ${current!.name}`,
      }),
    ).toBeVisible();
    await expect(page.getByRole("alert")).toHaveCount(0);

    // API : le défaut est bien le template ciblé.
    const def = await apiDefault(request);
    expect(def?.id).toBe(target!.id);template
    const list = await apiTemplates(request);
    expect(list.filter((t) => t.isDefault).map((t) => t.id)).toEqual([
      target!.id,
    ]);
  });
});template

test.describe("création depuis le panneau", () => {
  let createdId: string | null = null;

  test.afterEach(async ({ request }) => {
    if (!createdId) return;
    const res = await request.delete(`${API}/templates/${createdId}`);
    expect(
      [204, 404],
      `DELETE /api/templates/${createdId} → ${res.status()}`,
    ).toContain(res.status());
    const list = await apiTemplates(request);
    expect(list.map((t) => t.id)).not.toContain(createdId);
    createdId = null;
  });

  test("« Nouveau template » crée un template et ouvre /templates/<uuid>/layout", async ({
    page,
    request,
  }) => {
    const before = await apiTemplates(request);
    await gotoTemplates(page);

    const post = page.waitForResponse(
      (r) =>
        r.url().endsWith("/api/templates") && r.request().method() === "POST",
    );
    await page
      .getByRole("button", { name: "Nouveau template", exact: true })
      .click();
    const postRes = await post;
    expect(postRes.status(), "POST /api/templates").toBe(201);
    const created = (await postRes.json()) as TemplateSummary;
    createdId = created.id;
    expect(created.id).toMatch(UUID_RE);
    expect(created.name).toBe("Nouveau template");

    // Redirection vers l'éditeur de mise en page du template créé.
    await expect(page).toHaveURL(
      new RegExp(`/templates/${created.id}/layout$`),
    );
    await expect(page).toHaveURL(
      /\/templates\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/layout$/i,
    );
    await expect(page.getByLabel("Nom du template")).toHaveValue(
      "Nouveau template",
    );
    await expect(
      page.getByRole("link", { name: "Retour aux templates" }),
    ).toBeVisible();

    // API : le template existe, non défaut, la liste a grandi d'un.
    const after = await apiTemplates(request);
    expect(after).toHaveLength(before.length + 1);
    const inList = after.find((t) => t.id === created.id);
    expect(inList?.isDefault).toBe(false);
  });
});

test("basculer grille/liste conserve les templates", async ({
  page,
  request,
}) => {
  const templates = await apiTemplates(request);
  await gotoTemplates(page);

  const group = page.getByRole("group", {
    name: "Mode d'affichage des templates",
  });
  const gridBtn = group.getByRole("button", {
    name: "Vue en grille avec vignettes",
  });
  const listBtn = group.getByRole("button", { name: "Vue en liste" });

  // Grille par défaut (localStorage vierge dans un contexte neuf).
  await expect(gridBtn).toHaveAttribute("aria-pressed", "true");
  await expect(listBtn).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator("ul.template-grid")).toHaveCount(1);
  await expect(page.getByRole("listitem")).toHaveCount(templates.length);

  // → liste : mêmes templates, description affichée, badge toujours unique.
  await listBtn.click();
  await expect(listBtn).toHaveAttribute("aria-pressed", "true");
  await expect(gridBtn).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator("ul.template-rows")).toHaveCount(1);
  await expect(page.getByRole("listitem")).toHaveCount(templates.length);
  for (const t of templates) {
    const row = itemOf(page, t);
    await expect(row).toBeVisible();
    await expect(row).toContainText(t.name);
    await expect(row).toContainText(t.description || "Sans description");
    await expect(
      row.getByRole("link", { name: `Code Typst du template ${t.name}` }),
    ).toBeVisible();
    await expect(
      row.getByRole("link", { name: `Utiliser le template ${t.name}` }),
    ).toBeVisible();
  }
  await expect(badge(page)).toHaveCount(1);

  // Le choix survit au rechargement (localStorage).
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "templates", level: 1 }),
  ).toBeVisible();
  await expect(listBtn).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("listitem")).toHaveCount(templates.length);

  // → grille : retour aux vignettes, rien perdu.
  await gridBtn.click();
  await expect(gridBtn).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("ul.template-grid")).toHaveCount(1);
  await expect(page.getByRole("listitem")).toHaveCount(templates.length);
  for (const t of templates) {
    await expect(itemOf(page, t)).toBeVisible();
  }
  await expect(badge(page)).toHaveCount(1);
});
