# Lot 26 — vitesse de l'assistant : mesurer, puis raccourcir

## Meta

- Date : 2026-09-17
- Lot : 26
- Scope : `backend/src/ai/client.ts` (cache de prompt, réglage d'effort, trace d'usage),
  `backend/bench/README.md` (tour rapide documenté). Rien d'autre.
- Commit début : 6c1ce66 · rebasé par fast-forward sur 19d95f2 avant de committer
- Commit fin : le commit `perf(assistant): réponse abrégée…` de `main`. Son empreinte
  ne peut pas figurer ici : elle dépend de ce fichier.
- Statut : TERMINE

## Protocole

Quatre cas du banc — `libre-renomme-ministere`, `marges-3cm`, `paysage`, `tableaux` —
deux exécutions chacun, soit 8 appels réels par configuration, 24 en tout. Les trois
configurations tournent sur le **même code de notation**, et les deux dernières sur un
backend isolé (`PORT=4002`) pour ne pas toucher au serveur de travail.

## Definition de fin + preuve BRUTE

### A — état de `main`, rien de changé

```
cas                        rep  http  compile  inclus  bloc  cohérent  intention  collatéral  s
marges-3cm                 1    200   oui      1       ok    oui       oui        0           10
marges-3cm                 2    200   oui      1       ok    oui       oui        0           13
paysage                    1    200   oui      1       ok    oui       oui        0           9
paysage                    2    200   oui      1       ok    oui       oui        0           8
tableaux                   1    200   oui      1       ok    NON       oui        0           12
tableaux                   2    200   oui      1       ok    NON       oui        0           11
libre-renomme-ministere    1    200   oui      1       ok    —         oui        0           5
libre-renomme-ministere    2    200   oui      1       ok    —         oui        0           6

compile : 8/8 · intention tenue : 8/8 · bloc préservé : 8/8 · cohérent : 4/6 · sans collatéral : 8/8
durée médiane : 10.303 s
```

### B — cache de prompt sur le prompt système

```
marges-3cm                 1    200   oui      1       ok    oui       oui        0           10
marges-3cm                 2    200   oui      1       ok    oui       oui        0           9
paysage                    1    200   oui      1       ok    oui       oui        0           8
paysage                    2    200   oui      1       ok    oui       oui        0           9
tableaux                   1    200   oui      1       ok    NON       oui        0           11
tableaux                   2    200   oui      1       ok    NON       oui        0           11
libre-renomme-ministere    1    200   oui      1       ok    —         oui        0           5
libre-renomme-ministere    2    200   oui      1       ok    —         oui        0           5

compile : 8/8 · intention tenue : 8/8 · bloc préservé : 8/8 · cohérent : 4/6 · sans collatéral : 8/8
durée médiane : 9.234 s
```

Le cache prend réellement — trace d'usage du backend, 3 311 jetons écrits puis relus :

```
{"input_tokens":956,"cache_creation_input_tokens":3311,"cache_read_input_tokens":0,...}
{"input_tokens":514,"cache_creation_input_tokens":0,"cache_read_input_tokens":3311,...}
```

4 écritures puis 4 lectures sur 8 appels : la première exécution de chaque cas paie
l'écriture, la seconde lit. En usage réel (un utilisateur qui enchaîne des demandes sur la
même template), la proportion de lectures est bien plus haute.

### C — cache + `DOTS_AI_EFFORT=low`

```
marges-3cm                 1    200   oui      1       ok    oui       oui        0           8
marges-3cm                 2    200   oui      1       ok    oui       oui        0           8
paysage                    1    200   oui      1       ok    oui       oui        0           8
paysage                    2    200   oui      1       ok    oui       oui        0           8
tableaux                   1    200   oui      1       ok    NON       oui        0           8
tableaux                   2    200   oui      1       ok    NON       oui        0           8
libre-renomme-ministere    1    200   oui      1       ok    —         oui        0           5
libre-renomme-ministere    2    200   oui      1       ok    —         oui        0           5

compile : 8/8 · intention tenue : 8/8 · bloc préservé : 8/8 · cohérent : 4/6 · sans collatéral : 8/8
durée médiane : 7.832 s
```

**10,30 s → 9,23 s → 7,83 s de médiane, soit −24 %.** Les six colonnes de qualité sont
identiques dans les trois configurations, y compris les deux échecs de `tableaux`, qui
sont antérieurs (lots 19-21).

### Où part le temps

```
runs-vitesse-a: total méd 9.6 s · compile Typst méd 180.5 ms
runs-vitesse-c: total méd 7.8 s · compile Typst méd 181.0 ms

cache seul (effort défaut)   n=8  sortie méd=1190 jetons  réflexion méd=122  lectures de cache=4/8
cache + effort=low           n=8  sortie méd=1024 jetons  réflexion méd=0    lectures de cache=4/8
```

La compilation Typst ne pèse que ~180 ms. **Le temps, c'est la génération de la sortie**,
et la sortie, c'est la template réécrite en entier : la base gérée fait 1 799 octets, la
réponse en renvoie 1 799. Pour « marges à 3 cm », le résumé fait 67 octets et la liste des
changements 74 ; les 1 658 restants sont une recopie.

`effort=low` supprime la réflexion (122 → 0 jetons médians) sans rien changer aux six
contrôles. Le reste du gain vient du cache.

### Contrôles du dépôt

```
$ cd backend && npx vitest run
      Tests  130 passed | 17 skipped (147)

$ cd backend && npx tsc --noEmit -p tsconfig.json
(aucune sortie)
```

### Criteres non atteints

- **Quatre cas sur vingt et un.** Le gain de vitesse est mesuré sur ce sous-ensemble, pas
  sur le banc complet, et la qualité non plus : les sept instructions destructrices et les
  cas `demande-vague`, `logo-inexistant`, `police-arial-10`… n'ont pas tourné en `low`.
  Conclure que `effort=low` ne coûte rien demanderait le banc entier, deux fois.
- **Deux exécutions par cas.** L'écart 10,3 → 9,2 (cache seul) tient dans le bruit d'un si
  petit échantillon ; c'est la trace d'usage qui prouve que le cache fonctionne, pas le
  chronomètre. Seul l'écart 10,3 → 7,8 est net.
- **`effort=low` n'est pas activé** : la variable n'est pas posée dans `backend/.env`, donc
  le comportement par défaut du dépôt est inchangé.

## Ecarts rencontres

- Le banc a tourné sur un backend séparé (`PORT=4002`), lancé et arrêté dans la session,
  pour ne pas redémarrer le serveur de travail ni écrire dans `backend/.env`. Arrêt
  vérifié (`:4002 arrêté`).
- La route compile **deux fois** par appel : la proposition, et la source de départ pour la
  comparaison avant/après (`backend/src/routes/ai.ts:90-92`). Soit ~360 ms au lieu de 180.
  Négligeable devant 8 s, donc pas touché ; à noter si la génération devient courte.

## Decision / choix

_(à remplir après revue humaine)_

1. **Le cache de prompt** ne change rien à la réponse et réduit l'entrée facturée de
   3 311 jetons par appel. Je le laisse actif dans le code ; à confirmer ou à retirer.
2. **`effort=low`** : mesuré sans perte sur quatre cas, non mesuré sur les dix-sept autres.
   Le poser en défaut demande soit le banc complet, soit d'accepter le risque.
3. **Le vrai levier n'est pas touché.** La sortie est une recopie de la template entière.
   Si l'assistant renvoyait, pour une template gérée, **seulement les champs modifiés du
   JSON** — le serveur reconstruisant le bloc par `applyLayout`, ce qu'il fait déjà — la
   sortie passerait d'environ 1 024 jetons à moins de 150. Le temps est à peu près
   proportionnel : on viserait 2 à 3 s au lieu de 8.
   Ce que ça coûte : le contrat de réponse change (`prompt.ts`, `parse.ts`, `routes/ai.ts`),
   il faut un mode distinct pour les templates libres, qui n'ont pas de bloc, et les
   surcharges écrites après `// dots:layout end` doivent être préservées explicitement.
   Ce n'est pas un réglage, c'est une modification de conception : **je ne l'ai pas faite**.

## Confidentialite

Fixtures synthétiques du banc uniquement. Aucune donnée client. La clé API n'apparaît dans
aucune sortie ; les journaux du backend de test ne contiennent que des compteurs de jetons.
