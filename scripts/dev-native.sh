#!/usr/bin/env bash
# Development stack WITHOUT Docker: runner (background) + migrate + seed + `next dev` (foreground).
#
# Prerequisites on this machine:
#   - PostgreSQL 16+ with a database you can use, e.g.
#       createuser -P jmq && createdb -O jmq jmq
#   - JDK 25   (JDK25_HOME, JAVA_HOME or /opt/jdk25 — see runner/jdk.sh)
#   - Node 22 + npm
#   - DATABASE_URL in the environment or in web/.env.local, e.g.
#       DATABASE_URL=postgres://jmq:<password>@127.0.0.1:5432/jmq
#
# Usage: scripts/dev-native.sh
#   RUNNER_PORT=8091 scripts/dev-native.sh      run the runner on another port
#   SKIP_RUNNER=1    scripts/dev-native.sh      don't start the runner (Run / Coding Lab will be disabled)
#   WEB_PORT=3001    scripts/dev-native.sh      serve the app on another port
#
# Ctrl-C stops `next dev` and the runner it started.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WEB="$ROOT/web"
RUNNER_DIR="$ROOT/runner"

die() { echo "ERROR: $*" >&2; exit 1; }
info() { echo "→ $*"; }

# --- load web/.env.local (only keys not already set in the environment; Next.js does the same) --------------
if [ -f "$WEB/.env.local" ]; then
  while IFS= read -r line || [ -n "$line" ]; do
    case "$line" in ''|'#'*) continue ;; esac
    key="${line%%=*}"
    [[ "$key" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] || continue
    value="${line#*=}"
    value="${value%\"}"; value="${value#\"}"
    if [ -z "${!key+x}" ]; then export "$key=$value"; fi
  done < "$WEB/.env.local"
fi

# --- prerequisites ------------------------------------------------------------------------------------------
command -v node >/dev/null 2>&1 || die "Node.js 22 is required (node not found)"
command -v npm  >/dev/null 2>&1 || die "npm is required"
node_major="$(node -p 'process.versions.node.split(".")[0]')"
[ "$node_major" -ge 22 ] || die "Node.js 22+ is required (found $(node --version))"

[ -n "${DATABASE_URL:-}" ] || die "DATABASE_URL is not set (export it or put it in web/.env.local)"

if [ -z "${SKIP_RUNNER:-}" ]; then
  # shellcheck source=SCRIPTDIR/../runner/jdk.sh
  ( . "$RUNNER_DIR/jdk.sh" ) || die "JDK 25 is required for the runner (or set SKIP_RUNNER=1)"
fi

export CONTENT_DIR="${CONTENT_DIR:-$ROOT/content}"
export MIGRATIONS_DIR="${MIGRATIONS_DIR:-$ROOT/db/migrations}"
export NEXT_TELEMETRY_DISABLED=1
# Shared secret between web and the runner this script starts (both inherit it). A runner that was already
# running without a token still accepts the requests; one started here only accepts them from this app.
if [ -z "${RUNNER_TOKEN:-}" ]; then
  RUNNER_TOKEN="$(node -e 'process.stdout.write(require("crypto").randomBytes(24).toString("hex"))')"
  export RUNNER_TOKEN
fi
RUNNER_PORT="${RUNNER_PORT:-8090}"
# This script manages its own runner, so the app is always pointed at it (overriding RUNNER_URL from
# web/.env.local). With SKIP_RUNNER=1, RUNNER_URL is left as configured.
if [ -z "${SKIP_RUNNER:-}" ]; then
  export RUNNER_URL="http://127.0.0.1:$RUNNER_PORT"
fi

# --- runner -------------------------------------------------------------------------------------------------
runner_pid=""
dev_pid=""
stop_pid() { # stop_pid <pid> <label>
  if [ -n "$1" ] && kill -0 "$1" 2>/dev/null; then
    info "stopping $2 (pid $1)"
    kill "$1" 2>/dev/null || true
    wait "$1" 2>/dev/null || true
  fi
}
cleanup() {
  stop_pid "$dev_pid" "next dev"
  stop_pid "$runner_pid" "runner"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

runner_healthy() { node -e "fetch('$RUNNER_URL/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"; }

if [ -n "${SKIP_RUNNER:-}" ]; then
  info "SKIP_RUNNER set — not starting the runner"
elif runner_healthy; then
  info "runner already running at $RUNNER_URL — reusing it"
else
  mkdir -p "$RUNNER_DIR/out"
  log="$RUNNER_DIR/out/runner.log"
  info "starting runner on 127.0.0.1:$RUNNER_PORT (log: $log)"
  RUNNER_PORT="$RUNNER_PORT" "$RUNNER_DIR/run-local.sh" > "$log" 2>&1 &
  runner_pid=$!
  for _ in $(seq 1 60); do
    runner_healthy && break
    kill -0 "$runner_pid" 2>/dev/null || { tail -n 20 "$log" >&2; die "runner exited during startup"; }
    sleep 1
  done
  runner_healthy || { tail -n 20 "$log" >&2; die "runner did not become healthy within 60 s"; }
  info "runner healthy"
fi

# --- database + content -------------------------------------------------------------------------------------
cd "$WEB"
if [ ! -d node_modules ]; then
  info "installing npm dependencies (npm ci)"
  npm ci
fi
info "applying migrations"
npm run --silent migrate || die "migrations failed — is PostgreSQL running and DATABASE_URL correct?"
info "seeding content from $CONTENT_DIR"
npm run --silent seed || die "seeding failed (run: cd web && npm run content:validate)"

# --- web ----------------------------------------------------------------------------------------------------
WEB_PORT="${WEB_PORT:-3000}"
info "starting next dev on http://127.0.0.1:$WEB_PORT (Ctrl-C to stop)"
# Started in the background + `wait` so that Ctrl-C *and* a plain SIGTERM to this script both reach the
# cleanup trap, which stops next dev and the runner.
"$WEB/node_modules/.bin/next" dev -H 127.0.0.1 -p "$WEB_PORT" &
dev_pid=$!
wait "$dev_pid"
