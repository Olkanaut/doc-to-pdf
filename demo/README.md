# Local Demo Scripts

This folder contains the local orchestration layer for the workspace.

Use the single profile from the repository root:

```bash
./setup.sh docs bootstrap
```

The root `setup.sh` script manages the La Suite services only. The local PDF
app is started from the root Makefile:

```bash
make install
make dev
```

## Profile

`docs` is the development profile for the PDF app:

```text
auth: shared Keycloak
docs: postgresql, redis, minio, createbuckets, app-dev, frontend-development, nginx, y-provider
```

Its bootstrap prepares the local Docs directories/env files expected by the
upstream Makefile, and generates `OIDC_STORE_REFRESH_TOKEN_KEY` only when it is
missing.

Skipped services:

```text
docs:  local keycloak, kc_postgresql, mailcatcher, docspec, celery
```

## URLs

| Service           | URL                                         |
| ----------------- | ------------------------------------------- |
| Keycloak          | http://localhost:8083                       |
| Docs frontend     | http://localhost:3000                       |
| Docs backend      | http://localhost:8071                       |
| Docs external API | http://localhost:8071/external_api/v1.0/... |
| PDF app frontend  | http://localhost:3002                       |
| PDF app backend   | http://localhost:4000                       |

## Users

| Username | Password | Email                  |
| -------- | -------- | ---------------------- |
| `demo1`  | `demo1`  | `demo1@lasuite.local`  |
| `demo2`  | `demo2`  | `demo2@lasuite.local`  |

## Direct Scripts

The root wrapper is preferred, but direct scripts are available:

```bash
./demo/docs.sh <check|bootstrap|up|down|status|verify|users|clean>
./demo/users.sh docs
```
