#!/usr/bin/env bash
#
# Installe l'environnement local complet : La Suite Docs + ce mini-site.
#
# Idempotent : relançable sans rien casser. Il ne lance `make bootstrap` que si la
# base est vide, et ne réécrit jamais un compose.override.yml existant.
#
#   ./dev/setup-local.sh            installe tout
#   ./dev/setup-local.sh --verify   ne vérifie que l'état, n'installe rien
#
set -uo pipefail

DOCS_DIR="${DOCS_DIR:-$HOME/Documents/docs}"
ICI="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VERIFY_ONLY=0
[ "${1:-}" = "--verify" ] && VERIFY_ONLY=1

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
besoin docker "https://www.docker.com/products/docker-desktop"
besoin node   "https://nodejs.org (20+)"
besoin npm    "fourni avec node"
besoin typst  "brew install typst"

if ! docker info >/dev/null 2>&1; then
  ko "le démon Docker ne tourne pas — lance Docker Desktop"; MANQUE=1
fi
NODE_MAJ=$(node --version 2>/dev/null | sed 's/^v//' | cut -d. -f1)
[ -n "$NODE_MAJ" ] && [ "$NODE_MAJ" -lt 20 ] && { ko "node $NODE_MAJ, il en faut 20+"; MANQUE=1; }
[ "$MANQUE" = 1 ] && { echo; echo "Installe ce qui manque, puis relance."; exit 1; }

# --------------------------------------------------------------- 2. clone de Docs

etape "2. La Suite Docs"
if [ -d "$DOCS_DIR/.git" ]; then
  ok "déjà cloné dans $DOCS_DIR"
else
  if [ "$VERIFY_ONLY" = 1 ]; then ko "absent de $DOCS_DIR"; else
    info "clonage dans $DOCS_DIR (quelques minutes)"
    git clone https://github.com/suitenumerique/docs.git "$DOCS_DIR" || exit 1
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
python3 - "$DOCS_DIR" <<'PY'
import pathlib, re, sys
racine = pathlib.Path(sys.argv[1])
motif = re.compile(r'^(\s*)except\s+([^:()#]+,[^:()#]+):\s*$')
touches = deja = 0
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
PY
if python3 -m compileall -q "$DOCS_DIR/src/backend" 2>/dev/null; then
  ok "tout src/backend compile"
else
  ko "src/backend ne compile toujours pas — regarde la sortie ci-dessus"
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
  if [ "$BASE_VIDE" = 1 ] && [ ! -d "$DOCS_DIR/data" ]; then
    info "première installation : make bootstrap (10-20 min, construit les images)"
    ( cd "$DOCS_DIR" && make bootstrap ) || { ko "make bootstrap a échoué"; exit 1; }
  else
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
for partie in backend frontend; do
  if [ -d "$ICI/$partie/node_modules" ]; then ok "$partie — dépendances présentes"
  elif [ "$VERIFY_ONLY" = 1 ]; then ko "$partie — npm install pas fait"
  else ( cd "$ICI/$partie" && npm install >/dev/null 2>&1 ) && ok "$partie — installé" || ko "$partie — npm install a échoué"; fi
done

# ------------------------------------------------------------------ 7. vérification

etape "7. Vérification"
verif() {
  code=$(curl -s -o /dev/null --max-time 20 -w "%{http_code}" "$2" 2>/dev/null)
  [ "$code" = "$3" ] && ok "$1 ($code)" || ko "$1 — attendu $3, reçu ${code:-aucune réponse}"
}
verif "Docs API      http://localhost:8071" http://localhost:8071/api/v1.0/config/ 200
verif "Docs interface http://localhost:3011" http://localhost:3011/ 200
verif "Keycloak      http://localhost:8083" http://localhost:8083/realms/impress/.well-known/openid-configuration 200

if ! lsof -nP -iTCP:4000 -sTCP:LISTEN >/dev/null 2>&1; then
  ok "port 4000 libre pour le mini-site"
elif [ "$(curl -s -o /dev/null --max-time 10 -w '%{http_code}' http://localhost:4000/api/templates 2>/dev/null)" = "200" ]; then
  ok "port 4000 — le backend du mini-site y répond déjà"
else
  ko "port 4000 pris par autre chose — le backend du mini-site ne démarrera pas"
  info "coupable : $(lsof -nP -iTCP:4000 -sTCP:LISTEN 2>/dev/null | awk 'NR==2{print $1" (pid "$2")"}')"
  info "si c'est docspec, c'est que compose.override.yml ne libère pas le port"
fi

cat <<'FIN'

Prochaine étape — deux terminaux :

  cd backend  && npm run dev     API du mini-site sur :4000
  cd frontend && npm run dev     interface sur :5173

Puis http://localhost:5173 pour le mini-site,
et  http://localhost:3011 pour Docs (connexion : impress / impress).
FIN
