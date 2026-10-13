#!/usr/bin/env sh
# Runs the code runner natively (no Docker) on 127.0.0.1, rebuilding the jar first if sources changed.
#
# Usage: ./runner/run-local.sh              (needs JDK 25: JDK25_HOME, JAVA_HOME or /opt/jdk25 — see jdk.sh)
#   RUNNER_PORT=8091 ./runner/run-local.sh  other port (point the web app at it with RUNNER_URL)
#   RUNNER_TOKEN=...                        optional shared secret; the web app must use the same value
#
# Native mode has NONE of the container isolation (read-only FS, no network, cap drop, pids/memory limits):
# learner code runs as your user in a child JVM. It is always bound to 127.0.0.1, never to the network.
set -eu
cd "$(dirname "$0")"
# shellcheck source=SCRIPTDIR/jdk.sh
. ./jdk.sh

if [ ! -f out/jmq-runner.jar ] || [ -n "$(find src -name '*.java' -newer out/jmq-runner.jar)" ]; then
  echo "Building runner..."
  ./build.sh
fi

RUNNER_PORT="${RUNNER_PORT:-8090}"
RUNNER_WORK_DIR="${RUNNER_WORK_DIR:-${TMPDIR:-/tmp}/jmq-runner-work}"
mkdir -p "$RUNNER_WORK_DIR"
echo "Starting runner on 127.0.0.1:$RUNNER_PORT (JDK: $JDK, work dir: $RUNNER_WORK_DIR)"

# env -u JAVA_TOOL_OPTIONS: a host-wide JAVA_TOOL_OPTIONS (proxies, trust stores) must not leak into the runner.
exec env -u JAVA_TOOL_OPTIONS \
  RUNNER_BIND=127.0.0.1 \
  RUNNER_PORT="$RUNNER_PORT" \
  RUNNER_WORK_DIR="$RUNNER_WORK_DIR" \
  RUNNER_JAVA_HOME="$JDK" \
  "$JDK/bin/java" -XX:+UseSerialGC -Xmx192m -XX:-UsePerfData -jar out/jmq-runner.jar
