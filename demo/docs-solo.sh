#!/usr/bin/env bash
set -Eeuo pipefail

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

usage() {
  cat <<'EOF'
Usage:
  ./lasuite-dev.sh docs-solo <check|bootstrap|up|down|status|verify|users|clean>
  ./demo/docs-solo.sh <check|bootstrap|up|down|status|verify|users|clean>

Examples:
  ./lasuite-dev.sh docs-solo bootstrap
  ./lasuite-dev.sh docs-solo up
  ./lasuite-dev.sh docs-solo verify
  ./lasuite-dev.sh docs-solo down
EOF
}

action="${1:-}"

case "$action" in
  check)
    check_prerequisites
    printf '\n'
    check_docker_disk
    printf '\n'
    check_docs_solo_compose_config
    ;;
  bootstrap)
    docs_solo_bootstrap
    ;;
  up)
    docs_solo_up
    ;;
  down)
    docs_solo_down
    ;;
  status)
    docs_solo_status
    ;;
  verify)
    docs_solo_verify
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
    fail "Unknown docs-solo action: $action"
    usage
    exit 2
    ;;
esac
