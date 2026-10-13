#!/usr/bin/env bash
# End-to-end journey test with a restart in the middle.
#
#   E2E_DATABASE_URL=postgres://jmq:...@127.0.0.1:5432/jmq_e2e  ./scripts/e2e.sh
#
# The database must be EMPTY or freshly created (the test refuses to run on a database with learner history).
# Steps: migrate + seed → production build (if missing) → start app → phase 1 (journey) → stop app,
# run $RESTART_DB_CMD (optional, e.g. "pg_ctl restart ..." or "docker compose restart db") → start app →
# phase 2 (everything still there) → stop app.
# Needs: Node 22, a built or buildable web app, Playwright's Chromium (npx playwright install chromium,
# or PW_CHROMIUM=/path/to/chromium). The Java runner is optional for this journey.
set -euo pipefail
cd "$(dirname "$0")/../web"

: "${E2E_DATABASE_URL:?set E2E_DATABASE_URL to a fresh, empty database}"
PORT="${E2E_PORT:-3200}"
BASE_URL="http://127.0.0.1:${PORT}"
export E2E_DATABASE_URL BASE_URL
LOG="${TMPDIR:-/tmp}/jmq-e2e-server.log"
SERVER_PID=""

start_app() {
  if curl -fsS "$BASE_URL/api/health" >/dev/null 2>&1; then echo "port $PORT is already serving something — stop it first" >&2; exit 1; fi
  # setsid: the server gets its own process group, so stop_app takes down npx *and* the next-server child.
  DATABASE_URL="$E2E_DATABASE_URL" RUNNER_URL="${RUNNER_URL:-http://127.0.0.1:8090}" NODE_ENV=production \
    setsid npx next start -H 127.0.0.1 -p "$PORT" >>"$LOG" 2>&1 &
  SERVER_PID=$!
  for _ in $(seq 1 60); do
    if curl -fsS "$BASE_URL/api/health" >/dev/null 2>&1; then echo "app up on $BASE_URL"; return 0; fi
    sleep 1
  done
  echo "app did not become healthy — see $LOG" >&2; exit 1
}
stop_app() {
  if [ -n "$SERVER_PID" ]; then
    kill -TERM -- "-$SERVER_PID" 2>/dev/null || kill -TERM "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
    for _ in $(seq 1 20); do curl -fsS "$BASE_URL/api/health" >/dev/null 2>&1 || break; sleep 0.5; done
    SERVER_PID=""
  fi
}
trap stop_app EXIT

echo "→ migrate + seed"
DATABASE_URL="$E2E_DATABASE_URL" npm run --silent migrate
DATABASE_URL="$E2E_DATABASE_URL" npm run --silent seed
[ -f .next/BUILD_ID ] || { echo "→ next build"; npx next build; }
rm -f test-results/e2e-state.json
: >"$LOG"

echo "→ phase 1: learning journey"
start_app
npx playwright test tests/e2e/1-journey.spec.ts
stop_app

if [ -n "${RESTART_DB_CMD:-}" ]; then
  echo "→ restarting the database: $RESTART_DB_CMD"
  eval "$RESTART_DB_CMD"
fi

echo "→ phase 2: persistence after restart"
start_app
E2E_PHASE=2 npx playwright test tests/e2e/2-persistence.spec.ts
stop_app
echo "✓ end-to-end journey passed"
