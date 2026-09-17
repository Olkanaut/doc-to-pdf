# Lot 20 — quatre modifications du prompt système de l'assistant, mesurées

## Meta
- Date : 2026-09-17
- Lot : 20
- Scope : `backend/src/ai/prompt.ts` (seul fichier du dépôt modifié, +9 −2)
- Commit début : db56ebd   Commit fin : **aucun** (modification non commitée)
- Statut : TERMINE

## Ce qui a été changé
1. **Garde-fou marges/bandes** : l'en-tête et le pied vivent dans la marge, bande utile
   ≈ 0,7 × marge ; vérifier avant de réduire `margin.top`/`margin.bottom`, et le dire.
2. **Le bloc géré est ENGENDRÉ** : le JSON est la seule source durable, le Typst sous lui
   est jetable ; ne jamais écrire dans le bloc un réglage que le JSON ne porte pas.
3. **Échappatoire nommée** : ce que le type ne sait pas exprimer se met après
   `// dots:layout end`, ces lignes étant conservées par la régénération ; plus la liste
   des limites connues (logo toujours en première colonne, pas d'interlettrage…).
4. **Retenue et honnêteté** : ne rien ajouter qui n'ait été demandé ; le `<summary>` ne
   décrit que ce qui a réellement été écrit.

## Protocole
Deux passes du même banc (14 instructions × 2 exécutions = 28 appels réels), à modèle
identique (`db56ebd`, `claude-sonnet-5`), la première avec le prompt d'origine, la seconde
après le patch. Les deux passes sont **renotées par le même code** après coup
(`rescore.mts`), pour que la comparaison ne dépende pas d'une évolution des contrôles.

## Définition de fin + preuve BRUTE

### Les deux passes, mêmes contrôles
```
runs-avant — compile 28/28 · intention 28/28 · bloc préservé 28/28 · cohérent 11/24 · sans collatéral 27/28 · réponses avec surcharge hors bloc 0/28
   demande-vague#1 — incohérent
   demande-vague#2 — incohérent
   logo-entete-droite#1 — incohérent
   logo-entete-droite#2 — incohérent
   logo-inexistant#1 — incohérent
   logo-inexistant#2 — incohérent
   pagination-pas-page-1#1 — incohérent — non demandé: footer.text
   pagination-pas-page-1#2 — incohérent
   police-arial-10#1 — incohérent
   tableaux#1 — incohérent
   tableaux#2 — incohérent
   titres-bleu-marianne#1 — incohérent
   titres-bleu-marianne#2 — incohérent

runs-apres — compile 28/28 · intention 28/28 · bloc préservé 28/28 · cohérent 15/24 · sans collatéral 27/28 · réponses avec surcharge hors bloc 4/28
   demande-vague#1 — incohérent
   demande-vague#2 — incohérent
   logo-inexistant#2 — incohérent
   pagination-pas-page-1#1 — incohérent
   pagination-pas-page-1#2 — incohérent — non demandé: footer.text
   tableaux#1 — incohérent
   tableaux#2 — incohérent
   titres-bleu-marianne#1 — incohérent
   titres-bleu-marianne#2 — incohérent
```

### Lignes manuscrites que la régénération du panneau jette
```
avant : 74
après : 48
```

### Le cas « logo à droite », rendu réel après régénération du bloc
Avant (prompt d'origine) : le JSON portait `align:"right"` mais le logo est codé en dur en
première colonne — après régénération, **le logo est à gauche et le texte à droite**, soit
l'inverse de la demande.
Après (prompt patché) : `header.logo` reste `null`, l'en-tête complet est posé en surcharge
après `// dots:layout end`, et **le rendu régénéré garde le texte à gauche et le logo à
droite**. Captures : `<scratchpad>/ia-eval/logo-rendu/crop-avant1-regenere.png` et
`crop-apres1-regenere.png`.

Résumé produit par l'assistant après le patch, exécution 1 :
```
Ajout du logo 42_Logo.png aligné à droite dans l'en-tête, via une surcharge après le bloc
dots:layout car ce positionnement n'est pas exprimable dans le JSON.
```

### Types
```
$ npx tsc --noEmit   (backend)
(exit 0)
```

## Écarts rencontrés
- **Deux contrôles du banc étaient liés au moyen, pas au résultat**, et notaient en échec
  des réponses correctes du prompt patché : `logo-entete-droite` exigeait `header.logo` dans
  le JSON (alors que la bonne réponse est justement de ne pas l'y mettre et de surcharger
  après le bloc), et `pagination-pas-page-1` n'acceptait que `mode:"except-first"` alors que
  `different-first` avec une première bande vide fait le même effet. Corrigés, puis les deux
  passes renotées ensemble. Sans cette correction, le patch aurait été mesuré à 24/28 au lieu
  de 28/28 sur l'intention.
- Le logo non demandé de la question vague : 1 exécution sur 2 avant, 0 sur 2 après —
  échantillon trop petit pour conclure.

## Ce qui n'est PAS fait
- 9 réponses sur 24 restent incohérentes après le patch (`tableaux`, `titres-bleu-marianne`,
  `demande-vague`, `pagination`, `logo-inexistant#2`) : l'assistant met le JSON à jour mais
  réécrit le Typst du bloc dans son style. L'effet demandé survit, la mise en forme non.
- Le filet de sécurité serveur (renvoyer un drapeau quand
  `applyLayout(source, readLayout(source).layout) !== source`) n'est pas écrit.
- `header.logoAlign` n'est pas ajouté au modèle ; l'échappatoire couvre le besoin, mais le
  panneau continue d'afficher un état qui ne correspond pas au PDF.
- Aucun jugement qualitatif rejoué sur la seconde passe (les 26 agents du lot 19 n'ont pas
  été relancés) : la comparaison ci-dessus est mécanique.

## Décision / choix
LAISSER OUVERT — revue humaine. `backend/src/ai/prompt.ts` est modifié dans l'arbre, non commité.

## Confidentialité
Gabarits et fixtures du dépôt uniquement. Aucune donnée client. La clé API n'apparaît nulle part.
