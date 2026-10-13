# Sourced by build.sh / test.sh. Resolves a JDK 25 and refuses anything else.
# Order: $JDK25_HOME, $JAVA_HOME, /opt/jdk25. Never silently falls back to another major version.
for candidate in "${JDK25_HOME:-}" "${JAVA_HOME:-}" /opt/jdk25; do
  if [ -n "$candidate" ] && [ -x "$candidate/bin/javac" ] && \
     "$candidate/bin/javac" -version 2>&1 | grep -q 'javac 25'; then
    JDK="$candidate"; break
  fi
done
if [ -z "${JDK:-}" ]; then
  echo "ERROR: JDK 25 not found. Set JDK25_HOME to a JDK 25 installation." >&2
  exit 1
fi
