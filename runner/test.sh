#!/usr/bin/env sh
# Compiles and runs the dependency-free runner self-test suite.
set -eu
cd "$(dirname "$0")"
. ./jdk.sh
rm -rf out/test && mkdir -p out/test
"$JDK/bin/javac" --release 25 -d out/test $(find src test -name '*.java')
env -u JAVA_TOOL_OPTIONS "$JDK/bin/java" -cp out/test dev.jmq.runner.RunnerSelfTest
