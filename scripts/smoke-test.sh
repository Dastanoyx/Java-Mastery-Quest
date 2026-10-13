#!/usr/bin/env bash
# Smoke test against a running instance: health endpoint + main pages must answer HTTP 200.
#
# Usage: scripts/smoke-test.sh [base_url]          (default: http://127.0.0.1:${WEB_PORT:-3000})
#   SMOKE_WAIT=60 scripts/smoke-test.sh            wait up to 60 s for /api/health first (e.g. right after `up`)
#
# Exit code 0 = everything passed, 1 = at least one check failed.
set -euo pipefail

BASE_URL="${1:-http://127.0.0.1:${WEB_PORT:-3000}}"
BASE_URL="${BASE_URL%/}"
WAIT="${SMOKE_WAIT:-0}"
PAGES=(/ /curriculum /practice /exams /progress)

command -v curl >/dev/null 2>&1 || { echo "ERROR: curl is required" >&2; exit 1; }

body_file="$(mktemp)"
trap 'rm -f "$body_file"' EXIT
failures=0

fetch() { # fetch <path> → prints HTTP status (000 on connection failure), body in $body_file
  curl -sS -o "$body_file" -w '%{http_code}' --max-time 20 "$BASE_URL$1" 2>/dev/null || true
}

echo "Smoke testing $BASE_URL"

if [ "$WAIT" -gt 0 ]; then
  deadline=$(( $(date +%s) + WAIT ))
  until [ "$(fetch /api/health)" = "200" ]; do
    if [ "$(date +%s)" -ge "$deadline" ]; then echo "  (gave up waiting after ${WAIT}s)"; break; fi
    sleep 2
  done
fi

# 1. Health: HTTP 200 and "status":"ok" (database reachable). Runner state is reported, not required.
code="$(fetch /api/health)"
compact="$(tr -d ' \n' < "$body_file")"
if [ "$code" = "200" ] && printf '%s' "$compact" | grep -q '"status":"ok"'; then
  echo "  PASS  /api/health  200 status=ok"
else
  echo "  FAIL  /api/health  HTTP $code  ${compact:0:200}"
  failures=$((failures + 1))
fi
if printf '%s' "$compact" | grep -q '"runner":{"ok":true'; then
  echo "  info  runner reachable"
elif [ "$code" = "200" ]; then
  echo "  WARN  runner not reachable (Run / Coding Lab disabled; everything else works)"
fi

# 2. Pages
for path in "${PAGES[@]}"; do
  code="$(fetch "$path")"
  if [ "$code" = "200" ]; then
    echo "  PASS  $path  200"
  else
    echo "  FAIL  $path  HTTP $code"
    failures=$((failures + 1))
  fi
done

if [ "$failures" -gt 0 ]; then
  echo "✗ $failures check(s) failed"
  exit 1
fi
echo "✓ all checks passed"
