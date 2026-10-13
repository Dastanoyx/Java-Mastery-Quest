#!/usr/bin/env sh
# Builds the runner with only the JDK (no Maven/Gradle needed). Usage: ./build.sh  (needs JDK 25: JDK25_HOME, JAVA_HOME or /opt/jdk25)
set -eu
cd "$(dirname "$0")"
. ./jdk.sh
rm -rf out && mkdir -p out/classes
"$JDK/bin/javac" --release 25 -Xlint:all -Werror -d out/classes $(find src -name '*.java')
"$JDK/bin/jar" --create --file out/jmq-runner.jar --main-class dev.jmq.runner.RunnerServer -C out/classes .
echo "Built out/jmq-runner.jar"
