# CLAUDE.md — doc-to-pdf

## Règle absolue : rien ne part sans relecture humaine

**Ne jamais commiter, pousser, ouvrir ou fusionner une PR sans accord explicite
préalable.** Pas d'exception, pas d'interprétation extensive.

Concrètement, ces commandes sont interdites tant que l'humain n'a pas dit oui
**pour cette action précise** :

```
git commit        git push          git merge         git rebase
gh pr create      gh pr merge       gh pr close       gh release create
```

Ce qui **ne compte pas** comme un accord :

- « fais ce qu'il faut pour que mes coéquipiers aient le guide »
- « le guide sera poussé sur git »
- avoir été autorisé à commiter une fois auparavant
- le fait que ce soit une branche et pas `main`, ou une PR et pas une fusion
- le fait que ce soit facilement annulable

Un accord vaut **une fois, pour une action nommée**. Il ne se reporte pas sur la
suivante.

### Ce qu'il faut faire à la place

Préparer le travail dans l'arbre, puis **s'arrêter et montrer** :

1. `git status --short` et `git diff --stat` — ce qui a changé ;
2. le message de commit proposé, en toutes lettres ;
3. la cible : quelle branche, quel dépôt, PR ou pas.

Puis attendre. C'est l'humain qui lance `git commit` et `git push`, ou qui le
demande explicitement.

### Pourquoi

Le dépôt est partagé avec une équipe. Un commit ou une PR est visible par d'autres
personnes immédiatement : ça n'a pas le même statut qu'un fichier local, même si
techniquement ça se supprime. La relecture avant publication n'est pas une formalité,
c'est le contrôle qualité.

---

## Le reste du travail

Tout ce qui ne publie rien reste libre : lire, chercher, écrire des fichiers,
installer des dépendances, lancer les serveurs, faire tourner les tests, rendre des
PDF, explorer la stack Docs locale.

## Règle de preuve

Toute affirmation technique porte un chemin de fichier + numéro de ligne, ou la
commande exécutée et sa sortie. Sinon, la marquer comme hypothèse.

Ne jamais écrire « c'est fait » ou « les tests passent » sans coller la sortie qui le
montre. Distinguer explicitement, dans chaque compte rendu : **confirmé en exécution**
/ **lu dans le code** / **supposé**.

## Prose

Courte, factuelle, sans superlatif. Dire aussi ce qui n'est **pas** fait, pas
seulement ce qui marche.

## Décisions

Ne pas trancher à la place de l'humain. Présenter les options avec leur coût, donner
une recommandation motivée, et laisser la décision ouverte.

---

## Mon périmètre : l'éditeur de gabarits

Je suis chargé de **l'éditeur de gabarits Typst**, sur une nouvelle route
`/template/editor`. C'est mon seul périmètre côté produit : le reste de l'app
appartient à des coéquipiers, et leur travail arrive par PR sur `main`.

### Ce qui est à moi

- `frontend/src/pages/` — la page de l'éditeur
- `frontend/src/components/TemplateEditor.tsx`
- côté backend, les routes de gabarits si l'éditeur en a besoin :
  `backend/src/routes/templates.ts`, `backend/src/registry/templates.ts`

### Ce qui ne l'est pas

`ComposePage`, `TemplatesListPage`, la couture d'authentification
(`auth/AuthContext.tsx`, `auth/ProtectedRoute.tsx`, `backend/src/routes/session.ts`),
le convertisseur (`backend/src/convert/`). Ne pas y toucher sans me le signaler
d'abord : ce sont des chantiers ouverts chez d'autres.

### À régler avant d'écrire du code

**Un éditeur existe déjà**, arrivé par la PR #2 : `frontend/src/pages/TemplateEditorPage.tsx`
(141 lignes), sur la route `/templates/:id`. Il gère déjà le nom, la description, la
source Typst en `<textarea>`, la sauvegarde (`updateTemplate`), la suppression, le
téléchargement `.typ`, le partage, et un **aperçu en direct** qui rend la source non
sauvegardée contre une fixture (`renderPdf({ fixtureId, templateSource })`).

La création existe aussi : « Nouveau gabarit » dans `TemplatesListPage` appelle
`createTemplate` puis redirige vers `/templates/:id`.

### Ce que ma route apporte de plus

Tranché : `/template/editor` **s'ajoute** à `/templates/:id`, elle ne le remplace pas.
Les deux éditent le même objet par deux moyens différents :

| Route | Quoi | Pour qui |
|---|---|---|
| `/templates/:id` (existant) | la **source Typst**, dans un `<textarea>` | qui sait écrire du Typst |
| `/template/editor` (à faire) | la **mise en page**, par des contrôles | qui ne sait pas, et ne veut pas apprendre |

C'est un éditeur de mise en page, pas un éditeur de texte : marges, en-tête, logo,
typographie, numérotation — réglés par des champs, pas par du code. Il produit du
Typst, il n'en fait pas écrire.

Référence de conception : `~/Documents/sa_soft/sa-soft-scoped`, projet « Mike » du
même auteur. Son éditeur de mise en page est `src/components/clauses/MiseEnPageTab.tsx`
(909 l.), avec `src/lib/layout-render.ts` (795 l.), `layouts-store.ts` (255 l.) et
`layout-deduce.ts` (231 l.). `DIAGNOSTIC-MISE-EN-PAGE.md` (399 l.) y recense les
pièges déjà rencontrés. Le fossé à franchir : Mike rend du web, ici on rend du Typst.

### Ce qui reste à trancher

Le nommage. L'app dit `/templates` au pluriel partout ; `/template/editor` au
singulier détonne. À aligner ou à assumer, mais à décider avant d'écrire les liens.

Et la question de fond, qui n'est pas technique : que se passe-t-il quand quelqu'un
règle sa mise en page par les contrôles **puis** modifie la source à la main ? Les
deux éditeurs écrivent le même `template.typ`. Soit le second écrase le premier, soit
il faut savoir relire les réglages depuis la source — ce que `layout-deduce.ts` fait
justement chez Mike. À regarder avant de choisir.

---

## Mise en place locale

Voir [SETUP-LOCAL.md](SETUP-LOCAL.md). `./dev/setup-local.sh --verify` contrôle l'état
sans rien installer.

Deux pièges extérieurs à ce dépôt, traités par le script : le backend de
`suitenumerique/docs` ne compile pas tel quel (cinq `except A, B:` de syntaxe
Python 2, sur `main` comme sur `v5.6.0`), et Docs occupe le port 4000 — celui du
backend Fastify de ce projet.
