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

target="${1:-docs}"

case "$target" in
  docs)
    print_users docs run_docs
    ;;
  *)
    fail "Unknown target: $target"
    printf 'Usage: %s docs\n' "$0"
    exit 2
    ;;
esac
