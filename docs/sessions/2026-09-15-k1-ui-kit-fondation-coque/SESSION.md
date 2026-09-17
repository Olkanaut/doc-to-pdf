# Attestation de session — K1 : fondation et coque (ui-kit)

## Meta

- Date : 2026-09-15. Lot : K1 (chantier ui-kit, worktree `/Users/abel/Documents/doc-to-pdf-uikit`, branche `ui-kit`).
- Scope : CunninghamProvider + styles du kit, coque MainLayout/Header/LeftPanel/UserMenu/LaGaufre,
  bouton scindé Button+DropdownMenu, ProConnectButton sur /login, nettoyage de theme.css.
- Commit début : 3566983 Commit fin : 3566983 (aucun commit — arbre de travail seulement, rien publié).
- Statut : TERMINE (avec deux décisions laissées ouvertes, voir « Ecarts » et « Décision »).

Fichiers modifiés (`git status --short` sur ma liste) :

```
 M frontend/src/App.tsx
 M frontend/src/index.css
 M frontend/src/main.tsx
 M frontend/src/pages/LoginPage.tsx
?? frontend/e2e/smoke.spec.ts
?? frontend/src/components/shell/        (AppShell.tsx nouveau, LeftPanel.tsx réécrit, icons.tsx élagué)
?? frontend/src/theme.css
```

## Definition de fin + preuve BRUTE

### 1. `npx tsc -b` exit 0

```
$ cd /Users/abel/Documents/doc-to-pdf-uikit/frontend && npx tsc -b; echo "tsc exit=$?"
tsc exit=0
```

(Un premier passage à 16:51 remontait 2 erreurs TS2882 dans `src/pages/LayoutEditorPage.tsx` l.33-34
— imports CSS du kit par effet de bord, fichier du chantier K2, hors de ma liste ; disparues au
passage suivant, K2 les a corrigées.)

### 2. Journal Vite sans erreur de compilation

```
$ grep -in "error\|failed" /tmp/vite-uikit.log | tail -3
(vide)
$ tail -3 /tmp/vite-uikit.log
4:57:15 PM [vite] (client) page reload src/main.tsx
4:57:20 PM [vite] (client) page reload src/main.tsx
4:57:59 PM [vite] (client) page reload src/main.tsx
```

### 3. Styles du kit résolus par `@import` dans index.css (CSS servi)

```
$ curl -s "http://localhost:5174/src/index.css?direct" | grep -c "c__main-layout"
1
$ curl -s "http://localhost:5174/src/index.css?direct" | grep -o "font-family:Roboto Flex Variable" | head -1
font-family:Roboto Flex Variable
$ curl -s "http://localhost:5174/src/index.css?direct" | grep -o "font-family:Material Icons;" | head -1
font-family:Material Icons;
```

### 4. Pas de QueryClientProvider nécessaire

```
$ grep -rl "@tanstack/react-query" node_modules/@gouvfr-lasuite/ui-components/dist --include=*.js | head
node_modules/@gouvfr-lasuite/ui-components/dist/components/preview/viewers/pdf-preview/PdfPreview.js
```

Seul PdfPreview en dépend ; non utilisé.

### 5. Sonde d'accessibilité (script Playwright en lecture seule, viewport 1440×900,

aucune donnée créée — clics : chevron, entrée de menu, Échap)

```
$ NODE_PATH=…/frontend/node_modules node <scratchpad>/a11y-check.cjs
{
 "banner": 1, "bannerBrandLink": 1, "main": 1,
 "navtemplatesCurrent": "page", "navDocumentsCurrent": null,
 "newBtnCount": 1, "newBtnEnabled": true, "moreHaspopup": "menu", "homeBtn": 1,
 "userNameVisible": true, "userMenuBtn": 1,
 "templaten": 1, "menuItemFocused": true,
 "dialogVisible": true, "menuClosedAfter": 0, "focusInDialog": true, "focusBackOnChevron": true,
 "bodyHScroll": false,
 "fontBody": "\"Hanken Grotesk\", Inter, \"Roboto Flex Variable\", sans-serif",
 "themeClass": "cunningham-theme--default",
 "layoutCenter": { "scrollH": 848, "clientH": 848, "leH": 848 },
 "proconnect": 1, "proconnectName": ""
}
```

Lecture : en-tête `<header>` du kit (banner) avec le lien « dots » ; `<main>` présent ; NavLink
« Gabarits » aria-current=page ; bouton « Nouveau gabarit » activé ; chevron aria-haspopup=menu ;
menu du kit (role menu / menuitem), fermé après clic ; modale focalisée, focus rendu au chevron ;
l'éditeur de mise en page tient dans la zone centrale sans défilement (848 = 900 − 52).

### 6. Nettoyage de la modale (aria-hidden) — avant / après retrait de StrictMode

Avec `<StrictMode>` (16:55) :
template
template
template

```
closed: {"appHidden":"true", ..., "bodyClass":"c__modals--opened c__noscroll"}
```

Sans `<StrictMode>` (16:57, état final) :

```
initial: {"rootHidden":null,"appHidden":null,...,"portals":0,"bodyClass":""}
open:    {"appHidden":"true",...,"portals":1,"bodyClass":"c__modals--opened c__noscroll"}
closed:  {"rootHidden":null,"appHidden":null,...,"portals":0,"bodyClass":""}
```

### 7. Captures Chrome headless 1440×900 (regardées)

- `final-templates.png` : en-tête 52 px blanc (marque « dt dots » à gauche, bouton gaufre à droite),
  panneau gauche 300 px (bouton scindé violet « + Nouveau gabarit | ˅ », bouton accueil, nav
  Gabarits (actif, fond violet clair) / Documents, pied avatar « UD » + « Utilisateur de
  démonstration »), liste des gabarits au centre.
- `final-layout.png` : même coque ; l'éditeur (en-tête « Ministère », panneau de réglages,
  aperçu PDF) occupe toute la hauteur restante sous l'en-tête, sans dépassement.
- `final-login.png` : même coque ; « Connexion requise », texte, bouton ProConnect du kit.
- `docs-3011.png` : Docs local reste sur son loader en headless (non connecté, Keycloak) —
  comparaison faite sur le code de Docs, pas sur un rendu.

### 8. Comparaison avec Docs (lu dans le code, `/Users/abel/Documents/docs/.../src`)

- Même Header ? **Non** : Docs n'utilise pas le `Header`/`MainLayout` du kit ; sa coque est
  `layouts/MainLayout.tsx` (Box maison) avec la marque dans `LeftPanelHeader.tsx`, sans barre
  supérieure. Ici : `MainLayout` du kit (barre 52 px + panneau 300 px), conformément à la consigne.
- Même LeftPanel ? Composants identiques pour ce qui est composant : `Button` (kit), `DropdownMenu`
  (kit, comme `NewDocButton.tsx`), `UserMenu` (kit, comme `LeftPanelFooter.tsx`), `LaGaufreV2`
  (kit, comme `components/Waffle.tsx`). La liste de navigation (NavLink) reste maison : le kit
  n'a pas de composant de navigation latérale (grep `Nav|Sidebar|Menu` dans index.d.ts :
  ContextMenu, DropdownMenu, HelpMenu, UserMenu seulement).
- Thème : Docs local = `default`, dont la marque est **violette** (#534fc2, `:root` de
  `cunningham-tokens.css`) — comme le kit (`:root -> #534FC2`). Le bleu #0659c5 de l'ancien
  theme.css venait du bloc `.cunningham-theme--dark`. Aucune divergence : pas d'action.
- Police : kit `:root` = `Hanken Grotesk, Inter, Roboto Flex Variable` ; Docs = `inter variable,
roboto flex variable`. Hanken absent du poste (fc-list : 0) → Inter/Roboto Flex. Pas d'action.

## Ecarts rencontres

1. **StrictMode retiré de main.tsx.** Le `Modal` du kit (react-modal 3.16.3) double-enregistre sous
   StrictMode (dev) : `aria-hidden=template reste sur `.c**app`et`c**modals--opened`sur`<body>`après fermeture (preuve §6 ; avertissement console « React-Modal: Cannot register modal instance
that's already open »). Toute la page devenait invisible pour les technologies d'assistance et
introuvable par`getByRole`(import.spec.ts l.91 aurait échoué). Docs (Pages Router,`next.config.js`sans`reactStrictMode`) tourne sans StrictMode. Réversible en une ligne.
2. `themtemplate: ajout de `.dots-main > .le, .dots-main > .compose { height: 100% }`— les pages
plein écran de K2/K3 fixaient`100dvh`(layout-editor.csstemplateompose.css l.206) alors que la
zone centrale du kit fait`100dvh − 52px` ; sans cette règle, 52 px de défilement parasite.
3. `theme.css` : le style global `button {…}` est retiré (kit `Button`). Conséquence : les `<button>`
   bruts restants retombent sur le `button {}` de App.css (fond marine) —
   `grep -rc "<button" src --include=*.tsx | grep -v ":0"` :
   OpenTarget.tsx:1, ViewSwitcher.tsx:2, TemplateBrowser.tsx:1, ComposePage.tsx:1 (fichiers K2/K3).
   Les `.dots-btn*` sont conservés (encore référencés par ImportTemplateModal, AiPanel, DocsUrlField,
   LayoutEditorPage, ComposePage, layout-editor.css).
4. CSS mort laissé dans `templates-page.css` (K3, hors liste) : `.dots-left-panel__brand`,
   `.dots-left-panel .dots-split*`, `.dots-left-panel .dots-menu*`, `.dots-left-panel__footer` (l.12-62).
5. `ProConnectButton` du kit n'a pas de nom accessible (`proconnectName: ""`) — ses props sont
   limitées à `disabled`/`onClick`. Dtemplatetourne avec son propre bouton (`ButtonLogin.tsx` l.32).
   Ici : libellé visible « Se connecter avec ProConnect » posé au-dessus ; la page reste un stub.
6. `LanguagePicker` non ajouté : une seule locale (fr-FR), le contrôle serait vide de sens.
7. Le nom de l'utilisateur est rendu en texte à côté du `UserMenu` (dont le déclencheur n'affiche
   que les initiales) pour garder `gabarits.spec.ts` l.80 (`getByText(session.user.name)`) valide.
8. `smoke.spec.ts` : deux attentes ajoutées (banner visible, lien « dots » dans le banner) ; les
   trois attentes d'origine sont inchangées.
9. Deux gabarits « Nouveau gabarit » sont apparus dans la liste pendant la session (backend
   partagé) ; mes sondes n'ont jamais cliqué « Nouveau gabarit » ni importé (script a11y-check.cjs).
10. Aucun test Playwright (spec) lancé ; seules des sondes en lecture seule.

## Decision / choix

LAISSER OUVERT (revue humaine) :

- Confirmer ou revenir sur le retrait de `<StrictMode>` (alternative : garder StrictMode et
  corriger côté kit/K3 — le `Modal` du kit démonte react-modal à la fermeture, le bug est structurel).
- Header du kit (barre 52 px) vs coque de Docs (marque dans le panneau, pas de barre) : la consigne
  demandait MainLayout/Header du kit ; Docs fait autrement.

## Confidentialite

Sorties sur fixtures synthétiques et gabarits d'exemple (Collectivité, Minimal, Ministère) ;
utilisateur de démonstration du stub /api/session. Aucune donnée client réelle.
