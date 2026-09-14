# Un doc, un PDF

Hackathon mini-app (La Suite numérique — Track 3): pick a Typst letterhead template, pick a document (mock blocks for now), and get a polished PDF in under a second.

Phase 1 (this codebase, as it stands): runs entirely on localhost with mock/fixture documents, no external API, no auth. See `/Users/ok/.claude/plans/track-3-eager-crystal.md` for the full plan (Phase 2: real Docs API integration + deploy).

> **Mise en place complète (Docs en local + ce mini-site) : [SETUP-LOCAL.md](SETUP-LOCAL.md).**
> `./dev/setup-local.sh` fait tout et vérifie derrière. Le guide documente les deux
> pièges qui bloquent à coup sûr : le backend de Docs ne compile pas tel quel, et Docs
> occupe le port 4000 — celui de notre backend.

## Requirements

- Node.js 20+
- [`typst`](https://typst.app) CLI on `PATH` (`brew install typst`)
- Docker Desktop, pour l'instance Docs locale — voir [SETUP-LOCAL.md](SETUP-LOCAL.md)


**##Subject :**
Track 1. One doc, one PDF

English translation of the La Suite Numérique × 42 Challenge subject, full version received on 14/09/2026. Original French in sujet-piste-1.md.

A civil servant finishes a note in Docs. They need a good-looking PDF with their administration's letterhead and page numbers, not the browser's raw export. Today, they open Word/LibreOffice and retype everything. We can spare them that.

The idea: a companion mini-app. Let's host it at dots.numerique.gouv.fr, so that only one character differs from docs. Everyone uploads their own Typst templates there: margins, header, typography, page numbering. Typst is built for this and compiles a PDF in a fraction of a second.

Note that the BlockNote PDF export module used by Docs is now Typst-based. We should be able to inject templates into it: https://www.blocknotejs.org/docs/features/export/pdf#pdf-export.

docs.numerique.gouv.fr/d/7f3a2b → dots.numerique.gouv.fr/d/7f3a2b (the "c" becomes a "t")

How it works, step by step
Create a template: On the mini-site, you write (or import) a Typst file that defines what a "clean" PDF should look like: margins, font, header with the right logo, footer, numbering. You do it once and reuse it for all your documents afterwards. It could be worthwhile to let the user:
get help from AI by giving prompt instructions to modify their template and immediately preview the result applied to their document. Docs already has an AI assistant we can take inspiration from.
provide a branded PDF document and have the AI write the Typst code for the template, taking Docs' constraints into account.
choose a predefined template.
set a default template.
Write normally in Docs: Nothing changes in your habits: you write your note on docs.numerique.gouv.fr as usual, alone or with others.
Change one letter in the URL: When it's time to publish, you edit the address bar: the "c" in docs becomes a "t", docs. becomes dots.. The document identifier itself doesn't move.
The mini-site fetches the content: It receives the identifier, verifies identity through ProConnect (existing professional session, no new password), then queries Docs' Resource Server API to retrieve the document in structured form. The blocks themselves, not a raw HTML export. This also works on a restricted-access document, since authorization is checked on every call, and nothing is ever copied anywhere except for the duration of the rendering.
Typst compiles, you get the PDF: The chosen template is applied to the retrieved content, Typst compiles, and the laid-out PDF is displayed, ready to be signed, printed or sent.
What if you don't have the reflex?

The whole demo rests on this one-letter gesture, but you have to know it first. Anyone visiting dots.numerique.gouv.fr directly, without coming from a doc, is offered a field where they can paste the URL of the Docs document to lay out. Same result as the changed-character trick... which is only a shortcut for those who already know it, not the only way in.

And if the pasted document (or the one targeted by the modified URL) is private, the mini-site doesn't fetch it blindly: it first redirects to ProConnect to open a session, if one isn't already open. Once logged in, the Resource Server API only returns what the user is allowed to see, whether they arrived via the changed letter or a simple copy-paste.

Why this track wins
Wow effect: You type one letter, a styled PDF appears. Three seconds to film, zero explanation needed for the jury.
Real need: Layout that meets standards (ministerial letterheads, local-authority style guides) without going back through Word.
Fits in 48h: One template plus one route that calls the API and Typst are enough from day one. The rest is polish.


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
