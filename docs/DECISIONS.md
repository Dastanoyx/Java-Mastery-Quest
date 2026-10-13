# Architecture Decision Log

Short ADRs. Status: **Accepted** unless noted.

## D-001 — Next.js full-stack (TypeScript) instead of a Spring Boot backend

**Context.** The brief prefers a Java 25 / Spring Boot backend. The build environment used to create this
project blocks Maven Central, Gradle and every Maven mirror (verified 2026-10-12), and no Spring artifacts
are cached. A Spring backend could be *written* but never compiled, tested or run here — which would violate
the "no unverified claims / keep it runnable" rules.

**Decision.** Use one Next.js 16 application (App Router) for both UI and HTTP API (route handlers + server
actions), talking to PostgreSQL through `pg` with hand-written SQL. Java remains a first-class part of the
system where it matters most: the **code runner is a dependency-free Java 25 service**, and every code
question is verified by compiling and running it on JDK 25.

**Consequences.** + Fully built and tested in this environment; one deployable for the app; typed end-to-end.
− Not a Spring showcase. The data layer is isolated in `web/src/server/**` (repositories + services, no
SQL in components), so a Spring Boot port can replace it behind the same JSON API later (tracked in
`IMPLEMENTATION_PLAN.md`, "Future").

## D-002 — Plain SQL migrations + tiny migrator (no ORM)

Prisma downloads native engines from a CDN (blocked here) and hides SQL. Migrations live in
`db/migrations/NNN_name.sql`, applied in order by `scripts/migrate.ts` inside a transaction with an advisory
lock, recorded in `schema_migrations` (with checksum; a changed applied migration aborts startup).

## D-003 — Content as files, seeded idempotently into PostgreSQL

Lessons are Markdown with front-matter; questions/exercises are YAML. `scripts/seed.ts` validates and
**upserts** content (keyed by stable IDs, with a content hash), never touching learner tables. Learner history
references question IDs; editing a question bumps its `version` but keeps past attempts intact (the attempt
stores the answer it was graded against).

## D-004 — Dependency-free Java 25 runner as a separate service

`runner/` uses only the JDK (`com.sun.net.httpserver`, `javax.tools`). It compiles in-process with
`-proc:none` (no annotation processors ⇒ no code runs at compile time) and runs learner code in a **separate
child JVM** with `-Xmx`, thread-stack, timeout, output caps, a cleared environment (only `LANG`, `HOME`, `TMPDIR`) and a throw-away directory.
In Docker it runs as non-root with read-only root FS, `cap_drop: ALL`, `no-new-privileges`, pids/memory/CPU
limits, on an `internal` network with no route to the internet and no DB credentials. The web app never
executes learner code itself, and the Docker socket is never mounted.

## D-005 — Spaced repetition: SM-2 variant with evidence-weighted mastery

FSRS needs parameter fitting to shine; SM-2 is well understood and testable. We grade 0–5 from
correctness × confidence × time, keep an `ease` factor per item, and reset on lapse with a 10-minute
relearning step. Mastery is computed separately from scheduling (see LEARNING_METHODOLOGY §3).

## D-006 — Single local learner, no auth

Personal, local-first tool. One `learner` row (id = 1). All tables still carry `learner_id` so multi-user
support is a migration, not a rewrite. The app binds to localhost by default.

## D-007 — Mock-exam domain distribution

Oracle publishes no domain weights. Full mocks allocate questions proportionally to objective count with a
floor of 3 per domain, preferring least-exposed questions. Configurable in `content/blueprint.yaml`.

## D-008 — CodeMirror 6 instead of Monaco

Monaco's default loader pulls from a CDN and is heavy; CodeMirror 6 bundles locally, is accessible and fast.

## D-009 — Readiness is a gated level, not a single score

A composite index (0–100) is shown, but the readiness *level* is the highest level whose **every** gate
passes (coverage, unseen accuracy, weakest domain, retention, recent mocks, pace). Sample sizes are shown;
below minimum evidence the estimate is labelled *preliminary*.

## D-010 — Container images verified on local stand-in base images

Registries are blocked in the build environment. Originally the stack could not be run at all; it was
written against public images and every process was run natively. **Update 2026-10-13:** a Docker daemon
became available, so the base images were rebuilt locally as stand-ins that mirror the official ones and the
real Dockerfiles and Compose file were run end to end (OPERATIONS.md §11). Remaining gap: the official
base-image bytes themselves.

## D-011 — Multi-select questions state how many to choose

Sources consulted on 2026-10-13 (CodeRanch OCP 25 wiki) agree the real exam says "Choose two." and gives no
partial credit. Content written earlier used "Choose all that apply". Rather than rewrite 81 verified items,
`toPublic()` strips that phrase and exposes `choose` (the number of correct options); every mode shows
"Choose N." Scoring was already all-or-nothing.

## D-012 — Locked lessons are a recommendation the learner can override

Prerequisites lock a mission in the Learning World, but the lesson shows a gate with the missing lessons and
an "Open it anyway" link. An experienced engineer should not have to grind through basics to reach the
material that matters; the evidence-based measures (mastery, readiness) are unaffected by the order.

## D-013 — Cross-site request guard instead of authentication

With no login, any website open in the same browser could POST to the local API (reset progress, use the
runner). `handle()` rejects state-changing requests whose `Origin` / `Sec-Fetch-Site` is cross-site and
requires `application/json` bodies (which forces a CORS preflight). Non-browser clients (tests, curl) are
unaffected. Found by the ops review on 2026-10-13; unit-tested.

## D-014 — Charts are small, hand-written SVG components

`LineChart` and `Heatmap` are ~150 lines of SVG with a hover layer and a data-table toggle, instead of
Recharts. Server-rendered pages stay light, the palette is the validated token set, and accessibility
(text alternatives, tables) is under our control. Recharts remains a dependency for future complex charts.

## D-015 — Code fonts without ligatures

JetBrains Mono would draw `->` as an arrow and `!=` as ≠. On an exam about exact syntax, code must look
exactly as typed, so ligatures are disabled on every code surface.

## D-016 — End-to-end journey runs against a production build with a database restart

`scripts/e2e.sh` migrates and seeds a fresh database, starts `next start`, drives the full journey through
Chromium (phase 1), stops the app, restarts PostgreSQL, starts the app again and verifies every recorded
fact (phase 2). The test reads correct answers from the database only to drive the UI deterministically;
the browser never receives them.

## D-017 — Questions of an open strict exam are locked everywhere else

Found by the independent review (2026-10-13): with an exam open, a second tab could answer the same question
in practice mode (`/api/answers`) and receive the full explanation, or read its hint via `/api/questions/:id`.
`services/examLock.ts` defines one SQL condition and one assertion. Answers, question lookups and mastery-quiz
submissions return **409** for those questions; practice selection, review queues, follow-ups and search
exclude them; lesson checks drop their hints. The lock lifts on submission or expiry. Integration- and
E2E-tested.

## D-018 — The strict exam payload carries prompt, code and options only

The review showed that `format` and `tags` leak the answer type: 34/43 `compile-error` questions are "does not
compile", 0/164 `predict-output` questions are. `examSafe()` replaces the id (`<attempt>-<position>`),
format, tags, objective, domain, lesson, verification and difficulty with neutral values until submission.

## D-019 — Host allow-list against DNS rebinding

The cross-site guard (D-013) cannot stop a rebinding domain, which is same-origin with itself. `src/proxy.ts`
(Next 16's renamed middleware) answers **421** to any request whose `Host` is not a loopback name or listed
in `ALLOWED_HOSTS`, on every method including GET (`/api/export` is a full data dump).

## D-020 — The runner refuses browser requests

In native mode the runner listens on 127.0.0.1 without container isolation. Any web page could POST a
`text/plain` body (no CORS preflight) and run Java on the machine. The runner now rejects requests carrying
`Origin` or `Sec-Fetch-Site` (403) and non-JSON bodies (415). `dev-native.sh` generates a random
`RUNNER_TOKEN` shared by web and runner. The app's server-side fetch sends neither header.

## D-021 — Rewards need genuine evidence

- Relearning steps (interval < 1 day) get **no** 6-hour due tolerance: answering again seconds after a miss is
  an immediate repeat, so it doesn't graduate the item, count as a due review, or feed the retention gate or
  the daily review bonus.
- Exam XP, timed-challenge quests and mock achievements require **≥ 80 % of questions answered**. A blank
  attempt is still scored and kept.
- Domain mastery milestones require weighted evidence ≥ 3 on **every** objective of the domain, so the
  Beta(1,1) prior can't pay out on two lucky answers.
- Blank exam answers count as wrong in the exam score (as on the real exam) but are excluded from mastery
  evidence, and file as an `unanswered` mistake, not a "knowledge gap" (migration 003).

## D-022 — glibc base images (Debian/Ubuntu) instead of Alpine

`node:22-alpine`, `eclipse-temurin:25-jdk-alpine` and `postgres:17-alpine` became `node:22-bookworm-slim`,
`eclipse-temurin:25-jdk-noble` and `postgres:17-bookworm`. Reasons: the app, Next.js' native binaries, the
runner and every test had only ever run on glibc; the Alpine build needed a musl compatibility shim; and the
glibc variants are what could be faithfully reproduced and exercised here (Ubuntu's archive was reachable,
Alpine's was not). Cost: larger images (a few hundred MB), irrelevant for a local tool. The
`# syntax=docker/dockerfile:1` lines were dropped too: no feature needed them, and they force a registry
pull of the Dockerfile frontend even when the base images are already present (offline builds).

## D-023 — Reap processes left behind by learner code

Probing the container showed that learner code can start `/bin/sh` and leave processes running after its
JVM exits. They survived as orphans of the container's init and counted against `pids_limit`, so enough of
them would stop the runner from starting JVMs. Removing every shell from a JDK image is brittle, so instead:
on timeout or output flood the whole process tree is killed, and in the container an **orphan reaper** kills
any direct child of PID 1 that isn't the runner or an active child JVM, after each run and every 2 s. It is
opt-in (`RUNNER_REAP_ORPHANS=true`, set by the image) and refuses to start unless PID 1 is a container init,
because on a normal machine PID 1's children are the user's own programs. Verified: 300+ orphans from 16
runs, none left, runner healthy.
