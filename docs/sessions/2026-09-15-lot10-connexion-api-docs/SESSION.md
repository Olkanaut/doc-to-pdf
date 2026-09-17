# Attestation — lot 10 : connexion à l'API de Docs (document Docs → PDF)

## Meta

- Date : 2026-09-15
- Lot : 10 — lire un document Docs par son identifiant et le rendre avec un template ; même chemin d'URL que Docs (`/docs/<id>/`) ; gabarits à logos officiels ; jeu d'exemples complet
- Commit début : e44f62c Commit fin : (commit de ce lot, voir git log de la branche `ui-kit-docs-api`)
- Statut : TERMINE pour le périmètre ci-dessous ; images des documents Docs refusées proprement (422), non prises en charge

## Definition de fin + preuve BRUTE

### Contrat

- `GET /api/docs/:id` → 200 `{ id, name, blocks, blockCount }` ; 400 uuid invalide ; 403 non accessible ; 404 introuvable ; 422 sans contenu ; 502 Docs injoignable. Cookie `docs_sessionid` du navigateur relayé seul.
- `POST /api/render { docId | fixtureId, templateId?, templateSource? }`, mêmes en-têtes `X-Dots-*`.
- Source Docs : `${DOCS_API_URL}/api/v1.0/documents/<id>/formatted-content/?content_format=json` (blocs BlockNote, anonyme si lien public). Aucune dépendance ajoutée.
- Frontend : champ URL Docs → `fetchDocsDocument`, page Rendu sur `docId`, `?doc=<uuid>`, routes `/docs/:id` et `/d/:id` → `/documents/new?doc=<id>`.

### Preuves (vérificateur adversaire, passe 2, ok=true ; sorties brutes)

```
$ cd backend && npx tsc --noEmit -p . ; echo TSC_EXIT=$?
TSC_EXIT=0
$ npx vitest run --root .
 ✓ src/docs/client.test.ts (16 tests)
 Test Files  5 passed (5)
      Tests  94 passed (94)
$ cd frontend && npx tsc --noEmit -p tsconfig.app.json ; echo FRONT_TSC_EXIT=$?
FRONT_TSC_EXIT=0
$ E2E_BASE_URL=http://localhost:5175 E2E_API_URL=http://localhost:4001/api \
  E2E_DOCS_URL=http://localhost:3011/docs/22ae79e0-1210-4c2e-9969-7f7f7c6466a0/ npx playwright test
Running 25 tests using 1 worker
  25 passed (28.4s)
$ curl -s -D - http://localhost:4001/api/docs/22ae79e0-1210-4c2e-9969-7f7f7c6466a0 | head -c 200
HTTP/1.1 200 OK
content-type: application/json; charset=utf-8
{"id":"22ae79e0-1210-4c2e-9969-7f7f7c6466a0","name":"Note de service — test dots","blocks":[{"id":"5f845190-…
$ curl -s http://localhost:4001/api/docs/00000000-0000-4000-8000-000000000000
{"error":"Document introuvable dans Docs."}                     (HTTP 404)
$ curl -s http://localhost:4001/api/docs/pas-un-uuid
{"error":"Identifiant de document invalide : un uuid Docs est attendu."}   (HTTP 400)
$ curl -s -D - -o render-doc.pdf -X POST http://localhost:4001/api/render -H 'content-type: application/json' \
  -d '{"docId":"22ae79e0-1210-4c2e-9969-7f7f7c6466a0","templateId":"ministere"}'
HTTP/1.1 200 OK
content-type: application/pdf
x-dots-block-count: 11
x-dots-unsupported-blocks: {}
$ pdftotext -layout render-doc.pdf - | head
RÉPUBLIQUE FRANÇAISE / Ministère de l’Exemple / Note de service — test dots / … Direction Titulaires Contractuels / Numérique 48 23 / Ressources humaines 36 4
Document privé (create-for-owner, 201 id 10077f90-…) : Docs brut anonyme → 401 ; GET :4001/api/docs/10077f90-… → 403
{"error":"Document non accessible : connectez-vous à Docs dans ce navigateur ou rendez son lien public."}
Cookie (faux Docs, fetch natif) : "docs_sessionid=abc; autre=1; csrftoken=zzz" ⇒ Docs reçoit "docs_sessionid=abc" ; sans docs_sessionid ⇒ aucun en-tête cookie.
Journaux pino niveau trace, 3 requêtes avec cookie → « cookie dans les journaux ? false ».
Docs 500 HTML → 502 "Docs injoignable (… : HTTP 500)" ; 200 HTML → 502 "(… : réponse non JSON)" ; aucun <html|DOCTYPE|SECRET dans les corps.
Capture :5175/documents/new?doc=22ae79e0-… regardée : h1 « Note de service — test dots », « Document Docs · 11 blocs », tuile Ministère cochée, aperçu chargé.
```

### Écart important trouvé en passe 1, corrigé, re-vérifié

Bloc `image` d'un document Docs → 500 ENOENT avec chemins du serveur dans la réponse (render.ts résolvait l'URL http contre FIXTURES_DIR). Correctif render.ts : document Docs avec image, ou `src` en http(s) → 422 `{"error":"Les images des documents Docs ne sont pas encore prises en charge."}` avant compilation ; test Fastify inject ajouté (3 URL dont `../.env`).

```template
[bloc image] POST /api/render -> 500 … ENOENT … copyfile '/Users/abel/Documents/doc-to-pdf/backend/fixtures/http:/localhost:8071/media/abc/photo.png'   (AVANT)
[bloc image] POST /api/render -> 422 {"error":"Les images des documents Docs ne sont pas encore prises en charge."}   (APRÈS)
```

### Gabarits à logos officiels et jeu d'exemples

- `backend/templates/republique-francaise.typ` (bloc Marianne, `logo-republique-francaise.png`) et `ville-de-paris.typ` (logo centré), semis ajoutés dans `registry/templates.ts` ; créés dans les données de travail via `POST /api/templates` → 201, 201.
- `~/Desktop/dots-exemples/` : 9 documents × (pdf, officiel.pdf, docs-blocks.json, md, docs-formatted-content.json, docs-content.yjs.b64) + README + PARCOURS ; 10 documents créés dans le Docs local (`create-for-owner`, lien public, `publics: 9` + document de test), rôle propriétaire donné à `impress@impress.world` (`accès propriétaire ajoutés : 10 / 10`). Rendus : 9 × HTTP 200, blocs ignorés `{}`.
- `DOTS_DATA_DIR` (registry) et `DOTS_API_PROXY` (vite.config) pour un second couple frontend/backend isolé (:5175/:4001) sans toucher aux données de travail.template

## Ecarts rencontres

- Le serveur Vite :5173 lancé avant `npm install` du kit servait `index.css` en 500 (page blanche) ; redémarré → 200. Cause : cache de résolution des dépendances.template
- `tsx watch` recharge les deux backends à chaque écriture sous `backend/src` (attendu).
- Relais d'une vraie session Docs vers un document privé : prouvé au niveau backend avec un faux Docs et le fetch natif, pas de bout en bout avec une session réelle (le vérificateur n'a pas voulu forger une session admin).
- Mineurs laissés ouverts (vérificateur) : corps JSON `null` en 200 → 500 au lieu de 502 ; le 502 expose `DOCS_API_URL` ; test 502 attend un `ECONNREFUSED` que le fetch réel ne produit pas ; `docId` valide + gabarit inconnu appelle Docs avant le 404 ; `?doc=<non-uuid>` ignoré en silence ; pas de cache : un appel Docs par rendu (quota Docs 80/min).
- Non fait : images des documents Docs ; lien « Voir dans Docs » ; ProConnect / Resource Server (branche d'Ismaël) pour les documents privés entre hôtes distincts.

## Decision / choix

LAISSER OUVERT. À trancher : prise en charge des images Docs (téléchargement avec session) ; cache court des documents Docs ; masquer `DOCS_API_URL` dans le 502 ; réordonner gabarit puis Docs dans `/api/render` ; nettoyage des 4 gabarits « Nouveau gabarit » et des 10 documents de test dans le Docs local.

## Confidentialite

Documents de test : synthétiques (Ministère de l'Exemple, Exempleville) ou actes publics ; document Docs de test créé pour l'occasion. Aucune donnée client. Le cookie de session n'est ni journalisé ni renvoyé.
