#!/usr/bin/env bash
set -Eeuo pipefail

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

usage() {
  cat <<'EOF'
Usage:
  ./lasuite-dev.sh suite <check|bootstrap|up|down|status|verify|users|clean>
  ./demo/suite.sh <check|bootstrap|up|down|status|verify|users|clean>

Examples:
  ./lasuite-dev.sh suite bootstrap
  ./lasuite-dev.sh suite up
  ./lasuite-dev.sh suite verify
  ./lasuite-dev.sh suite down
EOF
}

action="${1:-}"

case "$action" in
  check)
    check_prerequisites
    printf '\n'
    check_docker_disk
    printf '\n'
    check_compose_config
    ;;
  bootstrap)
    suite_bootstrap
    ;;
  up)
    suite_up
    ;;
  down)
    suite_down
    ;;
  status)
    suite_status
    ;;
  verify)
    suite_verify
    ;;
  users)
    "$DEMO_DIR/users.sh" all
    ;;
  clean)
    suite_clean
    ;;
  ""|-h|--help|help)
    usage
    ;;
  *)
    fail "Unknown suite action: $action"
    usage
    exit 2
    ;;
esac
