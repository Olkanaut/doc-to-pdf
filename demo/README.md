# Local Demo Scripts

This folder contains the local orchestration layer for the workspace.

Use only two profiles from the repository root:

```bash
./setup.sh docs-solo bootstrap
./setup.sh suite bootstrap
```

The root `setup.sh` script manages the La Suite services only. The local PDF
app is started from the root Makefile:

```bash
make install
make dev
```

## Profiles

`docs-solo` is the main development profile for the PDF app:

```text
auth: shared Keycloak
docs: postgresql, redis, minio, createbuckets, app-dev, frontend-development, nginx, y-provider
```

Its bootstrap prepares the local Docs directories/env files expected by the
upstream Makefile, and generates `OIDC_STORE_REFRESH_TOKEN_KEY` only when it is
missing.

`suite` is the minimal Docs + Drive profile:

```text
auth:  shared Keycloak
docs:  postgresql, redis, minio, createbuckets, app-dev, frontend-development, nginx, y-provider
drive: postgresql, redis, minio, createbuckets, app-dev, frontend-dev, nginx
```

Skipped services:

```text
docs:  local keycloak, kc_postgresql, mailcatcher, docspec, celery
drive: local keycloak, kc_postgresql, mailcatcher, ds-proxy, celery, collabora, onlyoffice
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
| Drive frontend    | http://localhost:3001                       |
| Drive backend     | http://localhost:8072                       |

## Users

| Username | Password | Email                  |
| -------- | -------- | ---------------------- |
| `ismael` | `ismael` | `ismael@lasuite.local` |
| `demo`   | `demo`   | `demo@lasuite.local`   |

## Direct Scripts

The root wrapper is preferred, but direct scripts are available:

```bash
./demo/docs-solo.sh <check|bootstrap|up|down|status|verify|users|clean>
./demo/suite.sh <check|bootstrap|up|down|status|verify|users|clean>
./demo/users.sh <docs|drive|all>
```
