# La Suite Local Dev

Workspace local pour developper une app transverse autour de La Suite.

Il y a deux profils a retenir :

```text
docs-solo  Docs + Keycloak commun
suite      Docs + Drive + Keycloak commun
```

Le profil principal pour l'app PDF est `docs-solo` :

```text
Docs -> Docs API -> app dots/pdf -> Typst -> PDF
```

## Commandes Stack

Check general :

```bash
./setup.sh check
```

Dev principal, Docs seul :

```bash
./setup.sh docs-solo bootstrap
./setup.sh docs-solo verify
```

`bootstrap` prepare les dossiers/fichiers locaux manquants avant de build :

```text
docs/data/media
docs/data/static
docs/env.d/development/*.local
OIDC_STORE_REFRESH_TOKEN_KEY si absente
```

Relancer sans rebuild :

```bash
./setup.sh docs-solo up
```

Stopper :

```bash
./setup.sh docs-solo down
```

Demo Docs + Drive :

```bash
./setup.sh suite bootstrap
./setup.sh suite verify
./setup.sh suite users
./setup.sh suite down
```

## Commandes App PDF

Installer les dependances de la mini-app :

```bash
make install
```

Lancer backend et frontend ensemble :

```bash
make dev
```

Commandes separees si besoin :

```bash
make backend
make frontend
make build
make lint
```

Le Makefile concerne uniquement l'app PDF locale. Le script `setup.sh`
continue de gerer la stack La Suite locale.

## URLs

| Service           | URL                                         |
| ----------------- | ------------------------------------------- |
| Keycloak commun   | http://localhost:8083                       |
| Docs frontend     | http://localhost:3000                       |
| Docs backend/API  | http://localhost:8071                       |
| Docs external API | http://localhost:8071/external_api/v1.0/... |
| App PDF locale    | http://localhost:3002                       |
| App PDF backend   | http://localhost:4000                       |
| Drive frontend    | http://localhost:3001                       |
| Drive backend/API | http://localhost:8072                       |

## Users

Le realm Keycloak commun `lasuite` contient :

| Username | Password | Email                  |
| -------- | -------- | ---------------------- |
| `ismael` | `ismael` | `ismael@lasuite.local` |
| `demo`   | `demo`   | `demo@lasuite.local`   |

Docs et Drive ne partagent pas leur table `user`. Ils creent chacun un user
local, mais avec le meme `sub` OIDC emis par Keycloak.

Pour verifier les users locaux :

```bash
./setup.sh docs-solo users
./setup.sh suite users
```

## Profils

`docs-solo` lance uniquement :

```text
auth: Keycloak commun + base Keycloak
docs: postgres, redis, minio, createbuckets, backend, frontend, nginx media, y-provider
```

`suite` lance :

```text
auth:  Keycloak commun + base Keycloak
docs:  postgres, redis, minio, createbuckets, backend, frontend, nginx media, y-provider
drive: postgres, redis, minio, createbuckets, backend, frontend, nginx media
```

`suite bootstrap` applique la meme preparation cote Docs et prepare aussi les
dossiers locaux attendus par Drive.

Services volontairement exclus :

```text
docs:  keycloak local, kc_postgresql, mailcatcher, docspec, celery
drive: keycloak local, kc_postgresql, mailcatcher, ds-proxy, celery, collabora, onlyoffice
```

## Structure Locale

```text
auth/
  compose.yml              Keycloak commun
  realm-lasuite.json       realm, users, clients OIDC

demo/
  suite.sh                 profil Docs + Drive minimal
  docs-solo.sh             profil Docs minimal
  lib.sh                   fonctions partagees
  users.sh                 inspection users locaux
  env.docs.common.local    overrides OIDC Docs
  env.drive.common.local   overrides OIDC Drive
  ports.docs.env           ports Docs locaux
  ports.drive.env          ports Drive locaux

docs/
drive/
django-lasuite/
```

## Auth Et API

Keycloak expose un realm commun :

```text
realm: lasuite
clients: impress, drive, interop-app
```

L'app transverse devra utiliser le client `interop-app`, puis appeler Docs avec :

```http
Authorization: Bearer <access_token>
```

Endpoint principal pour le POC PDF :

```text
http://localhost:8071/external_api/v1.0/documents/
```

Documentation API :

- [Templates Typst](./README-EXTERNAL-API.md)
- [Recuperation d'un document Docs depuis Dots](./README-DOCS-FETCH.md)

## App PDF Locale

La mini-app du repo tourne hors Docker :

```bash
make install
make dev
```

Elle est servie sur :

```text
http://localhost:3002
```

Le frontend Vite proxifie `/api` vers le backend Node en `localhost:4000`.
L'auth utilise le client Keycloak confidentiel `interop-app` du realm `lasuite`.
Le secret reste cote backend.

Avant de lancer l'app, demarrer la stack Docs locale :

```bash
./setup.sh docs-solo up
```

Puis :

```bash
make dev
```

Variables override possibles :

```bash
APP_ORIGIN=http://localhost:3002
OIDC_ISSUER=http://localhost:8083/realms/lasuite
OIDC_CLIENT_ID=interop-app
OIDC_CLIENT_SECRET=ThisIsAnExampleKeyForDevPurposeOnly
OIDC_REDIRECT_URI=http://localhost:3002/auth/callback
OIDC_POST_LOGOUT_REDIRECT_URI=http://localhost:3002/login
DOCS_API_BASE_URL=http://localhost:8071/external_api/v1.0/
DOCS_API_TIMEOUT_MS=10000
DOCS_API_MAX_RESPONSE_BYTES=5242880
TYPST_TEMPLATES_API_BASE_URL=http://localhost:8071/external_api/v1.0/typst-templates/
TYPST_TEMPLATES_API_TIMEOUT_MS=10000
TYPST_TEMPLATES_API_MAX_RESPONSE_BYTES=5242880
```

Le backend expose `GET /api/documents/{id}/content`. Il transmet le token
Keycloak de la session a Docs et renvoie le contenu structure dans `blocks`.

Variables frontend optionnelles pour le menu apps :

```bash
VITE_DOCS_URL=http://localhost:3000
VITE_DRIVE_URL=http://localhost:3001
```

Par defaut, Dots affiche seulement Dots et Docs dans le menu apps. Drive
n'apparait que si `VITE_DRIVE_URL` est defini, pour garder le mode
`docs-solo` independant de Drive.

## Nettoyage

Nettoyer les caches frontend locaux :

```bash
./setup.sh docs-solo clean
./setup.sh suite clean
```

Voir l'espace Docker :

```bash
docker system df
```

Nettoyage Docker classique :

```bash
docker builder prune
docker system prune
```

Avec volumes inutilises, plus destructif :

```bash
docker system prune --volumes
```
