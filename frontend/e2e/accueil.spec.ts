import { expect, test, type Page, type Route } from "@playwright/test";

// Écran ① — accueil (/ et /docs) : pages/HomePage.tsx, GET /api/docs.
// Le contexte Playwright n'a pas de cookie Docs : sans simulation, le backend répond
// une liste vide avec hasSession=false. Les scénarios de liste simulent /api/docs.

const DOC_ID = "22ae79e0-1210-4c2e-9969-7f7f7c6466a0";
const NOW = Date.now();
const ago = (ms: number) => new Date(NOW - ms).toISOString();

const PAGE_1 = [
  { id: "11111111-1111-4111-8111-111111111111", title: "Note de service", updatedAt: ago(10 * 60_000), role: "owner" },
  { id: "22222222-2222-4222-8222-222222222222", title: "Compte rendu", updatedAt: ago(26 * 3_600_000), role: "editor" },
  { id: "33333333-3333-4333-8333-333333333333", title: "Feuille de route", updatedAt: ago(40 * 86_400_000), role: "reader" },
];
const PAGE_2 = [
  { id: "44444444-4444-4444-8444-444444444444", title: "Ordre du jour", updatedAt: ago(3 * 86_400_000), role: "commenter" },
  { id: "55555555-5555-4555-8555-555555555555", title: "Procès-verbal", updatedAt: ago(5 * 86_400_000), role: null },
];

const isDocsList = (url: URL) => url.pathname === "/api/docs";

/** Simule GET /api/docs : 12 documents en tout, page 1 = 3, page 2 = 2 ; filtre `title` sur le titre. */
async function fakeDocs(route: Route) {
  const url = new URL(route.request().url());
  const title = (url.searchParams.get("title") ?? "").toLowerCase();
  const page = Number(url.searchParams.get("page") ?? "1");
  let body;
  if (title) {
    const items = [...PAGE_1, ...PAGE_2].filter((d) => d.title.toLowerCase().includes(title));
    body = { items, total: items.length, page: 1, pageSize: 8, hasMore: false, hasSession: true };
  } else if (page === 2) {
    body = { items: PAGE_2, total: 12, page: 2, pageSize: 8, hasMore: false, hasSession: true };
  } else {
    body = { items: PAGE_1, total: 12, page: 1, pageSize: 8, hasMore: true, hasSession: true };
  }
  await route.fulfill({ json: body });
}

const searchField = (page: Page) => page.getByRole("searchbox", { name: "Rechercher un document par son nom" });
// exact : la coque du kit a aussi un bouton « Ouvrir le menu utilisateur ».
const openButton = (page: Page) => page.getByRole("button", { name: "Ouvrir", exact: true });
const rows = (page: Page) => page.getByRole("list").filter({ has: page.locator("a.home-doc") }).getByRole("listitem");

test("/ : titre, champ de recherche, et sans session Docs l'avis « Connectez-vous à Docs »", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "Un doc, un PDF" })).toBeVisible();
  await expect(searchField(page)).toBeVisible();
  await expect(openButton(page)).toBeVisible();
  await expect(page.getByText("Connectez-vous à Docs dans ce navigateur pour voir vos documents.")).toBeVisible();
  await expect(page.getByRole("status")).toHaveCount(0);
  await expect(page.getByRole("heading", { level: 2 })).toHaveCount(0);
  await expect(page.getByRole("alert")).toHaveCount(0);
  // Panneau gauche : le lien Accueil est actif ici, pas sur /templates.
  await expect(page.getByRole("link", { name: "Accueil" })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("banner").getByRole("link", { name: "dots" })).toHaveAttribute("href", "/");
});

test("liste simulée : lignes, badges, compteur, recherche avec débounce, « Voir plus », ouverture", async ({ page }) => {
  await page.route(isDocsList, fakeDocs);
  const requests: string[] = [];
  page.on("request", (r) => {
    if (isDocsList(new URL(r.url()))) requests.push(r.url());
  });

  await page.goto("/");
  await expect(page.getByRole("heading", { level: 2, name: "Vos derniers documents dans Docs" })).toBeVisible();
  await expect(rows(page)).toHaveCount(3);
  await expect(page.getByText("3 sur 12")).toBeVisible();
  await expect(page.getByRole("status")).toHaveCount(0);

  const first = rows(page).nth(0);
  await expect(first.getByRole("link")).toHaveAttribute("href", `/documents/new?doc=${PAGE_1[0].id}`);
  await expect(first).toContainText("Note de service");
  await expect(first).toContainText("Propriétaire");
  await expect(first).toContainText("modifié il y a 10 min");
  await expect(rows(page).nth(1)).toContainText("Éditeur");
  await expect(rows(page).nth(1)).toContainText("modifié hier");
  await expect(rows(page).nth(2)).toContainText("Lecteur");
  await expect(rows(page).nth(2)).toContainText(/modifié \d{1,2} [a-zéû.]+ \d{4}/);
  expect(requests).toHaveLength(1);
  expect(new URL(requests[0]).searchParams.has("title")).toBe(false);

  // « Voir plus » demande la page 2 et ajoute les lignes à la suite.
  const page2 = page.waitForRequest((r) => isDocsList(new URL(r.url())) && new URL(r.url()).searchParams.get("page") === "2");
  await page.getByRole("button", { name: "Voir plus" }).click();
  await page2;
  await expect(rows(page)).toHaveCount(5);
  await expect(page.getByText("5 sur 12")).toBeVisible();
  await expect(rows(page).nth(3)).toContainText("Commentateur");
  await expect(rows(page).nth(3)).toContainText("modifié il y a 3 j");
  await expect(rows(page).nth(4).locator(".c__badge")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Voir plus" })).toHaveCount(0);
  expect(requests).toHaveLength(2);

  // Quatre lettres tapées d'affilée : une seule requête, 300 ms après la dernière.
  const before = requests.length;
  const search = page.waitForRequest((r) => r.url().includes("title=note"));
  await searchField(page).pressSequentially("note");
  await search;
  await page.waitForTimeout(600);
  expect(requests.slice(before)).toHaveLength(1);
  expect(new URL(requests[before]).searchParams.get("title")).toBe("note");
  await expect(page.getByRole("heading", { level: 2, name: "Résultats pour « note »" })).toBeVisible();
  await expect(rows(page)).toHaveCount(1);
  await expect(page.getByText("1 sur 1")).toBeVisible();

  // Sans résultat : message dédié, pas d'avis de connexion.
  await searchField(page).fill("zzz");
  await expect(page.getByText("Aucun document dont le nom contient « zzz ».")).toBeVisible();
  await expect(rows(page)).toHaveCount(0);
  await expect(page.getByText("Connectez-vous à Docs")).toHaveCount(0);

  // Une ligne mène à la page Rendu sur ce document.
  await searchField(page).fill("note");
  await rows(page).first().getByRole("link").click();
  await expect(page).toHaveURL(/\/documents\/new\?doc=11111111-1111-4111-8111-111111111111$/);
});

test("coller une URL Docs puis Ouvrir mène au rendu de ce document", async ({ page }) => {
  await page.route(isDocsList, fakeDocs);
  await page.goto("/");
  await searchField(page).fill(`http://localhost:3011/docs/${DOC_ID}/`);
  await openButton(page).click();
  await expect(page).toHaveURL(new RegExp(`/documents/new\\?doc=${DOC_ID}$`));
});

test("/docs (sans identifiant) affiche l'accueil ; /docs/<uuid>/ redirige toujours vers le rendu", async ({ page }) => {
  await page.goto("/docs");
  await expect(page.getByRole("heading", { level: 1, name: "Un doc, un PDF" })).toBeVisible();
  await expect(page).toHaveURL(/\/docs$/);
  await page.goto(`/docs/${DOC_ID}/`);
  await expect(page).toHaveURL(new RegExp(`/documents/new\\?doc=${DOC_ID}$`));
});
