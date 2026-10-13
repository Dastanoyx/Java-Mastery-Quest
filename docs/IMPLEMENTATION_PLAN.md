# Implementation Plan & Status

Living checklist. ✅ = implemented **and** verified by the checks listed in the verification log.
⚠️ = implemented but not fully verifiable in the build environment. ⬜ = not done.
Last updated: 2026-10-13.

## Phase 0 — Discovery and foundation

- ✅ Exam research and blueprint (`EXAM_BLUEPRINT.md`, `content/blueprint.yaml`). Format confirmed by two
  secondary sources.
- ⚠️ Official objective wording: Oracle's page was in maintenance on 2026-10-12 and 2026-10-13, so objective
  wording is reconstructed and flagged in the UI.
- ✅ Architecture, product, methodology and decision docs.
- ✅ Schema and migrations (3 migrations, checksummed migrator with advisory lock).
- ✅ Design tokens and component primitives (dark, light and system themes; reduced motion).
- ✅ Docker Compose stack (`compose.yaml`, two Dockerfiles, health checks, hardened runner):
  `docker compose up --build` run end to end, on local stand-ins for the three base images because registries
  are blocked here (OPERATIONS.md §11, D-010, D-022).

## Phase 1 — Vertical slice

- ✅ Onboarding → dashboard → lesson (predictions, checks, retrieval, mastery quiz) → feedback → XP →
  review of the same concept → persistence across a restart (E2E, phases 1 and 2).

## Phase 2 — Curriculum and question engine

- ✅ All 10 domains, 24 objectives mapped to lessons and questions (`COVERAGE_REPORT.md`).
- ✅ 32 lessons (~61k words, 178 predict blocks, all outputs verified on JDK 25).
- ✅ 384 original questions (91 multi-select stating "Choose N."; 353 JDK-verified, 31 concept-reviewed,
  0 needs review), 4 difficulty levels, 10 formats.
- ✅ 17 coding exercises with hidden test harnesses (reference solution passes, starter fails).
- ✅ Content validation (schema, references, near-duplicates, answer consistency) and JDK 25 verification
  (548 artefacts).
- ✅ Practice filters (domain, objective, difficulty, format, source) and interleaving.
- ✅ Mistake Journal with classification, personal explanation and history; notes and bookmarks; Knowledge
  Vault with rules, traps, 12 confusable pairs and full-text search.

## Phase 3 — Retention and progression

- ✅ SM-2 variant scheduler, due tolerance, relearning, elapsed-time growth (unit-tested).
- ✅ Review sessions: interleaved by domain, with new variations for open mistakes.
- ✅ Quests (daily and weekly, generated from state), XP ledger (idempotent), levels, titles, 13
  achievements, boss battles, domain milestones, daily review bonus.
- ✅ Daily planner and evidence-based next steps (unit-tested).
- ✅ Confidence calibration (optional), re-entry plan after time away, study reminder banner (in-app only).

## Phase 4 — Exam simulation

- ✅ Blueprint-driven full, short, domain, boss and custom exams; server-side strict mode; autosave;
  server-time deadline with auto-submit; flags; navigation; confirm before submit.
- ✅ Results: domain, objective, difficulty, calibration, remediation, every question explained; history.
- ✅ Readiness engine with gates, index, sample sizes and preliminary labelling (unit-tested).

## Phase 5 — Secure Java execution

- ✅ Runner: in-process javac (no annotation processors), child JVM with heap, time, output and environment
  limits, throwaway directory, token, concurrency slots, subprocess cleanup (41 self-test assertions).
- ✅ Verified through the app: infinite loop stopped at 5 s, OOM contained, environment cleared, output spam
  capped and the process killed, Java 25 compact sources run.
- ✅ Container hardening exercised in the running stack and probed from learner code: uid 10001, no
  capabilities, read-only FS, `noexec` `/tmp`, no internet, no database, pids limit stops thread bombs,
  leftover subprocesses reaped (D-023).

## Phase 6 — Polish and release

- ✅ Responsive layouts (sidebar → drawer, lesson rails → collapsible), keyboard shortcuts, command
  palette, breadcrumbs, empty, loading, error and 404 states, toasts, autosave (notes, reflections, exam
  answers, code drafts).
- ✅ Cross-site request guard (D-013); security headers; no stack traces in responses.
- ✅ README, operations guide, backup and restore scripts (exercised against a scratch database), smoke test,
  E2E script.

## Verification log

All commands were run on 2026-10-13 in the build environment (Ubuntu 24.04, Node 22.22, PostgreSQL 16 native,
Temurin JDK 25.0.4+7) and passed:

| Check | Result |
|---|---|
| `npm run lint` (tsc, strict) | 0 errors |
| `npm test` (Vitest: 6 unit + 2 integration files) | **100 / 100 passed** |
| `runner/test.sh` | **41 / 41 assertions** (also inside the runner image build) |
| `npm run content:validate` | 32 lessons, 384 questions, 17 exercises — 0 errors, 0 warnings |
| `npm run content:verify-java` | **548 / 548 artefacts verified on JDK 25.0.4+7**, 0 failed |
| `npx next build` (production, standalone) | succeeded; standalone server served every route; Shiki and pg traced |
| `scripts/smoke-test.sh` against the standalone server | all checks passed |
| `scripts/e2e.sh` (fresh DB → journey → restart of app **and** PostgreSQL → persistence), incl. answer-leak probes during an open exam | **9 + 1 Playwright tests passed** |
| Runner through the app API: loop, OOM, env, output flood, compact source | all contained / correct |
| Cross-site POST to `/api/run` with a foreign Origin; foreign `Host` (DNS rebinding) on `/api/export`; browser-style requests straight to the runner | 403 · 421 · 403/415 |
| Horizontal overflow, all 16 routes, 390 px and 1440 px (production build, measured in Chromium) | none |
| `docker compose config -q` | valid |
| `backup.sh` / `restore.sh` (via native stand-ins for `docker compose exec`) | round trip OK, refuses without confirmation, rejects junk |
| Visual review (Playwright screenshots, 1440 px and 390 px, dark and light) | every page reviewed; fixes applied (output wrapping, ligatures, hydration-safe dates, breadcrumbs) |

### Docker Compose stack (2026-10-13, Docker 29.8.2, Compose v5.5.1)

Base images were local stand-ins mirroring the official ones (registries blocked; see OPERATIONS.md §11).

| Check | Result |
|---|---|
| `docker compose up --build -d` | 3 images built; db, web, runner healthy; migrate exit 0 |
| `scripts/smoke-test.sh` against the containers | all checks passed |
| E2E journey against the containers → `down` + `up -d` → persistence | **9 + 1 passed**, three times on fresh volumes (the first attempt hit a lost click on a cold server; the test now fails fast if a session doesn't advance, and JS scrolling respects reduced motion) |
| All 17 coding exercises through web → runner | 17/17 solutions pass, 17/17 starters fail |
| Isolation probes from learner code | non-root, no caps, read-only FS, `noexec` `/tmp`, no internet, no db, `web:3000` reachable (documented) |
| Abuse probes | timeout, OOM, output flood, thread bomb (`pids_limit`), 300+ orphaned subprocesses → all contained, runner healthy |
| `backup.sh` → delete data → `restore.sh --yes` | data restored exactly; refusal without `--yes`; junk file rejected |

## Independent review (2026-10-13)

A separate agent that had not seen the work audited claims, security and UX. Its findings and outcomes:

| Severity | Finding | Outcome |
|---|---|---|
| Critical | Native-mode runner accepted `text/plain` POSTs from any web page → arbitrary Java on the machine | **Fixed** (D-020), self-tested |
| High | Strict mode bypassable during an open exam via `/api/answers`, `/api/questions/:id`, practice | **Fixed** (D-017), integration + E2E tested |
| High | Exam payload `format`/`tags` leaked the answer type | **Fixed** (D-018), integration + E2E tested |
| High | 9 of 15 routes overflowed horizontally at 390 px (the earlier "every page reviewed" claim was wrong) | **Fixed**: base grid columns, grid-child `min-width: 0`, scroll containers as containing blocks; re-measured, 0 overflow |
| Medium | XP for empty exams; immediate repeats counted as due reviews; milestones on a few answers | **Fixed** (D-021), unit + integration tested |
| Medium | No `Host` check → DNS rebinding could read `/api/export` | **Fixed** (D-019), unit tested, verified live (421) |
| Low | Unanswered exam questions filed as "knowledge gap" | **Fixed**: `unanswered` category (migration 003), excluded from mastery evidence |
| Low | `1e3`/huge ids, unknown note references (500), orphan bookmarks, `javascript:` images in notes, wrong XP comment | **Fixed**, unit tested |
| Low | A mistake resolves with two correct answers on different calendar days even if minutes apart across midnight | **Open**: documented below |

The review also confirmed: 12+ documented facts match the code and data, no answer data in exam payloads or
HTML, XSS payloads don't execute, all 91 "Choose N." prompts match their answer keys, and 8 randomly sampled
questions were technically correct when re-run on JDK 25.

## Known limitations

1. **Objective wording unverified against Oracle** (site maintenance). Format numbers come from two
   secondary sources. Fix: compare with Oracle's "Review Exam Topics", then update `blueprint.yaml`
   (`verification: official`) and run `docker compose run --rm migrate`.
2. **Official base images not pulled here**: the stack ran on local stand-ins that mirror them (registries
   blocked). The first build on your machine is the first one with the official images.
3. **Backend in TypeScript, not Spring Boot** (D-001): Maven Central was blocked. The `/api` contract and
   `services/` layer are shaped for a later port.
4. **Runner isolation is process-level inside one hardened container**, not one container per run. Learner
   code can reach `web:3000` on the internal network. See OPERATIONS.md §3.
5. **Content is a strong start, not exhaustive**: 384 questions, 17 exercises. Seven objectives still have
   no coding exercise (`COVERAGE_REPORT.md`). Many full mocks will eventually reuse questions; the
   readiness overlap gate detects that.
6. **Single learner, no authentication** (local tool by design, D-006). Don't expose port 3000 beyond
   localhost.
7. **Reminders are in-app only** (no notifications or email).
8. **SM-2, not FSRS**: well-tested and transparent, but not personalised.
9. **Mistake resolution uses calendar days**: two correct answers just before and after midnight resolve a
   mistake. A minimum gap (e.g. 12 h) would be stricter.

## Next (in priority order)

1. Run `docker compose up --build` once with the official base images (registry access) and run
   `scripts/smoke-test.sh`; everything else about the stack is already verified.
2. Verify the 24 objectives against Oracle's official list once the site is back; adjust content mapping.
3. Coding exercises for D1.1, D3.1, D3.3, D3.6, D7.2 (needs a multi-file runner request), D8.3, D9.2.
4. Grow the bank toward ~600 questions, weighted to objectives with the lowest unseen-question supply
   (watch the "questions seen / available" column on the Progress page).
5. Optional: per-run containers for the runner (gVisor or rootless Podman) if stronger isolation is wanted.
6. Optional: FSRS scheduler behind the existing `SrsState` interface, once there is enough review history.
