import { expect, test, type APIRequestContext, type Locator, type Page, type Request } from "@playwright/test";

// Écran ③ — rendu d'un document (/compose et /docs/:id) : ComposePage, DocsUrlField, TemplateTiles.
// Ces scénarios ne font que lire l'API (fixtures, gabarits, rendu) ; par précaution le gabarit
// par défaut est relevé avant chaque test et remis s'il avait bougé.

const API = process.env.E2E_API_URL ?? "http://localhost:4000/api";

interface TemplateSummary {
  id: string;
  name: string;
  isDefault?: boolean;
}
interface FixtureSummary {
  id: string;
  name: string;
}

async function readState(request: APIRequestContext) {
  const templates = (await (await request.get(`${API}/templates`)).json()) as TemplateSummary[];
  const def = (await (await request.get(`${API}/templates/default`)).json()) as TemplateSummary;
  const fixtures = (await (await request.get(`${API}/fixtures`)).json()) as FixtureSummary[];
  return { templates, def, fixtures };
}

function isRender(req: Request) {
  return req.method() === "POST" && new URL(req.url()).pathname === "/api/render";
}

/** Attend la prochaine réponse de POST /api/render dont le corps satisfait `match`. */
function nextRender(page: Page, match: (body: { fixtureId?: string; docId?: string; templateId?: string }) => boolean = () => true) {
  return page.waitForResponse((r) => isRender(r.request()) && match(r.request().postDataJSON() ?? {}));
}

const tiles = (page: Page) => page.getByRole("group", { name: "Gabarit" });
// Une tuile = l'input radio du kit (visible, appearance:none) dont la valeur est l'id du
// gabarit. Par id et non par nom accessible : le backend partagé peut porter plusieurs
// gabarits homonymes (« Nouveau gabarit »), et le nom seul viole le mode strict.
const radioOf = (group: Locator, id: string) => group.locator(`input[type="radio"][value="${id}"]`);
// Select du kit (downshift) : un combobox nommé par son libellé ; la valeur choisie
// vit dans un <input type="hidden" name="fixture">, et les choix sont des options.
const fixtureSelect = (page: Page) => page.getByRole("combobox", { name: "Document d'exemple" });
const fixtureValue = (page: Page) => page.locator('input[name="fixture"]');
async function selectFixture(page: Page, name: string) {
  await fixtureSelect(page).click();
  await page.getByRole("option", { name }).click();
}
const unsupportedNotice = (page: Page) => page.getByRole("status").filter({ hasText: "sans équivalent Typst" });

let defaultBefore: string;

test.beforeEach(async ({ request }) => {
  defaultBefore = (await readState(request)).def.id;
});

test.afterEach(async ({ request }) => {
  const { def } = await readState(request);
  if (def.id !== defaultBefore) {
    await request.put(`${API}/templates/default`, { data: { templateId: defaultBefore } });
  }
});

test("chargement : titre, tuiles avec le défaut présélectionné, aperçu rendu et lien blob", async ({ page, request }) => {
  const { templates, def, fixtures } = await readState(request);
  expect(templates.length).toBeGreaterThan(1);

  const firstRender = nextRender(page);
  await page.goto("/compose");

  // Le titre est le nom du premier document d'exemple, sélectionné d'office.
  await expect(page.getByRole("heading", { level: 1, name: fixtures[0].name })).toBeVisible();
  await expect(fixtureSelect(page)).toBeVisible();
  await expect(fixtureValue(page)).toHaveValue(fixtures[0].id);

  // Une tuile par gabarit ; une seule porte « Par défaut » et c'est elle qui est cochée.
  const group = tiles(page);
  await expect(group).toBeVisible();
  await expect(group.getByRole("radio")).toHaveCount(templates.length);
  await expect(group.getByText("Par défaut")).toHaveCount(1);
  const defaultTile = radioOf(group, def.id);
  await expect(defaultTile).toBeChecked();
  await expect(defaultTile).toHaveAccessibleName(`${def.name} Par défaut`);
  for (const t of templates.filter((t) => t.id !== def.id)) {
    await expect(radioOf(group, t.id)).not.toBeChecked();
    await expect(radioOf(group, t.id)).toHaveAccessibleName(t.name);
  }

  // L'aperçu s'obtient par POST /api/render, en 200, avec le gabarit par défaut et le premier document.
  const response = await firstRender;
  expect(response.status()).toBe(200);
  expect(response.request().postDataJSON()).toEqual({ fixtureId: fixtures[0].id, templateId: def.id });

  await expect(page.getByTitle("Aperçu du PDF")).toBeVisible();
  await expect(page.getByText(/^Rendu en \d+ ms$/)).toBeVisible();
  const download = page.getByRole("link", { name: "Télécharger le PDF" });
  await expect(download).toBeVisible();
  await expect(download).toHaveAttribute("href", /^blob:/);
  await expect(download).toHaveAttribute("download", `${fixtures[0].id}.pdf`);
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("document avec callouts : bandeau d'avertissement, puis absent sur un document sans callout", async ({ page, request }) => {
  const { fixtures } = await readState(request);
  const roadmap = fixtures.find((f) => f.name === "REEL — 🇬🇧 Roadmap (in english)");
  expect(roadmap, "le document « REEL — 🇬🇧 Roadmap (in english) » doit exister").toBeTruthy();
  const plain = fixtures[0];
  expect(plain.id).not.toBe(roadmap!.id);

  const firstRender = nextRender(page);
  await page.goto("/compose");
  expect((await firstRender).status()).toBe(200);
  await expect(unsupportedNotice(page)).toHaveCount(0);

  const roadmapRender = nextRender(page, (b) => b.fixtureId === roadmap!.id);
  await selectFixture(page, roadmap!.name);
  await expect(page.getByRole("heading", { level: 1, name: roadmap!.name })).toBeVisible();
  expect((await roadmapRender).status()).toBe(200);

  const notice = unsupportedNotice(page);
  await expect(notice).toBeVisible();
  await expect(notice).toContainText("callout");
  await expect(notice).toContainText(/ne figure(nt)? pas dans le PDF/);

  const plainRender = nextRender(page, (b) => b.fixtureId === plain.id);
  await selectFixture(page, plain.name);
  await expect(page.getByRole("heading", { level: 1, name: plain.name })).toBeVisible();
  expect((await plainRender).status()).toBe(200);
  await expect(unsupportedNotice(page)).toHaveCount(0);
});

test("choisir une autre tuile de gabarit relance le rendu avec ce gabarit", async ({ page, request }) => {
  const { templates, def, fixtures } = await readState(request);
  const other = templates.find((t) => t.id !== def.id);
  expect(other, "il faut au moins un gabarit non défaut").toBeTruthy();

  const firstRender = nextRender(page);
  await page.goto("/compose");
  expect((await firstRender).status()).toBe(200);
  const download = page.getByRole("link", { name: "Télécharger le PDF" });
  await expect(download).toHaveAttribute("href", /^blob:/);
  const hrefBefore = await download.getAttribute("href");

  const group = tiles(page);
  const otherTile = radioOf(group, other!.id);
  await expect(otherTile).not.toBeChecked();
  await expect(otherTile).toHaveAccessibleName(other!.name);

  // Radio du kit : l'input est visible, on le coche directement.
  const rerender = nextRender(page, (b) => b.templateId === other!.id);
  await otherTile.check();
  await expect(otherTile).toBeChecked();
  const response = await rerender;
  expect(response.status()).toBe(200);
  expect(response.request().postDataJSON()).toEqual({ fixtureId: fixtures[0].id, templateId: other!.id });

  // Nouvel aperçu : un nouvel object URL remplace l'ancien.
  await expect(download).not.toHaveAttribute("href", hrefBefore!);
  await expect(download).toHaveAttribute("href", /^blob:/);
  await expect(page.getByRole("link", { name: "Mise en page" })).toHaveAttribute("href", `/t/${other!.id}/layout`);
});

const urlField = (page: Page) => page.getByRole("textbox", { name: "Coller l'URL d'un document Docs" });
// exact : la coque du kit a aussi un bouton « Ouvrir le menu utilisateur ».
const openButton = (page: Page) => page.getByRole("button", { name: "Ouvrir", exact: true });

test("champ URL Docs : URL invalide → message d'erreur, sans appel réseau", async ({ page }) => {
  await page.goto("/compose");
  const field = urlField(page);
  const open = openButton(page);
  await expect(field).toBeVisible();
  await expect(open).toBeDisabled();

  const docsCalls: string[] = [];
  page.on("request", (r) => {
    if (new URL(r.url()).pathname.startsWith("/api/docs/")) docsCalls.push(r.url());
  });

  await field.fill("pas une url");
  await expect(open).toBeEnabled();
  await open.click();
  const invalid = page.getByRole("alert").filter({ hasText: "URL non reconnue" });
  await expect(invalid).toBeVisible();
  await expect(invalid).toContainText("/docs/<identifiant>");

  // Un identifiant qui n'est pas un uuid n'est pas reconnu non plus.
  await field.fill("https://docs.numerique.gouv.fr/docs/7f3a2b/");
  await open.click();
  await expect(invalid).toBeVisible();
  expect(docsCalls).toEqual([]);
});

// Document Docs public (lien partagé), ex. E2E_DOCS_URL=http://localhost:3000/docs/<uuid>/
const DOCS_URL = process.env.E2E_DOCS_URL;
const DOCS_TITLE = "Note de service — test dots";
const docIdOf = (url: string) => /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i.exec(url)![1];

test("champ URL Docs : coller l'URL d'un document public, l'ouvrir, le rendre, puis revenir à un exemple", async ({ page, request }) => {
  test.skip(!DOCS_URL, "E2E_DOCS_URL non défini : pas de document Docs public à ouvrir");
  const docId = docIdOf(DOCS_URL!);
  const { def, fixtures } = await readState(request);

  const firstRender = nextRender(page);
  await page.goto("/compose");
  expect((await firstRender).status()).toBe(200);
  const download = page.getByRole("link", { name: "Télécharger le PDF" });
  await expect(download).toHaveAttribute("href", /^blob:/);
  const hrefBefore = await download.getAttribute("href");

  await urlField(page).fill(DOCS_URL!);
  const docRender = page.waitForRequest((r) => isRender(r) && r.postDataJSON()?.docId === docId);
  await openButton(page).click();
  await expect(page.getByRole("status").filter({ hasText: "Chargement…" })).toHaveCount(0);

  // La page passe sur le document Docs : titre, sous-titre, lien vers Docs.
  await expect(page.getByRole("heading", { level: 1, name: DOCS_TITLE })).toBeVisible();
  await expect(page.getByText(/^Document Docs · \d+ blocs$/)).toBeVisible();
  await expect(page.getByRole("link", { name: "Voir dans Docs" })).toHaveAttribute("href", DOCS_URL!);
  await expect(fixtureValue(page)).toHaveValue("docs");

  // Le rendu repart avec { docId, templateId } et aboutit à un nouvel aperçu.
  const req = await docRender;
  expect(req.postDataJSON()).toEqual({ docId, templateId: def.id });
  expect((await req.response())!.status()).toBe(200);
  await expect(download).not.toHaveAttribute("href", hrefBefore!);
  await expect(download).toHaveAttribute("href", /^blob:/);
  await expect(download).toHaveAttribute("download", `${docId}.pdf`);
  await expect(page.getByTitle("Aperçu du PDF")).toBeVisible();
  await expect(page.getByText(/^Rendu en \d+ ms$/)).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);

  // Revenir à un document d'exemple efface le document Docs.
  const backRender = nextRender(page, (b) => b.fixtureId === fixtures[0].id);
  await selectFixture(page, fixtures[0].name);
  expect((await backRender).request().postDataJSON()).toEqual({ fixtureId: fixtures[0].id, templateId: def.id });
  await expect(page.getByRole("heading", { level: 1, name: fixtures[0].name })).toBeVisible();
  await expect(page.getByRole("link", { name: "Voir dans Docs" })).toHaveCount(0);
  await expect(fixtureValue(page)).toHaveValue(fixtures[0].id);
});

test("?doc=<uuid> précharge ce document Docs, sans rendre d'exemple avant", async ({ page, request }) => {
  test.skip(!DOCS_URL, "E2E_DOCS_URL non défini : pas de document Docs public à ouvrir");
  const docId = docIdOf(DOCS_URL!);
  const { def } = await readState(request);

  const renders: Request[] = [];
  page.on("request", (r) => {
    if (isRender(r)) renders.push(r);
  });
  const firstRender = nextRender(page);
  await page.goto(`/docs/${docId}`);

  await expect(page.getByRole("heading", { level: 1, name: DOCS_TITLE })).toBeVisible();
  const response = await firstRender;
  expect(response.status()).toBe(200);
  expect(response.request().postDataJSON()).toEqual({ docId, templateId: def.id });
  await expect(page.getByTitle("Aperçu du PDF")).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
  expect(renders.map((r) => r.postDataJSON())).toEqual([{ docId, templateId: def.id }]);
});

test("?template=<id> présélectionne ce gabarit", async ({ page, request }) => {
  const { templates, def, fixtures } = await readState(request);
  const other = templates.find((t) => t.id !== def.id);
  expect(other, "il faut au moins un gabarit non défaut").toBeTruthy();

  const firstRender = nextRender(page);
  await page.goto(`/compose?template=${encodeURIComponent(other!.id)}`);

  const group = tiles(page);
  await expect(radioOf(group, other!.id)).toBeChecked();
  await expect(radioOf(group, def.id)).not.toBeChecked();

  const response = await firstRender;
  expect(response.status()).toBe(200);
  expect(response.request().postDataJSON()).toEqual({ fixtureId: fixtures[0].id, templateId: other!.id });
  await expect(page.getByRole("link", { name: "Mise en page" })).toHaveAttribute("href", `/t/${other!.id}/layout`);
});
