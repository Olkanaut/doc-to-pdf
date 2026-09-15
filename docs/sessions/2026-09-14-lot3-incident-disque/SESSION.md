# Incident disque plein — arrêt de Docker et récupération

## Meta
- Date : 2026-09-14
- Lot : 3 (non planifié — incident provoqué par le lot 2)
- Scope : remettre Docker en marche, établir si les données locales ont survécu
- Commit début : n/a (aucun commit, dépôt laissé intact)
- Commit fin : n/a
- Statut : **TERMINÉ**

## Cause

La vérification « machine vierge » du guide (`DOCS_DIR=~/Documents/docs-test
./dev/setup-local.sh`) a lancé un `make bootstrap` complet. Le téléchargement des
images a rempli le disque hôte. Les écritures vers le disque virtuel ont échoué,
ext4 a avorté son journal, et Docker Desktop s'est arrêté.

C'est mon action qui a causé l'incident, pas une manipulation de l'utilisateur.

## Définition de fin + preuve BRUTE

### Critère 1 — identifier pourquoi Docker ne redémarrait pas

`~/Library/Containers/com.docker.docker/Data/log/vm/init.log` :

    "msg":"Buffer I/O error on dev vda1, logical block 1523473, lost async page write"
    "msg":"Aborting journal on device vda1-8."
    "msg":"EXT4-fs (vda1): failed to convert unwritten extents to written extents
           -- potential data loss!  (inode 3493922, error -5)"

`.../log/host/electron-errd-2026-09-14.log` : Docker Desktop a affiché une boîte
d'erreur puis s'est fermé.

    2026-09-14T18:10:45.827Z info [WINDOW] Open app://dd/error-dialog
    2026-09-14T18:11:01.895Z info before closing windows, childPids to kill:  []

Cause du blocage ensuite :

    $ ps -o pid,user,lstart,command -p 2847
      PID USER STARTED                      COMMAND
     2847 abel Wed Sep  9 18:02:53 2026     .../com.docker.backend --autostart

Ce processus, lancé le **9 septembre**, a survécu à `osascript quit`, à
`pkill -f com.docker.backend` et à `docker desktop stop`. Il occupait la socket
`backend.sock`, donc `docker desktop start` répondait « Docker Desktop is already
running » et `open -a Docker` était sans effet. La VM ne démarrait jamais :
`console.log` est resté figé à 18:10:36 pendant 22 minutes.

Résolution : `kill -9 2847`, puis lancement de l'application.

    t+6s  >>> DEMON OK

### Critère 2 — les conteneurs ont-ils survécu

    $ docker ps -a --format '{{.Names}}\t{{.Status}}' | sort
    crypto_trader	Exited (127) 6 months ago
    data_collector	Up 7 seconds
    docs-app-dev-1	Exited (0) 24 minutes ago
    docs-celery-dev-1	Exited (137) 24 minutes ago
    docs-createbuckets-1	Exited (1) 58 minutes ago
    docs-docspec-1	Exited (137) 24 minutes ago
    docs-frontend-development-1	Exited (1) 24 minutes ago
    docs-kc_postgresql-1	Exited (0) 24 minutes ago
    docs-keycloak-1	Exited (143) 24 minutes ago
    docs-mailcatcher-1	Exited (0) 24 minutes ago
    docs-minio-1	Exited (0) 24 minutes ago
    docs-nginx-1	Exited (0) 24 minutes ago
    docs-postgresql-1	Exited (0) 24 minutes ago
    docs-redis-1	Exited (0) 24 minutes ago
    docs-y-provider-development-1	Exited (1) 24 minutes ago
    docs-y-provider-development-converter-1	Exited (1) 24 minutes ago
    grafana	Up 7 seconds
    pump_fun_streaming-crypto_trader-run-cc6ad6072ee2	Exited (0) 15 months ago
    soris-clamd	Exited (255) 5 weeks ago
    soris-pg	Exited (255) 8 seconds ago
    timescaledb	Up 7 seconds (healthy)
    welcome-to-docker	Exited (255) 16 months ago

    total conteneurs: 22

Les 14 conteneurs `docs-*` sont présents. `postgresql`, `minio`, `app-dev`,
`nginx`, `kc_postgresql`, `mailcatcher` sont en `Exited (0)` : arrêt propre.
Les 17 volumes sont présents.

### Critère 3 — les données ont-elles survécu

    $ docker exec docs-postgresql-1 psql -U dinum -d impress -tAc "..."
    documents      : 53
    utilisateurs   : 56
    acces          : 1351
    invitations    : 1

    documents supprimes (soft) : 0   actifs : 53

    $ ... order by created_at desc limit 10
    09-14 17:33  Note de service — essai dots
    09-08 19:38  Projet Helios
    09-08 19:38  Projet Helios
    09-08 17:54  Stunde Zeit Essen.
    09-08 17:54  Wetter weiß.
    09-08 17:54  Haut accompagner miser.
    09-08 17:54  Oder vergessen einigen.
    09-08 17:54  Full bank wrong how.
    09-08 17:54  Wir jung schwer.
    09-08 17:54  Él bueno iglesia diciembre.

Contenu (stocké dans MinIO, pas en base) :

    objets avec contenu : 52
    objets vides        : 0

53 lignes en base, 52 blobs : l'écart est un document sans contenu enregistré.
**Aucune perte.**

### Critère 4 — où part réellement l'espace

    $ docker system df
    TYPE            TOTAL     ACTIVE    SIZE      RECLAIMABLE
    Images          25        19        21.65GB   3.723GB (17%)
    Containers      22        0         379.1MB   379.1MB (100%)
    Local Volumes   17        14        4.109GB   138.9MB (3%)
    Build Cache     217       0         33.13GB   18.47GB

    $ df -h /
    libre: 15Gi   utilise: 52%

Le cache de construction (33,13 Go) pèse **plus que toutes les images réunies**
(21,65 Go). 18,47 Go y sont récupérables. Il ne contient aucune donnée : il se
reconstruit tout seul au prochain build.

## Écarts rencontrés

1. **Fausse alerte de ma part.** J'ai d'abord compté « 0 objets » dans MinIO et
   cru à une perte de contenu. En réalité `find` n'existe pas dans l'image MinIO :

       sh: line 1: find: command not found

   Comptage refait avec une boucle shell : 52 objets, 0 vide. Artefact d'outil,
   pas perte de données.

2. **Mauvais noms de tables.** J'ai interrogé `core_document` (préfixe Django
   habituel) ; les tables sont préfixées `impress_`. Corrigé.

3. **Le guide indique un prérequis d'espace faux.** `SETUP-LOCAL.md` demande 8 Go
   libres. L'incident prouve que c'est insuffisant : le bootstrap complet en a
   consommé davantage et a rempli le disque. Prérequis non corrigé à ce jour —
   **reste à faire**.

4. **Vérification « machine vierge » du guide : non terminée.** Interrompue par
   l'incident. Le guide n'a donc PAS été validé de bout en bout sur un chemin
   neuf. Seul `--verify` sur l'installation existante est passé.

## Décision / choix

*À remplir par revue humaine.*

Options pour l'espace, par rapport coût/gain :

- A. `docker builder prune` — rend 18,47 Go. Aucune donnée touchée. Coût : les
  prochains builds repartent de zéro (quelques minutes).
- B. Supprimer les images des autres projets (~7,3 Go : pump_fun_streaming,
  timescaledb, grafana, pgvector, clamav). Coût : à re-télécharger si ces projets
  reprennent. Décision de l'utilisateur, pas la mienne.
- C. Renoncer à Docs en local et taper l'API de production (anonyme, prouvé
  fonctionnel). Coût : plus de contrôle sur les documents de test.

Non tranché.

## Confidentialité

Les titres de documents cités proviennent de l'instance Docs locale de
l'utilisateur (fixtures de démonstration générées par `make demo` + un document
de test que j'ai créé). Aucune donnée client réelle.

---

# Suite — vidage du cache de construction

## Meta
- Date : 2026-09-14
- Scope : exécuter l'option A, sur accord explicite de l'utilisateur
- Statut : **TERMINÉ**

## Preuve BRUTE

### Avant

    $ docker builder du | tail -4
    Shared:		14.66GB
    Private:	18.47GB
    Reclaimable:	33.13GB
    Total:		33.13GB

    $ df -h /        -> libre: 15Gi   utilise: 52%
    $ du -h Docker.raw -> 48G

`Shared` = blobs partagés avec des images existantes : les supprimer du cache ne
libère aucun octet, l'image les référence toujours. `Private` = exclusifs au
cache, seuls réellement récupérables. D'où la prévision de ~18,47 Go.

### Commande

    $ docker builder prune -af
    Total:	33.13GB
    code de sortie: 0

### Après

    $ docker system df
    TYPE            TOTAL     ACTIVE    SIZE      RECLAIMABLE
    Images          25        19        21.65GB   3.723GB (17%)
    Containers      22        0         379.1MB   379.1MB (100%)
    Local Volumes   17        14        4.109GB   138.9MB (3%)
    Build Cache     0         0         0B        0B

    $ df -h /        -> libre: 35Gi   utilise: 32%
    $ du -h Docker.raw -> 28G

**Gain réel : +20 Gio sur l'hôte** (15 → 35 Gio), `Docker.raw` 48 → 28 Go.
Supérieur aux 18,47 Go prévus : la récupération automatique d'espace de Docker
Desktop a aussi rendu des blocs déjà libérés par l'incident.

### Contrôle d'intégrité

    conteneurs : 22  (attendu 22)   OK
    volumes    : 17  (attendu 17)   OK
    images     : 25  /  21.65GB     identique avant et apres

    impress:frontend-development	6.11GB
    impress:y-provider-development	1.86GB
    impress:backend-development	554MB

Les trois images Docs sont intactes : la stack redémarre sans reconstruction.

## Écarts rencontrés

**Fausse alerte, la seconde de la session.** J'ai comparé `docker images -q`
(23) au total de `docker system df` (25) et signalé deux images manquantes. Les
deux compteurs ne mesurent pas la même chose : `docker images -q` masque les
images `dangling` par défaut.

    docker images -q   (sans dangling) : 23
    docker images -qa  (tout)          : 25
    dangling <none>                    : 2

Les deux `<none>` sont d'anciens builds impress (1,85 Go et 553 Mo). Rien n'a été
perdu. Comparaison invalide de ma part, pas un incident.

## Reste à faire (inchangé)

1. Corriger le prérequis d'espace de `SETUP-LOCAL.md` (8 Go annoncés, insuffisant).
2. Vérifier le guide de bout en bout sur un chemin neuf — désormais possible :
   35 Gio libres.

## Décision / choix

*À remplir par revue humaine.*

Reste récupérable sans risque si besoin : 3,72 Go d'images inutilisées, dont les
deux `<none>` ci-dessus (2,4 Go). Non exécuté — non demandé.
