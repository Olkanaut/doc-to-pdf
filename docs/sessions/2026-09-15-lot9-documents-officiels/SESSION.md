# Attestation — lot 9 : documents officiels réels (État, Ville de Paris) → fixtures Docs

## Meta

- Date : 2026-09-15
- Lot : 9 — récupération de documents officiels originaux et de logos, dépôt sur le Bureau et dans la partie test, fixtures Docs construites mot pour mot et vérifiées
- Commit début : e44f62c Commit fin : aucun (fichiers non commités)
- Statut : PARTIEL — 3 fixtures construites et vérifiées ; un bug du convertisseur (hors périmètre) fait rendre en puce toute cellule ou paragraphe commençant par « - »

## Definition de fin + preuve BRUTE

### Documents récupérés (originaux, non modifiés)

```
$ curl -sL -A "Mozilla/5.0 …" -o etat-circulaire-interieur-2024-12.pdf -w "%{http_code} %{content_type} %{size_download}\n" \
    "https://www.interieur.gouv.fr/sites/minint/files/medias/documents/2025-09/K00_20241215_INTE2411572C.pdf"
200 application/pdf 7071454
$ curl … "https://cdn.paris.fr/paris/2025/04/22/arrete_tarifaire_2025-Bkt9.pdf"     -> 200 application/pdf 221974
$ curl … "https://cdn.paris.fr/paris/2025/01/06/arrete_tarifaire_2025-Yt97.pdf"     -> 200 application/pdf 386818
$ curl … "https://www.legifrance.gouv.fr/download/pdf/circ?id=45601"                -> 403 text/html (refus des robots ; Légifrance abandonné)
$ curl … "https://www.economie.gouv.fr/files/actes-BOAC/2025-03/ECOR2505880C_0_0.pdf" -> 403
$ pdfinfo … | grep -E "^(Pages|Page size)"
etat-circulaire-interieur-2024-12.pdf          Pages: 46 Page size: 595 x 842 pts (A4)
paris-arrete-tarifaire-2025-04.pdf             Pages: 5  Page size: 595.32 x 841.92 pts (A4)
paris-arrete-voirie-2025-01.pdf                Pages: 13 Page size: 595.32 x 841.92 pts (A4)
$ pdfseparate -f 1 -l 4 … && pdfunite … etat-circulaire-interieur-2024-12-extrait-p1-4.pdf ; pdfinfo | grep Pages
Pages:           4
```

Logos (PNG 1280 px rendus depuis les SVG de Wikimedia Commons) :

```
RF    200 image/png 68324   logo-republique-francaise.png PNG image data, 1280 x 1038
Paris 200 image/png 77119   logo-ville-de-paris.png       PNG image data, 1280 x 1296
licence Commons : RF = CC BY-SA 4.0 (rendu SVG) ; Paris = PD-shape. Marques officielles : usage de test seulement.
```

Dépôts :

```
~/Desktop/dots-documents-officiels/   4 PDF + 2 PNG
backend/templates/assets/             + logo-republique-francaise.png, logo-ville-de-paris.png
$ curl -s http://localhost:4000/api/templates/assets
{"assets":[{"file":"logo-collectivite.png"},{"file":"logo-ministere.png"},{"file":"logo-republique-francaise.png"},{"file":"logo-ville-de-paris.png"}]}
backend/fixtures/pdf/                 extrait p1-4 (98 917 o), arrêté redevances (221 974 o), arrêté voirie (386 818 o)
$ curl -s http://localhost:4000/api/fixtures | … -> 11 fixtures ; dossier pdf/ ignoré par listFixtures (filtre .json)
```

### Fixtures Docs (construites par 3 agents, vérifiées par 3 agents adversaires, 1 correction + re-vérification)

### reel-etat-circulaire-interieur

- Fichier : `backend/fixtures/reel-etat-circulaire-interieur.json` — 73 blocs, 0 tableau(x), rendu 4 page(s) avec le template `ministere`, HTTP 200, blocs ignorés `{}`
- Périmètre / omis : Seules les pages 1-4 de la circulaire INTE2411572C (46 pages) sont reprises : les pages 5-46 (suite de l'annexe 1 à partir du 1.7, annexes 2 à 4, modèles) ne sont pas dans la fixture. Le dernier paragraphe (1.7 Duplicata) est coupé en fin de page 4 dans la source et reste coupé verbatim dans la fixture (« … copie de procès-verbaux, »), sans complétion. Non reproductibles dans le format de blocs, donc absents : filets horizontaux sous l'en-tête, centrage du titre et des destinataires, alignement à droite du bloc de signature, soulignement des sous-titres (rendus en titres), exposants « 3e / 2e
- Vérification adversaire : ok=True — 2 constat(s) : mineur, mineur

Preuves brutes (construction) :

```
$ python3 -c "import json;json.load(open('/Users/abel/Documents/doc-to-pdf/backend/fixtures/reel-etat-circulaire-interieur.json'));print('JSON OK')"
JSON OK
$ curl -s -D - -o reel-etat-circulaire-interieur.pdf -H "Content-Type: application/json" -d '{"fixtureId":"reel-etat-circulaire-interieur","templateId":"ministere"}' http://localhost:4000/api/render | grep -iE "^HTTP|x-dots|content-type"
HTTP/1.1 200 OK
x-dots-block-count: 73
x-dots-unsupported-blocks: {}
$ pdfinfo reel-etat-circulaire-interieur.pdf | grep Pages
Pages:           4
$ pdftotext reel-etat-circulaire-interieur.pdf reel-etat-circulaire-interieur.txt ; tr '\n\f' '  ' | sed 's/  */ /g' > …-1ligne.txt ; 5 phrases tirées au hasard (random.seed(42) sur 40 phrases >= 60 car. de etat-extrait.txt) ; grep -c -F par phrase :
[1] grep -c => 1 : Pour le ministre et par délégation : Le sous-directeur des services d’incendie et des acteurs du secours, B.
[2] grep -c => 1 : Titre II bis du livre VII (partie réglementaire) du code de la sécurité intérieure
[3] grep -c => 1 : Les certificats et attestations sont obligatoirement délivrés aux candidats dans les six mois après le dernier jour de la formation.
[4] grep -c => 1 : 726-8 du code de la sécurité intérieure, entérine l’avis de l’équipe pédagogique et permet la délivrance des certificats ou des attestations.
[5] grep -c => 1 : La signature de l’autorité habilitée, ou de son délégué suivant les dispositions de l’article R.
```

Preuves brutes (vérification) :

```
$ pdfinfo etat-circulaire-interieur-2024-12.pdf | grep Pages ; pdftotext -layout -f 1 -l 4 <full>.pdf - | diff - etat-extrait.txt && echo OK
Pages: 46
types: {'paragraph': 34, 'heading': 9, 'bulletListItem': 30} total: 73
issues: []
mots source: 1325 mots fixture: 1325
lignes source non retrouvées telles quelles dans la fixture: 0
$ curl -s -D - -o verif-etat.pdf -H "Content-Type: application/json" -d '{"fixtureId":"reel-etat-circulaire-interieutemplateplateId":"ministere"}' http://localhost:4000/api/render | grep -iE "^HTTP|x-dots|content-type"
HTTP/1.1 200 OK
x-dots-block-count: 73
x-dots-unsupported-blocks: {}
$ pdfinfo verif-etat.pdf | grep Pages
Pages: 4
mots source 1325 mots rendu 1349
```

### reel-paris-arrete-redevances

- Fichier : `backend/fixtures/reel-paris-arrete-redevances.json` — 102 blocs, 2 tableau(x), rendu 6 page(s) avec le gabarit `ministere`, HTTP 200, blocs ignorés `{}`
- Périmètre / omis : Logo « Ville de Paris » en tête de page 1 (image, type non autorisé). Pied de page « Date de mise en ligne : le 17 avril 2025 » répété sur les 5 pages du source : conservé une seule fois, en dernier paragraphe. Mise en forme non représentable en blocs : encadré et centrage du titre, centrage de « La Maire de Paris, » et du bloc signature, soulignement de « ARRETE » (rendu en heading 2), centrage des cellules (déclaré textAlignment "center" dans le JSON, mais le convertisseur branché dans blocksToTypst.ts l.73-80 ignore les props de cellule). Ajout demandé par la consigne et absent du source :
- Vérification adversaire : ok=True — 3 constat(s) : mineur, mineur, mineur

Preuves brutes (construction) :

```
$ python3 -c "import json;json.load(open('.../reel-paris-arrete-redevances.json'));print('JSON OK')"
JSON OK
$ curl -s -D - -o reel-paris-arrete-redevances.pdf -X POST http://localhost:4000/api/render -d '{"fixtureId":"reel-paris-arrete-redevances","templateId":"ministere"}' | grep -i -E "^HTTP|x-dots"
HTTP/1.1 200 OK
x-dots-block-count: 102
x-dots-unsupported-blocks: {}
$ pdfinfo reel-paris-arrete-redevances.pdf | grep Pages
Pages:           6
$ pdftotext reel-paris-arrete-redevances.pdf rendu.txt ; tr '\n' ' ' < rendu.txt | tr -s ' ' > rendu-1ligne.txt ; grep -c -F "<phrase>" rendu-1ligne.txt
$ grep -c "Date de mise en ligne" reel-paris-arrete-redevances.json
```

template
Preuves brutes (vérification) :

```
$ curl -s -D - -o verif-paris.pdf -X POST http://localhost:4000/api/render -H 'Content-Type: application/json' -d '{"fixtureId":"reel-paris-arrete-redevances","templateId":"ministere"}' | grep -iE "^HTTP|x-dots"
HTTP/1.1 200 OK
x-dots-block-count: 102
x-dots-unsupported-blocks: {}
$ pdfinfo verif-paris.pdf | grep Pages → Pages: 6 ; source : Pages: 5
4. PÉRIMÈTRE : pdfimages -list → 1 seule image (logo p.1, 154x112) → déclarée. Source 5 pages, pied « Date de mise en ligne » ×5 (grep source = 5) → fixture 1 (grep -c = 1), déclaré. pdftotext brut vs -layout : seul écart « au-dessus » (césure traitée). Non déclaré (mineur) : graisse ajoutée sur blocs 1-2, graisse perdue sur « La Maire de Paris, », et l'affirmation « Article N gras absent du source » est fausse (pdftohtml p.5 : <b>Article 15 </b>). Aucun fichier modifié, aucune commande git, backend non redémarré.
```

### reel-paris-arrete-voirie

- Fichier : `backend/fixtures/reel-paris-arrete-voirie.json` — 134 blocs, 4 tableau(x), rendu 22 page(s) avec le gabarit `ministere`, HTTP 200, blocs ignorés `{}`
- Périmètre / omis : Aucun texte omis : les 13 pages sont reprises (arrêté p.1-2, annexe p.3-5, tableaux A/B1/B2 p.6-7, prescriptions p.8-10, tableau C p.11-13, 63 lignes). Non repris, hors texte : le logo « VILLE DE PARIS » (image ; rendu par un paragraphe court en gras « VILLE DE PARIS »), les numéros de page, le soulignement des intertitres (pas de style underline dans TextStyles : rendu en gras), les exposants (« 1er », « m² » gardés tels qu'extraits ; l'appel de note « commerces1 » rendu « commerces¹ » avec la note en paragraphe « ¹ Délibération 2008 DU-23… »). Fusions de cellules des en-têtes de tableau (CATtemplate
- Vérification adversaire : ok=False — 6 constat(s) : important, mineur, mineur, mineur, mineur, mineur
- Re-vérification après correction : ok=True — important : backend/src/convert/escapeTypst.ts l.7 (hors périmètre de l'agent fixt, mineur : frontend/e2e/\*.spec.ts (6 fichiers, mtime 17:27:56), frontend/src/page, mineur : docs/sessions/ — SESSION.md

Preuves brutes (construction) :

```
$ python3 -c "import json;json.load(open('.../reel-paris-arrete-voirie.json'))" -> OK reel-paris-arrete-voirie 134 blocks
$ curl -s -D - -o reel-paris-arrete-voirie.pdf -d '{"fixtureId":"reel-paris-arrete-voirie","templateId":"ministere"}' /api/render ->
HTTP/1.1 200 OK / content-type: application/pdf / x-dots-block-count: 134 / x-dots-unsupported-blocks: {}
$ pdfinfo reel-paris-arrete-voirie.pdf | grep Pages -> Pages: 22
$ contrôle verbatim (tr '\n' ' ' < pdftotext(rendu) | grep -c) :
3. Contournement dans la fixture : 30 cellules de la colonne Désignation commencent par « - » ; escapeTypst.ts l.7 n'échappe pas le tiret, et Typst rend « [- x] » en puce « • » (testé : t.typ -> « • dans le tiers du trottoir »). J'ai préfixé ces 30 ctemplate d'un U+200B (espace sans chasse) : rendu « - dans le tiers du trottoir » intact, grep -c U+200B rendu 30 / fixture 30. À retirer si le convertisseur échappe un jour le tiret initial. Un doc Docs réel aurait le même problème.
```

Preuves brutes (vérification) :

```
RENDU : $ curl -s -D - -o verif-voirie/rendu.pdf -d '{"fixtureId":"reel-paris-arrete-voirie","templateId":"ministere"}' http://localhost:4000/api/render → HTTP/1.1 200 OK / content-type: application/pdf / x-dots-block-count: 134 / x-dots-unsupported-blocks: {} ; $ pdfinfo → Pages: 22, A4 ; GET /api/fixtures → [{'id': 'reel-paris-arrete-voirie', 'name': 'Arrêté droits de voirie 2025 — Ville de Paris (janvier 2025)'}] ; pdfinfo source → Pages: 13. Texte rendu : ZW 30, puces « • » 27 (toutes hors tableaux, l.79-700), « 1 029,21 € » 2, « 1 851,13 € » 2, « 2 657,41 € » 2, « 28,85 € » 1, « 11,54 € » 1, « Ariane BOULEAU » 1, « *MP : Minimum de perception » 3, « RÉPUBLIQUE » 22 (gabarit). rendu-layout.txt l.580 : « 410 ​- dans le id. 84,64 € 63,18 € 40,49 € 22,68 € 15,97 € 72,95 € » (tiret intact). Test Typst : #table(columns:2,[410],[- dans…],[411],[\\- au-delà],[413],[U+200B- dans…]) → « 410 • dans le tiers du trottoir / 411 - au-delà / 413 ​- dans les voies ». Aperçus lus : rendu p.1 (VILLE DE PARIS, h1, visas, ARRÊTE, Art.1-4 gras, signature), source p.1 (logo, titre centré, mêmes visas, Art.1-3, pied « Date de mise en ligne »), source p.2 (Art.4 + signature, pas d'image), rendu p.4 (tableau A correct), rendu p.11 (en-tête C orphelin, chevauchement Désignation/Mode, Minimum perception déborde), rendu p.12 (lignes 400-TEP correctes, tirets intacts), source p.11 (même contenu), rendu p.22 (« Démonstrations » chevauche « Par 2m »). Code lu : escapeTypst.ts l.7 SPECIAL_CHARS = /[\\\\*_`#<>@$\\[\\]]/g (pas de « - ») ; blocksToTypst.ts l.73-80 case "table" columns = rows[0]?.cells.length, flatMap cells ; grep tableToTypst hors de lui-même → seulement layout/layoutTypst.test.ts:304 (commentaire). PÉRIMÈTRE : 13 pages source toutes couvertes (diff prose + tableaux) ; omissions réelles = logo, numéros de page, soulignés, exposants, fusions d'en-tête — toutes dans « omitted ». Aucun fichier du projet modifié (git status : fixture toujours « ?? », untouched) ; fichiers de vérification uniquement dans scratchpad/officiels/verif-voirie/.
```

## Ecarts rencontres

- Légifrance et economie.gouv.fr refusent les téléchargements automatisés (403) : la circulaire vient du site du ministère de l'Intérieur.
- Le PDF complet de la circulaire (7,07 Mo, 8,99 Mo en base64) dépasse la limite de 6 Mo de l'onglet « Depuis un PDF » : extrait de 4 pages produit pour cet usage.
- Contournement rejeté : l'agent constructeur de l'arrêté voirie avait inséré un U+200B devant 30 cellules commençant par « - » pour éviter la puce Typst ; retiré (texte verbatim), donc ces 30 cellules sortent en puce « • ». Cause confirmée en exécution avec typst 0.15.1 : `[- dans le tiers]` → « • dans le tiers », `[\- au-delà]` → « - au-delà ». Bug du convertisseur : `backend/src/convert/escapeTypst.ts` l.7, SPECIAL_CHARS n'échappe pas `-`, `+`, `=`, `/` en début de contenu. Fichier d'un coéquipier, non corrigé.
- Mise en forme absente du format de blocs (filets, centrage, soulignement, exposants, logo image) : rendue en gras/titres ou gardée en texte plain, déclarée par les agents.
- Le convertisseur actuel (non branché sur tableToTypst) rend les tableaux des deux arrêtés parisiens avec le décalage connu des cellules.

## Decision / choix

LAISSER OUVERT. À trancher par l'humain : commit des trois fixtures `reel-*` (public, pas de donnée client) ; correction de l'échappement des débuts de ligne dans escapeTypst.ts (une ligne, fichier d'un coéquipier) ; `#set table` par défaut dans les gabarits de semis ; commit de CLAUDE.md / SUBJECT.md.

## Confidentialite

Documents administratifs publics (actes réglementaires de l'État et de la Ville de Paris, diffusés par leurs éditeurs). Aucune donnée client, aucune donnée personnelle au-delà des signataires publics des actes. Les fixtures `reel-roadmap.json` et `reel-shipped2026.json` (documents de l'équipe) n'ont pas été relues ni commitées.
