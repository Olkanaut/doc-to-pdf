#!/usr/bin/env bash
set -Eeuo pipefail

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

usage() {
  cat <<'EOF'
Usage:
  ./setup.sh docs <check|bootstrap|up|down|status|verify|users|clean>
  ./demo/docs.sh <check|bootstrap|up|down|status|verify|users|clean>

Examples:
  ./setup.sh docs bootstrap
  ./setup.sh docs up
  ./setup.sh docs verify
  ./setup.sh docs down
EOF
}

action="${1:-}"

case "$action" in
  check)
    check_prerequisites
    printf '\n'
    check_docker_disk
    printf '\n'
    check_docs_compose_config_only
    ;;
  bootstrap)
    docs_bootstrap
    ;;
  up)
    docs_up
    ;;
  down)
    docs_down
    ;;
  status)
    docs_status
    ;;
  verify)
    docs_verify
    ;;
  users)
    "$DEMO_DIR/users.sh" docs
    ;;
  clean)
    clean_docs_yarn_cache
    ;;
  ""|-h|--help|help)
    usage
    ;;
  *)
    fail "Unknown docs action: $action"
    usage
    exit 2
    ;;
esac
