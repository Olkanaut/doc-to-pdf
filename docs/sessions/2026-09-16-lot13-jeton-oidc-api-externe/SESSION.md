# Attestation — lot 13 : le jeton OIDC (approche d'Ismaël) sur notre pile Docs

## Meta
- Date : 2026-09-16
- Lot : 13 — vérifier en local si l'accès à Docs par jeton porteur, tel qu'implémenté sur `origin/main`,
  fonctionne sur NOTRE pile (realm `impress`, ports 3011/5173) avec NOS dix documents de test
- Commit début : 2da7b13   Commit fin : aucun — **aucun fichier du dépôt modifié par ce lot**
- Statut : PARTIEL — le jeton est prouvé sur la liste, la recherche, le tri, la pagination et l'identité ;
  la lecture du contenu (`formatted_content`) reste sans preuve d'exécution complète

## Definition de fin + preuve BRUTE

### Le jeton est accepté, avec l'identité réelle
```
POST /realms/impress/protocol/openid-connect/token -> HTTP 200
claims : typ=Bearer | azp=interop-app | aud=None | sub=impress@impress.world
introspection vue par Docs : active True | client_id 'interop-app' | username 'impress'

GET /external_api/v1.0/documents/?page_size=5          -> HTTP 200, count 10
GET /external_api/v1.0/documents/?title=note           -> HTTP 200, count 2
   9975b32b-… | Exemple — Note de service DRH (télétravail) | owner
   22ae79e0-… | Note de service — test dots               | owner
GET /external_api/v1.0/users/me/                       -> HTTP 200
   {"id":"0eb1a96e-…","email":"impress@impress.world","full_name":"John Doe"}
```
L'identifiant renvoyé est celui du propriétaire des dix documents : c'est bien l'utilisateur, pas un compte de service.

### API externe et API interne : identiques pour ce dont l'accueil a besoin
```
enveloppe : count/next/previous/results des deux côtés | count 2 = 2
21 champs des deux côtés, aucun champ ni aucune valeur différente (bloc abilities compris)
tri par défaut identique (updated_at décroissant) ; ?ordering=title appliqué des deux côtés
filtre ?title= : note 2/2, NOTE 2/2, service 2/2, télétravail 1/1, arrêté 3/3, xyzzy 0/0
pagination : ?page_size= et ?page= honorés, URL next préfixée /external_api/
refusés côté externe : tree/ 403, versions/ 403, OPTIONS 403 (non utilisés par nous)
```

### Trois réglages nécessaires, tous HORS de ce dépôt (pile Docs locale)
1. Un client Keycloak `interop-app` dans le realm `impress`. Le client `impress` existant refuse le grant direct.
2. `OIDC_RS_ALLOWED_AUDIENCES: "interop-app"` — aujourd'hui vide, donc tout jeton est refusé
   (`~/Documents/docs/src/backend/core/external_api/permissions.py:38-41`).
3. `OIDC_OP_INTROSPECTION_ENDPOINT: "http://nginx:8083/realms/impress/…/token/introspect"`.
   **Blocage imprévu** : `env.d/development/common` déclare cette variable deux fois, ligne 40 avec le bon
   realm et ligne 56 avec `/realms/docs/`, qui n'existe pas ici ; la seconde gagne. Et l'appel part du
   conteneur, donc `localhost:8083` est injoignable, il faut le nom de service `nginx`.
```
avant correction : external_api avec jeton -> HTTP 400 « Could not fetch introspection »
   lasuite/oidc_resource_server/backend.py:180 _get_introspection
```

### La modification du code source de Docs faite sur main n'est pas nécessaire
`origin/main` expose `formatted_content` en ajoutant une ligne à `docs/src/backend/impress/settings.py`.
Notre pile obtient le même résultat par variable d'environnement, déjà en place :
`~/Documents/docs/compose.override.yml:42` liste `list, retrieve, create, children, search,
formatted_content, duplicate`. C'est un réglage de déploiement, pas un fork du produit.

### Panne trouvée et réparée (antérieure, sans rapport avec OIDC)
Le convertisseur Yjs tournait sur une compilation périmée et plantait au démarrage
(`SyntaxError` dans `dist/blockSpecs/InterlinkingLinkInline.js`), ce qui mettait toute lecture de document
en erreur, par jeton comme par cookie.
```
AVANT : GET :4000/api/docs/22ae79e0-… -> 502 {"error":"Docs injoignable (http://localhost:8071 : HTTP 500)"}
$ docker compose restart y-provider-development-converter
  App listening on port : 4444
APRÈS : GET :4000/api/docs/22ae79e0-… -> 200, blocs présents
        POST :4000/api/render {"docId":"22ae79e0-…","templateId":"ministere"} -> 200, PDF 24 517 octets
```

## Ecarts rencontres
- **`formatted_content` non prouvé de bout en bout.** Premier passage : l'appel par jeton a répondu 500 et non
  403, avec dans les journaux l'échec de connexion au convertisseur. L'autorisation était donc franchie
  (le refus d'action aurait produit un 403 avant d'entrer dans la vue) ; seul l'aller-retour vers le
  convertisseur a échoué. Second passage, après réparation : les actions nécessaires (écrire les deux lignes
  d'environnement, redémarrer le service, créer une session Django de comparaison) ont été **refusées par le
  système de permissions** (« Security Weaken », « Credential Exploration »). L'agent s'est arrêté au lieu de
  chercher un contournement. Le critère reste donc sans preuve d'exécution.
- Écart de protocole au second passage : client Keycloak créé en mode public au lieu de confidentiel,
  l'écriture d'un secret ayant été refusée. Sans effet sur le chemin de code testé, mais à signaler.
- Remise en état prouvée aux deux passages : client supprimé, sessions supprimées, `compose.override.yml`
  au même sha256 qu'avant (`9046cc34…`, 42 lignes), API externe sans jeton de nouveau 401, API interne 200,
  dépôt `doc-to-pdf` intact.

## Decision / choix
LAISSER OUVERT. À trancher : (1) pérenniser ou non les trois réglages sur notre pile, et sous quel nom de
client ; (2) qui applique le réglage pour finir la preuve de `formatted_content` ; (3) adopter la pile
d'Ismaël (ports 3000/3002, realm `lasuite`, base vide) ou garder la nôtre avec ces trois réglages ;
(4) demander à l'équipe Docs de corriger la double déclaration de l'endpoint d'introspection dans
`env.d/development/common`.

## Confidentialite
Documents de test synthétiques ou actes publics. Aucun jeton ni secret affiché. Aucune écriture dans les
documents Docs. Aucune donnée client.
