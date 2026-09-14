#!/usr/bin/env bash
#
# Installe l'environnement local complet : La Suite Docs + ce mini-site.
#
# Idempotent : relançable sans rien casser. Il ne lance `make bootstrap` que si la
# base est vide, et ne réécrit jamais un compose.override.yml existant.
#
#   ./dev/setup-local.sh            installe tout
#   ./dev/setup-local.sh --verify   ne vérifie que l'état, n'installe rien
#   ./dev/setup-local.sh --up       installe tout, puis lance le mini-site et le prouve
#
set -uo pipefail

DOCS_DIR="${DOCS_DIR:-$HOME/Documents/docs}"
ICI="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VERIFY_ONLY=0
UP=0
[ "${1:-}" = "--verify" ] && VERIFY_ONLY=1
[ "${1:-}" = "--up" ] && UP=1

# Marqueur de fin d'installation. `data/` ne peut pas servir à ça : c'est un
# montage que Docker crée dès le premier conteneur, donc bien avant la fin du
# bootstrap. Un bootstrap interrompu laisse un data/ d'apparence normale, et le
# script basculerait ensuite éternellement sur `make run` sans jamais terminer
# l'installation. Constaté le 14/09/2026.
MARQUEUR="$DOCS_DIR/.setup-local-ok"

ok()   { printf "  \033[32mok\033[0m    %s\n" "$1"; }
ko()   { printf "  \033[31mKO\033[0m    %s\n" "$1"; }
info() { printf "  ·     %s\n" "$1"; }
etape(){ printf "\n\033[1m%s\033[0m\n" "$1"; }

# --------------------------------------------------------------------- 1. outils

etape "1. Outils requis"
MANQUE=0
besoin() {
  if command -v "$1" >/dev/null 2>&1; then ok "$1 — $("$1" --version 2>&1 | head -1)"
  else ko "$1 absent — $2"; MANQUE=1; fi
}
besoin git    "xcode-select --install"
besoin docker "Docker Desktop, OrbStack, Colima ou Rancher Desktop — au choix"
besoin node   "https://nodejs.org (20+)"
besoin npm    "fourni avec node"
besoin typst  "brew install typst"

if ! docker info >/dev/null 2>&1; then
  ko "le démon Docker ne tourne pas — démarre ton moteur (Docker Desktop, OrbStack, colima start…)"; MANQUE=1
fi

# Ce script n'utilise que l'API Docker standard : tout moteur fournissant `docker`
# et le plugin `docker compose` v2 convient. Mais c'est bien le PLUGIN v2 qu'il
# faut : `docker compose config --format json` et `docker compose port` n'existent
# ni dans docker-compose v1, ni dans podman-compose. Sans ce contrôle, l'absence
# ne se manifeste qu'à l'étape 5, après le build.
if ! docker compose version >/dev/null 2>&1; then
  ko "plugin « docker compose » v2 absent — docker-compose v1 et podman-compose ne suffisent pas"; MANQUE=1
fi
NODE_MAJ=$(node --version 2>/dev/null | sed 's/^v//' | cut -d. -f1)
[ -n "$NODE_MAJ" ] && [ "$NODE_MAJ" -lt 20 ] && { ko "node $NODE_MAJ, il en faut 20+"; MANQUE=1; }

# Dimensionnement de la VM. Sur macOS, TOUS les moteurs (Docker Desktop, Colima,
# OrbStack, Rancher, Podman) font tourner Linux dans une machine virtuelle dont les
# ressources sont fixées à sa création. Les défauts de Colima — 2 CPU, 2 Go — ne
# passent pas `make bootstrap`, qui construit un Dockerfile à 7 étages : le build
# meurt en cours, après une vingtaine de minutes. On interroge le moteur plutôt que
# de deviner lequel c'est, donc ce contrôle vaut pour tous.
VM_CPU=$(docker info --format '{{.NCPU}}' 2>/dev/null)
VM_RAM_GO=$(docker info --format '{{.MemTotal}}' 2>/dev/null | awk '{printf "%d", $1/1073741824}')
if [ -z "${VM_CPU:-}" ]; then
  :   # moteur injoignable : déjà signalé par le contrôle `docker info` ci-dessus
elif [ "$VM_CPU" -lt 4 ] || [ "${VM_RAM_GO:-0}" -lt 6 ]; then
  if [ "$VERIFY_ONLY" = 1 ]; then
    info "VM : $VM_CPU CPU, $VM_RAM_GO Go — en dessous de ce que demande un build (4 CPU / 6 Go)"
  else
    ko "VM trop petite : $VM_CPU CPU, $VM_RAM_GO Go — il faut 4 CPU et 6 Go pour construire Docs"
    info "Docker Desktop : Settings > Resources"
    info "Colima         : colima stop && colima start --cpu 4 --memory 8 --disk 100"
    MANQUE=1
  fi
else
  ok "VM : $VM_CPU CPU, $VM_RAM_GO Go"
fi
[ "$MANQUE" = 1 ] && { echo; echo "Installe ce qui manque, puis relance."; exit 1; }

# Espace disque. `make bootstrap` construit les images de Docs depuis zéro ; le
# cache BuildKit gonfle bien au-delà de la taille finale des images. Un disque
# plein en cours de build ne rate pas proprement : il corrompt le système de
# fichiers de la VM Docker, qui refuse ensuite de démarrer (vécu le 14/09/2026).
# On refuse donc de commencer plutôt que de laisser saturer.
LIBRE_GO=$(df -k / 2>/dev/null | awk 'NR==2{printf "%d", $4/1048576}')
# Plancher ajustable : SETUP_MINI_GO=18 ./dev/setup-local.sh
# 25 Go vient d'une mesure (bootstrap complet = 17 Go consommés + marge). À baisser
# en connaissance de cause : un disque saturé en cours de build corrompt la VM Docker.
MINI_GO="${SETUP_MINI_GO:-25}"
if [ "$VERIFY_ONLY" = 1 ]; then
  # --verify ne construit rien : exiger de l'espace pour un simple diagnostic
  # empêcherait justement de diagnostiquer une machine à court de place.
  info "$LIBRE_GO Go libres sur / (non bloquant en --verify)"
elif [ -n "$LIBRE_GO" ] && [ "$LIBRE_GO" -lt "$MINI_GO" ]; then
  if [ -d "$DOCS_DIR/.git" ] && [ -d "$DOCS_DIR/data" ]; then
    info "$LIBRE_GO Go libres — juste pour une première installation, suffisant ici (Docs est déjà construit)"
  else
    ko "$LIBRE_GO Go libres, il en faut $MINI_GO pour construire Docs"
    echo
    echo "  Libère de la place, puis relance. Le plus rentable d'abord :"
    echo "    docker builder prune -af     # cache de construction, aucune donnée"
    echo "    docker image prune -af       # images non utilisées"
    echo
    exit 1
  fi
else
  ok "$LIBRE_GO Go libres sur /"
fi

# --------------------------------------------------------------- 2. clone de Docs

etape "2. La Suite Docs"
# Une seule pile Docs par machine. `compose.yml` de Docs fige `name: docs` en
# première ligne : le nom de projet ne dépend PAS du répertoire du clone. Lancer
# un bootstrap depuis un second clone pilote donc les conteneurs et le volume du
# premier, et `flush` y efface tous les documents. C'est arrivé le 14/09/2026 :
# 53 documents perdus. D'où ce refus, avant toute construction.
# `docker ps --format` rend .Labels comme une CHAÎNE, pas une table : `index` y
# renvoie toujours vide. Il faut passer par docker inspect.
PROJ_CID=$(docker ps -a --filter "label=com.docker.compose.project=docs" -q 2>/dev/null | head -1)
PROJ_DIR=""
[ -n "$PROJ_CID" ] && PROJ_DIR=$(docker inspect "$PROJ_CID" \
  --format '{{index .Config.Labels "com.docker.compose.project.working_dir"}}' 2>/dev/null)
if [ -n "${PROJ_DIR:-}" ] && [ "$PROJ_DIR" != "$DOCS_DIR" ]; then
  ko "une pile Docs existe déjà sur cette machine, installée depuis :"
  echo "        $PROJ_DIR"
  echo
  echo "  Le compose de Docs fige « name: docs » : il ne peut y avoir qu'UNE pile"
  echo "  par machine. Continuer depuis $DOCS_DIR"
  echo "  piloterait les conteneurs de l'autre clone et EFFACERAIT ses documents."
  echo
  echo "  Soit tu travailles dans le clone existant :"
  echo "      DOCS_DIR=$PROJ_DIR $0"
  echo
  echo "  soit tu supprimes l'ancienne pile, ce qui DÉTRUIT ses documents :"
  echo "      cd $PROJ_DIR && docker compose down -v"
  echo
  exit 1
fi

if [ -d "$DOCS_DIR/.git" ]; then
  ok "déjà cloné dans $DOCS_DIR"
else
  if [ "$VERIFY_ONLY" = 1 ]; then ko "absent de $DOCS_DIR"; else
    info "clonage dans $DOCS_DIR (2 à 5 min)"
    # Clone superficiel : aucun Dockerfile, Makefile ni compose.yml de Docs ne lit
    # l'historique git. Un clone complet transfère bien plus et tombe régulièrement
    # en « RPC failed; curl 56 » / « early EOF » sur une connexion moyenne — constaté
    # le 14/09/2026. git efface le répertoire derrière lui en cas d'échec, d'où la
    # reprise : sans elle, l'échec est définitif et silencieux pour l'utilisateur.
    CLONE_OK=0
    for tentative in 1 2 3; do
      if git clone --depth 1 https://github.com/suitenumerique/docs.git "$DOCS_DIR"; then
        CLONE_OK=1; break
      fi
      rm -rf "$DOCS_DIR"
      [ "$tentative" -lt 3 ] && info "clone interrompu (réseau) — tentative $((tentative + 1))/3" && sleep 5
    done
    if [ "$CLONE_OK" != 1 ]; then
      ko "clone impossible après 3 tentatives — vérifie ta connexion, puis relance"
      exit 1
    fi
    ok "cloné"
  fi
fi
[ -d "$DOCS_DIR/.git" ] || exit 1

# ------------------------------------------- 3. correctif des 5 SyntaxError amont
#
# Le dépôt amont contient cinq `except A, B:` — syntaxe Python 2, refusée par
# Python 3. L'une est dans impress/settings.py, le tout premier fichier que Django
# lit : sans ce correctif le backend ne démarre pas du tout. Présentes sur main
# comme sur le tag v5.6.0, vérifié le 14/09/2026. Signalé en amont.

etape "3. Correctif de syntaxe (amont)"

# Contrôle de syntaxe SANS rien écrire. `python3 -m compileall` sèmerait des
# __pycache__/*.pyc dans le clone de l'utilisateur ; ast.parse ne touche à rien.
syntaxe_ok() {
  python3 - "$1" <<'PYAST'
import ast, pathlib, sys
racine = pathlib.Path(sys.argv[1])
mauvais = []
for f in racine.rglob("*.py"):
    if "__pycache__" in f.parts or ".venv" in f.parts:
        continue
    try:
        ast.parse(f.read_text(encoding="utf-8"))
    except SyntaxError as e:
        mauvais.append(f"{f.relative_to(racine)}:{e.lineno}: {e.msg}")
    except (UnicodeDecodeError, OSError):
        pass
for m in mauvais[:5]:
    print("        " + m)
sys.exit(1 if mauvais else 0)
PYAST
}

if [ "$VERIFY_ONLY" = 1 ]; then
  # --verify ne doit RIEN modifier : on constate, on ne corrige pas.
  RESTE=$(grep -rlE "^[[:space:]]*except[[:space:]]+[^:(#]+,[^:(#]+:[[:space:]]*$" \
            "$DOCS_DIR/src/backend" --include="*.py" 2>/dev/null | wc -l | tr -d " ")
  if [ "${RESTE:-0}" = 0 ]; then ok "aucun 'except A, B:' restant"
  else ko "$RESTE fichier(s) encore en syntaxe Python 2 — relance sans --verify pour corriger"; fi
  if syntaxe_ok "$DOCS_DIR/src/backend"; then ok "tout src/backend compile"
  else ko "src/backend ne compile pas"; fi
else
  python3 - "$DOCS_DIR" <<'PYFIX'
import pathlib, re, sys
racine = pathlib.Path(sys.argv[1])
motif = re.compile(r'^(\s*)except\s+([^:()#]+,[^:()#]+):\s*$')
touches = 0
for f in (racine / "src" / "backend").rglob("*.py"):
    if "__pycache__" in f.parts or ".venv" in f.parts:
        continue
    try:
        lignes = f.read_text(encoding="utf-8").splitlines(keepends=True)
    except (UnicodeDecodeError, OSError):
        continue
    change = False
    for i, ligne in enumerate(lignes):
        m = motif.match(ligne)
        if m:
            lignes[i] = f"{m.group(1)}except ({m.group(2).strip()}):\n"
            change = True
    if change:
        f.write_text("".join(lignes), encoding="utf-8")
        touches += 1
        print(f"  ok    corrigé {f.relative_to(racine)}")
if touches == 0:
    print("  ok    aucune occurrence — déjà corrigé, ou corrigé en amont")
PYFIX
  if syntaxe_ok "$DOCS_DIR/src/backend"; then
    ok "tout src/backend compile"
  else
    ko "src/backend ne compile toujours pas — regarde la sortie ci-dessus"
  fi
fi

# ---------------------------------------------------- 4. réglages locaux (compose)
#
# compose.override.yml est gitignoré côté Docs : il ne voyagera jamais avec le
# dépôt amont, chacun doit le poser. Un seul réglage est indispensable et vaut
# pour tout le monde : libérer le port 4000.

etape "4. compose.override.yml"
if [ -f "$DOCS_DIR/compose.override.yml" ]; then
  ok "présent — laissé tel quel"
  grep -q "docspec" "$DOCS_DIR/compose.override.yml" \
    || ko "il ne libère PAS le port 4000 — ajoute le bloc docspec, voir dev/docs-compose.override.yml"
elif [ "$VERIFY_ONLY" = 1 ]; then
  ko "absent — le port 4000 entrera en conflit avec le backend du mini-site"
else
  cp "$ICI/dev/docs-compose.override.yml" "$DOCS_DIR/compose.override.yml"
  ok "posé depuis dev/docs-compose.override.yml"
fi

# ------------------------------------------------------------ 5. réseau + démarrage

etape "5. Démarrage de Docs"
docker network inspect lasuite-network >/dev/null 2>&1 \
  && ok "réseau lasuite-network" \
  || { [ "$VERIFY_ONLY" = 1 ] && ko "réseau lasuite-network absent" \
       || { docker network create lasuite-network >/dev/null && ok "réseau créé"; }; }

if [ "$VERIFY_ONLY" = 0 ]; then
  BASE_VIDE=1
  docker compose -f "$DOCS_DIR/compose.yml" ps --status running 2>/dev/null | grep -q app-dev && BASE_VIDE=0
# Contrôle des ports AVANT de construire. Sans lui, un port déjà pris ne se
# manifeste qu'après 20 minutes de build, au démarrage des conteneurs, par un
# EADDRINUSE noyé dans les journaux. On lit les ports RÉELLEMENT publiés
# (compose.yml + compose.override.yml) plutôt que de les supposer.
if [ "$VERIFY_ONLY" = 0 ] && [ "$BASE_VIDE" = 1 ]; then
  CONFLITS=0
  PORTS_EFF=$( cd "$DOCS_DIR" && docker compose config --format json 2>/dev/null | python3 -c '
import json, sys
try:
    d = json.load(sys.stdin)
except Exception:
    sys.exit(0)
vus = set()
for nom, s in (d.get("services") or {}).items():
    for p in (s.get("ports") or []):
        pub = p.get("published") if isinstance(p, dict) else None
        if pub:
            vus.add((int(pub), nom))
for p, n in sorted(vus):
    print(p, n)
' )
  while read -r P SVC; do
    [ -z "${P:-}" ] && continue
    # On ne retient que les écoutes sur TOUTES les interfaces (*:port). Un service
    # lié au seul 127.0.0.1 cohabite avec la publication Docker : vérifié ici, où
    # MinIO tournait pendant qu'un autre processus tenait 127.0.0.1:9000.
    QUI=$(lsof -nP -iTCP:"$P" -sTCP:LISTEN 2>/dev/null | awk -v p=":$P" '$NF ~ ("^\\*" p "$") {print $1" (pid "$2")"; exit}')
    if [ -n "$QUI" ]; then
      ko "port $P, requis par $SVC — déjà pris par $QUI"
      CONFLITS=$((CONFLITS + 1))
    fi
  done <<EOF
$PORTS_EFF
EOF
  if [ "$CONFLITS" -gt 0 ]; then
    echo
    echo "  $CONFLITS port(s) en conflit. Rien n'a été construit : le build aurait duré"
    echo "  20 minutes pour échouer au démarrage sur EADDRINUSE."
    echo
    echo "  Remappe-les dans $DOCS_DIR/compose.override.yml, par exemple :"
    echo
    echo "      services:"
    echo "        frontend-development:"
    echo "          ports: !override"
    echo '            - "3011:3000"'
    echo "        app-dev:"
    echo "          environment:"
    echo '            LOGIN_REDIRECT_URL: "http://localhost:3011"'
    echo '            LOGIN_REDIRECT_URL_FAILURE: "http://localhost:3011"'
    echo '            OIDC_REDIRECT_ALLOWED_HOSTS: "localhost:8083,localhost:3011"'
    echo '            COLLABORATION_SERVER_ORIGIN: "http://localhost:3011"'
    echo
    echo "  Les quatre redirections sont obligatoires si tu déplaces le frontend :"
    echo "  sans elles la connexion Keycloak se termine sur un port mort."
    echo "  Modèle commenté complet : dev/docs-compose.override.yml"
    echo
    exit 1
  fi
  ok "tous les ports requis sont libres"
fi

  if [ "$BASE_VIDE" = 1 ] && [ ! -d "$DOCS_DIR/data" ]; then
    info "première installation : make bootstrap (10-20 min, construit les images)"
    # FLUSH_ARGS=--noinput : bootstrap enchaîne post-bootstrap -> demo -> resetdb ->
    # `manage.py flush`, qui réclame une confirmation au clavier. Sans TTY il meurt
    # sur EOFError ; avec TTY il bloque en attendant qu'on tape « yes ». Le Makefile
    # amont prévoit `resetdb: FLUSH_ARGS ?=` exactement pour ça.
    # Sans danger ici : cette branche n'est prise qu'à la toute première installation,
    # quand la base n'existe pas encore (garde `[ ! -d "$DOCS_DIR/data" ]` ci-dessus).
    ( cd "$DOCS_DIR" && make bootstrap FLUSH_ARGS=--noinput ) \
      || { ko "make bootstrap a échoué"; exit 1; }
    touch "$MARQUEUR" 2>/dev/null
  else
    # On ne relance JAMAIS bootstrap sur un clone qui a déjà un data/ : il
    # effacerait les documents. En contrepartie, si ce data/ vient d'un bootstrap
    # interrompu, `make run` démarrera une pile incomplète — d'où l'avertissement
    # et le diagnostic de l'étape 7.
    [ -f "$MARQUEUR" ] || info "data/ présent sans marqueur de fin — installation antérieure à ce script, ou bootstrap interrompu"
    info "déjà installé : make run (make bootstrap EFFACERAIT tes documents)"
    ( cd "$DOCS_DIR" && make run ) || { ko "make run a échoué"; exit 1; }
  fi

  # Les deux conteneurs y-provider compilent dans le même dist/ monté et se
  # marchent dessus au premier démarrage. Un redémarrage suffit.
  sleep 5
  if docker logs docs-y-provider-development-1 2>&1 | tail -5 | grep -q "app crashed"; then
    info "y-provider a planté (course sur dist/ au premier démarrage) — relance"
    ( cd "$DOCS_DIR" && docker compose restart y-provider-development >/dev/null 2>&1 )
    sleep 8
  fi
fi

# ------------------------------------------------------------------ 6. le mini-site

etape "6. Mini-site"
# `[ -d node_modules ]` seul ne suffit pas : il répond « ok » sur des dépendances
# périmées. npm réécrit node_modules/.package-lock.json à chaque install, donc le
# comparer au package.json dit si l'installation est postérieure au dernier
# changement de dépendances. Cas réel : le merge du 15/09 ajoute react-router-dom
# au frontend — sans ce contrôle, l'étape 6 est verte et le frontend plante au
# démarrage sur un module introuvable.
for partie in backend frontend; do
  MARQ="$ICI/$partie/node_modules/.package-lock.json"
  if [ -d "$ICI/$partie/node_modules" ] && [ "$MARQ" -nt "$ICI/$partie/package.json" ]; then
    ok "$partie — dépendances à jour"
  elif [ "$VERIFY_ONLY" = 1 ]; then
    if [ -d "$ICI/$partie/node_modules" ]; then ko "$partie — dépendances périmées, lance npm install"
    else ko "$partie — npm install pas fait"; fi
  else
    ( cd "$ICI/$partie" && npm install >/dev/null 2>&1 ) && ok "$partie — installé" || ko "$partie — npm install a échoué"
  fi
done

# ------------------------------------------------------------------ 7. vérification

etape "7. Vérification"
VERIF_KO=0
# Réessaie au lieu de trancher au premier coup : `make run` recrée des conteneurs
# et le `sleep 5` ci-dessus ne couvre pas leur démarrage. Constaté en --up, où le
# frontend fraîchement recréé répondait 000 puis 200 huit secondes plus tard.
# Coût : une machine réellement en panne met ~40 s par contrôle au lieu de 20.
verif() {  # $1 = libellé, $2 = url, $3 = code attendu
  for _ in $(seq 8); do
    code=$(curl -s -o /dev/null --max-time 3 -w "%{http_code}" "$2" 2>/dev/null)
    [ "$code" = "$3" ] && { ok "$1 ($code)"; return 0; }
    sleep 2
  done
  ko "$1 — attendu $3, reçu ${code:-aucune réponse}"
  VERIF_KO=$((VERIF_KO + 1))
  return 1
}
# Le port publié du frontend dépend de compose.override.yml : 3000 par défaut,
# autre chose si l'utilisateur a décommenté le remappage. On le demande à compose
# au lieu de le supposer.
PORT_FRONT=$(docker compose -f "$DOCS_DIR/compose.yml" port frontend-development 3000 2>/dev/null | sed 's/.*://' | tr -d '[:space:]')
[ -n "$PORT_FRONT" ] || PORT_FRONT=3000

verif "Docs API      http://localhost:8071" http://localhost:8071/api/v1.0/config/ 200
verif "Docs interface http://localhost:$PORT_FRONT" "http://localhost:$PORT_FRONT/" 200
verif "Keycloak      http://localhost:8083" http://localhost:8083/realms/impress/.well-known/openid-configuration 200

# Une pile qui répond est la seule preuve d'une installation terminée.
if [ "$VERIF_KO" = 0 ]; then
  touch "$MARQUEUR" 2>/dev/null
elif [ ! -f "$MARQUEUR" ]; then
  echo
  echo "  Les contrôles échouent et aucune installation complète n'est enregistrée."
  echo "  Cause probable : un bootstrap interrompu a laissé un data/ derrière lui, et"
  echo "  ce script bascule depuis sur « make run » sans jamais reprendre l'installation."
  echo
  echo "  Pour repartir propre — DÉTRUIT les documents locaux de CE clone :"
  echo "      cd $DOCS_DIR && docker compose down -v && rm -rf data"
  echo "      puis relance ce script."
  echo
fi

if ! lsof -nP -iTCP:4000 -sTCP:LISTEN >/dev/null 2>&1; then
  ok "port 4000 libre pour le mini-site"
elif [ "$(curl -s -o /dev/null --max-time 10 -w '%{http_code}' http://localhost:4000/api/templates 2>/dev/null)" = "200" ]; then
  ok "port 4000 — le backend du mini-site y répond déjà"
else
  ko "port 4000 pris par autre chose — le backend du mini-site ne démarrera pas"
  info "coupable : $(lsof -nP -iTCP:4000 -sTCP:LISTEN 2>/dev/null | awk 'NR==2{print $1" (pid "$2")"}')"
  info "si c'est docspec, c'est que compose.override.yml ne libère pas le port"
fi

if [ "$UP" = 0 ]; then
cat <<FIN

Prochaine étape — deux terminaux :

  cd backend  && npm run dev     API du mini-site sur :4000
  cd frontend && npm run dev     interface sur :5173

Puis http://localhost:5173 pour le mini-site,
et  http://localhost:$PORT_FRONT pour Docs (connexion : impress / impress).
FIN
  exit 0
fi

# ----------------------------------------------------------------- 8. lancement

etape "8. Mini-site en marche"

# On n'arrête QUE les ports qu'on a soi-même ouverts. `kill 0` serait plus court
# mais tue le groupe de processus entier : essayé, il emporte le `tail` d'un
# `--up | tail`, et l'appelant lui-même dans un shell sans contrôle de tâches.
# Tuer le seul pid de npm ne suffit pas non plus (tsx et vite survivent), d'où
# lsof sur le port — l'idiome déjà employé aux étapes 5 et 7.
A_ARRETER=""
arreter() {
  for P in $A_ARRETER; do
    PIDS=$(lsof -nP -tiTCP:"$P" -sTCP:LISTEN 2>/dev/null)
    [ -n "$PIDS" ] && kill $PIDS 2>/dev/null
  done
}
trap arreter EXIT INT TERM

# Idempotent comme le reste du script : on ne relance pas ce qui tourne déjà.
# Sans ça, `--up` sur une machine où les serveurs sont lancés à la main donne un
# EADDRINUSE côté backend, et vite qui glisse silencieusement sur 5174 — donc une
# « preuve » qui teste le serveur du voisin.
lancer() {  # $1 = dossier, $2 = url de contrôle, $3 = port, $4 = libellé
  if [ "$(curl -s -o /dev/null --max-time 2 -w '%{http_code}' "$2" 2>/dev/null)" = "200" ]; then
    info "$4 — déjà lancé, laissé tel quel"
  else
    ( cd "$ICI/$1" && npm run dev ) >/dev/null 2>&1 &
    A_ARRETER="$A_ARRETER $3"
  fi
}

lancer backend  http://localhost:4000/api/templates 4000 "backend"
lancer frontend http://localhost:5173/              5173 "frontend"

DEBOUT=1
verif "backend   http://localhost:4000" http://localhost:4000/api/templates 200 || DEBOUT=0
# /api/session conditionne TOUT l'écran : AuthProvider l'appelle au montage et, en
# cas d'échec, ProtectedRoute renvoie chaque page vers /login. Sans ce contrôle,
# l'interface atterrit en silence sur une page factice — et la sonde ci-dessous
# reste verte, parce que Vite sert index.html quelle que soit la route.
verif "session   http://localhost:4000" http://localhost:4000/api/session   200 || DEBOUT=0
verif "interface http://localhost:5173" http://localhost:5173/              200 || DEBOUT=0

# La preuve : un PDF réellement produit par la chaîne complète. Un port qui répond
# ne prouve que le port ; seul un rendu prouve que Typst, les polices, les gabarits
# et le convertisseur sont tous en état de marche.
if [ "$DEBOUT" = 1 ]; then
  PREUVE=$(mktemp -t doc-to-pdf-preuve).pdf
  CODE=$(curl -s -X POST http://localhost:4000/api/render \
           -H 'Content-Type: application/json' \
           -d '{"fixtureId":"simple-note","templateId":"ministere"}' \
           -o "$PREUVE" -w '%{http_code}' --max-time 60 2>/dev/null)
  TAILLE=$(wc -c < "$PREUVE" 2>/dev/null | tr -d ' ')
  if [ "$CODE" = "200" ] && [ "${TAILLE:-0}" -gt 1000 ]; then
    ok "rendu PDF — $TAILLE octets, $PREUVE"
  else
    ko "le rendu a échoué — HTTP ${CODE:-aucun}, ${TAILLE:-0} octets"
    head -c 400 "$PREUVE" 2>/dev/null; echo
    DEBOUT=0
  fi
fi

cat <<FIN

  Mini-site   http://localhost:5173
  Docs        http://localhost:$PORT_FRONT   (connexion : impress / impress)
FIN

[ "$DEBOUT" = 1 ] && [ "$VERIF_KO" = 0 ] || exit 1

# `wait` sans tâche de fond rendrait la main tout de suite : annoncer « Ctrl-C »
# dans ce cas serait mensonger. Les serveurs déjà debout ne nous appartiennent pas,
# le trap ne les touchera pas.
if [ -n "$A_ARRETER" ]; then
  echo "Ctrl-C pour arrêter ce que ce script a lancé (ports :$A_ARRETER)."
  wait
else
  echo "(les deux serveurs tournaient déjà hors de ce script : il ne les arrête pas)"
fi
