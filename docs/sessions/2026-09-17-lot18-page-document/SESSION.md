# Lot 18 — page document : rail, ⓘ, recherche, barre d'actions, envoi (maquette)

## Meta
- Date : 2026-09-17
- Lot : 18
- Scope : `frontend/src/pages/DocumentPage.tsx`, `frontend/src/components/document/*` (neuf),
  `frontend/src/components/pdf-preview.css`, `frontend/e2e/document-render.spec.ts`
- Commit début : f63799d   Commit fin : **aucun** (rien n'est commité, arbre de travail seulement)
- Statut : TERMINE pour les lots A, B, C ; D livré en **maquette** (aucun envoi)

## Ce qui a été fait
- **A — le ⓘ** : la barre d'informations pleine largeur disparaît. `DocInfoPopover`
  (Popover du kit) donne le nom complet, l'**identifiant**, le nombre de blocs et la date.
- **B — la coque à deux colonnes** : `.doc-shell`, rail de 300 px (nom + ⓘ, « Ouvrir dans
  Docs », « Changer », recherche, gabarits) et PDF sur la surface restante. Plus de `<h1>`
  ni de barre de titre.
- **Rail, deuxième passe** : « Ouvrir dans Docs » et « Changer » sur une seule ligne.
  Avec leurs icônes ils faisaient 162 + 108 + 6 = 276 px pour 267 px disponibles, donc
  « Changer » passait à la ligne ; les icônes sont retirées (c'est aussi ce que montrait
  la maquette validée). Mesuré après : `{"actsW":273,"btns":[{"txt":"Ouvrir dans Docs","w":134,"top":108},{"txt":"Changer","w":80,"top":108}]}`
  — même `top`, donc même ligne, 53 px de marge.
- **Sélection de gabarit à la manière de Docs** : plus de filet bleu ni de puce radio,
  seulement un fond gris (`--dots-grey-100` coché, `--dots-grey-050` au survol), dans le
  seul rail (`.doc-rail …`) — les mêmes tuiles servent à la composition. L'input radio
  reste dans l'arbre d'accessibilité et devient la surface de clic de la tuile ; l'anneau
  de focus passe sur la tuile entière. Mesuré :
  `{"coche":{"bg":"rgb(226, 226, 234)","border":"rgba(0, 0, 0, 0)"},"puce":{"w":245,"h":44},"role":"radio checked=true","nomAccessible":"R République Française Par défaut"}`
- **C — recherche + actions** : filtre sur le nom des gabarits ; barre flottante en bas à
  droite (« Mise en page », « Envoyer », « Télécharger »), le PDF défile dessous grâce à
  `padding-bottom: 72px` sur `.pdf-scroll`.
- **D — envoi par mail** : `SendMailModal`, destinataire **libre**, objet, message, pièce
  jointe affichée. Rien ne part : le bouton affiche « Rien n'a été envoyé : la route
  d'envoi reste à écrire. » Aucune route serveur, aucun SMTP.
- Supprimé au passage : `fetchTemplateDetail` sur cette page (il n'alimentait que le
  panneau « Gabarit sélectionné », qui n'existe plus).

## Définition de fin + preuve BRUTE

### Types
```
$ npx tsc --noEmit
(exit 0)
```

### Lint (fichiers du lot)
```
$ npx oxlint src/pages/DocumentPage.tsx src/components/document/
(exit 0)
```
`npx oxlint src/ e2e/` : 9 avertissements, tous préexistants (AuthCallbackPage, AuthContext,
ComposePage, TemplatesListPage, TemplateEditorPage, AiPanel, LayoutEditorPage ×2) ; aucun
dans les fichiers du lot.

### E2E de la page (routes simulées, serveur Vite seul)
```
$ npx playwright test e2e/document-render.spec.ts

Running 1 test using 1 worker

  ✓  1 [chromium] › e2e/document-render.spec.ts:26:1 › renders Docs content with the selected database template (846ms)

  1 passed (1.1s)
```

### Parcours réel dans le navigateur (Chromium, 1440 × 900, API simulée)
```
BODY TEXT: I | Délibération — Tarifs de la restauration scolaire 2026 | Ouvrir dans Docs | Changer | Rechercher un gabarit | Gabarit | Gérer | R | République Française | Par défaut | V | Ville de Paris | M | Ministère | N | Note de service | Mise en page | Envoyer | Télécharger
POPOVER: Délibération — Tarifs de la restauration scolaire 2026 |  | Identifiant | a372f33f-25a1-4595-b6b6-d8de64c5ac00 | Contenu | 1 bloc | Dernière mise à jour | 15 sept. 2026, 16:45
POPOVER après Échap: 0
FILTRE min: Délibération — Tarifs de la restauration scolaire 2026 | Ouvrir dans Docs | Changer | Rechercher un gabarit | Gabarit | Gérer | M | Ministère
FILTRE paris: 1 gabarit(s)
MODALE: Maquette : l'envoi n'est pas encore branché. Le PDF reste téléchargeable. | Destinataires | Une ou plusieurs adresses, séparées par des virgules. | Objet | Message | PDF | a372f33f-25a1-4595-b6b6-d8de64c5ac00.pdf | pièce jointe | Rien n'a été envoyé : la route d'envoi reste à écrire.
```

### La page tient dans l'écran (mesures du navigateur, mêmes conditions)
Avant correctif (`min-height: auto` des éléments de grille) — la barre d'actions tombait
sous le pli :
```
".doc-shell": { "h": 848 }   ".doc-view": { "h": 1636 }   ".pdf-scroll": { "h": 1606, "minH": "700px" }
".doc-acts": { "top": 1622 }
```
Après (`min-height: 0` sur `.doc-rail` et `.doc-view`, réinitialisation du `min-height`
d'App.css au-dessus de 900 px) :
```
".doc-view": { "h": 848 }    ".pdf-scroll": { "h": 818, "minH": "0px" }
".doc-acts": { "top": 834 }  "bodyScroll": 900
```

## Écarts rencontrés

1. **La couche de texte de react-pdf rendait la modale inerte.** `.textLayer` porte
   `z-index: 2` (react-pdf/dist/Page/TextLayer.css) et `.c__modal` n'a pas de `z-index` :
   au-dessus de l'aperçu, la couche transparente captait tous les clics. Preuve : Playwright
   refusait le clic — « `<div class="react-pdf__Page__textContent textLayer">` from
   `<div class="c__app" aria-hidden="true">` subtree intercepts pointer events », 58 essais,
   timeout 30 s. Corrigé dans `frontend/src/components/pdf-preview.css` :
   `.pdf-preview { position: relative; z-index: 0 }` enferme ces z-index. Le défaut
   existait aussi ailleurs (composition, éditeur de mise en page) : le correctif est dans la
   feuille du composant, donc partagé.

2. **`e2e/document-render.spec.ts` interceptait `**/api/**`**, ce qui attrapait aussi le
   module `/src/api/client.ts` servi par Vite : l'app restait **blanche** et le test ne
   pouvait pas passer en dev, avant même ce lot. Motif resserré :
   `/\/api\/(auth|session|templates|documents)/`.

3. **Deux tests restent périmés, sans rapport avec ce lot** : `e2e/smoke.spec.ts:13` et
   `e2e/accueil.spec.ts:128` attendent que `/docs/<uuid>/` redirige vers
   `/documents/new?doc=…`, alors que `App.tsx:59` y rend `DocumentPage` depuis `main`.
   Non corrigés ici (hors périmètre du lot), signalés.

4. **Essai abandonné** : borner la pile de pages à 900 px
   (`.react-pdf__Document { max-width: 900px }`) ne réduit pas le canevas — mesuré
   `doc: 900`, `page/canvas: 1073` : la page débordait à droite. Règle retirée ; la page
   occupe la largeur de la colonne, comme dans le wireframe.

## Ce qui n'est PAS fait
- Aucun envoi d'e-mail : pas de route serveur, pas de gabarit d'e-mail, pas de SMTP.
  `mailcatcher` reste déclaré dans `docs/compose.yml` mais n'est pas utilisé.
- Aucune validation d'adresse : le champ « Destinataires » est libre, comme demandé.
- Pas de vérification sous 900 px de large (la règle média existe, elle n'a pas été testée).
- Rien n'est commité ni poussé.

## Décision / choix
LAISSER OUVERT — revue humaine.

## Confidentialité
Sorties obtenues sur données simulées (routes Playwright : « Document de démonstration »,
« Délibération — Tarifs de la restauration scolaire 2026 », gabarits fictifs). Aucune donnée
réelle.
