# Project context / handoff — "Un doc, un PDF"

This file exists so anyone (human or AI assistant) picking up this repo cold can get oriented without re-reading the whole planning conversation. It captures the *why* behind decisions, not just the *what* — the code and `README.md` already cover the what.

## The pitch (hackathon brief)

La Suite numérique hackathon, **Track 3: Mini-apps & surcouches** — build a small external app that plugs into an existing La Suite product's API without forking it. Our pick: **"Un doc, un PDF."**

A public servant finishes a note in **Docs** (La Suite's collaborative editor). They need a polished PDF with their administration's letterhead — logo, margins, proper pagination — not a raw browser export. Today they copy-paste into Word. The pitch: a companion mini-app where each admin/agency has its own Typst templates (margins, header, logo, pagination), and applying one to a Docs document is as easy as changing one letter in the URL (`docs.` → `dots.`).

**Explicit MVP bar** (from the brief): *"Un gabarit + une route qui appelle l'API et Typst suffisent dès le premier jour. Le reste, c'est du polish."* Everything past that (AI-assisted template editing, AI-generated templates from a branded PDF exemplar, template galleries, default templates) is Day 2 polish, not core scope.

## Key architectural decisions (and why)

1. **Node.js/TypeScript throughout**, frontend and backend. Chosen over a Python/FastAPI alternative mainly for single-language simplicity — subprocess-calling the `typst` CLI is equally trivial in either language, so this came down to team fluency, not a technical constraint.

2. **We do NOT depend on BlockNote.js's own Typst exporter — this was a deliberate reversal, worth knowing about.** Early research found that Docs' editor (BlockNote.js) ships `@blocknote/xl-typst-exporter` + `@blocknote/xl-typst-compiler`, which convert BlockNote blocks to Typst and compile to PDF **entirely client-side via WASM**, with a low-level API (`TypstExporter.transformBlocks()` + `TypstCompiler.compilePdf()`) that would even let us wrap the output in our own custom `.typ` template. This was technically elegant (zero backend, nothing ever leaves the browser) and was actually hinted at in the brief itself. **The team explicitly chose not to take this dependency** — instead we treat "BlockNote-shaped block JSON" purely as a *data contract* (because that's what Docs' real export API returns) and wrote our own small, fully-owned JSON→Typst converter, compiling server-side via the plain `typst` CLI. Rationale: no 25MB WASM bundle, no coupling to BlockNote's private/internal APIs, fully auditable escaping logic. **If you see "BlockNote" mentioned in old research notes or this file, it refers to the data shape we mimic, never a package we import.**

3. **Fixtures still exist, but they are now a local/demo path, not the main integration path.** `backend/fixtures/*.json` keeps BlockNote-shaped examples useful for tests, demos, and template iteration through `POST /api/render`. The real Docs path now goes through `/api/documents/:documentId/content` and `/api/documents/:documentId/render`, which call Docs' external API with the user's Keycloak access token.

4. **The integration targets the local self-hosted La Suite stack** (`docs-solo`: Docs + shared Keycloak), not the real `docs.numerique.gouv.fr` + ProConnect. Research found no realistic path to real ProConnect OAuth-client approval for an outside team within a 48h hackathon (no self-serve registration found; partner onboarding is a multi-day approval process). Self-hosting exercises the same Resource Server API contract while keeping the demo fully within our control.

5. **The app is multiple pages, not one screen.** Current primary routes are `/` (template library), `/docs` (paste/open a Docs URL or ID), `/docs/:id` (fetch a Docs document, choose a template, preview/download the PDF), `/t/:id` (template source editor), and `/t/:id/layout` (visual layout editor). `/d/:id` is the short URL-swap route and redirects to `/docs/:id`. Older planned routes (`/templates/*`, `/documents/new`) still exist as redirects for compatibility.

6. **Auth is wired to Keycloak now.** The backend implements OIDC Authorization Code + PKCE in `backend/src/routes/auth.ts`, stores the resulting access token in a server-side in-memory session, and exposes the session to the browser only through HttpOnly cookies. The frontend uses `AuthProvider`/`ProtectedRoute`/`useAuth()` and calls Dots with `credentials: "include"`. Important limitation: sessions are currently in memory, so restarting the backend logs users out; token refresh is stored if returned but not yet used to renew sessions.

7. **User-owned templates live in Docs through the external `typst-templates` API.** Dots' `/api/templates` routes proxy CRUD to Docs with the server-side Keycloak access token. Users can only access their own templates because Docs authorizes the Bearer token. There is still file-backed template storage in `backend/src/registry/templates.ts`, but it is now the local/fixture path used by `POST /api/render` and seeded assets, not the source of truth for real user templates. Per-user default template selection is currently stored locally by Dots under `backend/data/template-defaults`.

## Research findings worth knowing (condensed)

**La Suite Docs** (`github.com/suitenumerique/docs`, MIT license, Django+DRF backend / Next.js+React frontend):
- Editor is BlockNote.js + ProseMirror + Yjs (CRDT).
- **Resource Server API** at `/external_api/v1.0/`, OIDC Bearer-token auth (token introspection), added v4.8.2, documented in `documentation/resource_server.md` in that repo. Flagged by its own maintainers as "subject to future evolution" (beta).
- Content export: `GET .../external_api/v1.0/documents/{id}/formatted-content/?content_format=json|html|markdown` — `json` gives BlockNote's block JSON, exactly the shape our fixtures mimic.
- Self-hostable via `make bootstrap && make run` (Docker Compose + local Keycloak for dev — production instances presumably point at ProConnect, but this is not directly confirmed in the repo).
- Separate, older **server-to-server API** exists too (shared-token auth via `DJANGO_SERVER_TO_SERVER_API_TOKENS`) — not what we're using, but worth knowing it exists as a possible fallback/investigation path.

**Typst tooling**: shelling out to the official `typst` CLI (`brew install typst`, or a static release binary in Docker) is the simplest, fastest path — no meaningful downside vs. embedding it as a library for a project this size. Compiles run in ~200–400ms even via subprocess. Docker gotcha to remember for deploy: fonts must be explicitly bundled/pathed (`--font-path` / `TYPST_FONT_PATHS`) since containers don't have system fonts.

Historical note: older planning material may still mention file-only template storage, stub auth, and `/documents/new`. Treat those as implementation history. The current contracts are documented in `documentation/EXTERNAL-API.md`, `documentation/DOCS-FETCH.md`, and the route/client files in `backend/src`.

## Current state on `main`

Repo layout:
```
doc-pdf/
├── README.md          # run instructions
├── CONTEXT.md          # this file
├── documentation/
│   ├── EXTERNAL-API.md # Docs typst-templates external API contract
│   └── DOCS-FETCH.md   # Dots-to-Docs document fetch/render contract
├── backend/            # Fastify + TS
│   ├── src/convert/blocksToTypst.ts   # our hand-rolled JSON → Typst converter
│   ├── src/convert/escapeTypst.ts     # escapes \ * _ ` # < > @ $ [ ] in literal text
│   ├── src/compile/typstCompile.ts    # per-request temp dir + `typst compile` subprocess
│   ├── src/clients/docsClient.ts      # calls Docs formatted-content external API
│   ├── src/clients/templatesClient.ts # calls Docs typst-templates external API
│   ├── src/routes/auth.ts             # OIDC login/callback/logout + session cookie
│   ├── src/routes/documents.ts        # real Docs document fetch/render routes
│   ├── src/routes/templates.ts        # Dots template API, backed by Docs typst-templates
│   ├── src/routes/render.ts           # fixture/local rendering route
│   ├── src/routes/ai.ts               # optional AI template assistant
│   ├── src/routes/ingest.ts           # PDF/DOCX -> template (upload, crop, create)
│   ├── src/ingest/                    # sidecar call, job dirs, analysis -> LayoutConfig
│   ├── ingest/extract.py              # PyMuPDF extractor (see ingest/README.md)
│   ├── src/registry/fixtures.ts       # reads mock documents from fixtures/*.json
│   ├── src/registry/templates.ts      # file-backed templates for fixture/local path
│   ├── fixtures/*.json                # mock documents (BlockNote-shaped)
│   ├── templates/*.typ + assets/      # seed source/assets for local rendering and shared logos
│   └── data/                          # local runtime state (gitignored)
└── frontend/            # Vite + React + react-router-dom
    └── src/
        ├── auth/{AuthContext,ProtectedRoute}.tsx
        ├── pages/{HomePage,DocumentPage,TemplatesListPage,TemplateEditorPage,LayoutEditorPage,LoginPage}.tsx
        ├── api/client.ts                            # frontend only talks to Dots /api
        └── components/                              # shared pickers, PDF preview
```

### Runtime flow

Real Docs render:
1. User logs into Dots through Keycloak (`/api/auth/login` → `/api/auth/callback`).
2. Browser keeps only the Dots HttpOnly session cookie and calls Dots `/api/*`.
3. `GET /api/documents/:documentId/content` validates a UUID, calls Docs `documents/:id/formatted-content/?content_format=json`, and returns `{ id, title, blocks, createdAt, updatedAt }`.
4. `POST /api/documents/:documentId/render` fetches the Docs document and the selected Typst template in parallel, converts `blocks` to Typst, compiles with `typst`, and returns `application/pdf`.
5. Response headers include `X-Dots-Block-Count` and `X-Dots-Unsupported-Blocks` so the UI can explain what was omitted.

PDF/DOCX import (a template deduced from an existing document):
1. `POST /api/ingest` takes the file as base64, writes it to a per-import folder under `backend/data/ingest/<uuid>/`, and runs `backend/ingest/extract.py analyze`.
2. The extractor renders page 1, measures paper size, margins, dominant font, line height and heading colour, and proposes header/footer bands. Everything it returns has passed an occlusion check: content painted over by a later opaque shape is never reused, so a document "redacted" that way cannot be reconstructed through the import.
3. `POST /api/ingest/:id/fragment` crops one region (real SVG paths when the source is vector, a 4× PNG otherwise) and files it in `backend/templates/assets`, which `typstCompile` already copies next to every compile — so the fragment is referenced by a bare filename, which is the only form Typst's path sandbox accepts.
4. `POST /api/ingest/:id/template` does both and creates the template in Docs. A header fragment becomes a full-bleed band (`place(top + left, dx: -margin, image(width: 100% + 2 × margin))`) and the top margin is widened to the image's rendered height — below that, Typst silently clips it.

The same modal is the only import entry point: a `.typ` goes straight through the existing test-compile and opens the editor. In the layout editor, the En-tête and Pied de page sections reuse it to pull in a single visual.

**Python is required for this path only.** PyMuPDF gives the real vector geometry and paint order that a JS PDF library does not; `backend/ingest/README.md` covers installation and the AGPL question. Without Python the ingest routes return 422 and nothing else is affected.

A `.docx` takes a shorter route: `backend/ingest/docx.py` reads the zip, so paper size, margins, default font and the embedded images come out exactly, without composing anything, and the original image file is reused rather than a crop of a rendered page. There is then no page image, so the modal skips the crop step and offers the visuals it found. LibreOffice enters only for a letterhead drawn as DrawingML shapes, where no file exists to extract.

Template management:
- Frontend calls Dots `/api/templates`.
- Dots requires the session cookie, reads the server-side access token, and proxies to Docs `/external_api/v1.0/typst-templates/`.
- `documentation/EXTERNAL-API.md` documents the Docs-side API contract.
- Default template preference is a Dots-local preference keyed by the user's OIDC `sub`.

Local/fixture render:
- `POST /api/render` still renders fixture content from `backend/fixtures` with local file-backed templates.
- This path is useful for tests, local template iteration, and demos without a live Docs document.
- Do not confuse it with the real Docs path, which is `/api/documents/:documentId/render`.

AI assistant:
- `/api/ai/template` edits a Typst template from an instruction.
- `/api/ai/template-from-pdf` tries to generate a Typst template from a PDF.
- These routes require `ANTHROPIC_API_KEY` in `backend/.env`; without it they return `503` and the frontend should hide or disable the assistant.

### Current limitations / open points

- Sessions are in memory. A backend restart logs users out; production needs persistent/session-store strategy or a stateless encrypted session design.
- Remote Docs images are not downloaded yet. Real Docs documents containing body images return `422` during render.
- Import fragments land in the shared `backend/templates/assets` folder rather than being scoped per template, so every user's gallery shows every fragment. Fine for a demo, wrong for more than one administration.
- Import reads the first page only, by design. Header/footer text is rasterised with its band rather than reconstructed as Typst text — doable via `get_text("dict")`, but font substitution then shifts the metrics, so the image is the faithful option.
- `.docx` import reads the zip directly — page geometry from `sectPr`, fonts from `styles.xml`/`theme1.xml`, and the images from `word/media/` byte for byte (a real embedded SVG wins over its mandatory PNG fallback). No rendering, so no crop step either: the modal offers the visuals it found. LibreOffice is needed **only** when the letterhead is drawn in the XML and there is no file to take, which is the one case a zip cannot serve.
- Docker/deploy packaging still needs a final decision, especially Typst binary and fonts (`--font-path` / `TYPST_FONT_PATHS` in containers).
- Docs' Resource Server API is still treated as beta/evolving; keep `documentation/DOCS-FETCH.md` and `documentation/EXTERNAL-API.md` close to the actual upstream contract.
- The AI assistant is optional and depends on external API configuration; do not make the core PDF flow depend on it.
- Before claiming a behavior is verified, run the relevant checks on the current branch (`make test`, `make build`, `make lint`, and Playwright when the frontend flow changed).

## How to run it right now

```bash
./setup.sh docs-solo up  # start local Docs + Keycloak stack first
make install             # install backend + frontend dependencies
make dev                 # Dots backend on :4000, frontend on :3002
```
Open http://localhost:3002. Requires the `typst` CLI on `PATH` (`brew install typst`).

`make install` also sets up `backend/ingest/.venv` for the PDF/DOCX import
feature (`make install-ingest`, best-effort — skipped with a note if
`python3` isn't found, and the rest of the app is unaffected either way).
One further optional dependency for that feature: importing a `.docx` whose
letterhead is drawn as shapes rather than stored as a file needs `soffice`/
`libreoffice` on `PATH` (`brew install --cask libreoffice` on macOS) — see
`backend/ingest/README.md` for the full breakdown of what needs what.
