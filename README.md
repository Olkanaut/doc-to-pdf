# Un doc, un PDF

Hackathon mini-app (La Suite numérique — Track 3): pick a Typst letterhead template, pick a document (mock blocks for now), and get a polished PDF in under a second.

Phase 1 (this codebase, as it stands): runs entirely on localhost with mock/fixture documents, no external API, no auth. See `/Users/ok/.claude/plans/track-3-eager-crystal.md` for the full plan (Phase 2: real Docs API integration + deploy).

## Requirements

- Node.js 20+
- [`typst`](https://typst.app) CLI on `PATH` (`brew install typst`)

## Run it

```bash
# terminal 1
cd backend && npm install && npm run dev   # Fastify API on :4000

# terminal 2
cd frontend && npm install && npm run dev  # Vite dev server on :5173, proxies /api to :4000
```

Open http://localhost:5173, pick a fixture and a template, click "Générer le PDF".

## Layout

- `backend/src/convert/blocksToTypst.ts` — our own BlockNote-shaped JSON → Typst markup converter (with escaping, see `escapeTypst.ts`).
- `backend/src/compile/typstCompile.ts` — shells out to `typst compile` in a per-request temp dir.
- `backend/templates/*.typ` — the letterhead presets (margins, logo, header/footer, pagination).
- `backend/fixtures/*.json` — mock documents standing in for real Docs content.
- `frontend/src/App.tsx` — picker UI + PDF preview.

## Tests

```bash
cd backend && npm test
```
