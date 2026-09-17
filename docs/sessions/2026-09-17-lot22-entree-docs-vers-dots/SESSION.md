# Lot 22 — entrée « Format avec Dots » dans le menu document de Docs

## Meta

- Date : 2026-09-17
- Lot : 22
- Scope : ajouter dans le menu trois points du document Docs une entrée qui ouvre
  Dots sur le même document, dans un nouvel onglet, avec l'URL de Dots prise dans
  la configuration runtime de Docs et non écrite en dur.
- Commit début : `e5c24a3` (avant les deux `git pull` de la session)
- Commit fin : `270e11f` — **rien n'a été commité**, tout est dans l'arbre de travail
- Statut : **TERMINE**

## Définition de fin + preuve BRUTE

### 1. Le réglage existe côté backend Docs et sort par `/api/v1.0/config/`

```
$ curl -s http://localhost:8071/api/v1.0/config/ | python3 -c "import sys,json; d=json.load(sys.stdin); print('FRONTEND_DOTS_URL =', json.dumps(d.get('FRONTEND_DOTS_URL')))"
FRONTEND_DOTS_URL = "http://localhost:3002"
```

### 2. Le frontend Docs compile, et mes fichiers ne produisent aucune erreur de type

```
$ docker exec -w /home/frontend/apps/impress docssolo-frontend-development-1 npx tsc --noEmit > tsc.txt 2>&1
$ grep -c "error TS" tsc.txt
123
$ grep "error TS" tsc.txt | grep -v "__tests__\|\.test\.\|\.spec\." | head -10
(aucune sortie)
$ grep "error TS" tsc.txt | grep -i "DocToolBox\|useConfig\|dots" | head
(aucune sortie)
```

Les 123 erreurs sont toutes dans des fichiers de test (`Cannot find name 'expect' / 'it' / 'describe'`)
et préexistent : `npx tsc` direct ne charge pas les globals vitest que le script
`yarn lint` du paquet apporte. Aucune n'est hors fichier de test, aucune n'est dans
un fichier touché par ce lot.

### 3. L'entrée apparaît dans le vrai navigateur et ouvre la bonne URL

Script jetable (Playwright de `frontend/`, hors dépôt, dans le scratchpad) :
connexion Keycloak `demo`, création d'un document, ouverture du menu.

```
URL après connexion : http://localhost:3000/
Document : 17356d1a-f133-4863-bae3-4eb329573ac4
Entrées du menu : ["Copier le lien","Partager","Présenter","Télécharger","Format avec Dots","Imprimer","Ajouter aux favoris","Dupliquer","Déplacer dans un document","Historique","Quitter","Supprimer"]
Entrée Dots visible : true
Onglet ouvert : http://localhost:3002/docs/17356d1a-f133-4863-bae3-4eb329573ac4
Attendu       : http://localhost:3002/docs/17356d1a-f133-4863-bae3-4eb329573ac4
CONFORME : true
```

L'entrée se place entre « Télécharger » et « Imprimer », et porte son libellé
français. Capture : `menu-dots.png` (scratchpad, non versionnée).

### 4. Sans réglage, l'entrée n'existe pas

Même script, `FRONTEND_DOTS_URL` neutralisé au vol côté navigateur (même procédé
que le test e2e ajouté) :

```
Entrées du menu : ["Copier le lien","Partager","Présenter","Télécharger","Imprimer","Ajouter aux favoris","Dupliquer","Déplacer dans un document","Historique","Quitter","Supprimer"]
Entrée Dots présente : false
ATTENDU : false
```

Le réglage sert donc bien de drapeau de fonctionnalité : pas d'URL, pas d'entrée.

### 5. Ce que contient le lot

```
$ git diff --stat -- docs/env.d/development/common docs/src/backend docs/src/frontend
 docs/env.d/development/common                      |  3 ++
 docs/src/backend/core/api/viewsets.py              |  1 +
 docs/src/backend/impress/settings.py               |  5 +++
 .../e2e/__tests__/app-impress/doc-header.spec.ts   | 48 ++++++++++++++++++++++
 .../apps/e2e/__tests__/app-impress/utils-common.ts |  1 +
 .../apps/impress/src/core/config/api/useConfig.tsx |  1 +
 .../docs/doc-management/components/DocToolBox.tsx  | 18 ++++++++
 .../apps/impress/src/i18n/translations.json        |  1 +
 8 files changed, 78 insertions(+)
```

Plus un fichier nouveau, non suivi :
`docs/src/frontend/apps/impress/src/assets/icons/ui-kit/dots.svg` (6 lignes).

### 6. Trois casses de CI trouvées après coup, et corrigées

Vérifications faites en répondant à « si je pousse, est-ce que ça casse ? ». Les
trois auraient mis la CI au rouge.

**a. `config.spec.ts` comparait toute la config en strict.**

```
$ grep -n "toStrictEqual" docs/src/frontend/apps/e2e/__tests__/app-impress/config.spec.ts
131:      expect(json).toStrictEqual(CONFIG);
```

`docs/env.d/development/common` est suivi par git, et la CI e2e le charge
(`e2e-tests.yml:113` : `cat env.d/development/common.e2e >> env.d/development/common.local`).
Le backend aurait donc renvoyé `"http://localhost:3002"` pendant que `CONFIG`
annonçait `null`. Corrigé : `CONFIG` porte la même valeur que l'env.

**b. `yarn build` lance `prettier --check .` — deux fichiers non conformes.**

```
$ npx prettier --check <mes 5 fichiers>
[warn] apps/impress/src/features/docs/doc-management/components/DocToolBox.tsx
[warn] apps/e2e/__tests__/app-impress/doc-header.spec.ts
[warn] Code style issues found in 2 files.
```

Après `--write` puis nouveau contrôle :

```
Checking formatting...
All matched files use Prettier code style!
```

Le diff reste en insertions pures (`22 ++++` et `50 ++++`, zéro suppression) :
prettier n'a reformaté que les lignes ajoutées.

**c. `yarn lint` — ordre des imports.**

```
$ npx eslint src/features/docs/doc-management/components/DocToolBox.tsx
  24:1  error  `@/icons/dots.svg` import should occur after import of `@/icons/doc-move-out.svg`  import/order
✖ 1 problem (1 error, 0 warnings)
```

Import déplacé ; eslint ne dit plus rien sur ce fichier.

Vérification que la fonctionnalité survit à ces trois retouches, sur un navigateur
neuf :

```
Entrées du menu : ["Copier le lien","Partager","Présenter","Télécharger","Format avec Dots","Imprimer",…]
Onglet ouvert : http://localhost:3002/docs/854068b2-4894-48eb-9a08-0fe8cf457909
CONFORME : true
```

## Critères NON atteints

**Les deux tests e2e ajoutés n'ont pas été exécutés.**

```
$ ls -d docs/src/frontend/apps/e2e/node_modules
ls: docs/src/frontend/apps/e2e/node_modules: No such file or directory
```

Le paquet e2e de Docs n'a pas ses dépendances installées sur cette machine. Les deux
cas ajoutés à `doc-header.spec.ts` sont donc **écrits et relus, jamais lancés**. Ce
qu'ils affirment a été vérifié autrement (points 3 et 4 ci-dessus), par un script
jetable qui suit la même logique — ce n'est pas la même chose que les avoir vus
passer. À lancer avec `yarn install` dans `docs/src/frontend` puis Playwright sur le paquet
`app-e2e`. Deux obstacles supplémentaires : le paquet vise le Keycloak **local de
Docs** (realm `impress`, comptes `user-e2e-*`), que `docs-solo` exclut ; il faut
passer par `CUSTOM_SIGN_IN=true` et les variables `SIGN_IN_*` pour viser le realm
`lasuite` et son utilisateur `demo`.

**C'est le risque principal restant avant de pousser** : la CI lance ces tests sur
trois navigateurs, et ils n'ont jamais tourné une seule fois.

**Le libellé français est posé sur un fichier engendré.**
`apps/impress/src/i18n/translations.json` est reconstruit par `packages/i18n`
(`format-deploy:impress`, `format-rebuild-fr:impress`). La ligne ajoutée à la main
tiendra jusqu'à la prochaine régénération, après quoi le menu retombera sur la clé
anglaise. Ce n'est pas une casse, c'est un retour en arrière silencieux ; la voie
durable passe par le paquet i18n et Crowdin. Vérifié : ni `prebuild.mjs` ni aucun
workflow n'appelle cette régénération, donc rien n'est perdu dans l'immédiat.

**Les collègues devront recréer leur conteneur backend, pas le redémarrer**
(`docker compose up -d --force-recreate app-dev`). Sans ça, ils tirent le code, ne
voient rien, et concluent que c'est cassé.

## Écarts rencontrés

**1. Un second projet compose réveillé par erreur.**
`./setup.sh docs-solo up` a été lancé pour recharger l'environnement du backend. Or
le script crée un projet compose nommé `docs` (dérivé du nom du dossier), alors que
la pile qui tourne sur cette machine est nommée `docssolo`. Le script a donc démarré
des conteneurs d'un second projet, et s'est arrêté sur un conflit de port :

```
 Container docs-minio-1 Starting
Error response from daemon: failed to set up container networking: driver failed programming
external connectivity on endpoint docs-minio-1: Bind for 0.0.0.0:9000 failed: port is already allocated
```

Conséquence : `docs-postgresql-1` et `docs-redis-1` sont passés de `exited` à
`running` (sans port publié, donc sans effet sur la pile vivante), et
`docs-minio-1` / `docs-createbuckets-1` ont été recréés à l'état `created`.
La tentative de les arrêter a été refusée par la politique d'exécution
(« Interfere With Workloads »). **Ils sont donc toujours là.** À nettoyer à la main :

```
docker stop docs-postgresql-1 docs-redis-1
docker rm docs-minio-1 docs-createbuckets-1
```

Le rechargement voulu a finalement été obtenu en visant le bon projet :
`docker compose -p docssolo up -d --no-deps --force-recreate app-dev`.

À noter pour la suite : `docker restart` ne suffit pas, un `env_file` n'est relu
qu'à la création du conteneur.

**2. `CLAUDE.md` est toujours en attente d'arbitrage.**
Le premier `git pull` de la session a apporté un `CLAUDE.md` de 3 lignes venu de
`main` (« write all code comments in English »), qui entrait en collision avec le
fichier local de 146 lignes, non suivi. Le local a été remis tel quel après le pull :
il apparaît donc en ` M`, et la règle du coéquipier est écrasée localement. Copie de
la version `main` conservée dans le scratchpad de session.

**3. L'arbre contient des modifications qui ne viennent pas de ce lot.**
`backend/bench/cases.ts`, `backend/src/layout/layoutTypst.ts`,
`backend/fixtures/apercu-gabarit.json`, plusieurs `.typ` et des assets de logos ont
changé pendant la session, par un travail mené en parallèle dans le même arbre. Ils
ne font pas partie de ce lot et n'ont pas été relus ici.

## Décision / choix

*(à remplir par revue humaine)*

## Confidentialité

Tout s'est passé sur la pile locale (`docs-solo` : Docs + Keycloak commun), avec
l'utilisateur de démonstration `demo` du realm `lasuite` et un document vide créé
pour l'occasion. Aucune donnée client réelle n'apparaît dans les sorties ci-dessus.
