#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

bold() { printf '\033[1m%s\033[0m\n' "$*"; }
fail() { printf 'FAIL %s\n' "$*"; }

usage() {
  cat <<'EOF'
Usage:
  ./setup.sh check
  ./setup.sh docs <check|bootstrap|up|down|status|verify|users|clean>

Profil:
  docs  Docs + Keycloak commun, pour developper Dots.

Commandes typiques:
  ./setup.sh docs bootstrap
  ./setup.sh docs verify
EOF
}

cmd="${1:-}"
action="${2:-}"

case "$cmd" in
  check)
    bold "Workspace check"
    "$ROOT_DIR/demo/docs.sh" check
    ;;
  docs)
    "$ROOT_DIR/demo/docs.sh" "$action"
    ;;
  ""|-h|--help|help)
    usage
    ;;
  *)
    fail "Commande inconnue: $cmd"
    usage
    exit 2
    ;;
esac
