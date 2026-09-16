# Attestation — lot 11 : wireframes des nouveaux écrans Figma, habillage kit La Suite

## Meta
- Date : 2026-09-16
- Lot : 11 — traduire les 6 écrans du Figma `doc-to-pdf` (exports PNG dans `docs/doc-to-pdf/`) en wireframes 1440×900 avec les valeurs du kit `@gouvfr-lasuite/ui-components` relevées dans l'app
- Commit début : 2da7b13   Commit fin : aucun (livrable hors dépôt : `~/Desktop/dots-wireframes/`, rien à commiter)
- Statut : TERMINE (maquettes statiques ; aucune ligne de code applicatif touchée)

## Definition de fin + preuve BRUTE

### Valeurs du kit relevées dans l'app (:5173, getComputedStyle, session précédente)
bouton primaire rgb(94,92,208) / texte #EEF1FA, h 40 px, rayon 4 px, 16 px/500, padding 16 ; secondaire #F0F0F3 ; tertiaire texte brand ; en-tête 52 px bordure #E2E2EA ; h1 28 px/600 ; corps 16 px #1B1B23 ; badge #DDE2F5/#534FC2 24 px ; police Hanken Grotesk. Reportées en constantes dans `~/Desktop/dots-wireframes/gen.py` (l. 8-11).

### Génération, assemblage, contrôle
```
$ python3 gen.py
écrit : Main.dc.html, Galerie.dc.html, GalerieListe.dc.html, Rendu.dc.html, Editeur.dc.html + canvas.json
$ node seed-canvas.mjs --template … --out dots-figma-la-suite.html --title "dots — wireframes La Suite" --artboard ×5 --canvas canvas.json
wrote dots-figma-la-suite.html — "dots — wireframes La Suite": 5 artboards (Main.dc.html, Galerie.dc.html, GalerieListe.dc.html, Rendu.dc.html, Editeur.dc.html), 0 images, canvas.json
$ node seed-canvas.mjs --check dots-figma-la-suite.html
ok: dots-figma-la-suite.html — title "dots — wireframes La Suite", 6 files ("Main.dc.html", "Galerie.dc.html", "GalerieListe.dc.html", "Rendu.dc.html", "Editeur.dc.html", "canvas.json")
$ du -h dots-figma-la-suite.html
2.5M	dots-figma-la-suite.html
```
Captures Chrome headless 1440×900 regardées une à une (`shot-*.png`, 5 fichiers) ; défauts corrigés avant livraison : `<b>` éclaté en colonnes dans la notice (flex), vignettes de la vue liste débordant (overflow), nom « République française » collé aux icônes (min-width 0 + gap), libellé « Ou, pour un gabarit : » sur deux lignes (nowrap), page A4 du Rendu trop près du bord (échelle 0,86 → 0,8).

### Correspondance Figma → maquette
| Écran Figma | Artboard | Nouveaux éléments repris |
|---|---|---|
| (main page) « Choose a file », « url or search tool » | Main | champ unique adresse Docs ou titre, liste « Documents récents dans Docs », liens Importer / Partir de zéro / Déduire d'un PDF |
| galerie, boutons « import » + « start from 0 » | Galerie | Importer (secondary), Partir de zéro (primary), Déduire d'un PDF (tertiary), grille 6 colonnes portrait, badge Par défaut |
| alternative view | GalerieListe | mêmes boutons, lignes vignette / nom / description / date / actions |
| /docs/{doc_id}, « Select template », download | Rendu | aperçu centré, liste déroulante Gabarit en haut à droite, Télécharger en bas à droite, lien Voir dans Docs |
| /edit/{template_id}, edit form / pdf / ai chat | Editeur | trois colonnes permanentes : fichier, marges, police, espacements ; PDF ; assistant IA avec Instruction / Depuis un PDF, Accepter / Ignorer |

Publié en canevas éditable : https://claude.ai/artifact/8QkKg1cyzbP3FSHGGZTCaC (version 2 après corrections).

## Ecarts rencontres
- Le Figma n'a pas pu être lu directement (lien SPA, embed 403, API sans jeton) : les maquettes partent des 17 exports PNG fournis, pas du fichier source. Les libellés anglais des wireframes (« Select template », « start from 0 ») ont été traduits.
- Les maquettes suppriment le panneau gauche et la gaufre de navigation actuels, comme le Figma ; ce n'est pas une décision d'implémentation.
- Rien d'implémenté dans `frontend/` : la page d'accueil, les boutons en tête de galerie, la route `/edit/:id` et la colonne IA permanente restent à faire (voir « Decision »).

## Decision / choix
LAISSER OUVERT. À trancher avant de coder : (1) accueil `/` = champ Docs + recherche (nécessite l'API de recherche Docs avec session) ; (2) déplacer Importer / Partir de zéro du panneau gauche vers l'en-tête de la galerie ; (3) alias `/edit/:id` sur `/templates/:id/layout` ; (4) colonne IA permanente vs panneau repliable actuel ; (5) garder ou non le panneau gauche du kit.

## Confidentialite
Contenus fictifs (Ministère de l'Exemple, Note de service DRH) ou actes publics de la Ville de Paris. Aucune donnée client.

## Complément : accueil = recherche par nom + derniers documents Docs de l'utilisateur

Question posée : lister les derniers documents Docs de l'utilisateur et chercher par nom depuis l'accueil. Vérification par 3 agents (lecture du code Docs v5.6.0-preprod `~/Documents/docs/src/backend`, appels réels sur :8071, passe de réfutation). Aucune écriture en base ; une session de test créée en cache puis supprimée (`exists after False`).

### Confirmé en exécution
```
$ curl -s -w 'HTTP %{http_code}' http://localhost:8071/api/v1.0/documents/
{"count":0,"next":null,"previous":null,"results":[]}HTTP 200          (anonyme, ou cookie docs_sessionid bidon : 200 vide, jamais 401)
shell Django, APIClient().force_login(impress@impress.world), GET /api/v1.0/documents/?ordering=-updated_at&page_size=5
status 200 / count 10 / next …?ordering=-updated_at&page=2&page_size=5
1fb01dce-… | 'Arrêté droits de voirie 2025 — Ville de Paris (janvier 2025)' | 2026-09-15T15:56:26.856406Z | owner
06aab67d-… | 'Arrêté fixant les redevances … — Ville de Paris (avril 2025)'   | 2026-09-15T15:56:26.432230Z | owner
9bb48781-… | 'Circulaire du 15 décembre 2024 — Ministère de l’Intérieur …'   | 2026-09-15T15:56:26.166012Z | owner
GET /api/v1.0/documents/?title=note        -> count 2 : 'Exemple — Note de service DRH (télétravail)', 'Note de service — test dots'
?title=NOTÉ -> count 2 ; ?title=teletravail -> count 1 ; ?q=note -> count 2 ; ?title=note&q=drh -> count 1 (AND) ; ?title=service%20note -> count 0
?ordering=-title -> ordre change ; ?ordering=bogus -> ordre par défaut ; ?page=99 -> 404 {"detail":"Invalid page."}
curl GET avec le seul cookie docs_sessionid (sans csrftoken) -> HTTP 200, count 10
```
Code : `core/api/viewsets.py:550` `ordering = ["-updated_at"]`, `:551` ordering_fields created_at/updated_at/title, `:552` Pagination (`page_size` param, défaut 20 `impress/settings.py:429`, plafond 200 lu dans le code), `:578-579` anonyme → queryset vide, `:648-652` racines d'arbre seulement ; `core/api/filters.py:47-52` `title`/`q` = `unaccent__icontains` ; throttle « document » 80/min `impress/settings.py:446-450`. Champs de chaque résultat : id, title, updated_at, created_at, user_role (reader/commenter/editor/administrator/owner), is_favorite, excerpt, abilities, creator (nullable, null sur les fixtures), link_reach…

### Conséquences pour la maquette (artboard Main, version 3 du canevas)
- Barre de recherche avec loupe = `?title=` : sous-chaîne, insensible casse/accents, pas de recherche par mots ni full-text ; à débouncer (quota 80/min).
- Liste « Vos derniers documents » = `GET /documents/?page_size=8` (tri par défaut `-updated_at`), colonnes titre / rôle (`user_role`) / `updated_at`.
- Liste vide ne distingue pas « non connecté à Docs » de « aucun document » : l'accueil doit afficher « connectez-vous à Docs » sur un 200 vide sans cookie.
- Côté dots : nouvelle route backend `GET /api/docs?title=&page_size=` relayant `docs_sessionid` comme `GET /api/docs/:id` (même hôte localhost) ; entre hôtes distincts en production, il faut ProConnect / Resource Server (branche d'Ismaël).
- Non listés : les sous-documents (racines seulement) ; `/documents/search/?q=` les inclut (repli base de données, même filtre titre).

### Écarts relevés par la passe de réfutation
Booléen invalide (`?is_favorite=maybe`) → 200 et non 400 ; valeur de rôle `administrator` et non `admin` ; deux décalages de lignes dans le rapport de lecture, corrigés ci-dessus.
