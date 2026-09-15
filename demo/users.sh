#!/usr/bin/env bash
set -Eeuo pipefail

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

print_users() {
  project="$1"
  runner="$2"
  bold "$project local users"
  "$runner" docker compose exec -T app-dev python manage.py shell -c \
    'from core.models import User; [print(f"{u.email}\t{u.sub}") for u in User.objects.order_by("email")]' || true
}

target="${1:-all}"

case "$target" in
  docs)
    print_users docs run_docs
    ;;
  drive)
    print_users drive run_drive
    ;;
  all)
    print_users docs run_docs
    print_users drive run_drive
    ;;
  *)
    fail "Unknown target: $target"
    printf 'Usage: %s <docs|drive|all>\n' "$0"
    exit 2
    ;;
esac
