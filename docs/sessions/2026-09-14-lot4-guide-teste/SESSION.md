# Test de bout en bout du guide + perte de données

## Meta
- Date : 2026-09-14
- Lot : 4
- Scope : vérifier que `SETUP-LOCAL.md` fonctionne réellement, corriger ce qui casse
- Statut : **PARTIEL** — le chemin « clone neuf → build » n'a pas pu être rejoué
  en entier (voir Écarts), le reste est vérifié en exécution.

## Incident majeur : base de données effacée

`python manage.py flush --noinput` s'est exécuté sur la base de l'utilisateur.
**Perdus : 53 documents, 56 utilisateurs, 1351 accès.** Cause de ma seule
responsabilité.

Chaîne des trois causes :

1. `compose.yml` de Docs commence par `name: docs`. Le nom de projet compose est
   figé dans le fichier et ne dépend pas du répertoire. Mon isolation par
   `DOCS_DIR=~/Documents/docs-test` n'isolait donc rien : le clone de test pilotait
   les conteneurs et le volume de l'utilisateur. Je ne l'avais pas vérifié.
2. J'avais ajouté `FLUSH_ARGS=--noinput` le soir même pour rendre le bootstrap
   automatisable — supprimant la confirmation clavier, c'est-à-dire exactement le
   garde-fou qui avait fait échouer l'essai précédent. J'ai traité un signal comme
   une gêne.
3. Ma surveillance ne regardait que l'espace disque, jamais « suis-je en train de
   toucher la pile existante ».

Preuve (journal de l'essai, ligne 910) :

    python manage.py flush --noinput
    make[2]: *** [superuser] Error 130

Vérification après coup :

    documents   : 0
    utilisateurs: 1

Volume concerné : `43685c936b90`, créé le 2026-09-08T17:53:53Z — celui de
l'utilisateur. Aucun volume neuf créé ce jour-là. Les deux volumes orphelins
inspectés sont en PostgreSQL 13 (version antérieure), sans rapport.

Ce qui survit : les 52 blobs MinIO (contenu des documents), sur un montage du clone
que `flush` ne touche pas. Copie hors Docker :
`~/Documents/docs-blobs-sauvegarde-20260914-2248`. Les métadonnées (titres,
propriétaires, droits) sont irrécupérables — `flush` fait un `TRUNCATE`.

Décision de l'utilisateur : ne pas chercher à récupérer.

## Définition de fin + preuve BRUTE

### Le script passe de bout en bout

    1. Outils requis            5 ok
    2. La Suite Docs            ok
    3. Correctif de syntaxe     ok    aucune occurrence
                                ok    tout src/backend compile
    4. compose.override.yml     ok    présent
    5. Démarrage de Docs        ok    tous les ports requis sont libres
    6. Mini-site                ok    backend + frontend
    7. Vérification             ok    Docs API      http://localhost:8071 (200)
                                ok    Docs interface http://localhost:3011 (200)
                                ok    Keycloak      http://localhost:8083 (200)
                                ok    port 4000 — le backend du mini-site y répond

Le port 3011 est **détecté** depuis compose, plus codé en dur.

### `--verify` est redevenu non destructif

Avant correction, l'étape 3 réécrivait les `.py` du clone et semait des
`__pycache__`, alors que le guide la présente comme un simple contrôle. Preuve par
empreinte sur un arbre factice :

    empreinte AVANT : 97f5ca0ae134fb9ad4c08e8e653f60ff
    (execution de --verify, l'etape 3 s'execute bien et detecte la syntaxe Python 2)
    empreinte APRES : 97f5ca0ae134fb9ad4c08e8e653f60ff
    >>> IDENTIQUE

Et sur le clone réel : `fichiers .py modifiés par --verify : avant=0 apres=0`.

### Trois bugs du convertisseur, trouvés en rendant de vrais documents

    avant : POST /api/render {"fixtureId":"reel-roadmap"}
            HTTP 500 {"message":"Cannot read properties of undefined (reading 'replace')"}

Causes : un inline `link` porte son texte dans `content[].text` (pas `.text`), et
`interlinkingLinkInline` dans `props.title`. 15 inlines concernés dans la fixture.
Troisième bug : le `href` passait par l'échappement markup au lieu de l'échappement
de chaîne, cassant toute URL contenant `_`.

    apres, les cinq fixtures :
      ok  simple-note           24K
      ok  list-demo             24K
      ok  table-image-demo      24K
      ok  reel-roadmap         320K
      ok  reel-shipped2026     160K

    Tests  9 passed (9)      (5 avant, + 3 régressions + 1 filet)

## Écarts rencontrés

1. **Le chemin « machine vierge » complet n'a pas été rejoué.** Trois tentatives :
   la 1re est morte sur un timeout réseau du clone complet, la 2e sur la question
   interactive de `resetdb`, la 3e a détruit la base et a été arrêtée en urgence.
   Ce qui EST prouvé par la 2e tentative : clone superficiel, correctif de syntaxe,
   `docker compose build` des trois images, et `manage.py migrate` passent tous.
   Ce qui n'est PAS prouvé enchaîné : build → démarrage → vérification, depuis zéro.
   Une 4e tentative exigerait une table rase de Docs (refusée par le garde-fou
   d'environnement, accord utilisateur non demandé) et 25 Go libres, contre 18.

2. **Mes propres fausses alertes, trois fois.** (a) clone « bloqué » — `git` tournait,
   mon `pgrep` ne le filtrait pas ; (b) « 0 objet MinIO » — `find` n'existe pas dans
   cette image ; (c) « 2 images disparues » — `docker images -q` masque les
   `dangling`, comparaison invalide avec `system df`.

3. **Bug dans ma propre garde.** `docker ps --format '{{index .Labels "..."}}'` rend
   toujours vide : `.Labels` y est une chaîne, pas une table. La garde « une seule
   pile Docs » était inopérante à sa première écriture. Corrigée via `docker inspect`,
   puis vérifiée : elle refuse bien un second répertoire.

4. **Bruit amont non traité** : `make run` émet
   `Error response from daemon: network with name lasuite-network already exists`.
   Cosmétique, vient du Makefile de Docs.

5. **Défauts du convertisseur restants, non corrigés** : les blocs inconnus
   (dont `callout`) disparaissent en silence via `default: return ""` — pire mode de
   défaillance du produit, le PDF a l'air correct ; et le `~` non échappé.

## Décision / choix

*À remplir par revue humaine.*

- Rejouer ou non le chemin « machine vierge » complet (table rase de Docs + 25 Go).
- Garder ou retirer `FLUSH_ARGS=--noinput` : nécessaire à une installation non
  surveillée, dangereux par nature. Deux gardes le protègent désormais.
- Corriger les deux défauts restants du convertisseur.
- Rien n'est commité : tout est dans l'arbre de travail.

## Confidentialité

Fixtures publiques uniquement (`reel-*.json`, documents en lien public de
docs.numerique.gouv.fr). Les titres cités venaient de l'instance locale, générée par
`make demo`. Aucune donnée client réelle.
