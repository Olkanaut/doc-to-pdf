# Audit de l'installation locale

**Date :** 15/09/2026
**Portée :** `dev/setup-local.sh`, la pile Docs locale, le mini-site — pas le code applicatif.
**Question posée :** l'installation locale est-elle complète, et conforme à `SUBJECT.md` ?

---

## Résumé

20 pistes examinées, **3 retenues** après vérification contradictoire. Une quatrième
anomalie, la plus importante, a été trouvée **en dehors** de l'audit.

| # | Constat | Gravité | Section |
|---|---|---|---|
| D | Le dépôt et la machine de référence ont divergé | **élevée** | [D](#d--divergence-entre-le-dépôt-et-la-machine-hors-audit) |
| A.1 | `--verify` ne sonde jamais y-provider (:4444) | gênant | [A.1](#a1--y-provider-4444-nest-jamais-sondé) |
| A.2 | `--verify` ne sonde jamais minio (:9000) | gênant | [A.2](#a2--minio-9000-nest-jamais-sondé) |
| B.1 | La Resource Server API n'est pas ouverte par l'installation livrée | partiel | [B.1](#b1--la-resource-server-api-nest-pas-ouverte-par-linstallation-livrée) |

Aucun constat n'empêche l'installation de fonctionner aujourd'hui. Les trois premiers
décrivent des pannes que `--verify` **déclarerait vertes**.

---

## Méthode, et une réserve

Deux passes de 15 agents. Chaque agent devait produire une commande et sa sortie, jamais
une affirmation. Chaque piste trouvée passait ensuite devant un vérificateur adversarial
chargé de la **réfuter**, avec pour consigne explicite de conclure « pas un écart » en cas
de doute. 17 pistes sur 20 sont tombées à cette étape.

**Réserve de méthode, à lire avant les résultats.** Pour produire leurs preuves, deux
agents ont **arrêté des conteneurs** de la pile Docs (`y-provider`, `minio`) et supprimé le
marqueur `.setup-local-ok`. Ce n'était pas prévu : la consigne disait de vérifier, elle ne
disait pas de ne rien modifier. L'état a été restauré et contrôlé après coup (14 services
`running`, `--verify` vert). Les preuves ci-dessous sont donc réelles, mais elles ont été
obtenues en cassant volontairement la pile. À ne pas refaire sur une machine dont on a
besoin.

Un constat a par ailleurs été **corrigé à la baisse** après contre-vérification manuelle :
voir A.2.

---

## A — Ce que `--verify` ne contrôle pas

L'étape 7 sonde trois URL (`dev/setup-local.sh:368-370`) pour 14 services en
fonctionnement. Ce qui n'est pas sondé peut mourir sans que rien ne l'indique.

### A.1 — y-provider (:4444) n'est jamais sondé

`grep -n "4444" dev/setup-local.sh` ne renvoie aucune ligne. Le garde-fou qui détecte le
plantage de y-provider existe bien (`dev/setup-local.sh:328`) mais vit dans le bloc
`if [ "$VERIFY_ONLY" = 0 ]` : il n'est **jamais évalué en `--verify`**.

Les deux conteneurs y-provider arrêtés, `--verify` donne :

```
curl :4444/ping -> 000

7. Vérification
  ok    Docs API      http://localhost:8071 (200)
  ok    Docs interface http://localhost:3011 (200)
  ok    Keycloak      http://localhost:8083 (200)
  ok    port 4000 — le backend du mini-site y répond déjà
=== code de sortie: 0 ===
-rw-r--r--  1 abel  staff  0 Sep 14 23:24 /Users/abel/Documents/docs/.setup-local-ok
```

Quatre `ok`, code de sortie 0, et le marqueur de fin d'installation **recréé**.

**Conséquence.** `/api/v1.0/config/` sert `COLLABORATION_WS_URL: ws://localhost:4444/…`
et `COLLABORATION_WS_NOT_CONNECTED_READ_ONLY: true`. Sans y-provider, l'éditeur Docs se
connecte à un websocket mort et **passe en lecture seule, en silence**. Le coéquipier se
connecte, voit ses documents, ne peut pas taper une lettre — après un `--verify` tout vert.
Il cherchera dans son navigateur ou son compte, pas dans la pile.

Second effet : `y-provider-development-converter` porte l'import `.docx`/`.md`
(`CONVERSION_UPLOAD_ENABLED: true`). Mort = import cassé.

**Réserve honnête de l'agent, conservée :** la moitié « plantage au premier démarrage »
(la course sur `dist/` que documente `dev/setup-local.sh:322-324`) **ne s'est pas
reproduite**. Après redémarrage, `:4444/ping -> 200`. Ce qui est prouvé, c'est la cécité de
`--verify`, pas la course elle-même.

### A.2 — minio (:9000) n'est jamais sondé

minio arrêté, les trois sondes de l'étape 7 répondent toutes 200 :

```
minio | exited | Exited (0)
  :9000/minio/health/live -> 000

  http://localhost:8071/api/v1.0/config/                                 -> 200
  http://localhost:3011/                                                 -> 200
  http://localhost:8083/realms/impress/.well-known/openid-configuration  -> 200

UPLOAD ECHEC -> EndpointConnectionError Could not connect to the endpoint URL:
"http://minio:9000/impress-media-storage/probe-minio-down.txt"
```

**Conséquence.** Le téléversement d'images dans Docs échoue. `MEDIA_BASE_URL` pointe sur
nginx, qui lit l'objet dans le bucket `impress-media-storage` de minio.

**Correction apportée au constat initial.** L'agent affirmait aussi que le bucket pouvait
« n'avoir jamais été créé », en s'appuyant sur le conteneur `createbuckets` en
`exited (1)`. **C'est faux sur cette machine.** Contre-vérifié en lecture seule :

```
bucket impress-media-storage : EXISTE (head_bucket 200, lecture seule)
```

Et le code 1 de `createbuckets` s'explique par son propre journal :

```
mc: <ERROR> Unable to make bucket `impress/impress-media-storage`.
    Your previous request to create the named bucket succeeded and you already own it.
```

C'est du bruit d'idempotence sur un conteneur d'initialisation à usage unique, pas une
panne. Le constat retenu se limite donc à : **minio n'est pas sondé**.

**Nuance de portée.** Le rendu PDF du mini-site n'est pas concerné aujourd'hui :
`backend/src/routes/render.ts:42-44` résout les images contre le répertoire de fixtures,
sur disque local. L'impact est en amont, sur Docs.

### Les 8 pistes réfutées de cette passe

Elles sont listées parce que chacune paraissait solide et ne l'était pas — c'est utile à
savoir avant de les re-signaler.

| Piste | Pourquoi écartée |
|---|---|
| `python3` invoqué 3× sans être déclaré par `besoin` | présent partout sur macOS récent ; l'absence se verrait immédiatement à l'étape 3 |
| `make` invoqué sans être déclaré | idem, et `besoin` ne pourrait pas l'attraper tel qu'écrit |
| `jq` requis par le parcours de `SETUP-LOCAL.md` sans être déclaré | outil du guide, pas du script ; échec franc et lisible |
| `python3` porte l'étape 2 du guide | même raison que ci-dessus |
| Aucun gabarit ne déclare de police | Typst retombe sur son défaut embarqué, rendu déterministe |
| Chemins d'inclusion des gabarits (`assets/`) | présents, vérifiés |
| `typst` résolu sur le PATH à chaque requête | c'est le fonctionnement voulu ; `besoin typst` le couvre |
| Aucune version de Node épinglée (ni `.nvmrc` ni `engines`) | réel mais théorique ici : Node 22 installé, aucun conflit constaté |

---

## B — Conformité à `SUBJECT.md`

Une seule piste sur dix a survécu. Les neuf autres sont tombées pour la **même raison**, et
cette raison est importante : elles décrivaient du **produit non encore développé**, pas un
défaut d'installation. `README.md:5` borne d'ailleurs le périmètre noir sur blanc —
Phase 1 = localhost, fixtures, ni API externe ni authentification.

### B.1 — La Resource Server API n'est pas ouverte par l'installation livrée

Le sujet (`SUBJECT.md:27`) demande que le mini-site interroge la **Resource Server API** de
Docs, avec autorisation vérifiée à chaque appel.

```
dev/docs-compose.override.yml:52:  #     OIDC_RESOURCE_SERVER_ENABLED: "True"   <- commenté
~/Documents/docs/env.d/development/common:57:OIDC_RESOURCE_SERVER_ENABLED=False  <- défaut amont
~/Documents/docs/compose.override.yml:25:      OIDC_RESOURCE_SERVER_ENABLED: "True"  <- machine
~/Documents/docs/src/backend/core/urls.py:87:if settings.OIDC_RESOURCE_SERVER_ENABLED:

{"detail":"Authentication credentials were not provided."} <- HTTP 401
```

Deux choses :

1. **Chez un coéquipier**, le bloc est commenté et le défaut amont est `False` : il n'y a
   pas de `/external_api/v1.0/` du tout.
2. **Sur cette machine**, il est activé, mais répond **401** : `OIDC_RS_ALLOWED_AUDIENCES`
   est vide, et aucun client OIDC dédié au mini-site n'existe dans le realm `impress`
   (clients déclarés : `account`, `account-console`, `admin-cli`, `broker`, `impress`,
   `realm-management`, `security-admin-console` — ni `proconnect`, ni `dots`).

**Conséquence.** Le scénario différenciant du sujet — document à accès restreint,
autorisation contrôlée à chaque appel — n'est pas démontrable en l'état. Ce qui est
démontrable, c'est la boucle sur un document en **lien public**, où aucune autorisation
n'est vérifiée (`SETUP-LOCAL.md:282-299`, « Aucun en-tête Authorization »).

### Les 9 pistes réfutées de cette passe

Écartées comme **développement produit restant**, pas comme défauts d'installation. Elles
constituent de fait la liste de ce qui reste à écrire :

| Axe | Constat |
|---|---|
| ProConnect | Le mini-site n'implémente aucune authentification, ni ProConnect ni Keycloak |
| Resource Server API | Le backend ne lit que des fixtures JSON locales, il n'appelle jamais Docs |
| Resource Server API | L'API du parcours documenté est `/api/v1.0/`, en anonyme, pas la Resource Server API |
| Geste d'une lettre | Irreproductible en local : deux ports, pas deux noms d'hôte |
| Geste d'une lettre | Ni route `/d/:id`, ni champ « coller l'URL » |
| Gabarits | Un gabarit écrit par l'utilisateur ne peut être ni enregistré ni réutilisé |
| Gabarits | Aucun import de gabarit `.typ`, aucun logo d'administration |
| BlockNote | La piste BlockNote signalée par le sujet n'a pas été prise (aucune dépendance `@blocknote`) |
| BlockNote | Le convertisseur maison gère 6 des ~20 types de blocs du schéma Docs, et jette les autres en silence |

Le dernier mérite l'attention indépendamment de l'audit : **jeter des blocs en silence**
est un comportement à décider, pas à subir.

---

## D — Divergence entre le dépôt et la machine (hors audit)

Constat le plus important du lot, trouvé en dehors des deux passes.

Le `compose.override.yml` posé sur la machine de référence **n'est pas** le fichier du
dépôt. Ce n'en est pas une version modifiée : c'est un autre fichier, écrit en anglais.
`dev/setup-local.sh:219` dit `présent — laissé tel quel` : le script ne l'écrase jamais,
par conception. L'écart est donc permanent et invisible.

| Réglage | Dépôt (ce qu'un coéquipier obtient) | Machine de référence |
|---|---|---|
| `docspec` (port 4000) | libéré | libéré — **seul point commun** |
| `frontend-development` | **3000** (défaut) | **3011** |
| `nginx-frontend` | 3000 (défaut) | 3010 |
| `kc_postgresql` | publié (5433) | non publié |
| Les 4 `LOGIN_REDIRECT_URL` | absents | présents, alignés sur 3011 |
| Resource Server API | désactivée | activée |
| `EXTERNAL_API` | 2 ressources | 4 ressources (+ `document_access`, `document_invitation`, `duplicate`) |

Trois conséquences :

1. **`--verify` ne peut pas le voir.** Il contrôle que le fichier existe et contient
   `docspec`. Les deux versions passent.
2. **`SETUP-LOCAL.md:226` décrit la machine, pas le dépôt.** La « sortie attendue » annonce
   `Docs interface http://localhost:3011` ; un coéquipier verra `3000`. Le script s'adapte
   (`dev/setup-local.sh:365` demande le port à compose), donc ça marchera — mais la sortie
   ne correspondra pas à la doc.
3. **Un intrus dans le clone Docs :** `session-sans-keycloak.sh`, non suivi par git, que le
   script n'installe pas et ne connaît pas.

---

## E — Ce que cet audit ne dit pas

- **Un seul moteur de conteneurs testé** : Docker Desktop 29.4.1. Colima, OrbStack,
  Rancher Desktop et Podman n'ont pas été essayés — aucun n'est installé ici.
- **Pas de démarrage à froid de Docs.** Le `--up` a été vérifié à froid pour le mini-site
  (ports libérés, serveurs démarrés, PDF rendu, trap contrôlé), jamais pour la pile Docs.
- **Aucun PDF n'a été ouvert.** 15 combinaisons fixture × gabarit répondent 200 avec des
  fichiers de 19 ko à 321 ko. Taille et code HTTP ne prouvent pas un rendu correct.
- **Le correctif Python a été vérifié, lui, contre l'amont vivant** : `main` (`d596df9`)
  porte toujours les 5 occurrences, réparties sur 4 fichiers.

---

## F — Décisions à prendre

Laissé ouvert, pour revue humaine.

- Sonder y-provider et minio dans `--verify` ? (A.1, A.2)
- Faire détecter la divergence `compose.override.yml` par `--verify` ? (D)
- Reporter le bloc Resource Server API enrichi dans le gabarit du dépôt ? (D)
- Aligner `SETUP-LOCAL.md` sur le dépôt, ou expliciter que 3011 est un cas particulier ? (D)
- Que faire des blocs non gérés par le convertisseur : échouer, avertir, ou continuer à
  les jeter ? (B, ligne BlockNote)

## Confidentialité

Toutes les sorties proviennent de la pile locale et de fixtures du dépôt. Aucune donnée
client réelle.
