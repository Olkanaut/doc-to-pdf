# Dots

Dots turns La Suite Docs documents into PDFs using Typst templates.

## What this repository contains

Dots is the main application in this repository. It consists of the Vite frontend in `frontend/` and the Node/Fastify backend in `backend/`.

The repository also ships a local La Suite Docs stack so Dots can be tested end to end without an external account:

- `docs/` contains the La Suite Docs sources. In the code and Docker images, Docs may also appear under its historical technical name: `impress`.
- `django-lasuite/` contains the La Suite Django dependencies used by the local Docs backend.
- `auth/` contains the local Keycloak shared by Dots and Docs.

These folders are not Dots: they only provide a realistic local environment for authentication and the Docs external API.

User templates are not stored in Dots: they go through the Docs external API `typst-templates`. The Typst files versioned in `backend/fixtures/templates/` are fixtures for tests and local previews.

## Prerequisites

Required:

- Docker with Docker Compose, to run Docs, Keycloak, PostgreSQL, Redis and MinIO.
- `make`, used by the repository's root commands.
- Node.js and npm, to install and run the Dots backend and the Vite frontend.
- `typst`, used by the backend to compile templates to PDF.
- `curl`, recommended for the local check commands.

Optional:

- Python 3, to enable PDF/DOCX import via `backend/ingest`. Without Python, `make install` continues and the import responds with an explicit error.
- LibreOffice (`soffice` or `libreoffice` in the `PATH`), only required to import DOCX files.
- An `ANTHROPIC_API_KEY` in `.env`, only to use the AI assistant. Without a key, the application works and hides this feature.

## Quick start

Prepare the local configuration:

```bash
cp .env.example .env
```

Prepare and start Docs + Keycloak:

```bash
./setup.sh docs bootstrap
```

Install the Dots dependencies:

```bash
make install
```

Start Dots:

```bash
make dev
```

Then open:

```text
http://localhost:3002
```

## Commands

Check the local configuration:

```bash
./setup.sh check
```

Restart Docs + Keycloak without rebuilding:

```bash
./setup.sh docs up
```

Check that the Docs stack responds:

```bash
./setup.sh docs verify
```

Stop Docs + Keycloak:

```bash
./setup.sh docs down
```

Dots commands:

```bash
make backend
make frontend
make build
make lint
make test
```

## Local URLs

| Service           | URL                                         |
| ----------------- | ------------------------------------------- |
| Dots              | http://localhost:3002                       |
| Dots backend      | http://localhost:4000                       |
| Docs              | http://localhost:3000                       |
| Docs API          | http://localhost:8071                       |
| Docs external API | http://localhost:8071/external_api/v1.0/... |
| Keycloak          | http://localhost:8083                       |

## Local accounts

By default, the local Keycloak realm `lasuite` contains these demo accounts.
They are configured in `.env` and can be changed before the first Keycloak import.

| Username | Password | Email                  |
| -------- | -------- | ---------------------- |
| `demo1`  | `demo1`  | `demo1@lasuite.local`  |
| `demo2`  | `demo2`  | `demo2@lasuite.local`  |

Check the users created on the Docs side:

```bash
./setup.sh docs users
```

## How it works locally

The `docs` profile only starts the services Dots needs:

```text
auth: shared Keycloak + Keycloak database
docs: PostgreSQL, Redis, MinIO, createbuckets, backend, frontend, nginx media, y-provider
```

Docs services deliberately excluded:

```text
local keycloak, kc_postgresql, mailcatcher, docspec, celery
```

Dots uses the confidential OIDC client `interop-app` from the `lasuite` realm, then calls the Docs external API with:

```http
Authorization: Bearer <access_token>
```

Docs endpoints used by Dots:

```text
http://localhost:8071/external_api/v1.0/documents/
http://localhost:8071/external_api/v1.0/typst-templates/
```

API documentation:

- [Typst templates](./documentation/EXTERNAL-API.md)
- [Fetching a Docs document from Dots](./documentation/DOCS-FETCH.md)

## Configuration

Dots reads its local configuration from `.env`, to be created from `.env.example`.
The main variables are:

```bash
APP_ORIGIN=http://localhost:3002
OIDC_ISSUER=http://localhost:8083/realms/lasuite
OIDC_CLIENT_ID=interop-app
OIDC_CLIENT_SECRET=...
OIDC_REDIRECT_URI=http://localhost:3002/auth/callback
OIDC_POST_LOGOUT_REDIRECT_URI=http://localhost:3002/login
DOCS_API_BASE_URL=http://localhost:8071/external_api/v1.0/
DOCS_API_TIMEOUT_MS=10000
DOCS_API_MAX_RESPONSE_BYTES=5242880
TYPST_TEMPLATES_API_BASE_URL=http://localhost:8071/external_api/v1.0/typst-templates/
TYPST_TEMPLATES_API_TIMEOUT_MS=10000
TYPST_TEMPLATES_API_MAX_RESPONSE_BYTES=5242880
```

Optional frontend variables for the services menu:

```bash
VITE_DOCS_URL=http://localhost:3000
```

By default, Dots shows Dots and Docs in the services menu.

## Structure

```text
auth/
  compose.yml              local Keycloak
  realm-lasuite.json.tpl   local Keycloak realm template

backend/                   Dots backend
  fixtures/templates/      Typst fixtures used by tests and local previews
  templates/assets/        logos and shared assets for Typst compilation
frontend/                  Dots frontend

demo/
  docs.sh                  Docs + Keycloak orchestration
  lib.sh                   shared functions
  users.sh                 Docs user inspection
  env.docs.common.local.tpl Docs OIDC overrides generated from .env

docs/                      La Suite Docs sources
django-lasuite/            La Suite Django dependencies
```

## Cleanup

Clean the Docs frontend caches:

```bash
./setup.sh docs clean
```

See Docker disk usage:

```bash
docker system df
```

Standard Docker cleanup:

```bash
docker builder prune
docker system prune
```

Docker cleanup including unused volumes:

```bash
docker system prune --volumes
```
