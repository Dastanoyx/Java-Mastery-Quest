# Learning Methodology

How Java Mastery Quest turns study time into durable, exam-ready knowledge, and how it measures that
honestly. Every rule below is implemented in `web/src/server/domain/` (pure, unit-tested functions) and
configured in `content/`. Section numbers are referenced from code comments.

## 1. Principles and where they live

| Principle (learning science) | What it means here | Where |
|---|---|---|
| **Retrieval practice** | You answer before you see; lessons end with recall prompts answered from memory | predict blocks, knowledge checks, retrieval box, every question |
| **Spacing** | Items return at growing intervals, just before they would be forgotten | §2 scheduler, Review page |
| **Interleaving** | Sessions mix objectives and domains so you learn to *discriminate* similar rules | practice round-robin, interleaved review queue, confusable pairs |
| **Elaborative feedback** | Every option explains its own misconception, plus the exact rule | question format (CONTENT_GUIDE §2) |
| **Desirable difficulty** | Advanced/expert questions weigh more; hints halve XP and evidence | §3, §7 |
| **Metacognition / calibration** | Optional "how sure?" rating; confident errors get priority | §2 grading, §4, results calibration table |
| **Error-focused learning** | Mistakes are kept, classified, explained in your words and must be re-earned | §4, Mistake Journal |
| **Generation** | Write code, predict output, write rules in your own words | Coding Lab, predict blocks, notes |

What the app deliberately does **not** do: count page views as learning, pay for time spent, treat a
correct immediate repeat as evidence, or call you ready on the strength of one good score.

## 2. Spaced repetition (SM-2 variant)

`domain/srs.ts`. Every question you answer in any mode gets a review item.

**Grade (0–5) from one answer**

| Answer | Grade |
|---|---|
| Wrong, marked "Sure" | 0 (strongest misconception signal) |
| Wrong | 1 |
| Correct with a hint, or marked "Guessing" | 3 |
| Correct, marked "Sure", within 1.5× the estimated time | 5 |
| Any other correct answer | 4 |

**Scheduling rules**

- **Wrong (grade < 3):** relearning step of **10 minutes**, ease lowered, repetitions reset, lapse counted.
- **First correct answer ever:** first spaced check after **1 day** (grade 5: 2 days).
- **Correct but not yet due:** recorded, but the schedule does **not** move. An immediate repeat is not
  evidence of retention.
- **Correct and due:** graduating from relearning → 1 day; second success → 3 days (grade 5: 4);
  afterwards `interval = max(previous interval, actual elapsed days) × ease`. Using the *elapsed* time means
  a correct answer after a long, even overdue, gap pushes the item further out than an on-time one.
  Grade 3 ("shaky") shortens the result to 60 %.
- Ease is SM-2's update clamped to **[1.3, 3.0]**; intervals cap at **180 days**.
- "Due" includes items due within the next **6 hours**, so a morning session can catch the afternoon's items.
  This tolerance applies only to graduated items (interval ≥ 1 day). An item in its 10-minute relearning step
  is due only when the step has actually passed: answering it again seconds after a miss is an immediate
  repeat and changes nothing.

**Review sessions** (`services/practice.ts → reviewQueue`): due items ordered by recent failure first, then
oldest due date, then **interleaved by domain**. When there is room, up to three **unseen variations** are
added: new questions on objectives where you have open mistakes, so you prove the concept rather than
the memorised answer.

**Forgetting prevention.** After 3+ days away, the daily plan switches to re-entry mode: overdue reviews
first, with a no-blame message. Overdue items are not punished; their interval simply grows from the real
elapsed time.

## 3. Mastery estimation

`domain/mastery.ts`. Mastery is per **objective**, and it is *not* accuracy over everything ever answered.

Each attempt is weighted by how much it says about durable, transferable knowledge:

| Factor | Weight |
|---|---|
| First attempt on a never-seen question | 1.0 |
| Repeat after ≥ 1 day (spaced retrieval) | 1.0 |
| Repeat within a day (immediate repeat) | 0.25 |
| Answered as a lesson knowledge check (right after reading) | × 0.5 |
| Hint used | × 0.5 |
| Difficulty: foundation / intermediate / advanced / expert | × 0.8 / 1.0 / 1.2 / 1.4 |
| Age (recency half-life 45 days) | × 0.5^(age / 45 d) |

**Score** = posterior mean of a Beta(1, 1) prior updated with weighted successes and failures:
`(Σw·correct + 1) / (Σw + 2)`. With little evidence, the score stays close to 50 % and moves slowly.

**Status**

- *Mastered*: score ≥ the objective's threshold (default 85 %), **and** evidence weight ≥ 5, **and** ≥ 4
  distinct questions, **and** at least one correct spaced recall. A single lucky streak cannot master an
  objective.
- *Developing*: score ≥ 65 % with evidence weight ≥ 2. *Learning*: anything with evidence below that.
  *None*: no evidence.

**Domain mastery** = mean of its objectives' scores, where objectives without evidence count as 0.
Untouched material is never assumed known.

**Three different things, kept apart in the UI:** *lesson completion* (you studied it and passed its quiz),
*accuracy* (how answers went, first vs repeat shown separately), *mastery* (the weighted estimate above).
Only mastery and unseen-question accuracy feed readiness.

**Lesson states** (`services/lessons.ts`): locked (prerequisites not completed; you can still open it with
"Open it anyway"), available, in progress, completed (mastery quiz ≥ 70 %), needs review (completed but
with due reviews or open mistakes), mastered (completed, objective evidence says mastered, nothing due).

## 4. Mistakes

`domain/mistakes.ts`, `services/answers.ts`.

- Blank exam answers are recorded as `unanswered`: they count as wrong in the exam score, as on the real
  exam, but are not used as evidence about knowledge (excluded from mastery and unseen accuracy).
- Every wrong answer creates or updates a **mistake record**: question, your response, first and last
  occurrence, repeat count, whether you were sure.
- **Automatic classification** (you can override it): repeated → *repeated misconception*; timed and slow →
  *time pressure*; picked "compiles/throws" when the truth was the other → *compile-vs-runtime
  confusion*; very fast → *careless*; output/trace questions → *incorrect output prediction*; sure and
  wrong → *language-rule confusion*; otherwise *knowledge gap*.
- **Resolution** requires **two correct answers on different days** after the last wrong one. Seeing the
  explanation, or answering right once a minute later, does not resolve anything. A resolved mistake stays
  in spaced review.
- Confident errors appear first in the journal and on the dashboard, and count against readiness until
  resolved.

## 5. Exam readiness

`domain/readiness.ts`, thresholds in `content/readiness.yaml` (editable; restart the app to apply).

Readiness is a **level**, and a level is reached only when **every gate** of that level, and of all lower
levels, passes:

| Level | Gates (all must pass) |
|---|---|
| Exploring | — |
| Building Foundations | objectives covered ≥ 25 % · ≥ 40 answers |
| Developing Competence | coverage ≥ 60 % · unseen accuracy ≥ 55 % · ≥ 60 unseen questions |
| Advanced Practice | coverage ≥ 90 % · unseen accuracy ≥ 65 % · weakest domain ≥ 50 % · retention ≥ 70 % · ≥ 20 due reviews |
| Near Exam Ready | coverage 100 % · unseen ≥ 72 % · weakest domain ≥ 60 % · retention ≥ 80 % · advanced/expert ≥ 60 % · ≥ 1 recent full mock at/above the pass mark |
| **Consistently Exam Ready** | coverage 100 % · unseen ≥ 78 % · weakest domain ≥ 70 % · retention ≥ 85 % · advanced/expert ≥ 65 % · **last 3 full mocks all ≥ the personal target (80 %)** · ≤ 40 % question overlap between them · ≤ 85 % of the time used · ≤ 5 unresolved confident mistakes |

- *Covered* objective = at least 3 distinct questions attempted. *Unseen accuracy* = first attempts, outside
  lesson checks, last 200. *Retention* = due reviews recalled in the last 60 days. Full mocks count if taken
  in the last 45 days.
- The personal target (80 %) is deliberately above the pass mark (68 %). Community advice for this exam
  series is to score ~10 points above your goal on mocks.
- The app recommends booking the exam **only** at the top level.
- A 0–100 **index** (coverage 15 %, unseen accuracy 25 %, weakest domain 15 %, retention 15 %, recent mocks
  20 %, hard accuracy 10 %) is shown as a trend, but it never decides the level.
- **Preliminary** label until the minimum evidence exists (150 answers, 80 unseen first attempts, 30 due
  reviews, 1 full mock). The reasons and every sample size are on the Progress page.

## 6. Question and content verification

- Every question with Java code declares a `java` check: the source (plus imports and file layout), and
  the expected outcome: *compiles and prints exactly X*, *fails to compile (with a matching message)*, or
  *throws exception T*. Options can carry their own checks (e.g. "which lines compile?").
- `npm run content:verify-java` compiles and runs every check **on JDK 25** (the runner refuses any other
  version) and records the result with a content hash in `content/.verification/java-results.json`. The
  seed marks a question `jdk-verified` only when its current hash verified OK; an edited question loses its
  badge until re-verified.
- Lesson *predict* blocks are verified the same way: the shown output is the real JDK 25 output.
- Concept questions without code are `reviewed` (explained against the JLS/API docs, not machine-checkable).
  Anything uncertain is `needs-review` and shown with that label. As of this build: 353 JDK-verified,
  31 concept-reviewed, 0 needs-review (548 Java artefacts in total, including lesson outputs and exercises).
- `npm run content:validate` rejects missing explanations, duplicate IDs, near-duplicates (same code
  modulo identifiers), broken references, and choice questions with inconsistent answer keys.
- All questions are original. No exam dumps or commercial banks were used. References are to the JLS,
  the Java SE 25 API docs and JEPs only.

## 7. Progression: XP, levels, titles, quests, achievements

`domain/xp.ts`, `domain/titles.ts`, `domain/quests.ts`, `domain/achievements.ts`. All rewards go through an
**idempotent ledger** (`xp_transaction`, unique source key), so the same event can never pay twice.

| Event | XP |
|---|---|
| New question correct (foundation / intermediate / advanced / expert) | 10 / 15 / 20 / 30 (half with a hint) |
| Due review recalled | 6 + 0–4 by difficulty |
| 10+ due reviews in one day | 25, once per day |
| Immediate repeat, wrong answer, exam answer | 0 |
| Prediction written before the reveal | 2 (once per block) |
| Lesson completed (+ perfect quiz) | 100 (+25), once |
| Coding exercise passed | 50–150 by difficulty, once |
| Full mock (≥ 80 % of questions answered) | 100 + 2 per point above the pass mark; other timed exams 20–30. Blank or near-blank attempts pay nothing and don't count for quests or mock achievements. |
| Boss defeated | 200, once per region |
| Mistake resolved | 15 |
| Domain mastery milestones 50 / 70 / 85 % | 50 / 100 / 150, once, and only when every objective of the domain has weighted evidence ≥ 3 |

Levels grow gently (`150 × (level − 1)^1.45` total XP). **Titles** need demonstrated learning, not XP alone:
e.g. *Object-Oriented Craftsman* needs 70 % D3 mastery, *OCP Exam Challenger* a full mock at the personal
target, *Java Master* the top readiness level. **Quests** are generated daily and weekly from your state
(due reviews, next lesson, weakest domain, open mistakes) and completed only from recorded events.
**Boss battles**: 12 questions from one region, ≥ half advanced/expert, no hints, 90 % of exam pace, pass at
75 %. **Achievements** (13) are evaluated from the history tables after each learning event. Nothing
unlocks because a page was opened, and no content is locked behind grinding.

## 8. The daily plan and recommendations

`domain/planner.ts`. The plan scales the session shape *retrieval 5′ → learning 20′ → practice 15′ →
exam-style 15′ → reflection 5′ per hour* to your daily minutes, then re-prioritises from evidence:
due/overdue reviews first, the lesson in progress or next available (weak domains first), objectives with
repeated mistakes, the weakest objectives with evidence, an unpassed exercise, and a timed set when your
style is exam-focused. After practice sessions and exams, `nextSteps` produces concrete advice from what
the session showed. Single misses are grouped and labelled as weak evidence, never as a diagnosis.

## 9. Exam simulation

- Format from `content/blueprint.yaml`: 50 questions, 120 minutes, 68 % pass. Nothing is hard-coded in
  the UI.
- Full mocks distribute questions across domains in proportion to their objective count, with a minimum
  of 3 per domain (Oracle publishes no weights), and prefer questions you've seen least.
- **Strict mode is enforced server-side**: an open attempt's payload contains only prompt, code, options
  and the number to choose (no correctness, explanations, hints, format, tags, objective or real question
  id), and its questions are locked everywhere else in the app until submission. Answers, flags, confidence and time autosave per question; the deadline is
  server time; an expired attempt is submitted automatically.
- Multi-select questions say how many to choose ("Choose two."), as the real exam does, and are scored
  all-or-nothing, as the real exam is.
- Results: score vs pass mark and personal target, time used, per-domain/objective/difficulty breakdown,
  confidence calibration, every question explained, and a remediation plan. Every attempt is kept.

## 10. Known limitations of the model

- SM-2 is a sound, well-understood baseline but not personalised like FSRS. The grading and scheduler are
  isolated in `domain/srs.ts` so FSRS can replace them later.
- Readiness thresholds are informed judgement, not a validated psychometric model. They are conservative
  on purpose and fully configurable.
- With 384 questions, a learner who does many full mocks will eventually see repeats. The overlap gate
  catches this, and the bank needs to keep growing (see COVERAGE_REPORT.md).
- Confidence ratings are self-reported and optional; calibration is only as good as their use.
