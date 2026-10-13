# Architecture

## 1. System overview

```
            browser (localhost only)
                    │  HTTP :3000
┌───────────────────▼────────────────────────┐        ┌──────────────────────────────────┐
│ web — Next.js 16 (App Router), TypeScript  │  JSON  │ runner — Java 25, JDK only       │
│  • server components render pages          ├───────►│  • javac in-process (-proc:none) │
│  • /api route handlers (zod-validated)     │ :8090  │  • learner code in a child JVM   │
│  • services/ (all SQL)  domain/ (pure)     │        │    (heap, time, output, env caps)│
└───────────────────┬────────────────────────┘        └──────────────────────────────────┘
                    │ pg (parameterised SQL)               network "runner-net": internal,
┌───────────────────▼────────────────────────┐             no internet, no route to db
│ db — PostgreSQL 17, volume jmq-pgdata      │
└───────────────────▲────────────────────────┘
                    │ one-shot on every `up`
┌───────────────────┴────────────────────────┐
│ migrate — db/migrations/*.sql + seed from  │
│ content/ (idempotent, never touches        │
│ learner history)                           │
└────────────────────────────────────────────┘
```

| Service | Image (compose) | Network | Holds secrets? |
|---|---|---|---|
| `db` | postgres:17-bookworm | backend | DB password |
| `migrate` | web `tools` stage | backend | DB URL |
| `web` | web `runtime` stage, non-root, `cap_drop: ALL` | backend + runner-net | DB URL, runner token |
| `runner` | runner/Dockerfile, uid 10001, read-only FS, tmpfs `/tmp` noexec, `cap_drop: ALL`, no-new-privileges, pids 256, 1 GB, 1.5 CPU, orphan reaper (D-023) | runner-net (internal) only | runner token only |

Why one TypeScript app instead of Spring Boot: see DECISIONS D-001. In short, the build environment
blocked Maven Central, so a Spring backend could not have been compiled or tested here. Java is used where it
matters most: the runner and the JDK 25 verification of every code question.

## 2. Code organisation (`web/`)

```
src/app/                 routes. Pages are async server components that call services directly;
  api/**/route.ts        JSON endpoints used by client components. Every handler goes through
                         http.ts:handle() (cross-site guard, zod parsing, error mapping).
src/server/
  domain/                pure functions, no I/O, unit-tested: srs, mastery, readiness, xp, titles, quests,
                         achievements, scoring, mistakes, planner, examBuilder, streak, time
  services/              use cases + SQL: answers (the core pipeline), lessons, practice/review, exams,
                         journal (mistakes, notes, bookmarks, search), progress, analytics, gamification,
                         curriculum, knowledge, exercises, runner client, settings, learner, dashboard
  db.ts                  pg pool, query/one/tx helpers; NUMERIC/INT8 parsed to numbers
  http.ts                route-handler wrapper, cross-site guard, body parsing
  config.ts              blueprint/domains/objectives from DB; readiness.yaml from content/
  highlight.ts           Shiki (dual theme via CSS variables) for trusted curriculum code only
src/content/             content loading + schemas (shared by seed, validation and runtime)
src/components/          design system (ui.tsx, globals.css tokens) and interactive islands
scripts/                 migrate, seed, validate-content, verify-java, coverage-report
tests/unit|integration|e2e
```

Rules the code follows: SQL only in `services/`; values always parameterised (column names only from fixed
maps); domain logic never imports the database; client components never receive answer data for strict
attempts; everything persisted is append-only or versioned where history matters.

## 3. Data model

**Content** (owned by `content/`, upserted by the seed, never deleted; removed items are `retired`):
`exam_blueprint`, `exam_domain`, `exam_objective`, `lesson` (+ `lesson_objective`, `lesson_prerequisite`,
`lesson_question` with role `check` or `mastery`), `question` (+ `question_option`, `answer` jsonb,
`verification`, `verified_with`, `version`, `code_html` pre-highlighted), `coding_exercise` (hidden
`harness_code`, `solution_code`), `achievement`.

**Learner history** (every table carries `learner_id`; single learner `id = 1` today):

| Table | Role | Notes |
|---|---|---|
| `learner` | profile + preferences | onboarding answers, theme, reminders, review batch size |
| `question_attempt` | **append-only** log of every answer | mode, response, correctness, confidence, time, hint, `seen_before`, `days_since_last`, `question_version` |
| `review_item` / `review_log` | SRS state per question / every scheduling decision | ease, interval, due date, lapses; grade and `was_due` per review |
| `mistake_record` | one row per missed question | counts, last response, category + source (auto/learner), personal note, resolution |
| `lesson_progress` / `lesson_event` | lesson state / opened, section, prediction, retrieval, quiz events | resume position, best mastery-quiz score |
| `exam_attempt` / `exam_attempt_answer` | one row per attempt / per position | config, deadline (server time), strict flag, `question_version`, autosaved response, flag, confidence, time |
| `xp_transaction` | **idempotent ledger** | `UNIQUE (learner_id, source_key)`; every reward has a deterministic key (`lesson-complete:<id>`, `exam:<id>`, `daily-review:<day>` …) |
| `quest`, `learner_achievement` | generated quests per window; unlocked achievements with evidence snapshot | `UNIQUE (learner_id, cadence, kind, window_start)` |
| `study_session`, `activity_day` | session grouping; per-day counters for streaks/heatmap | day in the learner's time zone |
| `coding_submission` | every submitted solution with test results | |
| `bookmark`, `personal_note` | Knowledge Vault | full-text index on notes |
| `readiness_snapshot` | one row per day | the trend shows what the model said that day |

Derived statistics (mastery, readiness, accuracy, streaks) are **computed from history at request time**,
never stored, except the daily readiness snapshot, which is history by design.

Migrations: plain SQL in `db/migrations/NNN_name.sql`, applied in order in one transaction under an
advisory lock, recorded with a checksum in `schema_migrations`. A changed, already-applied migration aborts
startup instead of drifting.

## 4. Key flows

**Answering a question (learning modes)** — `POST /api/answers` → `recordAnswer()` in one transaction:
validate the response shape → score (all-or-nothing) → insert `question_attempt` → SRS `schedule()` →
upsert `review_item` + `review_log` → create, update or resolve `mistake_record` (with classification) →
XP via the ledger → `activity_day`. After commit, `afterLearningEvent()` completes quests, pays domain
milestones and the daily review bonus, evaluates achievements and snapshots readiness, then returns
everything that was earned, for the toasts.

**Strict exam** — `POST /api/exams` builds the question set (`examBuilder`: proportional allocation with
floors, least-exposed first, difficulty filters for bosses) and stores the attempt with a server-side
deadline. `GET` returns `examSafe()` questions only: prompt, code, options and the number to choose, under an opaque id. While the attempt is open, its questions are locked everywhere else in the app (D-017). `PUT …/answers/:pos`
autosaves response, flag, confidence and time, and rejects changes after submission or after the deadline
plus 5 s grace. `POST …/submit` (or any load after the deadline) scores each answer through the same
`recordAnswer()` pipeline in exam mode (no per-answer XP), then pays the exam reward once. `GET …/results`
returns 409 until submitted.

**Running code** — `POST /api/exercises/:id/run` → `runJava()` → runner `POST /v1/run` with the hidden
harness `Main.java` plus the learner's file. The runner compiles in-process with `-proc:none` (no annotation
processors, so no code runs at compile time). It runs `Main` in a child JVM with `-Xmx`, a thread-stack
limit, a wall-clock timeout, a byte cap on stdout/stderr (the process is killed when exceeded), an empty
environment and a throwaway directory, and returns diagnostics, output, exception type, timeout and OOM
flags. The harness prints `PASS name` or `FAIL name: detail` per test. Submissions are stored, XP is paid on
the first pass, and the reference solution unlocks after one submission.

**Content pipeline** — `content/*.md|yaml` → `content:validate` (schema, references, near-duplicates) →
`content:verify-java` (JDK 25 compile and run of every artefact, hash-keyed results) → `seed` (upsert by
stable id, bump `version` when the content hash changes, pre-highlight code with Shiki, mark verification
status from current hashes) → database.

## 5. Security and privacy

| Concern | Measure |
|---|---|
| Cross-site requests (no login: any site in the same browser could POST) | `assertSameOrigin()` rejects state-changing requests whose `Origin` or `Sec-Fetch-Site` is cross-site; JSON bodies must be `application/json` (forces a CORS preflight). Unit-tested. |
| Network exposure | web published on `127.0.0.1` only; db not published; runner on an internal network; `next dev`/`start` bind 127.0.0.1 |
| DNS rebinding | `src/proxy.ts` answers 421 unless `Host` is a loopback name or in `ALLOWED_HOSTS` (all methods, GET included) |
| Untrusted code | never executed in the web process; runner as above; no Docker socket mounted; runner has no DB credentials; the runner itself rejects browser requests (`Origin`/`Sec-Fetch-Site` → 403, non-JSON → 415) and accepts a shared bearer token |
| Injection | parameterised SQL everywhere; zod validation of every body and parameter; dynamic column names only from fixed maps |
| XSS | Markdown rendered with `skipHtml`; the only `dangerouslySetInnerHTML` is Shiki output for curriculum code (Shiki escapes the text); learner notes are Markdown without HTML |
| Answer leakage | `PublicQuestion` type has no answer fields; strict attempts get `examSafe()` payloads (prompt, code, options only; no id, format, tags, objective, hints); questions of an open strict attempt are locked app-wide (`examLock.ts`: 409 on answer/lookup, excluded from practice, review, search, follow-ups); results return 409 before submission; search excludes unseen questions |
| Errors | `handle()` maps errors to JSON with no stack traces (5xx: generic message, details in the server log); page-level error boundary with recovery steps |
| Headers | `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, `Permissions-Policy` |
| Secrets | `.env` git-ignored; `.env.example` has placeholders; the runner clears `JAVA_TOOL_OPTIONS` and the environment for learner code |
| Privacy | no accounts, analytics, telemetry (`NEXT_TELEMETRY_DISABLED=1`) or external calls at runtime; fonts bundled locally |

Known limits of the runner's isolation (all runs share one hardened container, learner code can reach
`web:3000` on the internal network, Docker's default seccomp) are documented in OPERATIONS.md §3.

## 6. Front-end design system

Tokens in `globals.css` (`--bg/surface/raised/sunken`, text levels, and five semantic accents with one
meaning each: **ion** = learning action, **arc** = game layer, **signal** = mastery/correct, **amber** = due
and time pressure, **rose** = mistakes). Dark first, with light and system themes and a reduced-motion
setting. IBM Plex Sans for UI, JetBrains Mono for code with ligatures disabled, so `->` and `!=` render as
typed. One icon family (lucide). Chart colours were validated for colour-vision deficiency in both themes,
every chart has a data-table view, and only one motion moment is orchestrated (the world map).

Accessibility: skip link, landmarks, visible focus rings, keyboard shortcuts (`Ctrl/⌘K` palette, `/`
search, A–H answer, Enter check, H hint, N next; exams: ←/→, F flag), `aria-live` feedback, real
links/buttons for every interactive element including map nodes, no colour-only state (icons + labels).

## 7. Testing

| Layer | Tooling | Scope |
|---|---|---|
| Domain | Vitest unit | SRS, mastery, XP/levels, scoring, readiness gates, exam builder, quests, achievements, streak, next steps, cross-site guard |
| Services | Vitest integration on a real PostgreSQL (`jmq_test`, recreated per run, refuses non-test URLs) | answer pipeline, lessons, practice/review, exams (strict concealment, autosave, timeout submit), journal, export/reset, daily bonus |
| Runner | `runner/test.sh` (plain Java) | limits and failure modes |
| Content | `content:validate`, `content:verify-java` | correctness of every question and lesson output on JDK 25 |
| End-to-end | Playwright, `scripts/e2e.sh` | the full journey through the UI, then a restart of app and database, then persistence |

## 8. Extension points

- **Multi-user**: all learner tables already carry `learner_id`; add auth and replace the `LEARNER_ID`
  constant with the session's learner.
- **Spring Boot port**: the JSON API under `/api` is the contract; `services/` maps one-to-one onto
  Spring services and repositories (see D-001).
- **FSRS**: replace `domain/srs.ts` (grade → schedule) behind the same `SrsState` interface.
- **Content growth**: drop files into `content/`, run validate → verify-java → `docker compose run --rm migrate`.
