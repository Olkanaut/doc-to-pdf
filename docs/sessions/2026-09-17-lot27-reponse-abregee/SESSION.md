# Lot 27 — réponse abrégée : le modèle renvoie un correctif, plus la template recopiée

## Meta

- Date : 2026-09-17
- Lot : 27
- Scope : `backend/src/ai/prompt.ts`, `backend/src/ai/parse.ts`, `backend/src/ai/parse.test.ts`,
  `backend/src/routes/ai.ts`, `backend/bench/cases.ts`, `backend/bench/rescore.ts`.
- Commit début : 6c1ce66 · rebasé par fast-forward sur 19d95f2 avant de committer
- Commit fin : deux commits — `4232fb0 fix(bench): réparer le renommage qui cassait la
  renotation` pour les réparations du banc, et `perf(assistant): réponse abrégée…` pour
  le reste. L'empreinte du second ne peut pas figurer ici : elle dépend de ce fichier.
- Statut : TERMINE

## Le résultat, d'abord

Cinq cas, deux exécutions, **renotés tous les quatre par le même `bench/rescore.ts`** :

| | médiane | compile | intention | cohérent | collatéral |
|---|---|---|---|---|---|
| A — `main` tel quel | **10,30 s** | 8/8 | 8/8 | 4/6 | 0 |
| C — cache + `effort=low` (lot 26) | **7,83 s** | 8/8 | 8/8 | 4/6 | 0 |
| D — + type corrigé dans le prompt | **7,83 s** | 10/10 | 10/10 | 6/8 | 0 |
| F — + réponse abrégée | **2,62 s** | 10/10 | 10/10 | **8/8** | 0 |

**3,9 × plus rapide qu'au départ, et aucune colonne de qualité ne baisse — deux montent.**

Le mécanisme, mesuré sur les jetons de sortie :

```
D — recopie complète     n=10  sortie: méd 1030  min 611  max 1442
F — correctif JSON       n=10  sortie: méd   51  min  22  max  572
```

`cohérent` passe à 8/8 par construction, pas par chance : le serveur régénère le bloc
depuis le JSON fusionné (`applyLayout`), exactement comme le panneau. Il ne peut plus
diverger. `libre-renomme-ministere` reste à 5 s et passe par `<typst>` — c'est une
template libre, sans bloc : le modèle a choisi la bonne branche, deux fois sur deux.

## Definition de fin + preuve BRUTE

### F — le tableau complet

```
cas                        rep  http  compile  inclus  bloc  cohérent  intention  collatéral  s
marges-3cm                 1    200   oui      1       ok    oui       oui        0           2
marges-3cm                 2    200   oui      1       ok    oui       oui        0           3
paysage                    1    200   oui      1       ok    oui       oui        0           2
paysage                    2    200   oui      1       ok    oui       oui        0           2
logo-entete-droite         1    200   oui      1       ok    oui       oui        0           3
logo-entete-droite         2    200   oui      1       ok    oui       oui        0           3
tableaux                   1    200   oui      1       ok    oui       oui        0           3
tableaux                   2    200   oui      1       ok    oui       oui        0           2
libre-renomme-ministere    1    200   oui      1       ok    —         oui        0           5
libre-renomme-ministere    2    200   oui      1       ok    —         oui        0           5

durée médiane : 2.618 s
```

### Renotation des quatre jeux par le même code

```
runs-vitesse-a — compile 8/8 · intention 8/8 · bloc préservé 8/8 · cohérent 4/6 · sans collatéral 8/8
runs-vitesse-c — compile 8/8 · intention 8/8 · bloc préservé 8/8 · cohérent 4/6 · sans collatéral 8/8
runs-vitesse-d — compile 10/10 · intention 10/10 · bloc préservé 10/10 · cohérent 6/8 · sans collatéral 10/10
runs-vitesse-f — compile 10/10 · intention 10/10 · bloc préservé 10/10 · cohérent 8/8 · sans collatéral 10/10
```

### Contrôles du dépôt

```
$ cd backend && npx vitest run
      Tests  137 passed | 17 skipped (154)      (130 avant ce lot : 7 tests ajoutés)

$ cd backend && npx tsc --noEmit -p tsconfig.json
(aucune sortie)
```

## Trois pannes antérieures trouvées en chemin

**1. Le prompt décrivait un type disparu.** `LAYOUT_CONFIG_TYPE` annonçait
`header: { enabled, mode, first, text, logo, … }` et un `PageBandMode`. Le vrai type est
`header: Band { blocks: Block[]; spacing }` depuis le passage aux blocs
(`backend/src/layout/layoutConfig.ts:78, 100`). Le modèle s'en sortait en recopiant la
forme qu'il voyait dans la template, mais toutes les consignes du prompt portaient sur des
champs inexistants.

**2. Le prompt affirmait qu'un logo à droite était impossible.** « il n'existe aucun champ
pour un logo à droite » — faux : `imagePosition: "right"` existe et est honoré
(`backend/src/layout/layoutTypst.ts:190-191`). Le cas `logo-entete-droite` échouait aux
lots 19, 20 et 21 **parce qu'on avait dit au modèle de ne pas le faire**. Phrase corrigée ;
le cas passe désormais 2/2, en JSON, sans surcharge.

**3. `npm run bench:score` plantait.** Deux identifiants `template` parachutés par le
renommage de terminologie (commit `e63b019`) :

```
ReferenceError: template is not defined
    at bench/rescore.ts:52    (une instruction morte dans un IIFE)
    at bench/rescore.ts:65    (un second argument parasite passé à .filter)
```

Les deux supprimés. La renotation, que le README du banc présente comme la seule
comparaison valable, était donc inutilisable depuis ce commit.

**4. Le cas `logo-entete-droite` du banc notait sur l'ancien type.** Il testait
`layout.header.logo` et `layout.header.align`, et listait `header.logo`, `header.enabled`,
`header.first` comme champs autorisés. Réponse correcte du modèle → notée en échec, avec
13 « changements collatéraux » qui n'étaient que les champs du bloc créé. Contrôle réécrit
sur le résultat (un bloc portant l'image, posé à droite), comme le README l'exige.

## Une régression que j'ai introduite, mesurée, puis corrigée

Première version du contrat, collée **après** le format de réponse : le modèle l'a lu comme
un format de remplacement et a cessé d'écrire `<summary>` et `<changes>`.

```
runs-vitesse-e (avant correction)
  logo-entete-droite#1  summary vide  changes 0
  marges-3cm#1          summary vide  changes 0
  …
  résumés vides : 8/10   (seules les deux réponses en <typst> gardaient le leur)
```

C'est le travail des lots 20 et 21 qui partait avec : le résumé est l'endroit où
l'assistant nomme ce que la modification fait perdre. Format restructuré — `<summary>` et
`<changes>` sortis de l'alternative, annoncés comme obligatoires « quelle que soit la
réponse » — puis remesuré :

```
runs-vitesse-f
  résumés vides : 0/10
  exemple : « Ajout du logo 42_Logo.png dans l'en-tête, aligné à droite. »
            ['header.blocks contient un bloc image seul positionné à droite']
```

Coût de la correction : 2,30 s → 2,62 s de médiane.

## Ce qui reste faux dans le banc, non corrigé

`bench/cases.ts` référence encore l'ancien type à quinze endroits, dans trois cas et dans
le constructeur de base :

```
l.26, l.27   : Property 'text' does not exist on type 'Band' / 'FooterBand'
l.128–140    : 'enabled', 'align', 'mode', 'first', 'firstPage' — cas pagination-pas-page-1
l.223        : 'rule' does not exist on type 'Band' — cas entete-sans-filet
l.334        : 'enabled' does not exist on type 'Band' — cas enleve-entete
```

`pagination-pas-page-1` et `entete-sans-filet` figurent parmi les échecs répétés des lots
19 à 21. **Ils sont peut-être faux de la même manière que `logo-entete-droite` l'était.**
Je n'ai pas réécrit ces trois cas : c'est un chantier à part, et le faire changerait la
lecture de trois attestations déjà signées.

## Criteres non atteints

- **Cinq cas sur vingt et un.** Les sept instructions destructrices n'ont **pas** tourné en
  mode abrégé — et c'est précisément là que le résumé compte (lot 21). Le gain de vitesse
  est établi ; que le mode abrégé préserve la prévention des dégâts ne l'est **pas**.
- **Deux exécutions par cas**, échantillon trop petit pour un écart fin. Seul l'écart
  10,3 → 2,6 s est hors de tout doute.
- **Les deux modes sont désactivés par défaut** : `DOTS_AI_PATCH` et `DOTS_AI_EFFORT` ne
  sont posés nulle part dans le dépôt. Sans eux, le comportement est celui d'avant, avec le
  type corrigé en plus.
- **Le frontend n'a pas été ouvert.** La route renvoie toujours `source`, donc rien ne
  devrait changer côté navigateur — **lu dans le code, pas vérifié en exécution**.
- **`/api/ai/template-from-pdf` n'est pas concerné** : pas de source de départ, donc pas de
  bloc à corriger. Le chemin abrégé y est refusé explicitement (`routes/ai.ts:97-100`),
  non testé.

## Ecarts rencontres

- Le lot mélange deux choses : une correction (le type réel dans le prompt) et une
  modification de conception (la réponse abrégée). J'ai mesuré D pour les séparer — la
  correction seule vaut `intention 8/8 → 10/10`, la réponse abrégée vaut la vitesse et
  `cohérent 6/8 → 8/8`.
- Le banc a tourné sur un backend séparé (`PORT=4002`), arrêté en fin de lot
  (`:4002 arrêté`). Le serveur de travail n'a pas été redémarré, `backend/.env` pas modifié.
- ~34 appels API pour ce lot, ~54 sur la journée avec le lot 26.

## Decision / choix

_(à remplir après revue humaine)_

1. **Le type corrigé dans le prompt** n'a pas de raison d'attendre : il répare une
   affirmation fausse. Le test de dérive (`parse.test.ts`) empêche la rechute.
2. **La réponse abrégée** demande le banc complet avant d'être activée par défaut,
   spécialement les sept instructions destructrices.
3. **Les trois cas de banc encore faux** : à réécrire, ou à laisser en sachant qu'ils
   notent peut-être à tort.
4. **`effort=low`** : toujours ouvert depuis le lot 26.

## Confidentialite

Fixtures synthétiques du banc uniquement. Aucune donnée client. Les journaux du backend de
test ne contiennent que des compteurs de jetons.
