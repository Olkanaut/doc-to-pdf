# Installation locale — La Suite Docs + le mini-site

Ce guide part d'une machine vierge et s'arrête quand un document écrit dans Docs
ressort en PDF à en-tête d'administration.

Vérifié de bout en bout sur macOS (Apple Silicon) le 14/09/2026. Les sorties collées
plus bas sont réelles.

---

## En résumé

```bash
git clone https://github.com/Olkanaut/doc-to-pdf.git
cd doc-to-pdf
./dev/setup-local.sh
```

Le script installe tout, détecte ce qui est déjà en place, et se termine par une
vérification. Il est relançable sans rien casser. `./dev/setup-local.sh --verify`
ne fait que contrôler l'état.

Si tu préfères comprendre ce qu'il fait, tout est détaillé plus bas.

---

## Prérequis

| Outil | Version | Installation |
|---|---|---|
| Docker Desktop | récent, **démarré** | <https://www.docker.com/products/docker-desktop> |
| Node.js | 20 ou plus | <https://nodejs.org> |
| Typst (CLI) | 0.13+ | `brew install typst` |
| git, make | — | `xcode-select --install` |

Typst est **obligatoire** : le backend l'appelle en sous-processus pour produire le
PDF. Sans lui, `/api/render` échoue.

Compte 15 à 20 Go de disque et 20 minutes pour la première installation, l'essentiel
étant la construction des images Docker de Docs.

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
src/backend/core/models.py:2110
src/backend/core/tasks/user_reconciliation.py:49
src/backend/core/migrations/0020_remove_is_public_add_field_attachments_and_duplicated_from.py:24
```

Présentes sur `main` **et** sur le tag `v5.6.0`, vérifié le 14/09/2026 — donc chez
tout le monde, ce n'est pas un accident de clone. Le correctif est d'ajouter des
parenthèses : `except (A, B):`. Les quatre cas sont bien des paires de types
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

### Les adresses

| Adresse | Quoi |
|---|---|
| <http://localhost:5173> | **Le mini-site** — choisis une fixture et un gabarit |
| <http://localhost:3011> | La Suite Docs (ou 3000 si tu n'as pas remappé) |
| <http://localhost:8083> | Keycloak |
| <http://localhost:8071> | API de Docs |

**Connexion à Docs : `impress` / `impress`.** Admin Keycloak : `admin` / `admin`.

Le flux de connexion complet a été déroulé et vérifié :

```
1. /api/v1.0/authenticate/     302 -> Keycloak
2. page de login               200
3. impress / impress           302 -> code d'autorisation
4. /api/v1.0/callback/         302 -> http://localhost:3011/
5. cookie                      docs_sessionid = jltfrznok9tirnx8...
6. /api/v1.0/users/me/         200  impress@impress.world (John Doe)
```

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

**`/api/render` renvoie 500 sur les liens entre documents.** Le type inline
`interlinkingLinkInline` n'a pas de champ `text` ; `inlineToTypst` ne teste que
`type === "link"` puis appelle `escapeTypstText(inline.text)` sur `undefined`.
L'erreur n'est pas rattrapée et le message interne fuit au client.

```
POST /api/render  {"fixtureId":"reel-roadmap","templateId":"ministere"}
HTTP 500 {"message":"Cannot read properties of undefined (reading 'replace')"}
```

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

**Les URL à ancre sont cassées.** Le `href` passe par l'échappement *markup* alors
qu'il atterrit dans une *chaîne* Typst. `page#section` devient `page\#section`, et le
backslash se retrouve littéralement dans l'URL du PDF. Le guillemet, lui, n'est pas
échappé du tout.

Quatre documents publics réels sont dans `backend/fixtures/reel-*.json` pour tester
ces cas.

---

## Arrêter

```bash
cd ~/Documents/docs && make stop     # arrête sans supprimer
```

Pas `make down` et surtout pas `docker compose down -v` : aucune base n'a de volume
nommé, les données partiraient avec les conteneurs.
