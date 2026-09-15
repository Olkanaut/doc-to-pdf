# Lot 5 — `--up`, neutralité du moteur, audit d'installation

## Meta

- **Date :** 15/09/2026
- **Lot :** 5
- **Scope :** `dev/setup-local.sh` et `SETUP-LOCAL.md`. Aucun code applicatif touché.
- **Commit début :** `a4e8ecc` (Update README.md)
- **Commit fin :** `36b0e53` (Merge pull request #3) — atteint par `git pull --ff-only`,
  sur demande explicite de l'humain, seule action git autorisée de la session.
- **Statut : PARTIEL** — le travail sur le script est terminé et prouvé ; le document
  d'audit produit dans ce lot est déjà périmé, et trois chantiers proposés n'ont pas
  été engagés. Détail en fin d'attestation.

---

## Définition de fin + preuve BRUTE

### 1. `--verify` passe intégralement sur le code fusionné

```
$ ./dev/setup-local.sh --verify

1. Outils requis
  ok    git — git version 2.50.1 (Apple Git-155)
  ok    docker — Docker version 29.4.1, build 055a478
  ok    node — v22.23.2
  ok    npm — 10.9.8
  ok    typst — typst 0.15.1 (unknown commit)
  ok    VM : 8 CPU, 14 Go
  ·     26 Go libres sur / (non bloquant en --verify)

2. La Suite Docs
  ok    déjà cloné dans /Users/abel/Documents/docs

3. Correctif de syntaxe (amont)
  ok    aucun 'except A, B:' restant
  ok    tout src/backend compile

4. compose.override.yml
  ok    présent — laissé tel quel

5. Démarrage de Docs
  ok    réseau lasuite-network

6. Mini-site
  ok    backend — dépendances à jour
  ok    frontend — dépendances à jour

7. Vérification
  ok    Docs API      http://localhost:8071 (200)
  ok    Docs interface http://localhost:3011 (200)
  ok    Keycloak      http://localhost:8083 (200)
  ok    port 4000 — le backend du mini-site y répond déjà
```

### 2. `--up` lance et prouve, contre `36b0e53`

```
8. Mini-site en marche
  ok    backend   http://localhost:4000 (200)
  ok    session   http://localhost:4000 (200)
  ok    interface http://localhost:5173 (200)
  ok    rendu PDF — 23062 octets, /var/folders/.../doc-to-pdf-preuve.pEwMbGrhbX.pdf

  Mini-site   http://localhost:5173
  Docs        http://localhost:3011   (connexion : impress / impress)
Ctrl-C pour arrêter ce que ce script a lancé (ports : 4000 5173).
```

23062 octets : **exactement la taille du rendu d'avant le merge**. La refonte du
registre des gabarits (fichier → `backend/data/templates/`) ne change pas la sortie.

### 3. Démarrage à froid du mini-site, et arrêt propre

Serveurs arrêtés, ports libres, puis `--up` :

```
tué sur :4000 -> 56730
tué sur :5173 -> 62868
--- ports après arrêt ---
:4000 libre
:5173 libre

  ok    backend   http://localhost:4000 (200)
  ok    interface http://localhost:5173 (200)
  ok    rendu PDF — 23062 octets
```

Puis SIGINT sur le script (pid 79008) :

```
--- ports AVANT ---
:4000 -> 79606
:5173 -> 79605
SIGINT -> 79008 (le script)
--- ports APRES ---
:4000 libéré
:5173 libéré
--- script vivant ? ---
non, terminé
```

### 4. Le contrôle de fraîcheur des dépendances attrape un cas réel

Après `git pull`, avant `npm install` :

```
6. Mini-site
  ok    backend — dépendances à jour
  KO    frontend — dépendances périmées, lance npm install
```

Puis, au passage `--up` suivant :

```
  ok    frontend — installé
```

Le merge ajoute `react-router-dom@^7.18.3`. Sans ce contrôle, l'ancienne condition
`[ -d node_modules ]` affichait `ok` et le frontend plantait au démarrage.

### 5. Tests unitaires

```
$ cd backend && npm test

 Test Files  1 passed (1)
      Tests  9 passed (9)
   Duration  235ms
```

### 6. Le correctif Python est toujours nécessaire — vérifié contre l'amont vivant

```
$ git fetch --depth 1 origin main
From https://github.com/suitenumerique/docs
 * branch            main       -> FETCH_HEAD

=== les 4 fichiers, sur origin/main (d596df9) ===
  models.py                                                            2
  settings.py                                                          1
  user_reconciliation.py                                               1
  0020_remove_is_public_add_field_attachments_and_duplicated_from.py   1
  ----
  total sur main : 5

=== chaque fichier de main compile-t-il ? ===
  SYNTAX  src/backend/impress/settings.py:49 -> multiple exception types must be parenthesized
  SYNTAX  src/backend/core/models.py:1073 -> multiple exception types must be parenthesized
  SYNTAX  src/backend/core/tasks/user_reconciliation.py:49 -> multiple exception types must be parenthesized
  SYNTAX  src/backend/core/migrations/0020_...py:24 -> multiple exception types must be parenthesized

$ git config --get-regexp 'url\..*\.insteadof'
  aucune — le fetch est bien allé sur github.com
```

Et la source est montée, donc le correctif est porteur en permanence, pas au build :

```
/Users/abel/Documents/docs/src/backend -> /app (bind)
```

### 7. Le pull, et la survie des modifications locales

```
$ git pull --ff-only
 20 files changed, 1182 insertions(+), 151 deletions(-)

$ git log --oneline -1
36b0e53 Merge pull request #3 from Olkanaut/frontend.templates-page.thumbnails

$ git diff --stat
 README.md                                 |  6 ++++
 backend/src/convert/blocksToTypst.test.ts | 57 +++++++++++++++++++++++++++++++
 backend/src/convert/blocksToTypst.ts      | 15 ++++++--
 backend/src/convert/escapeTypst.ts        |  9 +++++
 backend/src/types/blocks.ts               | 11 +++++-
 5 files changed, 94 insertions(+), 4 deletions(-)
```

Diffstat identique avant et après : aucune modification locale perdue.

---

## Critères NON atteints

- **Démarrage à froid de la pile Docs : jamais rejoué.** Le test à froid ne couvre que
  le mini-site. La séquence clone neuf → build → démarrage n'a pas été refaite ; elle
  demande une machine sans Docs et 25 Go libres, il y en a 26 dont 26 déjà pris par la
  VM existante.
- **Aucun PDF n'a été ouvert.** Les rendus sont attestés par code HTTP et taille, ce
  qui ne prouve pas un rendu correct.
- **Aucun moteur autre que Docker Desktop n'a été testé.** Les contrôles ajoutés
  (plugin compose v2, dimensionnement de la VM) sont écrits pour être agnostiques mais
  n'ont jamais tourné sur Colima, OrbStack, Rancher ou Podman. Proposition faite,
  déclinée par l'humain.

---

## Écarts rencontrés

**1. Première version du trap de `--up` : `kill 0`.** Tuait le groupe de processus
entier. Constaté en exécution — il a tué le `tail` d'un `--up | tail`, sortie 144 :

```
$ ./dev/setup-local.sh --up 2>&1 | tail -30
(exit code 144, aucune sortie)
```

Remplacé par un arrêt ciblé sur les seuls ports ouverts par le script (`lsof`),
l'idiome déjà employé aux étapes 5 et 7.

**2. L'étape 7 tranchait au premier appel HTTP.** `--up` passe par `make run`, qui
recrée des conteneurs ; le frontend Docs répondait `000` puis 200 huit secondes plus
tard :

```
  KO    Docs interface http://localhost:3011 — attendu 200, reçu 000
```

`verif` réessaie maintenant 8 fois. Effet de bord bénéfique : le helper `attendre`
que j'avais ajouté à l'étape 8 faisait doublon, il a été supprimé.

**3. Un `pgrep` a visé la mauvaise cible.** `pgrep -f "setup-local.sh --up"` a rendu
l'enveloppe du shell (78952) au lieu du script (79008) ; le premier SIGINT n'a donc
rien prouvé. Corrigé, puis le trap validé sur le bon pid.

**4. Les agents d'audit ont muté l'état de la machine.** Deux d'entre eux ont arrêté
`y-provider` et `minio` et supprimé `.setup-local-ok` pour produire leurs preuves. La
consigne disait de vérifier, elle ne disait pas de ne rien modifier. État restauré et
contrôlé (14 services `running`, `--verify` vert). La seconde passe d'audit a reçu une
interdiction explicite de mutation.

**5. Un constat d'agent corrigé à la baisse.** L'agent affirmait que le bucket minio
pouvait n'avoir jamais été créé, sur la foi d'un `createbuckets` en `exited (1)`.
Contre-vérifié :

```
bucket impress-media-storage : EXISTE (head_bucket 200, lecture seule)

createbuckets-1  | mc: <ERROR> Unable to make bucket `impress/impress-media-storage`.
    Your previous request to create the named bucket succeeded and you already own it.
```

Bruit d'idempotence, pas une panne. Le constat a été réduit à « minio n'est pas sondé ».

**6. La pile Docs est tombée en cours de session**, cause inconnue. Les 14 services
`exited` depuis ~9 minutes, arrêt propre côté logs (`Shutting down` normal). Aucune
commande de la session ne l'explique. Relancée par `docker compose start`.

**7. J'ai affirmé « rien en attente » sans avoir fetché.** `git status` comparait à un
`origin/main` périmé. L'humain a signalé le merge. Deux merges étaient en fait en
attente, puis un troisième est arrivé pendant l'échange (`e23e7aa` → `36b0e53`).

**8. Le document d'audit ne portait pas le commit audité.** Omission signalée mais non
corrigée : `docs/audit-installation-2026-09-15.md` a été écrit contre `a4e8ecc` et ne
le dit pas. Trois de ses constats sont dépassés par le merge (authentification,
gabarits enregistrables).

---

## Décision / choix

LAISSÉ OUVERT — à remplir par revue humaine.

Points en attente d'arbitrage :

- Sonder `y-provider` (:4444) et `minio` (:9000) dans `--verify` ? (audit A.1, A.2)
- Faire détecter par `--verify` la divergence entre `dev/docs-compose.override.yml` et
  le `compose.override.yml` réellement posé ?
- Reporter le bloc Resource Server API enrichi dans le gabarit du dépôt ?
- Mettre `SETUP-LOCAL.md` à jour : ses sections décrivent encore l'application à un
  seul écran, alors que `/templates`, `/templates/:id` et `/documents/new` existent.
- Comment un gabarit peaufiné voyage-t-il entre coéquipiers, puisque
  `backend/data/templates/` est gitignoré ?
- Que faire des types de blocs non gérés par le convertisseur : échouer, avertir, ou
  continuer à les jeter en silence ?
- Rafraîchir le document d'audit contre `36b0e53` et y inscrire le commit audité ?

---

## Confidentialité

Toutes les sorties proviennent de la pile locale et des fixtures du dépôt. Aucune
donnée client réelle. Aucun secret collé — le document d'audit a été contrôlé
(`grep -niE "secret|password|token"` → aucune occurrence).
