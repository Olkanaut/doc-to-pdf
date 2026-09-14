# Installation locale — La Suite Docs + le mini-site

Ce guide part d'une machine vierge et s'arrête quand un document écrit dans Docs
ressort en PDF à en-tête d'administration.

macOS (Apple Silicon), 14/09/2026. Toutes les sorties collées plus bas sont réelles.

État de la vérification, sans enjoliver : le script a été exécuté intégralement et
ses sept étapes passent, y compris les trois contrôles HTTP. Le clone superficiel,
le correctif de syntaxe, la construction des trois images et `manage.py migrate` ont
été exécutés depuis un clone neuf. En revanche la séquence complète
clone neuf → build → démarrage → vérification n'a **pas** été rejouée d'une traite :
elle demande une machine sans Docs installé (voir l'avertissement ci-dessous) et
25 Go libres.

---

## Démarrage rapide

```bash
# ── Une seule fois ────────────────────────────────────────────────
brew install git node typst
# + un moteur Docker au choix : Docker Desktop, OrbStack, Colima, Rancher Desktop
# puis le démarrer (l'application, ou `colima start`)

git clone https://github.com/Olkanaut/doc-to-pdf.git
cd doc-to-pdf
./dev/setup-local.sh            # 10 à 20 min : clone Docs, construit les images

# ── Chaque jour ───────────────────────────────────────────────────
git pull
./dev/setup-local.sh --up       # installe ce qui manque, lance tout, rend un PDF
                                # Ctrl-C pour arrêter

# ── En cas de doute ───────────────────────────────────────────────
./dev/setup-local.sh --verify   # constate l'état, ne modifie rien
```

**Adresses.** Le mini-site est sur <http://localhost:5173>. Pour Docs, **lis
l'adresse que le script affiche à la fin** : elle dépend de ton
`compose.override.yml` — 3000 par défaut, autre chose si tu as dû remapper.
Connexion : `impress` / `impress`.

**Pour tout arrêter.** `Ctrl-C` coupe le mini-site ; Docs continue de tourner en
conteneurs. Pour l'arrêter aussi : `cd ~/Documents/docs && docker compose stop`.

**Tes gabarits vivent dans `backend/data/templates/`**, pas dans git. Ce répertoire
est créé et pré-rempli au premier démarrage du backend à partir de
`backend/templates/*.typ`, puis il t'appartient : ce que tu modifies depuis
`/templates` reste sur ta machine et ne part pas avec le dépôt. Pour repartir des
gabarits d'origine, `rm -rf backend/data` et redémarre le backend.

**Si ça coince.** `./dev/setup-local.sh --verify` nomme l'étape qui échoue, et le
tableau [Ce qui casse, et quoi regarder](#ce-qui-casse-et-quoi-regarder) donne la
suite.

Les trois modes : sans option le script **installe**, `--verify` **constate** sans
rien modifier, `--up` installe puis **lance et le prouve** en rendant un PDF. Il est
relançable sans rien casser. Si tu préfères comprendre ce qu'il fait, tout est
détaillé plus bas.

---

## Avertissement : une seule instance de Docs par machine

Le `compose.yml` de Docs commence par **`name: docs`** — un nom de projet figé dans
le fichier, qui ne dépend pas du répertoire du clone. Conséquence : deux clones de
Docs sur une même machine pilotent **les mêmes conteneurs et le même volume**.

Lancer `make bootstrap` depuis un second clone exécute `manage.py flush` sur la base
du premier et **efface tous ses documents**. C'est arrivé ici le 14/09/2026 : 53
documents perdus. Il n'y a pas de corbeille, `flush` fait un `TRUNCATE`.

`dev/setup-local.sh` refuse désormais de démarrer s'il détecte une pile Docs
installée depuis un autre répertoire. Si tu lances `make` à la main, vérifie d'abord :

```bash
docker ps -a --filter label=com.docker.compose.project=docs -q | head -1 \
  | xargs -r docker inspect --format '{{index .Config.Labels "com.docker.compose.project.working_dir"}}'
```

---

## Prérequis

| Outil | Version | Installation |
|---|---|---|
| Docker Desktop | récent, **démarré** | <https://www.docker.com/products/docker-desktop> |
| Node.js | 20.19+ ou 22.12+ | <https://nodejs.org> |
| Typst (CLI) | 0.13+ | `brew install typst` |
| git, make | — | `xcode-select --install` |

Typst est **obligatoire** : le backend l'appelle en sous-processus pour produire le
PDF. Sans lui, `/api/render` échoue.

Compte **au moins 25 Go libres** et 20 à 30 minutes pour la première installation.
Le script refuse de démarrer en dessous de 25 Go, et ce n'est pas une marge de
confort : le poste principal n'est pas la taille finale des images (~21 Go) mais le
cache de construction BuildKit, monté à 33 Go lors d'un bootstrap mesuré le
14/09/2026. Un disque saturé en cours de build ne rate pas proprement — il corrompt
le système de fichiers de la VM Docker, qui refuse ensuite de redémarrer.

Une fois l'installation finie, `docker builder prune -af` récupère ce cache (20 Go
rendus dans notre mesure). Il ne contient ni image, ni volume, ni donnée.

---

## Les deux pièges à connaître

Ils ne viennent pas de notre code. Le script les traite tout seul, mais il vaut mieux
savoir pourquoi, parce qu'on les recroisera.

### 1. Le backend de Docs ne démarre pas tel quel

Le dépôt `suitenumerique/docs` contient **cinq `except A, B:`** — de la syntaxe
Python 2, refusée par Python 3. L'une d'elles est dans `impress/settings.py`, le tout
premier fichier que Django lit :

```
$ python3 -m compileall -q src/backend/core src/backend/impress
*** Error compiling 'src/backend/impress/settings.py'...
  File "src/backend/impress/settings.py", line 49
    except FileNotFoundError, KeyError:
           ^^^^^^^^^^^^^^^^^^^^^^^^^^^
SyntaxError: multiple exception types must be parenthesized
```

Les cinq emplacements :

```
src/backend/impress/settings.py:49
src/backend/core/models.py:1073
src/backend/core/models.py:2110   (2124 sur `main`)
src/backend/core/tasks/user_reconciliation.py:49
src/backend/core/migrations/0020_remove_is_public_add_field_attachments_and_duplicated_from.py:24
```

Présentes sur `main` **et** sur le tag `v5.6.0`, vérifié le 14/09/2026 — donc chez
tout le monde, ce n'est pas un accident de clone. Le correctif est d'ajouter des
parenthèses : `except (A, B):`. Les cinq cas sont bien des paires de types
d'exception (`ClientError` vient de `botocore.exceptions`, `ValidationError` de
`django.core.exceptions`), donc « attraper les deux » est bien l'intention.

L'étape 3 du script s'en charge, et vérifie derrière que tout compile.

### 2. Docs occupe le port 4000, celui de notre backend

Le service `docspec` de Docs publie `0.0.0.0:4000`. Notre backend Fastify veut le même
port et échoue sur `EADDRINUSE`. Comme la Phase 2 suppose de faire tourner les deux
ensemble, il faut trancher une fois pour toutes.

La solution est dans [`dev/docs-compose.override.yml`](dev/docs-compose.override.yml) :

```yaml
services:
  docspec:
    ports: !override []
```

`docspec` reste joignable par son nom de service sur le réseau Docker — seule la
publication vers l'hôte disparaît. Rien d'autre ne change dans Docs.

Ce fichier est à copier en `compose.override.yml` **à la racine du clone de Docs**.
Il est gitignoré côté Docs, donc il ne voyage jamais avec leur dépôt : c'est pour ça
qu'on le garde ici.

---

## Installation pas à pas

Si le script a marché, saute cette section.

### 1. Cloner Docs

```bash
git clone https://github.com/suitenumerique/docs.git ~/Documents/docs
```

### 2. Appliquer le correctif de syntaxe

```bash
cd ~/Documents/docs
python3 - <<'PY'
import pathlib, re
motif = re.compile(r'^(\s*)except\s+([^:()#]+,[^:()#]+):\s*$')
for f in pathlib.Path("src/backend").rglob("*.py"):
    if "__pycache__" in f.parts: continue
    lignes = f.read_text(encoding="utf-8").splitlines(keepends=True)
    if any(motif.match(l) for l in lignes):
        f.write_text("".join(
            f"{m.group(1)}except ({m.group(2).strip()}):\n" if (m := motif.match(l)) else l
            for l in lignes), encoding="utf-8")
        print("corrigé", f)
PY
python3 -m compileall -q src/backend && echo "src/backend compile"
```

### 3. Poser les réglages locaux

```bash
cp ~/Documents/doc-to-pdf/dev/docs-compose.override.yml ~/Documents/docs/compose.override.yml
```

Ouvre-le : si un autre port est déjà pris chez toi (souvent le **3000**, vérifie avec
`lsof -nP -iTCP:3000 -sTCP:LISTEN`), décommente le bloc de remappage. **Si tu remappes
le frontend, décommente aussi les quatre redirections `LOGIN_REDIRECT_URL` et
compagnie**, sinon la connexion Keycloak se termine sur un port mort.

### 4. Démarrer Docs

```bash
cd ~/Documents/docs
docker network create lasuite-network   # exigé par leur compose.yml
make bootstrap                          # PREMIÈRE FOIS SEULEMENT — 10 à 20 min
```

> **`make bootstrap` est destructif.** Il enchaîne `resetdb`, donc un
> `manage.py flush` : il efface tous tes documents. Une fois installé, c'est
> **`make run`** et rien d'autre. Ne lance jamais `make clean` : il supprimerait ton
> `compose.override.yml`, qui est gitignoré.

### 5. Relancer y-provider s'il a planté

Au tout premier démarrage, les deux conteneurs y-provider compilent dans le même
`dist/` monté et se marchent dessus :

```
Error [ERR_MODULE_NOT_FOUND]: Cannot find module '.../dist/env'
[nodemon] app crashed - waiting for file changes before starting...
```

```bash
docker compose restart y-provider-development
```

C'est le serveur de collaboration. Le convertisseur, lui, est un autre conteneur, et
c'est lui qui compte pour nous — mais autant que les deux tournent.

### 6. Installer et lancer le mini-site

```bash
cd ~/Documents/doc-to-pdf
cd backend  && npm install && npm run dev    # :4000
cd frontend && npm install && npm run dev    # :5173
```

---

## Vérifier que ça marche

```bash
./dev/setup-local.sh --verify
```

Sortie attendue :

```
7. Vérification
  ok    Docs API      http://localhost:8071 (200)
  ok    Docs interface http://localhost:3011 (200)
  ok    Keycloak      http://localhost:8083 (200)
  ok    port 4000 libre pour le mini-site
```

Sortie prise sur une machine dont le frontend est remappé sur 3011. Le script
demande le port à compose au lieu de le supposer : chez toi cette ligne affichera
3000 si tu n'as rien remappé. **C'est l'adresse affichée qui fait foi**, pas
celle-ci.

### Les adresses

| Adresse | Quoi |
|---|---|
| <http://localhost:5173> | **Le mini-site** — s'ouvre sur la bibliothèque de gabarits |
| *l'adresse affichée par le script* | La Suite Docs — 3000 par défaut, autre chose si tu as remappé |
| <http://localhost:8083> | Keycloak |
| <http://localhost:8071> | API de Docs |

**Connexion à Docs : `impress` / `impress`.** Admin Keycloak : `admin` / `admin`.

Le flux de connexion complet a été déroulé et vérifié :

```
1. /api/v1.0/authenticate/     302 -> Keycloak
2. page de login               200
3. impress / impress           302 -> code d'autorisation
4. /api/v1.0/callback/         302 -> http://localhost:3011/   (port de CETTE machine)
5. cookie                      docs_sessionid = jltfrznok9tirnx8...
6. /api/v1.0/users/me/         200  impress@impress.world (John Doe)
```

### Les écrans du mini-site

Depuis les PR #2 et #3, ce n'est plus un écran unique mais quatre pages, reliées par
une barre de navigation à deux entrées — « Gabarits » et « Créer un document ».

| Route | Ce qu'on y fait |
|---|---|
| `/` | redirige vers `/templates` |
| `/templates` | la bibliothèque : les gabarits avec leur vignette, « Nouveau gabarit », et un lien « Créer un document » sur chaque |
| `/templates/:id` | l'éditeur : nom, description, source Typst, aperçu, « Télécharger .typ », « Partager », « Supprimer » |
| `/documents/new` | la composition : choisir une fixture, choisir un gabarit, « Générer le PDF », aperçu et téléchargement |
| `/login` | page d'attente, pour l'instant vide |

Deux précisions qui évitent des malentendus :

- **« Partager » ne partage rien à distance.** Il recopie l'URL de la page courante
  dans le presse-papier (`TemplateEditorPage.tsx:68`). Sur `localhost`, ce lien ne
  vaut que pour toi.
- **L'authentification du mini-site, elle, n'est pas branchée.** La trace
  ci-dessus est celle de Docs, qui a bien son Keycloak. Les trois premières routes sont
  enveloppées dans `<ProtectedRoute>`, mais `GET /api/session` renvoie une constante
  `authenticated: true` (`backend/src/routes/session.ts:10-15`). Personne ne se
  connecte, et `/login` ne s'affiche que si le backend ne répond plus.

---

## La boucle complète, à la main

C'est le test qui prouve que tout est branché : un document écrit dans Docs qui
ressort en PDF.

### 1. Créer un document

Écris-le dans l'interface, ou par l'API interne — aucune authentification OIDC, un
simple jeton serveur :

```bash
curl -s -X POST http://localhost:8071/api/v1.0/documents/create-for-owner/ \
  -H 'Authorization: Bearer server-api-token' \
  -H 'Content-Type: application/json' \
  -d '{"title":"Note de service","sub":"impress@impress.world",
       "email":"impress@impress.world","send_notification_email":false,
       "content":"# Note de service\n\nUn **essai**.\n\n- un point\n- un autre\n"}'
# {"id":"37d9b071-ca20-471e-9eea-4b961fcf8f4c"}
```

### 2. Le passer en lien public

Le partage par défaut est *restreint*. En lien public, l'API répond sans aucune
authentification — c'est ce qui rend la Phase 1 possible sans OIDC.

```bash
cd ~/Documents/docs
docker compose exec -T app-dev python manage.py shell -c "
from core.models import Document
d = Document.objects.get(pk='<UUID>'); d.link_reach='public'; d.save()"
```

Ou depuis l'interface : bouton de partage → lien public.

### 3. Récupérer son contenu structuré

```bash
curl -s "http://localhost:8071/api/v1.0/documents/<UUID>/formatted-content/?content_format=json" | jq .
```

Aucun en-tête `Authorization`. Réponse réelle :

```
titre  : Note de service — essai dots
blocs  : 8
types  : bulletListItem x2  heading x3  paragraph x2  table x1
```

> Si `content` vaut `null` alors que le document existe, c'est qu'il n'a jamais été
> ouvert dans l'éditeur : le contenu n'est écrit qu'à la sauvegarde, côté navigateur,
> et par intervalles. Ce n'est pas une panne.

### 4. Le mettre en page

```bash
cd ~/Documents/doc-to-pdf   # l'étape 3 laissait le shell dans le clone de Docs

curl -s "http://localhost:8071/api/v1.0/documents/<UUID>/formatted-content/?content_format=json" \
  | jq '{id:"ma-note", name:.title, blocks:.content}' \
  > backend/fixtures/ma-note.json

curl -s -X POST http://localhost:4000/api/render \
  -H 'Content-Type: application/json' \
  -d '{"fixtureId":"ma-note","templateId":"ministere"}' \
  -o note.pdf && open note.pdf
```

---

## Ce qui casse, et quoi regarder

| Symptôme | Cause | Quoi faire |
|---|---|---|
| `EADDRINUSE: 0.0.0.0:4000` | `docspec` tient le port | poser `compose.override.yml` (piège n°2) |
| `SyntaxError: multiple exception types` | les cinq `except` amont | piège n°1 |
| `app crashed` dans y-provider | course sur `dist/` au 1er démarrage | `docker compose restart y-provider-development` |
| La connexion renvoie vers un port mort | frontend remappé, redirections pas alignées | décommenter les quatre `LOGIN_REDIRECT_URL` |
| `/api/render` → 422 | Typst n'a pas compilé | le corps de la réponse contient le `stderr` de Typst |
| `/api/render` → 500 | voir plus bas | défaut connu du convertisseur |
| PDF vide ou tronqué | le document n'a jamais été ouvert dans l'éditeur | l'ouvrir une fois dans Docs, attendre la sauvegarde |

---

## Défauts connus du convertisseur

Reproduits en exécution le 14/09/2026, sur des documents réels récupérés depuis
`docs.numerique.gouv.fr`. À corriger, pas à contourner.

**~~`/api/render` renvoie 500 sur les liens entre documents.~~ Corrigé le 14/09/2026.**
Deux causes, pas une : `interlinkingLinkInline` n'a pas de champ `text` (son libellé
est dans `props.title`), et un inline `link` non plus — son texte est dans
`content[].text`. `inlineToTypst` appelait `escapeTypstText(inline.text)` sur
`undefined` dans les deux cas.

```
avant : POST /api/render {"fixtureId":"reel-roadmap"}
        HTTP 500 {"message":"Cannot read properties of undefined (reading 'replace')"}
apres : HTTP 200, PDF de 320 Ko
```

Couvert par trois tests dans `blocksToTypst.test.ts`. Un inline inconnu sans texte
est désormais ignoré au lieu de faire échouer tout le document.

**Les blocs inconnus disparaissent en silence.** Le `default: return ""` de
`blockToTypst` jette tout type non géré, sans rien signaler — dont `callout`, présent
dans de vrais documents :

```
"The roadmap is not a contractual document and is subject to..."  ->  ""
```

Un avertissement juridique absent du PDF, sans aucun signal. C'est le pire mode de
défaillance pour ce produit : le PDF a l'air correct.

**Le tilde est avalé.** `~` n'est pas dans `SPECIAL_CHARS`, et c'est l'espace
insécable de Typst. `~ 1 200 €` sort « 1 200 € ». Manquent aussi les caractères actifs
en début de ligne : `-`, `+`, `=`, `/` et `chiffre.`, qui ouvrent une liste ou un titre.

**~~Les URL sont cassées.~~ Corrigé le 14/09/2026.** Le `href` passait par
l'échappement *markup* alors qu'il atterrit dans une *chaîne* Typst : `_` devenait
`\_` et le backslash se retrouvait dans l'URL du PDF. Le cas n'est pas théorique —
`reel-shipped2026` contient
`https://ara.numerique.gouv.fr/rapport/NQm_a0q0oJUVhg9_jVjUE/resultats`.
Un `escapeTypstString()` distinct n'échappe plus que `"` et `\`, les deux seuls
caractères spéciaux d'une chaîne Typst.

Deux documents publics réels sont dans `backend/fixtures/reel-*.json` pour tester
ces cas.

---

## Arrêter

```bash
cd ~/Documents/docs && make stop     # arrête sans supprimer
```

Pas `make down` et surtout pas `docker compose down -v` : aucune base n'a de volume
nommé, les données partiraient avec les conteneurs.
