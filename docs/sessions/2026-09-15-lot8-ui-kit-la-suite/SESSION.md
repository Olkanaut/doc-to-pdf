# Attestation — lot 8 : adoption de @gouvfr-lasuite/ui-components (copie isolée)

## Meta

- Date : 2026-09-15
- Lot : 8 — coque, contrôles et modale sur le kit UI de La Suite, dans une copie isolée de l'app
- Scope : worktree `/Users/abel/Documents/doc-to-pdf-uikit` (branche `ui-kit`), frontend seulement.
  Le backend de la copie est une copie figée de l'arbre principal ; les fichiers backend de
  référence restent ceux de `/Users/abel/Documents/doc-to-pdf`.
- Commit début : 3566983 (base de la branche `ui-kit`, rien de commité sur cette branche)
- Commit fin : aucun (travail non commité, à revoir)
- Statut : PARTIEL — 22/22 e2e verts sur backend isolé, tsc/build OK ; troisième série de
  correctifs (K3) non exécutée (limite de dépense du compte Claude Code atteinte) ;
  décisions de conception laissées ouvertes ci-dessous.

## Definition de fin + preuve BRUTE

### 1. Compilation TypeScript et build de production

```
$ cd /Users/abel/Documents/doc-to-pdf-uikit/frontend && npx tsc -b && echo "tsc exit=0"
tsc exit=0
$ npx vite build
dist/assets/index-DbQGcmfE.css                                         646.32 kB │ gzip:  77.82 kB
dist/assets/index-DoEtx502.js                                        1,122.91 kB │ gzip: 298.54 kB
(+ 10 fichiers de polices woff/woff2 : Roboto Flex 9–34 kB, Material Icons 128–182 kB)
✓ built in 346ms
(!) Some chunks are larger than 500 kB after minification.
--- arbre principal (référence, build du 15/09 15:14) ---
25952 index-4zTgtTVK.css
309385 index-9bm1i4e-.js
```

Écart : CSS ×25 (26 Ko → 646 Ko, gzip 78 Ko) ; JS ×3,6 (309 Ko → 1 123 Ko, gzip 299 Ko).
Avant le correctif K1 (polices en base64 importées du kit), le CSS faisait 1 632 Ko (gzip 819 Ko).

### 2. Suite Playwright (22 tests) sur la copie, backend isolé

Backend de la copie : `PORT=4001 npx tsx src/server.ts` (données fraîches, semis), proxy Vite
de la copie `/api → :4001`. Specs : `E2E_BASE_URL` et `E2E_API_URL` (nouvelle variable, les
cinq specs des deux arbres lisent `process.env.E2E_API_URL ?? "http://localhost:4000/api"`).

```
$ cd /Users/abel/Documents/doc-to-pdf-uikit/frontend && \
  E2E_BASE_URL=http://localhost:5174 E2E_API_URL=http://localhost:4001/api npx playwright test
  22 passed (23.2s)template
```

Passages précédents, pour mémoire :

- épreuve de l'agent vérificateur (backend partagé :4000, données de test de l'humain avec
  quatre templates homonymes « Nouveau template ») : `4 failed / 16 passed` — assistant-ia ②
  (sélecteur cassé par la TextArea du kit, corrigé par K2), templates ⑤ ⑧ et rendu ⑰
  (doublons de nom dans les données, pas le recâblage) ;
- premier passage isolé avec UI sur :4001 mais API des specs encore sur :4000 :
  `8 failed / 14 passed` — incohérence de mon montage, sans valeur ;
- passage suivant : `1 failed / 18 passed`, garde du spec mise-en-page (« minimal contient
  templateun bloc dots:layout ») laissée par le passage incohérent ; restauré par
  `PUT /api/templates/minimal` (source du semis) → 200 ; puis `22 passed`.

Données de l'arbre principal (:4000) vérifiées intactes après ces passages :

```
minimal : bloc dots:layout ? False
défaut : Ministère
templates : ['Collectivité', 'Minimal', 'Ministère', 'Nouveau template', 'Nouveau template', 'Nouveau template', 'Nouveau template']
```

### 3. Composants du kit utilisés (lu dans le code de la copie)

- `CunninghamProvider` (theme default, fr-FR, `customLocales` pour « Ouvrir/Fermer le menu ») — main.tsx
- `MainLayout` (Header 52 px + LeftPanel 300 px), `UserMenu`, `LaGaufreV2` — components/shell/AppShell.tsx
- `Button`, `DropdownMenu`, icônes du kit — LeftPanel.tsx ; `ProConnectButton` — LoginPage.tsx
- `Modal`, `TextArea`, `Select`, `Switch`, `Radio`, `Spinner`, `Badge` — ImportTemplateModal,
  LayoutPanel, AiPanel, TemplateTiles, TemplatesListPage (voir `git status` de la copie)
- polices via `@fontsource-variable/roboto-flex`, `@fontsource/material-icons(-outlined)` — index.css

### 4. Captures (regardées, 1440×900, Chrome headless, aperçus PDF noirs = artefact headless)

scratchpad `uikit-templates.png` (53 353 o), `uikit-layout.png` (89 997 o), `uikit-compose.png`
(60 268 o). Docs local (:3011) non connecté en headless : comparaison faite sur le code de
Docs, pas sur un rendu de sa coque connectée.

## Ecarts rencontres

- Agent `fix:K3` : `failed: You've hit your monthly spend limit` (compte Claude Code). Les
  constats K3 restent donc en l'état : commutateur « Mise en page | Code Typst » de la page
  Code Typst encore maison (TemplateEditorPage.tsx), tuiles de la grille à 176 px dont les
  actions se replient (templates-page.css), `<html lang="en">` (index.html), `button {}`
  global bleu d'App.css sur les `<button>` bruts restants.
- Fichiers `FixturePicker.tsx` et `TemplatePicker.tsx` toujours présents dans la copie
  (supprimés dans l'arbre principal ; la copie vient du commit 3566983 + rsync sans
  suppression). À supprimer au retour.
- La copie n'a pas les changements faits ensuite dans l'arbre principal : bouton
  « + Déduire un template d'un PDF » (TemplatesListPage), `max_tokens`/délai du client IA,
  retrait de `stroke:/inset:` de tableToTypst (backend), fixtures `reel-*`.
- Docs n'utilise pas le Header/MainLayout du kit (sa coque est maison, marque dans le
  panneau) : la copie a une barre supérieure de 52 px que Docs n'a pas.

## Decision / choix

LAISSER OUVERT. À trancher par l'humain :

1. Adopter le kit ou rester sur theme.css (coût : +620 Ko CSS / +810 Ko JS non compressés ;
   gain : composants, focus, locales, a11y du kit, même famille visuelle que Docs).
2. Header du kit (comme fait) ou coque maison à la Docs (marque dans le panneau).
3. `<StrictMode>` retiré de main.tsx par K1 (react-modal 3.16 laisse `aria-hidden` sur l'app
   après fermeture sous StrictMode en dev). Réversible en une ligne.
4. Actions des tuiles passées en icônes seules (code, lecture, étoile, corbeille) par K3.
5. Retour dans l'arbre principal : diff de `frontend/` entre les deux worktrees (21 fichiers
   différents + AppShell.tsx nouveau + icons.tsx supprimé + package.json : ajout
   `@gouvfr-lasuite/ui-components ^1.2.0`, `@tanstack/react-query ^5`), à rejouer par-dessus
   le bouton « Déduire un template d'un PDF ».

## Confidentialite

Données de test synthétiques seulement (templates de semis, fixtures d'exemple). Aucune donnée
réelle. La clé Anthropic n'a pas été copiée dans la copie (son backend n'a pas de `.env`).

## Application dans l'arbre principal (2026-09-15, décision « 2. appliquer le kit »)

Décision humaine : « 1. corrige 2. appliquer le kit 3. Brancher le module ». Le kit est appliqué tel que
construit dans la copie (barre du kit, StrictMode retiré, actions des tuiles en icônes) ; les quatre points
mineurs de K3 restent ouverts.

Preuves brutes :

```
$ for f in $FILES; do cp "$W/frontend/$f" "frontend/$f"; done      (27 fichiers : 19 src + 6 specs + package.json/lock)
copiés : 27
icons.tsx supprimé
$ npm install --no-audit --no-fund
added 436 packages in 40s
$ npx tsc --noEmit -p tsconfig.app.json
tsc OK
$ DOTS_API_PROXY=http://localhost:4001 npx vite --port 5175      (seconde instance du frontend principal, backend isolé)
$ E2E_BASE_URL=http://localhost:5175 E2E_API_URL=http://localhost:4001/api npx playwright test
  22 passed (23.4s)
$ npx vite build
dist/assets/index-DbQGcmfE.css                                         646.32 kB │ gzip:  77.82 kB
dist/assets/index-CJ6qM0rW.js                                        1,123.39 kB │ gzip: 298.66 kB
✓ built in 302ms
```

Le bouton « + Déduire un template d'un PDF » (ajouté après la copie) est re-posé sur la page templates avec le
`Button` du kit et une `Alert` INFO comme notice « À venir » ; capture `kit-main-templates.png` regardée.
`vite.config.ts` des deux arbres : cible du proxy `/api` réglable par `DOTS_API_PROXY` (défaut :4000).
