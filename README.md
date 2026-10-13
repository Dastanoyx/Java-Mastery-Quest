# Java Mastery Quest

**A personal training academy for the Oracle Certified Professional: Java SE 25 Developer exam (1Z0-831).**
Created by Yassin Ghariani.

Learn deeply, write real code, challenge assumptions, remember what matters, prove mastery. Java Mastery
Quest combines a lesson player, a practice arena, spaced repetition, a mistake journal, strict timed mock
exams, a Java 25 code runner and an RPG-style progression layer. Every number it shows is computed from what
you actually did; nothing is simulated.

It runs locally, needs no account, sends no analytics and uses no paid service.

---

## What's inside

| Area | Route | What it does |
|---|---|---|
| Command Center | `/` | Today's plan (review → learn → practise → test → reflect), level/XP, quests, readiness, due reviews, recent mistakes |
| Onboarding | `/onboarding` | Five skippable questions that tune the planner |
| Learning World | `/curriculum`, `/curriculum/D1…D10` | The ten exam domains as regions on a map; missions, objectives, mastery, boss battles |
| Lesson player | `/lessons/<id>` | Learning contract, deep lessons, predict-the-output blocks, knowledge checks, retrieval prompts, mastery quiz, notes |
| Practice Arena | `/practice` | Filter by domain, objective, difficulty, format, source (unseen, mistakes, bookmarks); learning mode or timed challenge |
| Coding Lab | `/exercises`, `/exercises/<id>` | Write Java in the browser and run it against hidden tests on JDK 25 |
| Review | `/review` | Spaced-repetition sessions, interleaved across domains, with new variations of missed concepts |
| Mock Exam Center | `/exams`, `/exams/<id>`, `/results/<id>` | Full (50 q / 120 min), short, domain, boss and custom exams; strict mode; autosave; detailed results and remediation |
| Mistake Journal | `/mistakes` | Every wrong answer with your answer, the explanation, error category, history and your own explanation |
| Knowledge Vault | `/knowledge` | Key rules and exam traps from every lesson, confusable concept pairs, notes, bookmarks, full-text search |
| Progress & Readiness | `/progress` | Mastery per objective, accuracy and retention over time, readiness gates with sample sizes, XP ledger, titles, achievements |
| Settings | `/settings` | Study preferences, theme, reminders, data export, reset, exam-blueprint verification status |

Initial content: **32 lessons (~61,000 words), 384 original questions (353 compiled and run on JDK 25),
17 coding exercises, 12 confusable-concept pairs**, covering all 24 objectives in 10 domains. See
[`docs/COVERAGE_REPORT.md`](docs/COVERAGE_REPORT.md) for the per-objective map and the known gaps.

> **Exam objectives — verification status.** Oracle University's 1Z0-831 page was down for maintenance on
> both days this was built (2026-10-12 and 2026-10-13). The format (50 questions, 120 minutes, 68 %) is
> confirmed by two independent secondary sources; the objective wording is reconstructed from the official
> 1Z0-830 objectives plus the Java 22–25 final features. The app flags this everywhere it matters. Five
> minutes with Oracle's "Review Exam Topics" list closes the gap; see
> [`docs/EXAM_BLUEPRINT.md`](docs/EXAM_BLUEPRINT.md).

---

## Quick start (Docker)

Prerequisites: Docker Engine 24+ with Docker Compose v2.20+. Nothing else.

```bash
cp .env.example .env          # then set POSTGRES_PASSWORD and RUNNER_TOKEN (openssl rand -hex 32)
docker compose up --build     # first build takes a few minutes
```

Open **http://127.0.0.1:3000**.

What happens: `db` (PostgreSQL 17) becomes healthy → `migrate` applies the schema and seeds the
curriculum → `web` starts → `runner` (Java 25) starts. The app is bound to `127.0.0.1` only, and the database
is not published to the host at all.

> **Verified status:** `docker compose up --build` was run end to end on 2026-10-13: images built (the
> runner's self-test runs inside its build), all four services healthy, smoke test, the full browser journey
> including recreating every container, 17/17 coding exercises through the runner container, runner
> isolation probes, and backup → damage → restore. One caveat: Docker Hub was unreachable from the build
> machine, so the three **base images were local stand-ins** built to mirror the official ones (same
> distro family, same Temurin 25 and Node 22 builds, PostgreSQL 17.11 from source). Your first build pulls
> the real `node:22-bookworm-slim`, `eclipse-temurin:25-jdk-noble` and `postgres:17-bookworm`. Details:
> [`docs/OPERATIONS.md` §11](docs/OPERATIONS.md#11-verification-status).

## Command checklist

| Task | Command |
|---|---|
| Start (build if needed) | `docker compose up --build -d` |
| Run migrations + seed again (after pulling new content) | `docker compose run --rm migrate` |
| Health / smoke test | `./scripts/smoke-test.sh` (defaults to http://127.0.0.1:3000) |
| Logs | `docker compose logs -f web` · `docker compose logs -f runner` · `docker compose logs migrate` |
| Stop (keeps all progress) | `docker compose down` |
| Restart without losing progress | `docker compose restart` or `docker compose down && docker compose up -d` |
| Back up | `./scripts/backup.sh` → `backups/jmq-YYYYmmdd-HHMMSS.dump` |
| Restore | `./scripts/restore.sh backups/<file>.dump` (asks for confirmation; writes a safety backup first) |
| Export your data as JSON | Settings → Your data → Download export (or `GET /api/export`) |
| **Delete everything** (irreversible) | `docker compose down -v` — removes the `jmq-pgdata` volume |

Progress lives in the named volume `jmq-pgdata`. It survives `down`, `restart`, image rebuilds and reboots.
Only `down -v` (or `docker volume rm jmq-pgdata`) deletes it. Back up before upgrading.

## Development without Docker

Prerequisites: PostgreSQL 16+, JDK 25, Node 22.

```bash
createuser -P jmq && createdb -O jmq jmq
echo 'DATABASE_URL=postgres://jmq:<password>@127.0.0.1:5432/jmq' > web/.env.local
(cd web && npm ci)
./scripts/dev-native.sh       # builds + starts the runner, migrates, seeds, runs `next dev` on 127.0.0.1:3000
```

In native mode the runner has **none** of the container isolation (it runs as your user, bound to
127.0.0.1). Use Docker if you want the hardened runner.

## Tests and quality gates

All of these were executed in the build environment; results are recorded in
[`docs/IMPLEMENTATION_PLAN.md`](docs/IMPLEMENTATION_PLAN.md#verification-log).

| Gate | Command (from `web/` unless noted) | What it proves |
|---|---|---|
| Type check | `npm run lint` | strict TypeScript across app, scripts and tests |
| Unit + integration | `npm test` | 100 tests: SRS, mastery, XP, scoring, readiness, quests, achievements, exam builder, next-step advice, cross-site guard, host allow-list, open-exam lock; integration against a real PostgreSQL (`jmq_test`, recreated per run) |
| Runner self-test | `../runner/test.sh` | 41 assertions: compile errors with line numbers, exceptions, timeouts, output caps, OOM, cleared environment, path traversal, Java 25 compact sources and flexible constructors, rejection of browser requests, cleanup of subprocesses started by learner code |
| Content validation | `npm run content:validate` | schemas, references, duplicate IDs, near-duplicate questions, answer consistency, confusable pairs |
| Java verification | `npm run content:verify-java` | compiles and runs every code question, option and lesson output block on **JDK 25** and checks the declared outcome; results in `content/.verification/` |
| Coverage report | `npm run content:report` | regenerates `docs/COVERAGE_REPORT.md` |
| End-to-end journey | `E2E_DATABASE_URL=postgres://…/jmq_e2e ../scripts/e2e.sh` (repo root: `./scripts/e2e.sh`) | onboarding → lesson → prediction → check → mastery quiz → practice → XP → review → strict mock exam with refresh → results → mistake journal → **restart app and database** → everything still there |

`npm test` needs a database named `jmq_test` (it refuses to reset any database whose URL lacks "test"). The
E2E script needs a fresh, empty database and Playwright's Chromium (`npx playwright install chromium`).

## Project layout

```
compose.yaml            db · migrate · web · runner
content/                curriculum as files: blueprint.yaml, lessons/*.md, questions/*.yaml,
                        exercises/*.yaml, achievements.yaml, readiness.yaml, confusables.yaml
db/migrations/          plain SQL, applied in order, checksummed
web/                    Next.js 16 app (UI + JSON API), TypeScript
  src/app/              routes (pages + /api route handlers)
  src/server/domain/    pure logic: srs, mastery, readiness, xp, scoring, planner, quests …
  src/server/services/  data access + use cases (SQL lives only here)
  src/components/       design system and interactive pieces
  scripts/              migrate, seed, validate-content, verify-java, coverage-report
  tests/                unit/, integration/, e2e/
runner/                 dependency-free Java 25 code runner (JDK only) + self-test
scripts/                backup, restore, smoke-test, e2e, dev-native
docs/                   product, architecture, methodology, blueprint, plan, decisions, operations, content guide
```

## Documentation

- [PRODUCT_SPEC.md](docs/PRODUCT_SPEC.md): what the product does and for whom
- [LEARNING_METHODOLOGY.md](docs/LEARNING_METHODOLOGY.md): mastery, spaced repetition, readiness, XP and why
- [ARCHITECTURE.md](docs/ARCHITECTURE.md): components, data model, security, request flows
- [EXAM_BLUEPRINT.md](docs/EXAM_BLUEPRINT.md): verified exam facts, objective checklist, sources
- [COVERAGE_REPORT.md](docs/COVERAGE_REPORT.md): objective-by-objective content coverage and gaps
- [IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md): milestones, verification log, known limitations, next steps
- [DECISIONS.md](docs/DECISIONS.md): architecture decision records
- [OPERATIONS.md](docs/OPERATIONS.md): running, backup/restore, troubleshooting, runner isolation model
- [CONTENT_GUIDE.md](docs/CONTENT_GUIDE.md): how to add lessons, questions and exercises

## Troubleshooting (short version)

- **"The database is not reachable" page:** `docker compose ps`; the `db` service must be healthy and
  `migrate` must have exited 0 (`docker compose logs migrate`).
- **Run / Coding Lab says the runner is offline:** `docker compose up -d runner`, then
  `docker compose logs runner`. The rest of the app works without it.
- **Port 3000 in use:** set `WEB_PORT=3001` in `.env`.
- **"Misdirected request" (421):** the app only answers on localhost / 127.0.0.1. To use another host name,
  add it to `ALLOWED_HOSTS` in `.env`.
- **Changed `POSTGRES_PASSWORD` after the first start:** the old password is still in the volume. See
  OPERATIONS.md §9.

## Independent review

Before delivery, a separate reviewer audited the claims in these docs, the exam concealment, security
and the mobile layout. It found one critical, three high and several medium/low issues. All were fixed and
re-tested except one documented low item. Details: [IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md#independent-review-2026-10-13).

## Principles

No fake data, no simulated progress, no guaranteed score. XP and achievements come only from verifiable
learning events. Readiness is a set of gates with visible sample sizes, labelled *preliminary* until the
evidence is there. Unverified Java behaviour is never presented as certain. It is marked for review.
