#!/usr/bin/env bash
# Backs up the Docker Compose PostgreSQL database to backups/jmq-YYYYmmdd-HHMMSS.dump (pg_dump custom format).
#
# Usage: scripts/backup.sh [output-dir]        (default output dir: backups/)
#
# Runs pg_dump *inside* the db container (no host PostgreSQL tools needed) using the container's own
# POSTGRES_USER / POSTGRES_DB. The stack must be running (`docker compose up -d db` is enough).
# The archive is verified with `pg_restore --list` before it is kept. Restore with scripts/restore.sh.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

OUT_DIR="${1:-backups}"
mkdir -p "$OUT_DIR"
umask 077   # dumps contain your whole learning history; keep them private

if ! docker compose ps --status running --services 2>/dev/null | grep -qx db; then
  echo "ERROR: the db service is not running. Start it with: docker compose up -d db" >&2
  exit 1
fi

ts="$(date +%Y%m%d-%H%M%S)"
file="$OUT_DIR/jmq-$ts.dump"
tmp="$file.partial"
trap 'rm -f "$tmp"' EXIT

echo "→ dumping database to $file"
# Single quotes: $POSTGRES_USER / $POSTGRES_DB are expanded inside the container, not on the host.
docker compose exec -T db sh -c 'exec pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc --no-owner' > "$tmp"

if [ ! -s "$tmp" ]; then
  echo "ERROR: pg_dump produced an empty file" >&2
  exit 1
fi

echo "→ verifying archive"
entries="$(docker compose exec -T db pg_restore --list < "$tmp" | grep -cv '^;' || true)"
if [ "${entries:-0}" -lt 1 ]; then
  echo "ERROR: archive verification failed (pg_restore --list found no entries)" >&2
  exit 1
fi

mv "$tmp" "$file"
trap - EXIT
size="$(wc -c < "$file" | tr -d ' ')"
echo "✓ backup written: $file ($size bytes, $entries archive entries)"
