# Brief for content authors (human or agent)

You are writing curriculum content for **Java Mastery Quest**, a personal OCP Java SE 25 (exam 1Z0-831)
training platform. The learner is an experienced Java/Spring engineer preparing for the exam; content must be
**technically exact for Java 25**, original (never copied from books, commercial banks or exam dumps), and
deep enough to teach — not just to test.

## Read first
1. `docs/CONTENT_GUIDE.md` — the full content format (lessons, questions, exercises, verification modes).
2. `docs/EXAM_BLUEPRINT.md` and `content/blueprint.yaml` — objective IDs.
3. One existing lesson and question file as quality reference, e.g. `content/lessons/D3/02-constructors.md`
   and `content/questions/D6-streams.yaml`.

## Tooling (run from `web/`)
- Runner (JDK 25 sandbox) is already running at `http://127.0.0.1:8090`. Do **not** start, stop or rebuild it.
- `npm run content:validate` — schema + reference checks for ALL content. Other authors work in parallel, so
  you will see errors that are not yours; only your own IDs/files must be clean.
- `VERIFY_PARALLEL=2 npm run content:verify-java -- --only D<n> --allow-errors` — compiles & runs every Java
  artefact of domain D<n> on JDK 25 and checks the declared expectations. Your domain must end at
  **0 failed**. Use `--id <ID>` to re-check one item.
- Quick experiments: `env -u JAVA_TOOL_OPTIONS /opt/jdk25/bin/java Main.java` (single-file source launch) in a
  scratch directory under `/tmp`, never inside the repo.

## Hard rules
- Only create/edit the files you were assigned. Never edit `web/src`, `web/scripts`, `runner/`, `db/`, other
  domains' files, or `content/.verification/` by hand.
- Every question with code has a `java` block whose expectation is verified on JDK 25. A predict-output
  question's correct option must equal the real output exactly; no wrong option may equal it.
- Every option has a `why` that explains the specific misconception it models (≥ 1 full sentence).
- `explanation` teaches the rule (2–6 sentences); `rule` states the exact language/API rule, citing a JLS
  section or API class only if you are sure of it — never invent a citation.
- Difficulty = reasoning depth: foundation (one rule), intermediate (two interacting rules), advanced (three+
  or subtle edge), expert (the classic trap most experienced developers miss). Aim for a realistic mix:
  ~20 % foundation, ~35 % intermediate, ~30 % advanced, ~15 % expert.
- Use `type: multi` for ~20–25 % of questions — the real exam uses many. Phrase the prompt as the exam does:
  "Choose two." / "Choose three." (the number of correct options) — never "Choose all that apply" (D-011).
- Format variety: predict-output, does-it-compile, compile-error (which line), runtime-exception,
  select-valid, concept, trace, polymorphism/overload-resolution where relevant.
- No near-duplicates (changing only names/numbers). No nondeterministic programs presented as deterministic
  (thread interleavings, HashMap/HashSet order of non-trivial keys, parallel forEach).
- Mark Java 22–25 features in explanations (e.g. "since Java 25, JEP 513"). Don't test preview features.
- `examEligible: true` for single/multi questions in the exam's style; `false` for `text` questions.
- Lessons: follow the teaching standard (Parts A–J), ≥ 3 `##` sections, real `java predict` blocks with
  verified `output` blocks, `[!TRAP]`, `[!RULE]`, `[!J25]` callouts, `::check` references, `mastery` list of
  ≥ 3 questions not used as checks, and `lesson:` on each question pointing at its remediation lesson.
- If a lesson references a question ID (`::check X` or in `checks`/`mastery`), you must create it with that
  exact ID and make it test what the lesson teaches at that point.

## Finish with a short report
List the files you created, counts (questions by difficulty/type, lessons, exercises), the final
`verify-java --only` summary line, and anything you could not verify (and why).
