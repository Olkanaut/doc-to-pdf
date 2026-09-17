# Lot 19 — banc d'essai de l'assistant IA (édition de templates Typst)

## Meta

- Date : 2026-09-17
- Lot : 19
- Scope : mesure seule. **Aucun fichier du dépôt modifié** ; le harnais vit hors dépôt
  (`<scratchpad>/ia-eval/`), la route testée est `POST /api/ai/template` telle qu'elle est
  sur `main`.
- Commit début : 9eb0283 Commit fin : 9eb0283 (aucun commit)
- Statut : TERMINE

## Protocole

14 instructitemplatefrançais, 2 exécutions chacune = 28 appels réels à l'API (modèle
`claude-sonnet-5`, `DOTS_AI_MODEL` de `backend/.env`), 4 en parallèle, backend local sur
:4000. Deux templates de départ : un **géré** (bloc `// dots:layout`, produit par
`applyLayout(defaultLayout())`) et un **libre** (`backend/templates/republique-francaise.typ`).

Chaque réponse passe six contrôles mécaniques (compilation Typst réelle, `#include "body.typ"`
conservé, bloc préservé, cohérence JSON ↔ Typst, contrôle propre à l'instruction, champs du
JSON modifiés sans avoir été demandés), puis un juge par cas et un sceptique chargé de le
réfuter (26 agents, 0 erreur).

## Définition de fin + preuve BRUTE

### Banc mécanique — sortie intégrale

```
cas                        rep  http  compile  inclus  bloc  cohérent  intention  collatéral  s
marges-3cm                 1    200   oui      1       ok    oui       oui        0           9
marges-3cm                 2    200   oui      1       ok    oui       oui        0           9
paysage                    1    200   oui      1       ok    oui       oui        0           9
paysage                    2    200   oui      1       ok    oui       oui        0           9
pagination-pas-page-1      1    200   oui      1       ok    NON       oui        0           17
pagination-pas-page-1      2    200   oui      1       ok    NON       oui        0           15
logo-entete-droite         1    200   oui      1       ok    NON       NON        0           14
logo-entete-droite         2    200   oui      1       ok    NON       NON        0           20
titres-bleu-marianne       1    200   oui      1       ok    NON       oui        0           11
titres-bleu-marianne       2    200   oui      1       ok    NON       oui        0           11
police-arial-10            1    200   oui      1       ok    NON       oui        0           15
police-arial-10            2    200   oui      1       ok    oui       oui        0           13
tableaux                   1    200   oui      1       ok    NON       oui        0           11
tableaux                   2    200   oui      1       ok    NON       oui        0           11
entete-sans-filet          1    200   oui      1       ok    oui       oui        0           8
entete-sans-filet          2    200   oui      1       ok    NON       oui        0           9
marges-pouces              1    200   oui      1       ok    oui       oui        0           10
marges-pouces              2    200   oui      1       ok    oui       oui        0           10
libre-marges-3cm           1    200   oui      1       ok    —         oui        0           5
libre-marges-3cm           2    200   oui      1       ok    —         oui        0           5
libre-renomme-ministere    1    200   oui      1       ok    —         oui        0           4
libre-renomme-ministere    2    200   oui      1       ok    —         oui        0           4
logo-inexistant            1    200   oui      1       ok    NON       oui        0           12
logo-inexistant            2    200   oui      1       ok    NON       oui        0           14
demande-vague              1    200   oui      1       ok    NON       oui        0           16
demande-vague              2    200   oui      1       ok    NON       oui        0           23
retire-include             1    200   oui      1       ok    oui       oui        0           11
retire-include             2    200   oui      1       ok    oui       oui        0           13

compile : 28/28 · intention tenue : 26/28 · bloc préservé : 28/28 · cohérent : 10/24 · sans collatéral : 28/28
durée médiane : 10.732 s
```

### La modification survit-elle à une régénération du bloc par le panneau ?

```
cas                          avant  après sauvegarde
entete-sans-filet#1          oui    oui
entete-sans-filet#2          oui    oui
logo-entete-droite#1         NON    NON
logo-entete-droite#2         NON    NON
marges-3cm#1                 oui    oui
marges-3cm#2                 oui    oui
marges-pouces#1              oui    oui
marges-pouces#2              oui    oui
pagination-pas-page-1#1      oui    oui
pagination-pas-page-1#2      oui    oui
paysage#1                    oui    oui
paysage#2                    oui    oui
police-arial-10#1            oui    oui
police-arial-10#2            oui    oui
tableaux#1                   oui    oui
tableaux#2                   oui    oui
titres-bleu-marianne#1       oui    oui
titres-bleu-marianne#2       oui    oui

tenue tout de suite : 16/18 · tenue après une sauvegarde du panneau : 16/18
```

### Divergence Typst ↔ JSON dans le bloc géré

```
réponses dont le Typst du bloc diverge du JSON : 14 / 24 (bases gérées)
  demande-vague#1              lignes écrites par l'IA que la régénération jette : 8
  demande-vague#2              lignes écrites par l'IA que la régénération jette : 8
  entete-sans-filet#2          lignes écrites par l'IA que la régénération jette : 0
  logo-entete-droite#1         lignes écrites par l'IA que la régénération jette : 6
  logo-entete-droite#2         lignes écrites par l'IA que la régénération jette : 6
  logo-inexistant#1            lignes écrites par l'IA que la régénération jette : 7
  logo-inexistant#2            lignes écrites par l'IA que la régénération jette : 8
  pagination-pas-page-1#1      lignes écrites par l'IA que la régénération jette : 8
  pagination-pas-page-1#2      lignes écrites par l'IA que la régénération jette : 8
  police-arial-10#1            lignes écrites par l'IA que la régénération jette : 4
  tableaux#1                   lignes écrites par l'IA que la régénération jette : 4
  tableaux#2                   lignes écrites par l'IA que la régénération jette : 4
  titres-bleu-marianne#1       lignes écrites par l'IA que la régénération jette : 2
  titres-bleu-marianne#2       lignes écrites par l'IA que la régénération jette : 2
```

### Jugement qualitatif (14 juges + 12 sceptiques)

```
cas                        intent résumé  stable  note  sceptique
paysage                    oui    oui     oui     5     confirme
entete-sans-filet          oui    oui     oui     4     RÉFUTE
marges-3cm                 oui    oui     oui     5     confirme
tableaux                   oui    oui     oui     4     RÉFUTE
logo-entete-droite         oui    oui     oui     2     RÉFUTE
libre-renomme-ministere    oui    oui     oui     5     confirme
police-arial-10            oui    oui     NON     4     RÉFUTE
marges-pouces              oui    oui     oui     5     confirme
titres-bleu-marianne       oui    oui     oui     4     RÉFUTE
pagination-pas-page-1      oui    oui     oui     5     confirme
retire-include             NON    oui     oui     4     —
logo-inexistant            NON    oui     oui     3     —
libre-marges-3cm           oui    oui     oui     3     RÉFUTE
demande-vague              oui    NON     oui     2     RÉFUTE

note moyenne : 3.93 — 7 verdicts positifs sur 12 réfutés par le sceptique
```

## Ce que ça dit

1. **La production Typst est fiable** : 28/28 compilent, 28/28 gardent `#include "body.typ"`
   une fois et le bloc géré, 0 fichier image inventé. Médiane 10,7 s.
2. **Sur ce que le panneau sait exprimer, l'assistant est chirurgical** : sur les 9 cas à
   périmètre déclaré, 0 champ du JSON modifié sans avoir été demandé, et 16/18 intentions
   tenues même après régénération du bloc.
3. **Le défaut de structure** : 14 réponses sur 24 (bases gérées) écrivent dans le bloc un
   Typst que le générateur ne produirait pas. Le Typst est juste à l'écran, mais
   `composeLayout` → `applyLayout` (déclenché par le premier réglage touché dans le panneau,
   `frontend/src/pages/LayoutEditorPage.tsx:115-131` et `:179-190`) réécrit tout le bloc
   depuis le JSON : le travail manuscrit dtemplatet.
4. **Un cas où la demande n'est pas exprimable** : « logo à droite » n'existe pas dans le
   modèle (`backend/src/layout/layoutTypst.ts:101-104` place le logo en colonne 1 ;
   `header.align` ne pilote que le texte). L'assistant écrit la grille à la main et laisse
   `"align":"left"` : le PDF est bon, le panneau affiche « gauche », et le premier réglage
   ramène le logo à gauche. 2 exécutions sur 2.
5. **Un cas de dégât invisible** : sur le template libre, « marges à 3 cm » fait passer
   `top: 4.2cm` à `3cm` et décapite le bloc Marianne — encre au bord physique de la page,
   mesuré au rendu par le sceptique (150 et 300 ppi). L'assistant ne prévient pas.
6. **Sur demande vague, il déborde** : ajout d'un logo jamais demandé, et résumé qui annonce
   des choses absentes du diff (« petites capitales » : 0 occurrence de `smallcaps` ;
   « teinte plus profonde » alors que la couleur est inchangée). Seul cas où le résumé ment.
7. **Robustesse : bonne.** Logo inexistant → substitution annoncée explicitement dans le
   résumé. « Supprime `#include "body.typ"` » → refus motivé, 2 fois sur 2.

## Écarts rencontrés

- La colonne « collatéral » du banc ne vaut que pour les 9 cas à périmètre déclaré ; ailleurs
  elle vaut 0 par construction (aucune liste `allowed`). Corrigé dans la lecture, pas dans le
  code : `demande-vague` change en réalité 9 champs du JSON.
- Le contrôle du cas `demande-vague` est `() => ok()` : sa colonne « intention » ne prouve rien.
- Premier énoncé faux de ma part, corrigé après lecture du code : le bloc n'est pas réécrit
  « à la sauvegarde » (`handleSave` enregistre la source telle quelle) mais **au premier
  réglage touché dans le panneau**.

## Ce qui n'est PAS fait

- Aucun correctif : ce lot mesure, il ne répare pas.
- Pas d'essai de la route `POST /api/ai/template-from-pdf` (import depuis un PDF).
- Un seul modèle (`claude-sonnet-5`), pas de comparaison, pas de variation de température.
- 2 exécutions par cas : assez pour voir une instabilité, pas pour la quantifier.

## Décision / choix

LAISSER OUVERT — revue humaine.

## Confidentialité

templates et fixtures du dépôt uniquement (`republique-francaise.typ`, `simple-note`), aucune
donnée client. La clé API n'apparaît nulle part dans les sorties.
