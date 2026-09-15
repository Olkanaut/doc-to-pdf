import { expect, test, type APIRequestContext, type Page, type Request } from "@playwright/test";

// Écran ③ — rendu d'un document (/documents/new) : ComposePage, DocsUrlField, TemplateTiles.
// Ces scénarios ne font que lire l'API (fixtures, gabarits, rendu) ; par précaution le gabarit
// par défaut est relevé avant chaque test et remis s'il avait bougé.

const API = "http://localhost:4000/api";

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
function nextRender(page: Page, match: (body: { fixtureId?: string; templateId?: string }) => boolean = () => true) {
  return page.waitForResponse((r) => isRender(r.request()) && match(r.request().postDataJSON() ?? {}));
}

const tiles = (page: Page) => page.getByRole("group", { name: "Gabarit" });
const fixtureSelect = (page: Page) => page.getByRole("combobox", { name: "Document d'exemple" });
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
  await page.goto("/documents/new");

  // Le titre est le nom du premier document d'exemple, sélectionné d'office.
  await expect(page.getByRole("heading", { level: 1, name: fixtures[0].name })).toBeVisible();
  await expect(fixtureSelect(page)).toHaveValue(fixtures[0].id);

  // Une tuile par gabarit ; une seule porte « Par défaut » et c'est elle qui est cochée.
  const group = tiles(page);
  await expect(group).toBeVisible();
  await expect(group.getByRole("radio")).toHaveCount(templates.length);
  await expect(group.getByText("Par défaut")).toHaveCount(1);
  const defaultTile = group.getByRole("radio", { name: `${def.name} Par défaut`, exact: true });
  await expect(defaultTile).toBeChecked();
  for (const t of templates.filter((t) => t.id !== def.id)) {
    await expect(group.getByRole("radio", { name: t.name, exact: true })).not.toBeChecked();
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
  await page.goto("/documents/new");
  expect((await firstRender).status()).toBe(200);
  await expect(unsupportedNotice(page)).toHaveCount(0);

  const roadmapRender = nextRender(page, (b) => b.fixtureId === roadmap!.id);
  await fixtureSelect(page).selectOption(roadmap!.id);
  await expect(page.getByRole("heading", { level: 1, name: roadmap!.name })).toBeVisible();
  expect((await roadmapRender).status()).toBe(200);

  const notice = unsupportedNotice(page);
  await expect(notice).toBeVisible();
  await expect(notice).toContainText("callout");
  await expect(notice).toContainText(/ne figure(nt)? pas dans le PDF/);

  const plainRender = nextRender(page, (b) => b.fixtureId === plain.id);
  await fixtureSelect(page).selectOption(plain.id);
  await expect(page.getByRole("heading", { level: 1, name: plain.name })).toBeVisible();
  expect((await plainRender).status()).toBe(200);
  await expect(unsupportedNotice(page)).toHaveCount(0);
});

test("choisir une autre tuile de gabarit relance le rendu avec ce gabarit", async ({ page, request }) => {
  const { templates, def, fixtures } = await readState(request);
  const other = templates.find((t) => t.id !== def.id);
  expect(other, "il faut au moins un gabarit non défaut").toBeTruthy();

  const firstRender = nextRender(page);
  await page.goto("/documents/new");
  expect((await firstRender).status()).toBe(200);
  const download = page.getByRole("link", { name: "Télécharger le PDF" });
  await expect(download).toHaveAttribute("href", /^blob:/);
  const hrefBefore = await download.getAttribute("href");

  const group = tiles(page);
  const otherTile = group.getByRole("radio", { name: other!.name, exact: true });
  await expect(otherTile).not.toBeChecked();

  // Le bouton radio est masqué visuellement (clip) : on clique le nom porté par son label.
  const rerender = nextRender(page, (b) => b.templateId === other!.id);
  await group.getByText(other!.name, { exact: true }).click();
  await expect(otherTile).toBeChecked();
  const response = await rerender;
  expect(response.status()).toBe(200);
  expect(response.request().postDataJSON()).toEqual({ fixtureId: fixtures[0].id, templateId: other!.id });

  // Nouvel aperçu : un nouvel object URL remplace l'ancien.
  await expect(download).not.toHaveAttribute("href", hrefBefore!);
  await expect(download).toHaveAttribute("href", /^blob:/);
  await expect(page.getByRole("link", { name: "Mise en page" })).toHaveAttribute("href", `/templates/${other!.id}/layout`);
});

test("champ URL Docs : identifiant reconnu (non branché) puis URL invalide", async ({ page }) => {
  await page.goto("/documents/new");
  const field = page.getByRole("textbox", { name: "Coller l'URL d'un document Docs" });
  const open = page.getByRole("button", { name: "Ouvrir" });
  await expect(field).toBeVisible();
  await expect(open).toBeDisabled();

  await field.fill("https://docs.numerique.gouv.fr/docs/7f3a2b/");
  await expect(open).toBeEnabled();
  await open.click();
  const recognized = page.getByRole("status").filter({ hasText: "7f3a2b" });
  await expect(recognized).toBeVisible();
  await expect(recognized).toContainText("n'est pas encore branchée");
  await expect(recognized).toContainText("identifiant 7f3a2b reconnu");

  await field.fill("pas une url");
  await open.click();
  const invalid = page.getByRole("alert").filter({ hasText: "URL non reconnue" });
  await expect(invalid).toBeVisible();
  await expect(invalid).toContainText("/docs/<identifiant>");
  await expect(recognized).toHaveCount(0);
});

test("?template=<id> présélectionne ce gabarit", async ({ page, request }) => {
  const { templates, def, fixtures } = await readState(request);
  const other = templates.find((t) => t.id !== def.id);
  expect(other, "il faut au moins un gabarit non défaut").toBeTruthy();

  const firstRender = nextRender(page);
  await page.goto(`/documents/new?template=${encodeURIComponent(other!.id)}`);

  const group = tiles(page);
  await expect(group.getByRole("radio", { name: other!.name, exact: true })).toBeChecked();
  await expect(group.getByRole("radio", { name: `${def.name} Par défaut`, exact: true })).not.toBeChecked();

  const response = await firstRender;
  expect(response.status()).toBe(200);
  expect(response.request().postDataJSON()).toEqual({ fixtureId: fixtures[0].id, templateId: other!.id });
  await expect(page.getByRole("link", { name: "Mise en page" })).toHaveAttribute("href", `/templates/${other!.id}/layout`);
});
