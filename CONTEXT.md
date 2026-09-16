# Project context / handoff — "Un doc, un PDF"

This file exists so anyone (human or AI assistant) picking up this repo cold can get oriented without re-reading the whole planning conversation. It captures the *why* behind decisions, not just the *what* — the code and `README.md` already cover the what.

## The pitch (hackathon brief)

La Suite numérique hackathon, **Track 3: Mini-apps & surcouches** — build a small external app that plugs into an existing La Suite product's API without forking it. Our pick: **"Un doc, un PDF."**

A public servant finishes a note in **Docs** (La Suite's collaborative editor). They need a polished PDF with their administration's letterhead — logo, margins, proper pagination — not a raw browser export. Today they copy-paste into Word. The pitch: a companion mini-app where each admin/agency has its own Typst templates (margins, header, logo, pagination), and applying one to a Docs document is as easy as changing one letter in the URL (`docs.` → `dots.`).

**Explicit MVP bar** (from the brief): *"Un gabarit + une route qui appelle l'API et Typst suffisent dès le premier jour. Le reste, c'est du polish."* Everything past that (AI-assisted template editing, AI-generated templates from a branded PDF exemplar, template galleries, default templates) is Day 2 polish, not core scope.

## Key architectural decisions (and why)

1. **Node.js/TypeScript throughout**, frontend and backend. Chosen over a Python/FastAPI alternative mainly for single-language simplicity — subprocess-calling the `typst` CLI is equally trivial in either language, so this came down to team fluency, not a technical constraint.

2. **We do NOT depend on BlockNote.js's own Typst exporter — this was a deliberate reversal, worth knowing about.** Early research found that Docs' editor (BlockNote.js) ships `@blocknote/xl-typst-exporter` + `@blocknote/xl-typst-compiler`, which convert BlockNote blocks to Typst and compile to PDF **entirely client-side via WASM**, with a low-level API (`TypstExporter.transformBlocks()` + `TypstCompiler.compilePdf()`) that would even let us wrap the output in our own custom `.typ` template. This was technically elegant (zero backend, nothing ever leaves the browser) and was actually hinted at in the brief itself. **The team explicitly chose not to take this dependency** — instead we treat "BlockNote-shaped block JSON" purely as a *data contract* (because that's what Docs' real export API returns) and wrote our own small, fully-owned JSON→Typst converter, compiling server-side via the plain `typst` CLI. Rationale: no 25MB WASM bundle, no coupling to BlockNote's private/internal APIs, fully auditable escaping logic. **If you see "BlockNote" mentioned in old research notes or this file, it refers to the data shape we mimic, never a package we import.**

3. **Phase 1 mock data = static JSON fixtures**, not a live embedded editor. Fixtures are hand-written to match BlockNote's real block-JSON shape (since that's what the real Docs API will return in Phase 2), so the converter built against fixtures should mostly just work against real data later.

4. **Phase 2 will target a self-hosted Docs instance** (Docker Compose + its bundled Keycloak as the OIDC provider), not the real `docs.numerique.gouv.fr` + ProConnect. Research found no realistic path to real ProConnect OAuth-client approval for an outside team within a 48h hackathon (no self-serve registration found; partner onboarding is a multi-day approval process). Self-hosting exercises the *same* Resource Server API contract while keeping the demo fully within our control.

5. **The app is multiple pages, not one screen** — `/templates` (library), `/templates/:id` (editor), `/documents/new` (compose: pick content + template → generate PDF). The `docs.→dots.` URL-swap gimmick targets the compose page specifically (it becomes `/d/:docId` in Phase 2, pre-filled with a real document) — template management is a separate "prepare your gabarits ahead of time" area, not something the gimmick opens.

6. **Auth is architected now, wired for real later.** The frontend has a real `AuthProvider`/`ProtectedRoute`/`useAuth()` seam, and the backend has a real `GET /api/session` endpoint — but today `/api/session` is a stub that always returns "authenticated" (see `backend/src/routes/session.ts`). Phase 2 replaces only that one endpoint's implementation (real check against the Keycloak session cookie); no page or routing code needs to change.

7. **Templates are stored as files, not a database**, seeded once from the original 3 presets: `backend/data/templates/<id>/{meta.json,template.typ}` (gitignored — this is runtime state, not source). Full CRUD lives in `backend/src/registry/templates.ts`. **Important open point for the team**: this storage is only "shared" if everyone points at the *same running backend instance* — if each teammate runs `npm run dev` locally, you each get your own empty template store and won't see each other's work, and the live demo won't show anything prepared in advance. Fix: deploy one shared backend instance (even a bare-bones one, e.g. via a quick Fly.io/Render deploy or a tunnel like ngrok from one machine) *before* everyone starts creating templates, and have all frontends (local `npm run dev` is fine) point at that one shared backend via `vite.config.ts`'s proxy target — not yet done, needs a decision on where to host it.

## Research findings worth knowing (condensed)

**La Suite Docs** (`github.com/suitenumerique/docs`, MIT license, Django+DRF backend / Next.js+React frontend):
- Editor is BlockNote.js + ProseMirror + Yjs (CRDT).
- **Resource Server API** at `/external_api/v1.0/`, OIDC Bearer-token auth (token introspection), added v4.8.2, documented in `documentation/resource_server.md` in that repo. Flagged by its own maintainers as "subject to future evolution" (beta).
- Content export: `GET .../api/v1.0/documents/{id}/formatted-content/?content_format=json|html|markdown` — `json` gives BlockNote's block JSON, exactly the shape our fixtures mimic.
- Self-hostable via `make bootstrap && make run` (Docker Compose + local Keycloak for dev — production instances presumably point at ProConnect, but this is not directly confirmed in the repo).
- Separate, older **server-to-server API** exists too (shared-token auth via `DJANGO_SERVER_TO_SERVER_API_TOKENS`) — not what we're using, but worth knowing it exists if Phase 2 auth gets stuck.

**Typst tooling**: shelling out to the official `typst` CLI (`brew install typst`, or a static release binary in Docker) is the simplest, fastest path — no meaningful downside vs. embedding it as a library for a project this size. Compiles run in ~200–400ms even via subprocess. Docker gotcha to remember for deploy: fonts must be explicitly bundled/pathed (`--font-path` / `TYPST_FONT_PATHS`) since containers don't have system fonts.

Full plan document (analysis, requirements, both system-design diagrams, folder structure) lives at `/Users/ok/.claude/plans/track-3-eager-crystal.md` on the machine this was built on — copy it into the repo if you want it versioned; it's not currently tracked in git.

## Current state: multi-page app with template CRUD, implemented and verified

Repo layout:
```
doc-pdf/
├── README.md          # run instructions
├── CONTEXT.md          # this file
├── backend/            # Fastify + TS
│   ├── src/convert/blocksToTypst.ts   # our hand-rolled JSON → Typst converter
│   ├── src/convert/escapeTypst.ts     # escapes \ * _ ` # < > @ $ [ ] in literal text
│   ├── src/compile/typstCompile.ts    # per-request temp dir + `typst compile` subprocess
│   ├── src/registry/templates.ts      # file-backed template CRUD (seeds 3 presets on first run)
│   ├── src/registry/fixtures.ts       # reads mock documents from fixtures/*.json
│   ├── src/routes/{templates,fixtures,render,session}.ts
│   ├── fixtures/*.json                # 3 mock documents (BlockNote-shaped)
│   ├── templates/*.typ + assets/      # seed source for the 3 presets: minimal, ministere, collectivite
│   └── data/templates/<id>/           # live template storage (gitignored, runtime state)
└── frontend/            # Vite + React + react-router-dom
    └── src/
        ├── auth/{AuthContext,ProtectedRoute}.tsx   # auth seam, see decision #6 above
        ├── pages/{TemplatesListPage,TemplateEditorPage,ComposePage,LoginPage}.tsx
        └── components/                              # shared pickers, PDF preview
```

Routes: `/templates` (library — list/create/delete), `/templates/:id` (editor — edit/save/preview/download/share/delete), `/documents/new?template=:id` (compose — pick content, generate, preview, download). All three are wrapped in `<ProtectedRoute>`; `/login` is a placeholder for the real Keycloak redirect.

**Verified working** (across sessions):
- Backend unit tests pass (escaping + conversion correctness, including a test that literal `*`/`_`/`#` in document text render as plain text, not markup).
- All fixture × template combinations render successfully via `POST /api/render`, visually confirmed via PDF→PNG (logo, header banner, pagination, bold/italic, tables, images all correct).
- Full template CRUD lifecycle exercised via curl (create/read/update/delete, plus confirming seeded presets survive and render still works afterward).
- Full multi-page browser flow driven with Playwright: root redirects to `/templates`, seeded templates list correctly, editor loads/edits/saves/previews real `.typ` source, creating a new template and deleting one both work, and navigating from a template card's "Créer un document" link correctly pre-selects that template on the compose page.

**Not yet built** (Phase 2, per the plan, plus new items from this session):
- **Decide where to host one shared backend instance** so the team's template library (and the demo) reflects everyone's work rather than N empty local stores — see decision #7 above. Blocking for effective teamwork on templates, not blocking for solo frontend/backend code changes.
- Self-hosted Docs + Keycloak instance; wiring `/api/session` to a real session check; `/auth/login` + `/auth/callback` (OIDC Authorization Code flow via `openid-client`).
- `/api/doc/:id` — proxies to Docs' `formatted-content` endpoint with a Bearer token; compose page's fixture picker gets a "paste a Docs URL/ID" alternative; `/d/:id` route for the URL-swap demo.
- Docker packaging + deploy alongside the self-hosted Docs stack.
- Asset upload (custom logo/fonts per user-created template) — deliberately deferred; new templates today can only reference the existing shared `templates/assets/*` logos.
- Stretch/polish, in priority order per the team's latest call: (1) `/templates` page — done; (2) explore PDF→Typst-template AI generation next (flagged as the highest-value bonus if it works — "parse every PDF to a Typst template" as a live demo moment); (3) template gallery/default-template niceties are lower priority than that.

## How to run it right now

```bash
cd backend && npm install && npm run dev   # Fastify API on :4000
cd frontend && npm install && npm run dev  # Vite dev server on :3002
```
Open http://localhost:3002. Requires the `typst` CLI on `PATH` (`brew install typst`).
