#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

bold() { printf '\033[1m%s\033[0m\n' "$*"; }
fail() { printf 'FAIL %s\n' "$*"; }

usage() {
  cat <<'EOF'
Usage:
  ./setup.sh check
  ./setup.sh suite <check|bootstrap|up|down|status|verify|users|clean>
  ./setup.sh docs-solo <check|bootstrap|up|down|status|verify|users|clean>

Profils:
  suite      Docs + Drive + Keycloak commun, en version minimale.
  docs-solo  Docs + Keycloak commun, pour developper l'app PDF.

Commandes typiques:
  ./setup.sh docs-solo bootstrap
  ./setup.sh docs-solo verify

  ./setup.sh suite bootstrap
  ./setup.sh suite verify
EOF
}

cmd="${1:-}"
action="${2:-}"

case "$cmd" in
  check)
    bold "Workspace check"
    "$ROOT_DIR/demo/suite.sh" check
    ;;
  suite)
    "$ROOT_DIR/demo/suite.sh" "$action"
    ;;
  docs-solo)
    "$ROOT_DIR/demo/docs-solo.sh" "$action"
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
