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

## Research findings worth knowing (condensed)

**La Suite Docs** (`github.com/suitenumerique/docs`, MIT license, Django+DRF backend / Next.js+React frontend):
- Editor is BlockNote.js + ProseMirror + Yjs (CRDT).
- **Resource Server API** at `/external_api/v1.0/`, OIDC Bearer-token auth (token introspection), added v4.8.2, documented in `documentation/resource_server.md` in that repo. Flagged by its own maintainers as "subject to future evolution" (beta).
- Content export: `GET .../api/v1.0/documents/{id}/formatted-content/?content_format=json|html|markdown` — `json` gives BlockNote's block JSON, exactly the shape our fixtures mimic.
- Self-hostable via `make bootstrap && make run` (Docker Compose + local Keycloak for dev — production instances presumably point at ProConnect, but this is not directly confirmed in the repo).
- Separate, older **server-to-server API** exists too (shared-token auth via `DJANGO_SERVER_TO_SERVER_API_TOKENS`) — not what we're using, but worth knowing it exists if Phase 2 auth gets stuck.

**Typst tooling**: shelling out to the official `typst` CLI (`brew install typst`, or a static release binary in Docker) is the simplest, fastest path — no meaningful downside vs. embedding it as a library for a project this size. Compiles run in ~200–400ms even via subprocess. Docker gotcha to remember for deploy: fonts must be explicitly bundled/pathed (`--font-path` / `TYPST_FONT_PATHS`) since containers don't have system fonts.

Full plan document (analysis, requirements, both system-design diagrams, folder structure) lives at `/Users/ok/.claude/plans/track-3-eager-crystal.md` on the machine this was built on — copy it into the repo if you want it versioned; it's not currently tracked in git.

## Current state: Phase 1 is implemented and verified

Repo layout:
```
doc-pdf/
├── README.md          # run instructions
├── CONTEXT.md          # this file
├── backend/            # Fastify + TS
│   ├── src/convert/blocksToTypst.ts   # our hand-rolled JSON → Typst converter
│   ├── src/convert/escapeTypst.ts     # escapes \ * _ ` # < > @ $ [ ] in literal text
│   ├── src/compile/typstCompile.ts    # per-request temp dir + `typst compile` subprocess
│   ├── src/routes/{templates,fixtures,render}.ts
│   ├── fixtures/*.json                # 3 mock documents (BlockNote-shaped)
│   └── templates/*.typ + assets/      # 3 letterhead presets: minimal, ministere, collectivite
└── frontend/            # Vite + React
    └── src/App.tsx + components/      # fixture/template pickers, live .typ editor, PDF preview
```

**Verified working** (this session):
- 5 backend unit tests pass (escaping + conversion correctness, including a test that literal `*`/`_`/`#` in document text render as plain text, not markup).
- All 9 fixture × template combinations render successfully via `POST /api/render` (checked via curl, and visually via PDF→PNG conversion — logo, header banner, pagination, bold/italic, tables, and images all render correctly).
- Full browser flow driven with Playwright: dropdowns populate from the backend, "Générer le PDF" returns a real `200 application/pdf`, the PDF loads into the preview iframe as a blob URL, and the "edit template" toggle correctly loads real `.typ` source into a textarea and regenerates from edited source.

**Not yet built** (Phase 2, per the plan):
- Self-hosted Docs + Keycloak instance.
- `/auth/login` + `/auth/callback` (OIDC Authorization Code flow via `openid-client`).
- `/api/doc/:id` — proxies to Docs' `formatted-content` endpoint with a Bearer token.
- Frontend: "paste a Docs URL/ID" input + `/d/:id` route replacing the fixture picker; the `docs.*`/`dots.*` local-hostname URL-swap demo.
- Docker packaging + deploy alongside the self-hosted Docs stack.
- Stretch/polish items (explicitly lowest priority): template gallery + default template, AI-assisted template editing, AI-generated templates from a branded PDF exemplar.

## How to run it right now

```bash
cd backend && npm install && npm run dev   # Fastify API on :4000
cd frontend && npm install && npm run dev  # Vite dev server on :5173
```
Open http://localhost:5173. Requires the `typst` CLI on `PATH` (`brew install typst`).
