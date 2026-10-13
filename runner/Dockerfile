# Java Mastery Quest — code runner (dependency-free Java 25 HTTP service).
#
# Build context is the repository root (compose.yaml does this):
#   docker build -f runner/Dockerfile -t jmq-runner .
#
# The runtime stage is a full JDK on purpose: the runner compiles learner code in-process with javax.tools
# (javac) and launches each run in a child JVM. No build tool, no third-party dependencies.

# Ubuntu 24.04 (glibc) Temurin image (docs/DECISIONS.md D-022).
ARG JDK_IMAGE=eclipse-temurin:25-jdk-noble

# ---------------------------------------------------------------------------------------------------------------
FROM ${JDK_IMAGE} AS build
WORKDIR /build/runner
COPY runner/jdk.sh runner/build.sh runner/test.sh ./
COPY runner/src ./src
COPY runner/test ./test
# build.sh: javac --release 25 -Xlint:all -Werror + jar. test.sh: the runner's own self-test suite
# (compiles and runs real snippets in child JVMs). A failing test fails the image build.
ARG RUN_TESTS=true
RUN sh ./build.sh \
 && if [ "$RUN_TESTS" = "true" ]; then sh ./test.sh; fi

# ---------------------------------------------------------------------------------------------------------------
FROM ${JDK_IMAGE} AS runtime
# Unprivileged user; no home directory, no login shell.
RUN groupadd --system --gid 10001 runner \
 && useradd --system --uid 10001 --gid runner --no-create-home --home-dir /nonexistent \
            --shell /usr/sbin/nologin runner
WORKDIR /app
# Root-owned jar → read-only for the runner user.
COPY --from=build /build/runner/out/jmq-runner.jar /app/jmq-runner.jar
# JAVA_TOOL_OPTIONS is intentionally NOT set (it would print "Picked up JAVA_TOOL_OPTIONS" and leak settings);
# child JVMs get an empty environment anyway (JavaSandbox clears it).
# RUNNER_REAP_ORPHANS: kill processes that learner code leaves behind (OrphanReaper; container-only).
ENV RUNNER_BIND=0.0.0.0 \
    RUNNER_PORT=8090 \
    RUNNER_WORK_DIR=/tmp/jmq-work \
    RUNNER_REAP_ORPHANS=true
USER 10001:10001
EXPOSE 8090
# -XX:-UsePerfData: no hsperfdata files in /tmp (the root filesystem is read-only in compose; /tmp is a tmpfs).
# The base image's /__cacert_entrypoint.sh is deliberately replaced: the runner needs no extra CA certificates.
ENTRYPOINT ["java", "-XX:+UseSerialGC", "-Xmx192m", "-XX:-UsePerfData", "-jar", "/app/jmq-runner.jar"]
