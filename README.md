# Dots

Dots transforme des documents La Suite Docs en PDF via des templates Typst.

Le dépôt contient :

- Dots : frontend Vite + backend Node/Fastify, lancé hors Docker.
- Une stack locale Docs + Keycloak, lancée avec `./setup.sh docs`.
- Les sources La Suite nécessaires au développement local : `docs/`, `drive/`, `django-lasuite/`.

## Démarrage rapide

Préparer et lancer Docs + Keycloak :

```bash
./setup.sh docs bootstrap
```

Installer les dépendances de Dots :

```bash
make install
```

Lancer Dots :

```bash
make dev
```

Ouvrir ensuite :

```text
http://localhost:3002
```

## Commandes

Vérifier la configuration locale :

```bash
./setup.sh check
```

Relancer Docs + Keycloak sans rebuild :

```bash
./setup.sh docs up
```

Vérifier que la stack Docs répond :

```bash
./setup.sh docs verify
```

Arrêter Docs + Keycloak :

```bash
./setup.sh docs down
```

Commandes Dots :

```bash
make backend
make frontend
make build
make lint
make test
```

## URLs locales

| Service           | URL                                         |
| ----------------- | ------------------------------------------- |
| Dots              | http://localhost:3002                       |
| Backend Dots      | http://localhost:4000                       |
| Docs              | http://localhost:3000                       |
| API Docs          | http://localhost:8071                       |
| API externe Docs  | http://localhost:8071/external_api/v1.0/... |
| Keycloak          | http://localhost:8083                       |

## Comptes locaux

Le realm Keycloak local `lasuite` contient :

| Username | Password | Email                  |
| -------- | -------- | ---------------------- |
| `demo1`  | `demo1`  | `demo1@lasuite.local`  |
| `demo2`  | `demo2`  | `demo2@lasuite.local`  |

Vérifier les utilisateurs créés côté Docs :

```bash
./setup.sh docs users
```

## Fonctionnement local

Le profil `docs` lance uniquement les services nécessaires à Dots :

```text
auth: Keycloak commun + base Keycloak
docs: PostgreSQL, Redis, MinIO, createbuckets, backend, frontend, nginx media, y-provider
```

Services Docs volontairement exclus :

```text
keycloak local, kc_postgresql, mailcatcher, docspec, celery
```

Dots utilise le client OIDC confidentiel `interop-app` du realm `lasuite`, puis appelle l'API externe Docs avec :

```http
Authorization: Bearer <access_token>
```

Endpoints Docs utilisés par Dots :

```text
http://localhost:8071/external_api/v1.0/documents/
http://localhost:8071/external_api/v1.0/typst-templates/
```

Documentation API :

- [Templates Typst](./documentation/EXTERNAL-API.md)
- [Récupération d'un document Docs depuis Dots](./documentation/DOCS-FETCH.md)

## Configuration

Dots fonctionne avec les valeurs locales par défaut. Les variables suivantes peuvent être surchargées côté backend :

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

Variables frontend optionnelles pour le menu des services :

```bash
VITE_DOCS_URL=http://localhost:3000
VITE_DRIVE_URL=http://localhost:3001
```

Par défaut, Dots affiche seulement Dots et Docs dans le menu des services. Drive n'apparaît que si `VITE_DRIVE_URL` est défini.

## Structure

```text
auth/
  compose.yml              Keycloak local
  realm-lasuite.json       realm, users, clients OIDC

backend/                   backend Dots
frontend/                  frontend Dots

demo/
  docs.sh                  orchestration Docs + Keycloak
  lib.sh                   fonctions partagées
  users.sh                 inspection des users Docs
  env.docs.common.local    overrides OIDC Docs
  ports.docs.env           ports Docs locaux

docs/                      sources La Suite Docs
drive/                     sources La Suite Drive
django-lasuite/            dépendances Django La Suite
```

## Nettoyage

Nettoyer les caches frontend Docs :

```bash
./setup.sh docs clean
```

Voir l'espace Docker utilisé :

```bash
docker system df
```

Nettoyage Docker classique :

```bash
docker builder prune
docker system prune
```

Nettoyage Docker avec volumes inutilisés :

```bash
docker system prune --volumes
```
