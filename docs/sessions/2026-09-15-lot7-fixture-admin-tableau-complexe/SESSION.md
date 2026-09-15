# Attestation de session — fixture `admin-tableau-complexe` (T1, preuve « avant »)

## Meta
- Date : 2026-09-15
- Lot : 7 (numéro déduit : lot 6 note « Tableaux […] Non traité dans ce lot », `docs/sessions/2026-09-15-lot6-ecrans-1-5/SESSION.md:126`). Sous-agent d'orchestration, chantier T1.
- Scope : `backend/fixtures/admin-tableau-complexe.json` uniquement. Aucun fichier `.ts` touché ; `blocksToTypst.ts`, `escapeTypst.ts`, `types/blocks.ts` lus seulement.
- Commit début : 3566983c5a15cb08524648973df0cec082703369   Commit fin : 3566983c5a15cb08524648973df0cec082703369 (aucun commit, arbre de travail seulement)
- Branche : template-editor
- Statut : TERMINE

Écart à signaler d'entrée : le fichier `backend/fixtures/admin-tableau-complexe.json` était DÉJÀ présent dans l'arbre au démarrage de cette session (non suivi par git, horodaté 15:51, 38 555 octets, md5 `0f6d0b08659816ee3d2c0626d04c3ea7`), vraisemblablement produit par une exécution antérieure du même chantier interrompue avant rapport. Il a été relu champ par champ contre la spécification (voir § 1) et n'a PAS été modifié. Les preuves ci-dessous sont des exécutions de cette session (16:15).

## Definition de fin + preuve BRUTE

### 1. Conformité du contenu à la spécification (lu dans le fichier, dump exécuté)

```
$ python3 (dump des tables : props signalées entre accolades)
=== block 4: keys=['id', 'type', 'props', 'content', 'children'] props={'textColor': 'default'} ctype=tableContent cw=[180, 90, 90, 90, None] hr=1
  row0 (5 cells): 'Direction' [tableCell] | 'Titulaires' [tableCell] {al=right} | 'Contractuels' [tableCell] {al=right} | 'Total' [tableCell] {al=right} | 'Observations' [tableCell]
  row1 (5 cells): 'Direction du numérique' [tableCell] | '48' [tableCell] {al=right} | '23' [tableCell] {al=right} | '71' [tableCell] {al=right} | 'Renfort de 5 contractuels prévu au T4 2026' [tableCell]
  row2 (5 cells): 'Direction des ressources humaines' [tableCell] | '36' [tableCell] {al=right} | '4' [tableCell] {al=right} | '40' [tableCell] {al=right} | '' [tableCell]
  row3 (5 cells): 'Direction des affaires financières' [tableCell] | '29' [tableCell] {al=right} | '6' [tableCell] {al=right} | '35' [tableCell] {al=right} | 'Masse salariale : 2 450 000 € (+3,2 %)' [tableCell]
  row4 (5 cells): 'Direction des affaires juridiques' [tableCell] | '18' [tableCell] {al=right} | '2' [tableCell] {al=right} | '20' [tableCell] {al=right} | 'Effectif stable depuis 2024' [tableCell]
  row5 (5 cells): 'Secrétariat général' [tableCell] | '52' [tableCell] {al=right} | '9' [tableCell] {al=right} | '61' [tableCell] {al=right} | 'Réorganisation en cours ; chiffres provisoires au 30 juin 2026' [tableCell] {bg=yellow}
  row6 (5 cells): 'Délégation à la communication' [tableCell] | '11' [tableCell] {al=right} | '7' [tableCell] {al=right} | '18' [tableCell] {al=right} | 'Taux de contractuels de 38,9 %, au-dessus du plafond de 30 %' [tableCell] {tc=red}
  row7 (3 cells): 'Total général' [tableCell] {colspan=3,bg=gray,al=right} | '245' [tableCell] {bg=gray,al=right} | 'Soit 20,8 % de contractuels (51 sur 245)' [tableCell]
=== block 7: keys=['id', 'type', 'props', 'content', 'children'] props={'textColor': 'default'} ctype=tableContent cw=[110, None, 200, 90] hr=1
  row0 (4 cells): 'Trimestre' [tableCell] {bg=blue} | 'Jalon' [tableCell] {bg=blue} | 'Responsable' [tableCell] {bg=blue} | 'État' [tableCell] {bg=blue}
  row1 (4 cells): 'T1 2026' [tableCell] | 'Cadrage et étude d’impact' [tableCell] | 'Direction du numérique' [tableCell] | 'Terminé' [tableCell]
  row2 (4 cells): 'T2 2026' [tableCell] | 'Développement du socle applicatif' [tableCell] | 'Prestataire (marché n° 2026-07)' [tableCell] | 'Terminé' [tableCell]
  row3 (4 cells): 'T3 2026' [tableCell] | 'Reprise des données et interfaces' [tableCell] | 'Direction des affaires financières' [tableCell] | 'En cours' [tableCell]
  row4 (3 cells): 'T4 2026' [tableCell] {rowspan=2} | 'Recette et mise en production' [tableCell] {colspan=2} | 'Prévu' [tableCell]
  row5 (3 cells): 'Formation des agents (1 200 personnes)' [tableCell] | 'Direction des ressources humaines' [tableCell] | 'Prévu' [tableCell]
=== block 10: keys=['type', 'content'] props=None ctype=None cw=None hr=None
  row0 (3 cells): 'Site' styles=[{'bold': True}] | 'Agents' styles=[{'bold': True}] | 'Postes de travail' styles=[{'bold': True}]
  row1 (3 cells): 'Exempleville (siège)' | '200' | '215'
  row2 (3 cells): 'Annexe Nord' | '45' | '50'
```

Correspondance spec → fichier : id/name ✓ ; titre niveau 1 (bloc 0) + paragraphe d'intro (bloc 1) ✓ ; tableau 1 : 5 colonnes, `columnWidths [180,90,90,90,null]`, `headerRows 1`, 6 lignes de données, ligne « Total général » colspan 3 / droite / gray, nombres à droite, une observation bg yellow (row5), une textColor red (row6) ✓ ; tableau 2 : 4 colonnes, `headerRows 1`, rowspan 2 « T4 2026 », colspan 2 « Recette et mise en production », en-têtes bg blue, cellules couvertes absentes (rows 4 et 5 : 3 cellules) ✓ ; tableau 3 : 3×3 forme simplifiée sans `type` ni `props` ✓ ; conclusion + signature (blocs 11-15) ✓.

```
$ grep -oE '[0-9 ]+ €|[0-9,]+ %' backend/fixtures/admin-tableau-complexe.json | sort -u
 1 250 000 €
 2 450 000 €
20,8 %
3,2 %
30 %
38,9 %
```

### 2. JSON valide

```
$ node -e 'const f=require("./backend/fixtures/admin-tableau-complexe.json"); console.log("id:",f.id,"| name:",f.name,"| blocks:",f.blocks.length)'
id: admin-tableau-complexe | name: Exemple — Tableaux : effectifs et planning | blocks: 16
$ python3 -m json.tool backend/fixtures/admin-tableau-complexe.json > /dev/null && echo "OK json.tool"
OK json.tool
```

### 3. Compilation et tests backend (rien de `.ts` modifié ; contrôle demandé)

```
$ cd backend && npx tsc --noEmit -p tsconfig.json; echo "tsc exit=$?"
tsc exit=0
$ npm test
 RUN  v2.1.9 /Users/abel/Documents/doc-to-pdf/backend
 ✓ src/ai/parse.test.ts (5 tests) 4ms
 ✓ src/convert/blocksToTypst.test.ts (9 tests) 6ms
 ✓ src/convert/tableToTypst.test.ts (28 tests) 846ms
 ✓ src/layout/layoutTypst.test.ts (30 tests) 2467ms
 Test Files  4 passed (4)
      Tests  72 passed (72)
npm test exit=0
```
(`tableToTypst.test.ts` est le chantier parallèle T2, non branché : ses 28 tests passent, mais `blocksToTypst.ts` ne l'appelle pas — `grep -n table blocksToTypst.ts` ne montre que le `case "table"` interne.)

### 4. Registre : GET /api/fixtures contient l'id

```
$ curl -s http://localhost:4000/api/fixtures | python3 -c "... [f for f in d if f['id']=='admin-tableau-complexe']"
[{'id': 'admin-tableau-complexe', 'name': 'Exemple — Tableaux : effectifs et planning'}]
$ curl -s http://localhost:4000/api/templates → ['collectivite', 'minimal', 'ministere']
```

### 5. Rendu : POST /api/render {fixtureId, templateId:"minimal"} → 200

```
$ curl -s -o avant.pdf -w "http=%{http_code} content-type=%{content_type} bytes=%{size_download}\n" -D headers.txt -X POST http://localhost:4000/api/render -H 'Content-Type: application/json' -d '{"fixtureId":"admin-tableau-complexe","templateId":"minimal"}'
http=200 content-type=application/pdf bytes=44138
content-type: application/pdf
x-dots-block-count: 16
x-dots-unsupported-blocks: {}
avant.pdf: PDF document, version 1.7, 2 pages
Pages:           2
Page size:       595.276 x 841.89 pts (A4)
```

### 6. Typst émis par le convertisseur ACTUEL pour les trois tableaux (exécuté via tsx sur `blocksToTypst`)

```
#table(
  columns: 5,
  [Direction], [Titulaires], [Contractuels], [Total], [Observations], [Direction du numérique], [48], [23], [71], [Renfort de 5 contractuels prévu au T4 2026], [Direction des ressources humaines], [36], [4], [40], [], [Direction des affaires financières], [29], [6], [35], [Masse salariale : 2 450 000 € (+3,2 %)], [Direction des affaires juridiques], [18], [2], [20], [Effectif stable depuis 2024], [Secrétariat général], [52], [9], [61], [Réorganisation en cours ; chiffres provisoires au 30 juin 2026], [Délégation à la communication], [11], [7], [18], [Taux de contractuels de 38,9 %, au-dessus du plafond de 30 %], [Total général], [245], [Soit 20,8 % de contractuels (51 sur 245)]
)
---
#table(
  columns: 4,
  [Trimestre], [Jalon], [Responsable], [État], [T1 2026], [Cadrage et étude d’impact], [Direction du numérique], [Terminé], [T2 2026], [Développement du socle applicatif], [Prestataire (marché n° 2026-07)], [Terminé], [T3 2026], [Reprise des données et interfaces], [Direction des affaires financières], [En cours], [T4 2026], [Recette et mise en production], [Prévu], [Formation des agents (1 200 personnes)], [Direction des ressources humaines], [Prévu]
)
---
#table(
  columns: 3,
  [*Site*], [*Agents*], [*Postes de travail*], [Exempleville (siège)], [200], [215], [Annexe Nord], [45], [50]
)
```
Aucun `columns: (…pt, auto)`, aucun `table.header`, aucun `table.cell(colspan/rowspan/fill/align)`, aucun `#text(fill:)`, aucun `stroke`/`inset` : tout ce que portent `columnWidths`, `headerRows` et `props` est perdu.

### 7. Preuve « avant » : PNG page 1 et texte en colonnes

```
$ pdftoppm -png -r 60 -f 1 -l 1 avant.pdf avant   → avant-1.png (74 882 octets), relu
$ pdftoppm -png -r 110 -f 1 -l 1 avant.pdf avant110 → avant110-1.png (182 973 octets), relu
$ pdftotext -layout -f 1 -l 1 avant.pdf -   (extrait des deux tableaux)
 Direction                    Titulaires Contractuels                 Total Observations
 Direction du numérique       48         23                           71      Renfort de 5
 …
 Délégation à la              11         7                            18      Taux de contractuels de
 communication                                                                38,9 %, au-dessus du
                                                                              plafond de 30 %
 Total général                245        Soit 20,8 % de
                                         contractuels (51 sur 245)

 Trimestre                  Jalon                    Responsable                État
 T1 2026                    Cadrage et étude         Direction du               Terminé
 …
 T4 2026                    Recette et mise en       Prévu                      Formation des agents
                            production                                          (1 200 personnes)
 Direction des              Prévu
 ressources humaines
$ pdftotext -layout -f 2 -l 2 avant.pdf -   (tableau simple)
 Site                   Agents Postes de travail
 Exempleville (siège) 200          215
 Annexe Nord            45         50
```

Description du PNG (page 1, relu à 60 et 110 dpi) :

Tableau 1 « Effectifs par direction » (grille 8 lignes × 5 colonnes, filets noirs fins uniformes) :
- Largeurs : `columnWidths [180,90,90,90,null]` ignorées. Typst dimensionne en `auto` : la colonne « Contractuels » est la plus large (élargie par « Soit 20,8 % de contractuels (51 sur 245) » qui y atterrit), « Total » est la plus étroite (~1 cm), « Direction » et « Observations » se partagent le reste.
- En-tête : même graisse et même fond que les données ; pas de `table.header` (pas de répétition en cas de saut de page).
- Nombres (48, 23, 71…) collés à GAUCHE de leur cellule alors que `textAlignment: "right"` est réglé.
- Ligne « Total général » : les 3 cellules émises à plat remplissent les colonnes 1, 2, 3 : « Total général » en col. 1 (aurait dû couvrir 1-3, aligné à droite, fond gris), « 245 » sous « Titulaires » (aurait dû être sous « Total »), « Soit 20,8 % de contractuels (51 sur 245) » sous « Contractuels » (aurait dû être sous « Observations ») ; les colonnes « Total » et « Observations » de cette ligne sont vides. Aucun fond gris.
- Observation « Réorganisation en cours… » : fond blanc (attendu jaune `#fbf3db`). Observation « Taux de contractuels de 38,9 %… » : texte noir (attendu rouge `#e03e3e`).

Tableau 2 « Planning des jalons » (grille 6 lignes × 4 colonnes, colonnes ~égales) :
- Largeurs `[110, null, 200, 90]` ignorées (4 colonnes de largeur voisine).
- En-tête : ni fond bleu (attendu `#ddebf1`), ni gras.
- Ligne « T4 2026 » (3 cellules émises) : « T4 2026 » col. 1 (ne s'étend pas sur la ligne suivante), « Recette et mise en production » col. 2 seulement (aurait dû couvrir 2-3), « Prévu » col. 3 « Responsable » (aurait dû être col. 4 « État »), puis la première cellule de la ligne suivante, « Formation des agents (1 200 personnes) », remonte en col. 4 « État » de la ligne T4.
- Ligne suivante : « Direction des ressources humaines » en col. 1 « Trimestre » (attendu col. 3), « Prévu » en col. 2 « Jalon » (attendu col. 4), colonnes 3 et 4 vides. Le décalage est d'exactement une case par cellule couverte manquante (2 cellules absentes → les 2 dernières cases de la grille sont vides).

Tableau 3 « Sites et postes de travail » (page 2) : 3×3 correct — la forme simplifiée passe, les en-têtes sont en gras uniquement parce que le style inline `bold` est porté par le texte, pas par une notion d'en-tête.

### 8. Couleurs BlockNote de référence (lues dans le conteneur Docs, @blocknote/core 0.54.0)

```
$ docker exec docs-frontend-development-1 sh -c 'cat /home/frontend/node_modules/@blocknote/core/src/editor/defaultColors.ts'
export const COLORS_DEFAULT = {
  gray:   { text: "#9b9a97", background: "#ebeced" },
  brown:  { text: "#64473a", background: "#e9e5e3" },
  red:    { text: "#e03e3e", background: "#fbe4e4" },
  orange: { text: "#d9730d", background: "#f6e9d9" },
  yellow: { text: "#dfab01", background: "#fbf3db" },
  green:  { text: "#4d6461", background: "#ddedea" },
  blue:   { text: "#0b6e99", background: "#ddebf1" },
  purple: { text: "#6940a5", background: "#eae4f2" },
  pink:   { text: "#ad1a72", background: "#f4dfeb" },
} (mise en forme condensée ; le fichier contient aussi COLORS_DARK_MODE_DEFAULT, non pertinent pour le PDF)
$ grep "\"version\"" /home/frontend/node_modules/@blocknote/core/package.json
  "version": "0.54.0",
```
La commande `grep -rhoE "(gray|…)\":\s*\{…"` proposée ne renvoie rien sur `dist/*.js` (clés non citées dans le bundle) ; `grep #ebeced` pointe `src/editor/defaultColors.ts` et `dist/style.css`.

## Ecarts rencontres
1. Le fichier livrable existait déjà avant la session (voir Meta). Relu et validé, non réécrit : aucune ligne modifiée. Preuve : `git status --short backend/fixtures/admin-tableau-complexe.json` → `?? backend/fixtures/admin-tableau-complexe.json` (non suivi), md5 `0f6d0b08659816ee3d2c0626d04c3ea7`, taille 38 555 octets, mtime 15:51 (avant le démarrage 16:15 de cette session).
2. Le numéro de lot (7) est déduit, non fourni par l'orchestrateur ; renommer le dossier si le lot réel diffère.
3. Le script de dump Typst a d'abord échoué sous tsx (`Top-level await is currently not supported with the "cjs" output format`) ; renommé en `.mts`, il a fonctionné. Script dans le scratchpad, hors dépôt.
4. `types/blocks.ts` (`TableBlock`, `TableCell`) ne décrit ni `type`, ni `columnWidths`, ni `headerRows`, ni `props` de cellule : la fixture est plus riche que le type, mais `JSON.parse(raw) as Fixture` (registry/fixtures.ts:33) ne vérifie rien, donc aucun échec. Diff proposé dans le rapport (needsElsewhere), fichier d'un coéquipier, non touché.

## Decision / choix
Tranché par Abel le 2026-09-15 (« la première s'il te plait ») : **le gabarit pilote le style des tableaux**.
Le convertisseur n'émet que la structure et les couleurs de cellules voulues dans Docs ; `stroke:` et `inset:`
retirés de l'appel `#table` (ils écrasaient le `#set table` du bloc dots:layout, section « Tableaux »).
Sans `#set table` dans le gabarit : défaut Typst (trait noir 1 pt, marge 5 pt).

Preuve, après modification :
```
$ grep -nE "STROKE|INSET|^\s*\`\s+(stroke|inset):" backend/src/convert/tableToTypst.ts
aucun
$ npx vitest run src/convert/tableToTypst.test.ts src/layout/layoutTypst.test.ts
 ✓ src/convert/tableToTypst.test.ts (32 tests) 744ms
 ✓ src/layout/layoutTypst.test.ts (30 tests) 1587ms
 Test Files  2 passed (2)
      Tests  62 passed (62)
$ npx tsc --noEmit -p .        (backend)   exit 0
$ npx tsx scratchpad/render-gabarit-pilote.ts     (fixture admin-tableau-complexe, minimal.typ)
sans-set-table: (pas de #set table)                                   -> pilote-sans-set-table.pdf 47481 octets
filets-aucun: #set table(stroke: none, inset: 6pt, fill: (x, y) => if y == 0 { luma(240) })   -> 87279 octets
filets-complets: #set table(stroke: 0.5pt + luma(120), inset: 6pt, fill: …calc.odd(y)…)        -> 91360 octets
```
Écart rencontré en chemin : le test « rowspan d'en-tête : b2 tombe sous H2 » mesure des colonnes de caractères
(`pdftotext -layout`, tolérance 2) sous la géométrie que le module imposait ; sans elle, `expected 4 to be less
than or equal to 2`. Le préambule des tests de compilation joue désormais le `#set table` du gabarit
(`TABLE_SET`, tableToTypst.test.ts). Le décalage n'a pas été reproduit isolément.

Limite vue sur les rendus : avec la police du bloc dots:layout (sans-serif gras), « Contractuels » déborde de
sa colonne Docs de 90 px ; largeurs reprises telles quelles de Docs, non corrigé.

Reste ouvert (revue humaine) : commit ; branchement de `tableToTypst` dans `blocksToTypst.ts` (fichier d'un
coéquipier, diff de 3 lignes) ; extension de `types/blocks.ts` ; `#set table` par défaut dans les seeds ou non.

## Confidentialite
Contenu synthétique (Ministère de l'Exemple, Direction du numérique, Exempleville, personnes fictives). Aucune donnée client réelle. La fixture réelle `reel-roadmap.json` n'a été lue que pour la forme des blocs.


## Branchement et échappement (2026-09-15, décisions « 1. corrige » et « 3. Brancher le module »)
Décision humaine : corriger l'échappement des débuts de ligne et brancher `tableToTypst` dans le
convertisseur (fichiers `backend/src/convert/`, périmètre d'un coéquipier, modifiés sur décision explicite).
Fait :
- `escapeTypst.ts` : `/` ajouté aux caractères échappés (deux barres ouvrent un commentaire même dans le
  markup) ; `- `, `+ `, `= `, `1. ` échappés en début de ligne (début du texte ou après un retour).
- `layoutTypst.ts` : son échappement propre des mêmes cas retiré (double échappement sinon).
- `blocksToTypst.ts` : `case "table"` délègue à `tableToTypst(block, inlinesToTypst)` ; `types/blocks.ts`
  inchangé (le type existant est structurellement compatible avec `TableBlockLike`).
- Semis `templates/{minimal,ministere,collectivite}.typ` : `#set table(stroke: 0.5pt + luma(200), inset: 6pt)`
  avant `#include "body.typ"` ; même ligne posée par `PUT /api/templates/<id>` sur les trois gabarits vivants
  (absente chez tous, aucun bloc dots:layout) → 200, 200, 200.
- Tests ajoutés : échappement (tiret, numéro, URL) et tableau fusionné via le convertisseur.

Preuves brutes :
```
$ npx tsc --noEmit -p .        (backend)   -> tsc OK
$ npx vitest run --root .
 Test Files  4 passed (4)
      Tests  78 passed (78)
$ POST /api/render {fixtureId, templateId:"ministere"}  puis pdfinfo / pdftotext | grep -c '•'
admin-tableau-complexe           HTTP/1.1 200 OK pages 2  puces 0
reel-paris-arrete-voirie         HTTP/1.1 200 OK pages 17 puces 27      (57 avant : 30 cellules « - … » en puce)
reel-paris-arrete-redevances     HTTP/1.1 200 OK pages 6  puces 24
```
Aperçus regardés : `branche-effectifs-1.png` (ligne « Total général » fusionnée sur 3 colonnes, en-tête gras,
fonds jaune/gris, texte rouge, chiffres à droite) ; `branche-voirie-11.png` (« 410 - dans le tiers du
trottoir » en texte, plus de puce).
Écart vu : sur l'arrêté voirie, l'en-tête à deux lignes (« Mode de taxation » / « CATEGORIES » sur 5 colonnes)
se chevauche : limite connue des en-têtes à deux rangs avec fusion, non corrigée.
