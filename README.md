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

## Commandes

Check general :

```bash
./lasuite-dev.sh check
```

Dev principal, Docs seul :

```bash
./lasuite-dev.sh docs-solo bootstrap
./lasuite-dev.sh docs-solo verify
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
./lasuite-dev.sh docs-solo up
```

Stopper :

```bash
./lasuite-dev.sh docs-solo down
```

Demo Docs + Drive :

```bash
./lasuite-dev.sh suite bootstrap
./lasuite-dev.sh suite verify
./lasuite-dev.sh suite users
./lasuite-dev.sh suite down
```

## URLs

| Service | URL |
| --- | --- |
| Keycloak commun | http://localhost:8083 |
| Docs frontend | http://localhost:3000 |
| Docs backend/API | http://localhost:8071 |
| Docs external API | http://localhost:8071/external_api/v1.0/... |
| Drive frontend | http://localhost:3001 |
| Drive backend/API | http://localhost:8072 |

## Users

Le realm Keycloak commun `lasuite` contient :

| Username | Password | Email |
| --- | --- | --- |
| `ismael` | `ismael` | `ismael@lasuite.local` |
| `demo` | `demo` | `demo@lasuite.local` |

Docs et Drive ne partagent pas leur table `user`. Ils creent chacun un user
local, mais avec le meme `sub` OIDC emis par Keycloak.

Pour verifier les users locaux :

```bash
./lasuite-dev.sh docs-solo users
./lasuite-dev.sh suite users
```

## Profils

`docs-solo` lance uniquement :

```text
auth: Keycloak commun + base Keycloak
docs: postgres, redis, minio, createbuckets, backend, frontend, nginx media
```

`suite` lance :

```text
auth:  Keycloak commun + base Keycloak
docs:  postgres, redis, minio, createbuckets, backend, frontend, nginx media
drive: postgres, redis, minio, createbuckets, backend, frontend, nginx media
```

`suite bootstrap` applique la meme preparation cote Docs et prepare aussi les
dossiers locaux attendus par Drive.

Services volontairement exclus :

```text
docs:  keycloak local, kc_postgresql, mailcatcher, docspec, celery, y-provider
drive: keycloak local, kc_postgresql, mailcatcher, ds-proxy, celery, collabora, onlyoffice
```

## Pourquoi Pas Juste Make

Dans les repos upstream, le setup standard est bien :

```bash
make bootstrap
make run
```

Mais ces commandes lancent les stacks de dev completes de chaque produit. Pour
Docs, cela tire aussi le y-provider, `docspec`, `celery` et le Keycloak local.
Pour Drive, cela tire les services d'edition type WOPI/OnlyOffice/Collabora.

Ici, les profils locaux gardent seulement ce qui est utile au POC :

```text
auth commune
frontend
backend/API
base de donnees
stockage local
Resource Server API
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

## Nettoyage

Nettoyer les caches frontend locaux :

```bash
./lasuite-dev.sh docs-solo clean
./lasuite-dev.sh suite clean
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
