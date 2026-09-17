# Attestation de session — fixture `admin-note-service`

## Meta

- Date : 2026-09-15
- Lot : 6 (sous-agent d'orchestration : rédaction d'une fixture synthétique)
- Scope : `backend/fixtures/admin-note-service.json` uniquement (note de service DRH, télétravail). Aucun fichier `.ts` touché.
- Commit début : 3566983c5a15cb08524648973df0cec082703369 Commit fin : 3566983c5a15cb08524648973df0cec082703369 (aucun commit, arbre de travail seulement)
- Branche : template-editor
- Statut : TERMINE

## Definition de fin + preuve BRUTE

### 1. JSON valide

```
$ python3 -c "import json; json.load(open('/Users/abel/Documents/doc-to-pdf/backend/fixtures/admin-note-service.json')); print('JSON OK')"
JSON OK
```

### 2. Présent dans GET /api/fixtures

```
$ curl -s http://localhost:4000/api/fixtures
[{"id":"admin-arrete","name":"Exemple — Arrêté municipal de circulation"},{"id":"admin-compte-rendu-long","name":"Exemple — Compte rendu COPIL Dématérialisation"},{"id":"admin-deliberation","name":"Exemple — Délibération du conseil municipal"},{"id":"admin-lettre-reponse","name":"Exemple — Lettre de réponse à un usager (associations)"},{"id":"admin-note-service","name":"Exemple — Note de service DRH (télétravail)"},{"id":"list-demo","name":"List-heavy note"},{"id":"reel-roadmap","name":"REEL — 🇬🇧 Roadmap (in english)"},{"id":"reel-shipped2026","name":"REEL — 🚢 Shipped in 2026"},{"id":"simple-note","name":"Simple note"},{"id":"table-image-demo","name":"Table + image"}]
```

### 3. Rendu 200 sur les trois templates

```
$ for g in ministere collectivite minimal; do printf "%s: " "$g"; curl -s -o /tmp/admin-note-service-$g.pdf -w "%{http_code} %{size_download}\n" -X POST http://localhost:4000/api/render -H 'content-type: application/json' -d "{\"fixtureId\":\"admin-note-service\",\"templateId\":\"$g\"}"; done
ministere: 200 45630
collectivite: 200 44777
minimal: 200 43696
$ curl -s -D - -o /dev/null -X POST http://localhost:4000/api/render ... | grep -i x-dots   (première version, 43 blocs ; version finale 42 blocs)
x-dots-unsupported-blocks: {}
```

### 4. Mots fixture vs PDF (seuil 5 %)

```
$ python3 ans-count.py backend/fixtures/admin-note-service.json
id: admin-note-service | name: Exemple — Note de service DRH (télétravail)
words fixture (python split): 680
blocks: {'paragraph': 28, 'heading': 5, 'bulletListItem': 4, 'numberedListItem': 4, 'table': 1} | total 42
table: rows 5 | cols 3
$ for g in ministere collectivite minimal; do printf "%s: " "$g"; pdftotext /tmp/admin-note-service-$g.pdf - | wc -w | tr -d ' '; done
ministere: 699template
collectivite: 695
minimal: 689
fixture=680 pdf=699 ecart=+2.8%
```

Explication des +19 mots (ministere) : en-tête/pied du gabarit sur 2 pages (« RÉPUBLIQUE FRANÇAISE », « Ministère de l’Exemple », « 1/2 » → 6 × 2 = 12) + marqueurs de liste (4 puces, 4 numéros). Preuve des lignes de gabarit :

```
$ pdftotext /tmp/admin-note-service-ministere.pdf - | grep -n -E "RÉPUBLIQUE FRANÇAISE|^Ministère de l’Exemple$|^[0-9]/[0-9]$"
1:RÉPUBLIQUE FRANÇAISE
2:Ministère de l’Exempletemplate
4:Ministère de l’Exemple
44:1/2
46:RÉPUBLIQUE FRANÇAISE
47:Ministère de l’Exemple
101:2/2
```

(la ligne 4 est le premier paragraphe du corps, pas le gabarit)

### 5. Nombre de pages

```
$ for g in ministere collectivite minimal; do printf "%s: " "$g"; python3 -c "import re,sys; print(len(re.findall(rb'/Type\s*/Page(?![s\w])', open(sys.argv[1],'rb').read())))" /tmp/admin-note-service-$g.pdf; done
ministere: 2
collectivite: 2
minimal: 2
```

### Pièges typographiques ressortis dans le PDF (grep -c -F sur pdftotext ministere)

```
’                                        30
« n° 2026-042 »                         1
1 200,50 €                               1
12,5 %                                     1
#A-42                                      1
*importante*                               1
fichier_nom.pdf                            2
camille.durand-lefevre@exemple.gouv.fr     1
drh@exemple.gouv.fr                        1
[à compléter]                            1
—                                        1
3 $ par unité                             1
antislash résiduel                        0
```

Contrôle visuel : `pdftoppm -r 60 -png` des pages 1-2 (ministere) et page 2 (minimal), relues — tableau, listes, signature et « Copie à » présents.

## Ecarts rencontres

- Première version à 833 mots rendait 3 pages (`file` : « 3 pages », regex : 3 ; page 3 = 42 mots de signature). Texte resserré à 680 mots → 2 pages. Preuve ci-dessus.
- Espaces insécables (U+00A0, U+202F) écrites dans la fixture ressortent comme espaces simples dans la couche texte du PDF (`U+00A0 count: 0`), sans effet sur le compte de mots.
- « teletravail-drh@exemple.gouv.fr » est césuré au trait d'union en fin de ligne par Typst (grep `teletravail-drh@` = 0, grep `drh@exemple.gouv.fr` = 1) : mise en page, pas perte de texte.
- Bloc vide `content: []` non utilisé : lu dans le code, `blocksToTypst.ts` l. 104 (`.filter(Boolean)`) supprime la chaîne vide, donc pas de ligne blanche possible. Non testé en exécution.
- Style inline `code` non utilisé : lu dans le code, `blocksToTypst.ts` l. 33-34 échappe le texte avant de l'entourer de backticks, un `_` en style code afficherait `\_`. Hypothèse non testée, hors périmètre (convertisseur en lecture seule).
- Scratchpad partagé avec des sous-agents frères (fixtures admin-arrete, admin-deliberation… apparues en parallèle) : mon `count.py` a été écrasé, renommé `ans-count.py`.
- Ce fichier SESSION.md est créé hors du seul fichier autorisé par l'orchestrateur, sur consigne globale utilisateur (règle session-attestation).

## Decision / choix

LAISSER OUVERT. Section remplie apres, par revue humaine.

## Confidentialite

Contenu 100 % synthétique : Ministère de l’Exemple, Exempleville, personnes fictives (Camille Durand-Lefèvre, Isabelle Marchand-Vidal), courriels @exemple.gouv.fr, références fictives (n° 2026-042, circulaire n° 2026-017, réf. #A-42). Aucune donnée réelle.
