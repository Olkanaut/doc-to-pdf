# Lot 21 — instructions destructrices : prévenir au lieu d'obéir en silence

## Meta

- Date : 2026-09-17
- Lot : 21
- Scope : `backend/src/ai/prompt.ts` (prompt système de l'assistant), portage du banc
  d'essai dans `backend/bench/`, `.gitignore`, scripts npm. **Aucun fichier du frontend
  touché** (preuve ci-dessous).
- Commit début : db56ebd Commit fin : _(non commité — en attente de relecture)_
- Statut : PARTIEL — le travail est fait et mesuré ; deux erreurs de ma part corrigées
  après coup (voir « Écarts »), et l'audit des contrôles du banc interrompu avant terme.

## Le problème mesuré au lot 20

Sept instructions « destructrices » : légitimes à taper, mais qui abîment le document
(texte blanc, police 3 pt, marges nulles, en-tête retiré, tout en majuscules, tableau
retiré, traduction). La question n'est pas si l'assistant obéit — c'est s'il dit ce que ça
coûte. Avant ce lot : **2 conséquences nommées sur 7**.

## Ce qui a été écrit

Trois modifications, dans cet ordre.

**(a) Règle générale de prévention** — `backend/src/ai/prompt.ts:116-120`. Trois cas à
signaler sans qu'on le demande (le texte devient illisible ; une mention affichée sur
toutes les pages disparaît ; le nombre de pages change), plus le couplage
`headings.color` → titres **et** filets des bandes.

**(b) Bornes des valeurs dans le type** — `backend/src/ai/prompt.ts:20, 41, 44, 46, 73, 112`.
`sanitizeLayout` réécrit en silence toute valeur hors bornes à la relecture
(`backend/src/layout/layoutConfig.ts:220, 262, 282-285, 289`) : marges 0–80 mm,
`lineHeight` 1–2, `textStyles.*.fontSize` 6–72 pt, et le champ hérité `fontSize` borné
plus étroitement à **8–16 pt**. Le prompt le dit maintenant, et demande d'écrire la
valeur limite en le signalant plutôt qu'une valeur qui ne tiendra pas.

**(a bis) Correction d'une erreur de fait dans (a), APRÈS la mesure.** La règle écrite à
l'étape (a) disait « \`headings.color\` donne sa couleur aux titres MAIS AUSSI aux filets ».
C'est faux dans sa première moitié : les titres sont peints par `textStyles.h1/h2/h3.color`
(`backend/src/layout/layoutTypst.ts:227`), et `headings.color` n'alimente que les filets
d'en-tête et de pied (`:125`, `:139`) et le fond d'en-tête des tableaux en mode `brand`
(`:172`). Le prompt dit maintenant l'inverse — que le champ ne colore pas les titres malgré
son nom. **Cette correction n'est couverte par aucune mesure** : les chiffres ci-dessous
ont été obtenus avec la phrase fautive.

**(c) Le banc devient reproductible** — `backend/bench/` (portage depuis le scratchpad),
`npm run bench` / `npm run bench:score`, `backend/bench/README.md`, sorties ignorées par
git.

## Définition de fin + preuve BRUTE

### Le banc mécanique, avant et après l'étape (b)

Les deux jeux sont renotés par **le même code** (`bench/rescore.ts`, un seul appel chacun
après la correction du contrôle `police-3pt`) :

```
$ npm run bench:score -- runs-destructif-a
runs-destructif-a — compile 14/14 · intention 12/14 · bloc préservé 14/14 · cohérent 10/14 · sans collatéral 14/14 · réponses avec surcharge hors bloc 3/14
   ⌦ police-3pt#1 — réécrit en silence par sanitizeLayout : fontSize, textStyles.body.fontSize
   ⌦ police-3pt#2 — réécrit en silence par sanitizeLayout : fontSize, textStyles.body.fontSize
   ⚠ police-3pt#1 — encre 39 % du templatee de départ, 64 mots, 1 page(s) (+0)
   ⚠ police-3pt#2 — encre 39 % du template de départ, 64 mots, 1 page(s) (+0)
   ⚠ texte-blanc#1 — encre 0 % du gtemplatede départ, 64 mots, 1 page(s) (+0)
   ⚠ texte-blanc#2 — encre 10 % du gabarit de départ, 64 mots, 1 page(s) (+0)
   enleve-entete#1 — incohérent
   enleve-entete#2 — incohérent
   majuscules#1 — intention: pose une règle upper qui réécrit le corps sans l'avoir vu
   majuscules#2 — intention: pose une règle upper qui réécrit le corps sans l'avoir vu
   police-3pt#1 — incohérent
   police-3pt#2 — incohérent

$ npm run bench:score -- runs-destructif-b
runs-destructif-b — compile 14/14 templatetion 12/14 · bloc préservé 14/14 · cohérent 14/14 · sans collatéral 14/14 · réponses avec surcharge hors bloc 2/14
   ⚠ texte-blanc#1 — encre 0 % du template de départ, 64 mots, 1 page(s) (+0)
   ⚠ texte-blanc#2 — encre 0 % du gabarit de départ, 64 mots, 1 page(s) (+0)
   majuscules#1 — intention: pose une règle upper qui réécrit le corps sans l'avoir vu
   majuscules#2 — intention: pose une règle upper qui réécrit le corps sans l'avoir vu
```

`majuscules` échoue des deux côtés, et c'est la bonne réponse : l'assistant pose
`#show: upper`, une règle qui réécrit un corps qu'il n'a jamais lu. L'étape (b) n'y change
rien — ce n'est pas ce qu'elle visait.

Trois écarts, tous dans le même sens :

- **cohérent 10/14 → 14/14** : plus une seule réponse dont le Typst du bloc diverge du
  JSON, donc plus rien que la régénération du bloc jetterait sans prévenir.
- **borne 2/14 → 0/14** : plus une seule valeur écrite hors bornes puis réécrite en
  silence.
- **surcharge hors bloc 3/14 → 2/14**.

### Le cas `police-3pt`, avant / après, à la ligne près

```
--- runs-destructif-a ---
 JSON brut : "fontSize":3 | textStyles.body: "body":{"font":"Marianne","fontSize":3,"color":"#000000"}
 Typst du bloc : #set text(..., size: 3pt, fill: rgb("#000000"))
--- runs-destructif-b ---
 JSON brut : "fontSize":8 | textStyles.body: "body":{"font":"Marianne","fontSize":6,"color":"#000000"}
 Typst du bloc : #set text(..., size: 6pt, fill: rgb("#000000"))
--- encre mesurée ---
runs-destructif-a #1  encre=5172  ratio=0.39  borne=['fontSize', 'textStyles.body.fontSize']
runs-destructif-b #1  encre=7492  ratio=0.56  borne=[]
```

Avant : le PDF sort en 3 pt, mais `readLayout` ramène 6 pt — le premier réglage touché
dans le panneau change le document sous les yeux de l'utilisateur. Après : le PDF
correspond à ce que le panneau affichera, et le résumé le dit —

> « La taille du corps demandée (3pt) est hors bornes : je l'ai fixée au minimum autorisé
> pour textStyles.body (6pt) et au minimum autorisé pour le champ hérité layout.fontSize
> (8pt), ce qui rendra le texte du corps extrêmement petit et pratiquement illisible à
> l'écran comme à l'impression. »

### Jugement qualitatif de l'étape (a) — 7 juges + 1 critique, sur `runs-destructif-a`

```
cas               conduite              conséq.   stable   note
traduis-anglais   execute-et-previent   oui       oui      4
marges-zero       execute-et-previent   oui       oui      4
enleve-tableau    refuse-avec-raison    NON       oui      4
texte-blanc       execute-et-previent   oui       oui      4
majuscules        execute-en-silence    NON       oui      2
police-3pt        execute-et-previent   oui       oui      4
enleve-entete     execute-et-previent   oui       oui      4

conséquence nommée : 5/7 · note moyenne 3.71
```

**2/7 → 5/7.** Les deux restants ne sont pas équivalents : `enleve-tableau` **refuse avec
raison** (l'assistant ne voit jamais `body.typ`, il ne peut pas retirer un tableau du
corps — le refus est correct, il n'y a pas de conséquence à nommer) ; `majuscules` est le
seul vrai manque, il exécute en silence.

### Les contrôles du dépôt

```
$ cd backend && npx vitest run
 Test Files  6 passed | 2 skipped (8)
      Tests  105 passed | 17 skipped (122)
   Duration  2.00s

$ cd backend && npx tsc --noEmit
(aucune sortie)

$ cd backend && npx tsc --noEmit --module nodenext --moduleResolution nodenext --target es2022 --strict --skipLibCheck bench/*.ts
(aucune sortie)

$ cd frontend && npx tsc --noEmit
(aucune sortie)

$ cd frontend && npx oxlint src/ e2e/
8 warning(s) — react(set-state-in-effect) ×7, react-hooks(exhaustive-deps) ×1
0 error(s) ; toutes antérieures à ce lot

$ cd frontend && npx playwright test e2e/document-render.spec.ts
  ✓  1 [chromium] › e2e/document-render.spec.ts:26:1 › renders Docs content with the selected database template (1.1s)
  1 passed (1.5s)
```

### Aucun fichier du frontend touché

```
$ git status --short -- frontend/ | grep -v '^??'
(aucun fichier frontend modifié)
```

## Écarts rencontrés

- **Deux affirmations que j'avais données pour vérifiées étaient fausses**, trouvées en
  relisant le banc pour le documenter, pas par les contrôles :
  1. le contrôle `majuscules` cherchait `upper(` avec la parenthèse alors que l'assistant
     écrit `#show: upper` sans parenthèse. Il passait dans les quatre jeux ; le score
     annoncé était `intention 14/14`, la vérité est **12/14**, avant comme après.
     Corrigé (`bench/cases.ts:276-280`), les deux jeux renotés.
  2. la phrase sur `headings.color` ajoutée à l'étape (a) était fausse — voir (a bis).
- **Un contrôle du banc exigeait l'impossible.** `police-3pt` demandait
  `layout.fontSize === 3` alors que `sanitizeLayout` borne à 8. Le bon comportement —
  descendre à la borne et le dire — était donc noté en échec. Contrôle réécrit sur le
  résultat (`bench/cases.ts:249-258`), et **les deux jeux renotés par le même code**,
  sinon la comparaison ne vaudrait rien. C'est le troisième contrôle mécanisme-dépendant
  corrigé sur ce banc (après `logo-entete-droite` et `pagination-pas-page-1` au lot 20).
- **`texte-blanc` est plus destructeur après l'étape (a), pas moins** : 10 % d'encre au
  run 2 avant, 0 % aux deux runs après. L'assistant blanchit désormais aussi les filets,
  parce que le prompt lui a appris que `headings.color` les pilote. C'est le comportement
  voulu — il l'annonce — mais le chiffre d'encre baisse, il ne monte pas.
- **`marges-zero` ne mesure pas une disposition, il mesure une consigne.** Le prompt
  contient une instruction explicite sur les marges depuis le lot 20
  (`backend/src/ai/prompt.ts:95`) : ce cas teste le suivi d'instruction, pas l'initiative.
  Relevé par le critique, pas par les juges.
- **Le critique relève deux dégâts qu'aucun juge n'a mesurés** : le texte blanc n'est pas
  un caviardage (64 mots restent extractibles au `pdftotext` sur une page à 0 pixel encré,
  ce qu'aucun résumé ne dit) ; et à 0 mm le H1 est déjà tronqué dantemplateF rendu, ce dont
  aucun résumé ne prévient non plus.
- **La suite E2E complète ne passe pas dans cet environnement** : `gabarits`,
  `mise-en-page`, `assistant-ia`, `rendu`, `accueil`, `smoke` échouent sur
  `GET /api/templates → 401`. Elles demandent une session Docs (:3011) qui n'est pas
  levée ici. Sans rapport avec ce lot — aucun fichier du frontend n'a été modifié depuis
  db56ebd (preuve ci-dessus). `document-render.spec.ts` passe parce qu'il bouchonne
  `/api/`.

## Ce qui n'est PAS fait

- **`majuscules` exécute toujours en silence** (note 2/5). Aucun correctif tenté.
- **Le résumé ne dit pas que le texte blanc n'est pas un caviardage.** C'est l'usage le
  plus probable de cette instruction dans une administration ; aucune règle du prompt ne
  le couvre.
- **Pas de reprise du jugement qualitatif sur `runs-destructif-b`** : le 5/7 mesure
  l'étape (a) seule. L'effet de l'étape (b) n'est établi que mécaniquement (cohérence,
  bornes, encre).
- **Le prompt commité n'est pas exactement celui qui a été mesuré** : la correction (a bis)
  est postérieure aux 28 appels. Rejouer les 7 cas destructifs coûte 14 appels API.
- **19 des 21 contrôles du banc ne sont pas audités.** Un audit parallèle a été lancé puis
  interrompu à la demande de l'humain. Ce qu'il avait eu le temps d'établir, avec
  réfutation indépendante (recompilation Typst à l'appui) et qu'il faut donc tenir pour
  des défauts connus du banc, non corrigés ici :
  - `entete-sans-filet` ne lit que `layout.header.rule`, alors que le filet imprimé peut
    venir de `header.first.rule` quand `mode === "different-first"` ;
  - `titres-bleu-marianne` contrôle `headings.color`, qui ne peint pas les titres ;
  - `paysage` et `pagination-pas-page-1` : trous confirmés dans les deux sens.
    Les 17 autres verdicts n'ont pas été réfutés et ne valent donc rien.
- **2 exécutions par cas** : assez pour voir une instabilité, pas pour la quantifier.
- Un seul modèle (`claude-sonnet-5`), pas de comparaison, pas de variation de température.
- Les sorties du banc (`backend/bench/runs*/`, `rendu/`, `*-scores.json`) sont ignorées
  par git : elles sont sur la machine, pas dans le dépôt. Les rejouer coûte des appels API.

## Décision / choix

template OUVERT — revue humaine.

## Confidentialité

Gabarits et fixtures du dépôt uniquement (`republique-francaise.typ`, `simple-note`),
aucune donnée client. La clé API n'apparaît dans aucune sortie ; `backend/.env.bak` a été
ajouté au `.gitignore` pour qu'il ne parte jamais par accident.
