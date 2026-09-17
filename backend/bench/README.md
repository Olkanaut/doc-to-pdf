# Banc d'essai de l'assistant IA

Mesure ce que l'assistant de l'éditeur de templates fait vraiment d'une instruction en
français : est-ce que ça compile, est-ce que ça fait ce qui était demandé, est-ce que ça
survit à la régénération du bloc `dots:layout`, et qu'est-ce que ça casse au passage.

## Ce qu'il faut avant

- le backend qui tourne (`npm run dev` dans `backend/`), avec `ANTHROPIC_API_KEY` dans
  `backend/.env` — sinon le banc s'arrête en le disant ;
- `typst`, `pdftoppm` et `pdftotext` sur le PATH (déjà nécessaires au projet) ;
- `python3` avec Pillow, pour la mesure d'encre.

**Chaque exécution appelle l'API Anthropic et coûte de l'argent** : 21 cas × 2 = 42 appels
par défaut, une dizaine de minutes. Rien ne tourne en CI.

## Lancer

```bash
cd backend

# le banc complet, deux exécutions par cas
npm run bench

# un sous-ensemble, une seule exécution
ONLY=marges-3cm,texte-blanc REPS=1 npm run bench

# renoter des exécutions déjà enregistrées, sans rappeler l'API
npm run bench:score -- runs
```

### Le tour rapide

Quatre cas, une exécution chacun : de quoi voir en ~35 s si une modification du prompt ou
du client casse quelque chose. Ce ne sont pas les plus exigeants, ce sont les plus courts.

```bash
ONLY=libre-renomme-ministere,marges-3cm,paysage,tableaux REPS=1 npm run bench
```

Durées mesurées le 17/09/2026 (Sonnet 5, cache actif, `DOTS_AI_EFFORT=low`) :
`libre-renomme-ministere` 5 s, `paysage` 8 s, `marges-3cm` 8 s, `tableaux` 8 s.
La compilation Typst ne pèse que ~180 ms là-dedans : le reste est la génération.

`DOTS_BENCH_API=http://localhost:4002/api/ai/template` pointe le banc sur un autre backend,
ce qui permet de comparer deux réglages sans toucher au serveur de travail.

`OUT=<dossier>` change la destination (`runs` par défaut), ce qui permet de comparer deux
états du prompt : `OUT=runs-avant npm run bench`, puis la modification, puis
`OUT=runs-apres npm run bench`, puis `npm run bench:score -- runs-avant` et
`npm run bench:score -- runs-apres` — **les deux renotés par le même code**, sinon la
comparaison ne vaut rien.

## Ce que les colonnes veulent dire

| colonne                    | question                                                                                                                                                        |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `compile`                  | la compilation Typst réelle, celle que le backend fait déjà avant de proposer                                                                                   |
| `inclus`                   | `#include "body.typ"` toujours présent une fois — sinon le corps disparaît du PDF                                                                               |
| `bloc`                     | le bloc `dots:layout` est préservé (ou pas créé s'il n'y en avait pas)                                                                                          |
| `cohérent`                 | régénérer le bloc depuis son JSON redonne la source. Faux = ce que l'assistant a écrit à la main sera écrasé au premier réglage touché dans le panneau          |
| `intention`                | le contrôle propre au cas (marges à 30 mm, `flipped: true`, pied absent de la première page…)                                                                   |
| `collatéral`               | champs du JSON modifiés sans avoir été demandés. **Attention** : calculé après `sanitizeLayout`, donc une valeur hors bornes n'y apparaît jamais — voir `borne` |
| `borne`                    | champs que `sanitizeLayout` a réécrits en silence à la relecture                                                                                                |
| `encre` / `mots` / `pages` | ce que le PDF montre. Beaucoup de mots avec peu d'encre = texte présent mais invisible                                                                          |

## Ajouter un cas

Dans `cases.ts` : un objet `{ id, base, instruction, allowed?, check }`. `base` vaut
`gere` (template avec bloc `dots:layout`) ou `libre` (template écrit à la main,
`templates/republique-francaise.typ`). `allowed` liste les chemins du JSON dont le
changement est demandé ; tout le reste compte comme collatéral. `check` renvoie `null` si
l'intention est tenue, sinon la raison.

Écris le contrôle sur le **résultat**, pas sur le moyen : deux cas ont dû être corrigés
parce qu'ils exigeaient une écriture précise dans le JSON alors que la bonne réponse était
une surcharge après le bloc.
