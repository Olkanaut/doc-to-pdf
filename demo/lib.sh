#!/usr/bin/env bash
set -Eeuo pipefail

DEMO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$DEMO_DIR/.." && pwd)"
ROOT_ENV_FILE="$ROOT_DIR/.env"
ROOT_ENV_EXAMPLE="$ROOT_DIR/.env.example"
MANAGED_BEGIN="# >>> lasuite shared auth demo"
MANAGED_END="# <<< lasuite shared auth demo"

bold() { printf '\033[1m%s\033[0m\n' "$*"; }
ok() { printf 'OK   %s\n' "$*"; }
warn() { printf 'WARN %s\n' "$*"; }
fail() { printf 'FAIL %s\n' "$*"; }
info() { printf 'INFO %s\n' "$*"; }

have() {
  command -v "$1" >/dev/null 2>&1
}

ensure_root_env() {
  if [ -f "$ROOT_ENV_FILE" ]; then
    return 0
  fi
  if [ ! -f "$ROOT_ENV_EXAMPLE" ]; then
    fail ".env.example is missing"
    return 1
  fi

  cp "$ROOT_ENV_EXAMPLE" "$ROOT_ENV_FILE"
  ok "Created .env from .env.example"
}

load_root_env() {
  ensure_root_env
  set -a
  . "$ROOT_ENV_FILE"
  set +a
}

render_template() {
  template="$1"
  target="$2"
  mkdir -p "$(dirname "$target")"
  awk '
    {
      while (match($0, /\{\{[A-Z0-9_]+\}\}/)) {
        key = substr($0, RSTART + 2, RLENGTH - 4)
        value = ENVIRON[key]
        $0 = substr($0, 1, RSTART - 1) value substr($0, RSTART + RLENGTH)
      }
      print
    }
  ' "$template" > "$target"
}

docker_daemon_available() {
  have docker && docker info >/dev/null 2>&1
}

ensure_docker_network() {
  docker network inspect lasuite-network >/dev/null 2>&1 || docker network create lasuite-network >/dev/null
}

port_listener() {
  port="$1"
  if have lsof; then
    lsof -nP -iTCP:"$port" -sTCP:LISTEN 2>/dev/null | awk 'NR > 1 {print $1 "/" $2; exit}'
  fi
}

assert_port_free() {
  port="$1"
  label="$2"
  allowed_container="${3:-}"

  if docker_daemon_available; then
    docker_holders="$(docker ps --filter "publish=$port" --format '{{.Names}}' || true)"
    if [ -n "$docker_holders" ]; then
      if [ -n "$allowed_container" ] && printf '%s\n' "$docker_holders" | grep -qx "$allowed_container"; then
        ok "$label already running on port $port"
        return 0
      fi

      fail "$label port $port is already allocated by Docker container(s):"
      printf '%s\n' "$docker_holders"
      info "Run ./setup.sh docs down, or stop the process using that port."
      exit 1
    fi
  fi

  owner="$(port_listener "$port" || true)"
  if [ -n "$owner" ]; then
    fail "$label port $port is already allocated by $owner"
    info "Run ./setup.sh docs down, or stop the process using that port."
    exit 1
  fi
}

stop_legacy_local_apps() {
  if ! docker_daemon_available; then
    return 0
  fi

  bold "Stopping older local Docs stack"
  (cd "$ROOT_DIR/docs" && docker compose stop >/dev/null 2>&1) || true
}

ensure_docs_local_files() {
  mkdir -p "$ROOT_DIR/docs/env.d/development"
  touch "$ROOT_DIR/docs/env.d/development/common.local"
  touch "$ROOT_DIR/docs/env.d/development/postgresql.local"
  touch "$ROOT_DIR/docs/env.d/development/kc_auth.local"
  touch "$ROOT_DIR/docs/env.d/development/kc_postgresql.local"
  touch "$ROOT_DIR/docs/env.d/development/crowdin.local"
  mkdir -p "$ROOT_DIR/docs/src/frontend/.yarn-cache"
}

ensure_docs_oidc_refresh_token_key() {
  local env_file="$ROOT_DIR/docs/env.d/development/common.local"

  if grep -q '^OIDC_STORE_REFRESH_TOKEN_KEY=' "$env_file"; then
    ok "Docs OIDC refresh token key already present"
    return 0
  fi

  bold "Generating Docs OIDC refresh token key"
  if [ -x "$ROOT_DIR/docs/bin/generate-oidc-store-refresh-token-key.sh" ]; then
    (cd "$ROOT_DIR/docs" && ./bin/generate-oidc-store-refresh-token-key.sh)
  else
    if ! have openssl; then
      fail "openssl is missing; cannot generate OIDC_STORE_REFRESH_TOKEN_KEY"
      return 1
    fi
    printf '\nOIDC_STORE_REFRESH_TOKEN_KEY=%s\n' "$(openssl rand -base64 32)" >> "$env_file"
  fi
}

prepare_docs_local_files() {
  bold "Preparing Docs local files"
  mkdir -p "$ROOT_DIR/docs/data/media"
  mkdir -p "$ROOT_DIR/docs/data/static"
  ensure_docs_local_files
  ensure_docs_oidc_refresh_token_key
}

auth_compose() {
  load_root_env
  render_auth_realm
  (cd "$ROOT_DIR/auth" && docker compose --env-file "$ROOT_ENV_FILE" "$@")
}

render_auth_realm() {
  render_template \
    "$ROOT_DIR/auth/realm-lasuite.json.tpl" \
    "$ROOT_DIR/auth/.generated/realm-lasuite.json"
}

auth_up() {
  bold "Starting shared Keycloak"
  stop_legacy_local_apps
  assert_port_free "${LASUITE_AUTH_PORT:-8083}" "Shared Keycloak" "lasuite-auth-lasuite-keycloak-1"
  ensure_docker_network
  auth_compose up -d
}

auth_down() {
  bold "Stopping shared Keycloak"
  auth_compose down
}

auth_status() {
  bold "Shared Keycloak status"
  auth_compose ps
}

run_with_env() {
  project="$1"
  shift 1
  (
    load_root_env
    cd "$ROOT_DIR/$project"
    "$@"
  )
}

run_docs() {
  run_with_env docs "$@"
}

write_managed_block() {
  target="$1"
  source="$2"
  tmp="${target}.tmp"

  mkdir -p "$(dirname "$target")"
  touch "$target"

  awk -v begin="$MANAGED_BEGIN" -v end="$MANAGED_END" '
    $0 == begin {skip = 1; next}
    $0 == end {skip = 0; next}
    skip != 1 {print}
  ' "$target" > "$tmp"

  {
    cat "$tmp"
    printf '\n%s\n' "$MANAGED_BEGIN"
    cat "$source"
    printf '%s\n' "$MANAGED_END"
  } > "$target"

  rm -f "$tmp"
}

apply_docs_shared_auth_env() {
  bold "Applying Docs shared OIDC env overrides"
  load_root_env
  ensure_docs_local_files
  rendered="$DEMO_DIR/env.docs.common.generated.local"
  render_template "$DEMO_DIR/env.docs.common.local.tpl" "$rendered"
  write_managed_block \
    "$ROOT_DIR/docs/env.d/development/common.local" \
    "$rendered"
  ok "docs/env.d/development/common.local updated"
}

check_prerequisites() {
  bold "Prerequisites"
  ensure_root_env
  if have docker; then
    ok "docker: $(docker --version)"
    if docker compose version >/dev/null 2>&1; then
      ok "docker compose: $(docker compose version)"
    else
      fail "docker compose is not available"
    fi
    if docker_daemon_available; then
      ok "Docker daemon is reachable"
    else
      warn "Docker daemon is not reachable; start Docker Desktop before bootstrap/up"
    fi
  else
    fail "docker is missing"
  fi

  if have make; then
    ok "make: $(make --version | head -n 1)"
  else
    fail "make is missing"
  fi

  if have curl; then
    ok "curl available"
  else
    warn "curl is missing; HTTP checks will be skipped"
  fi
}

check_docker_disk() {
  bold "Docker disk usage"
  if ! docker_daemon_available; then
    warn "Docker daemon is not reachable; skipping Docker disk usage"
    return 0
  fi

  docker system df || warn "Unable to read Docker disk usage"
}

clean_docs_yarn_cache() {
  bold "Cleaning Docs local Yarn cache"
  rm -rf "$ROOT_DIR/docs/src/frontend/.yarn-cache"
  rm -rf "$ROOT_DIR/docs/src/frontend/apps/impress/.next"
  ensure_docs_local_files
  ok "Docs local frontend cache cleaned"
}

check_auth_compose_config() {
  if auth_compose config --quiet; then
    ok "auth compose config"
  else
    fail "auth compose config"
  fi
}

check_docs_compose_config() {
  ensure_docs_local_files
  if run_docs docker compose config --quiet; then
    ok "docs compose config with demo ports"
  else
    fail "docs compose config with demo ports"
  fi
}

check_docs_compose_config_only() {
  bold "Docs compose config"
  ensure_docs_local_files
  check_auth_compose_config
  check_docs_compose_config
}

http_check() {
  label="$1"
  url="$2"
  timeout="${3:-30}"
  if ! have curl; then
    warn "$label skipped; curl is missing"
    return 0
  fi

  if curl -k -fsS --max-time "$timeout" -o /dev/null "$url"; then
    ok "$label reachable: $url"
  else
    warn "$label not reachable: $url"
  fi
}

http_status_check() {
  label="$1"
  url="$2"
  allowed_codes="$3"
  timeout="${4:-30}"
  if ! have curl; then
    warn "$label skipped; curl is missing"
    return 0
  fi

  code="$(curl -k -sS --max-time "$timeout" -o /dev/null -w '%{http_code}' "$url" || true)"
  case " $allowed_codes " in
    *" $code "*)
      ok "$label routed: $url (HTTP $code)"
      ;;
    *)
      warn "$label unexpected HTTP $code: $url"
      return 1
      ;;
  esac
}

wait_compose_service_healthy() {
  runner="$1"
  service="$2"
  label="$3"
  timeout="${4:-120}"
  elapsed=0

  while [ "$elapsed" -lt "$timeout" ]; do
    container_id="$("$runner" docker compose ps -q "$service" 2>/dev/null || true)"
    if [ -n "$container_id" ]; then
      status="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$container_id" 2>/dev/null || true)"
      if [ "$status" = "healthy" ] || [ "$status" = "running" ]; then
        ok "$label ready"
        return 0
      fi
    fi

    sleep 2
    elapsed=$((elapsed + 2))
  done

  warn "$label not ready after ${timeout}s"
  return 1
}

compose_service_is_running() {
  runner="$1"
  service="$2"
  container_id="$("$runner" docker compose ps -q "$service" 2>/dev/null || true)"
  [ -n "$container_id" ] || return 1
  [ "$(docker inspect --format '{{.State.Running}}' "$container_id" 2>/dev/null || true)" = "true" ]
}

stop_docs_excluded() {
  run_docs docker compose stop \
    keycloak \
    kc_postgresql \
    mailcatcher \
    docspec \
    celery-dev >/dev/null 2>&1 || true
}

docs_infra_up() {
  bold "Starting Docs dependencies"
  run_docs docker compose up -d postgresql redis minio
  wait_compose_service_healthy run_docs postgresql "Docs PostgreSQL"
  wait_compose_service_healthy run_docs minio "Docs MinIO"
  run_docs docker compose up -d createbuckets
}

docs_minimal_up() {
  prepare_docs_local_files
  apply_docs_shared_auth_env
  stop_docs_excluded
  docs_infra_up
  bold "Starting Docs app"
  run_docs docker compose up -d --no-deps \
    app-dev frontend-development nginx \
    y-provider-development y-provider-development-converter
  stop_docs_excluded
}

docs_minimal_bootstrap() {
  prepare_docs_local_files
  apply_docs_shared_auth_env
  stop_docs_excluded
  bold "Building Docs images"
  run_docs docker compose build app-dev frontend-development y-provider-development
  docs_infra_up
  bold "Migrating Docs database"
  run_docs docker compose run --rm --no-deps app-dev python manage.py migrate
  bold "Starting Docs app"
  run_docs docker compose up -d --no-deps \
    app-dev frontend-development nginx \
    y-provider-development y-provider-development-converter
  stop_docs_excluded
}

docs_minimal_down() {
  bold "Stopping Docs"
  run_docs docker compose stop \
    frontend-development \
    nginx \
    app-dev \
    createbuckets \
    minio \
    redis \
    postgresql \
    keycloak \
    kc_postgresql \
    mailcatcher \
    docspec \
    celery-dev \
    y-provider-development \
    y-provider-development-converter || true
}

docs_minimal_status() {
  bold "Docs status"
  run_docs docker compose ps \
    postgresql redis minio createbuckets app-dev frontend-development nginx \
    keycloak kc_postgresql mailcatcher docspec celery-dev y-provider-development \
    y-provider-development-converter || true
}

verify_excluded_services() {
  runner="$1"
  label="$2"
  shift 2
  for service in "$@"; do
    if compose_service_is_running "$runner" "$service"; then
      warn "$label excluded service is running: $service"
    else
      ok "$label excluded service stopped: $service"
    fi
  done
}

docs_minimal_verify_exclusions() {
  bold "Docs exclusions"
  verify_excluded_services run_docs Docs \
    keycloak kc_postgresql mailcatcher docspec celery-dev
}

docs_bootstrap() {
  auth_up
  docs_minimal_bootstrap
}

docs_up() {
  auth_up
  docs_minimal_up
}

docs_down() {
  docs_minimal_down
  auth_down || true
}

docs_status() {
  auth_status || true
  docs_minimal_status
}

docs_verify() {
  load_root_env
  bold "HTTP checks"
  http_check "Keycloak realm" "${OIDC_ISSUER}/.well-known/openid-configuration"
  http_check "Docs frontend" "${DOCS_FRONTEND_URL}"
  http_check "Docs backend" "${DOCS_BACKEND_URL}/admin/"
  http_status_check "Docs external API" "${DOCS_API_BASE_URL%/}/documents/" "200 401 403 405" || true

  docs_minimal_verify_exclusions
}
