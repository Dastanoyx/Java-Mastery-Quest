# Product Specification — Java Mastery Quest

**Owner and first user:** Yassin Ghariani, an experienced Java/Spring engineer.
**Goal:** demonstrable mastery of every OCP Java SE 25 (1Z0-831) objective, retained long-term, and a
well-founded decision about when to sit the exam.
**Philosophy:** Learn deeply. Write real code. Challenge assumptions. Remember what matters. Prove mastery.

## 1. Users and context

- One learner, on their own machine, studying around a full-time job: often 30–60 minutes a day, sometimes
  with gaps of several days.
- An expert in parts of Java, with blind spots on exact language rules (overload resolution,
  initialisation order, module semantics, stream laziness, concurrency guarantees). The product must find
  and fix those blind spots, not re-teach what is already known.
- Needs to trust the numbers. A dashboard that flatters is worse than none.

## 2. Jobs to be done

1. *Tell me what to do today.* An evidence-based daily plan that fits the time available.
2. *Teach me the exact rule.* Deep lessons that explain why code compiles, fails or behaves as it does.
3. *Make me retrieve, not re-read.* Predictions, checks, spaced reviews, recall prompts.
4. *Show me my mistakes until they're gone.* A journal that doesn't let one lucky answer close a gap.
5. *Let me rehearse the real thing.* Strict, timed, full-length mocks in the real format.
6. *Tell me honestly whether I'm ready.* Gates, sample sizes and a conservative recommendation.
7. *Keep it enjoyable.* A progression layer that rewards real learning and never feels childish.

## 3. Functional scope (all implemented)

| Area | Must do | Acceptance |
|---|---|---|
| Command Center | plan, level/XP, streak, quests, due reviews, coverage, domain mastery, recent mistakes and activity, readiness trend, resume/practice/exam shortcuts, onboarding state, reminder banner | every metric computed from persisted data; fresh install shows a useful first-run state |
| Onboarding | experience, prior certification, minutes/day, study days, exam date, strong/weak domains, style; all skippable | never blocks the app |
| Learning World | 10 regions, missions with states (locked, available, in progress, completed, needs review, mastered), objectives with mastery and verification status, boss battles | accessible grid alternative to the map; locked content can still be opened |
| Lesson player | contract, mental model, rules, walkthroughs, predict blocks, variations, traps, knowledge checks, retrieval and reflection, mastery quiz, notes, bookmarks, prev/next, resume position | tracks predictions, checks, reflection and quiz results, not page views |
| Practice Arena | filters (domain, objective, difficulty, format, source), learning mode with full feedback and a follow-up question, timed challenge | interleaved sessions; session summary with next steps |
| Coding Lab | editor, hidden tests on JDK 25, diagnostics, hints, solution after the first submission | code runs only in the isolated runner |
| Review | due items interleaved, plus new variations; upcoming load; retention stats | schedule changes only on real, due recall |
| Mock exams | full, short, domain, boss, custom; timer; navigation; flags; autosave; confirm before submit; history | no correctness before submission (server-enforced); survives refresh; detailed results and remediation |
| Mistake Journal | question, your answer, correct answer, explanations, category, count, history, personal explanation, next action | resolves only after two correct answers on different days |
| Knowledge Vault | rules and traps from all lessons, confusable pairs, notes CRUD, bookmarks, full-text search | search never reveals unseen questions |
| Progress & Readiness | mastery per objective, accuracy over time (first vs repeat), retention, difficulty, time per question, mocks, consistency, readiness gates, XP ledger, titles, achievements | lesson completion, accuracy and mastery shown as separate things; sample sizes visible |
| Settings | preferences, theme, reduced motion, reminders, export, backup instructions, guarded reset, blueprint status, system health | reset requires a typed phrase |

## 4. Non-functional requirements

- **Local and private:** Docker Compose, no account, no analytics, no external runtime calls, localhost binding.
- **Correctness:** every code question compiled and run on JDK 25; uncertain items are labelled.
- **Durability:** PostgreSQL in a named volume; migrations; idempotent seed; backup and restore scripts.
- **Security:** untrusted code isolated; cross-site requests rejected; validated inputs; no stack traces in the UI.
- **Accessibility:** keyboard-first, visible focus, reduced motion, no colour-only meaning, responsive down to phones.
- **Performance:** pages render on the server; the editor loads on demand; no CDN dependencies.

## 5. Out of scope (for now)

Multiple users and authentication; AI tutoring (if added later it must stay optional and separate); mobile
apps; push or email reminders; cloud sync. See IMPLEMENTATION_PLAN.md "Next".
