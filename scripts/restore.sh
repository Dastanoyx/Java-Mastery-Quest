#!/usr/bin/env bash
# Restores a backup made by scripts/backup.sh into the Docker Compose PostgreSQL database.
#
# Usage: scripts/restore.sh [--yes] <backups/jmq-YYYYmmdd-HHMMSS.dump>
#
# What it does:
#   1. verifies the archive (pg_restore --list)
#   2. asks you to type "restore" (skipped with --yes)
#   3. writes a safety backup of the CURRENT database (scripts/backup.sh)
#   4. stops the web service so nothing writes during the restore
#   5. replaces the database contents in ONE transaction:
#        DROP SCHEMA public CASCADE; CREATE SCHEMA public;  +  pg_restore --clean --if-exists
#      (the schema reset also removes tables a newer migration added after the backup was taken;
#       if anything fails, the transaction rolls back and the current data is left untouched)
#   6. re-runs the migrate job (brings an older backup up to the current schema, re-seeds content)
#   7. starts web again if it was running before
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

usage() { echo "Usage: $0 [--yes] <backup-file.dump>" >&2; exit 2; }

assume_yes=false
file=""
for arg in "$@"; do
  case "$arg" in
    -y|--yes) assume_yes=true ;;
    -h|--help) usage ;;
    -*) echo "Unknown option: $arg" >&2; usage ;;
    *) [ -z "$file" ] || usage; file="$arg" ;;
  esac
done
[ -n "$file" ] || usage
[ -f "$file" ] && [ -r "$file" ] || { echo "ERROR: cannot read backup file: $file" >&2; exit 1; }

running_services="$(docker compose ps --status running --services 2>/dev/null || true)"
if ! printf '%s\n' "$running_services" | grep -qx db; then
  echo "ERROR: the db service is not running. Start it with: docker compose up -d db" >&2
  exit 1
fi
web_was_running=false
if printf '%s\n' "$running_services" | grep -qx web; then web_was_running=true; fi

echo "→ verifying archive $file"
entries="$(docker compose exec -T db pg_restore --list < "$file" | grep -cv '^;' || true)"
if [ "${entries:-0}" -lt 1 ]; then
  echo "ERROR: $file is not a valid pg_dump custom-format archive" >&2
  exit 1
fi
echo "  $entries archive entries"

if [ "$assume_yes" != true ]; then
  if [ ! -t 0 ]; then
    echo "ERROR: refusing to restore without confirmation (no terminal). Re-run with --yes." >&2
    exit 1
  fi
  echo
  echo "This REPLACES all data in the database (progress, notes, exam history) with the contents of:"
  echo "  $file"
  printf 'Type "restore" to continue: '
  read -r answer
  if [ "$answer" != "restore" ]; then
    echo "Aborted; nothing was changed."
    exit 1
  fi
fi

echo "→ safety backup of the current database"
"$ROOT/scripts/backup.sh"

restart_web() {
  if [ "$web_was_running" = true ]; then
    echo "→ starting web"
    docker compose start web >/dev/null || echo "WARNING: could not start web; run: docker compose up -d web" >&2
  fi
}
trap restart_web EXIT

if [ "$web_was_running" = true ]; then
  echo "→ stopping web"
  docker compose stop web >/dev/null
fi

echo "→ restoring (single transaction)"
# Inside the container: pg_restore first turns the whole archive (stdin) into a SQL file, prefixed by a schema
# reset. Only if that fully succeeds does psql apply it, with --single-transaction + ON_ERROR_STOP, so a corrupt
# archive or any SQL error leaves the current database exactly as it was.
docker compose exec -T db sh -c '
  set -eu
  sql="$(mktemp)"
  trap "rm -f $sql" EXIT
  {
    echo "SET client_min_messages = warning; DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;"
    pg_restore --clean --if-exists --no-owner --no-privileges -f -
  } > "$sql"
  psql -X -q -v ON_ERROR_STOP=1 --single-transaction -U "$POSTGRES_USER" -d "$POSTGRES_DB" -f "$sql" >/dev/null
' < "$file"

echo "→ applying migrations / content to the restored database"
docker compose run --rm --no-deps migrate

echo "✓ restore complete from $file"
