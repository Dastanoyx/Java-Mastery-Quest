# Curriculum & Question-Bank Coverage Report

Generated 2026-10-13 by `npm run content:report` from `content/`. Do not edit by hand.

## Totals

| Item | Count |
|---|---|
| Domains / objectives | 10 / 24 |
| Lessons (core + supplementary) | 32 (32 + 0) |
| Lesson words | 61,063 |
| Predict-the-output blocks in lessons | 178 |
| Questions | 384 (383 exam-eligible) |
| Questions compiled & run on JDK 25.0.4+7-LTS | 353 |
| Concept questions without code (reviewed, not machine-checkable) | 31 |
| Questions flagged for manual review | 0 |
| Coding exercises | 17 |
| Confusable-concept pairs | 12 |

## By difficulty

| Difficulty | Questions | Exam-eligible |
|---|---|---|
| foundation | 66 | 66 |
| intermediate | 138 | 137 |
| advanced | 119 | 119 |
| expert | 61 | 61 |

## By format

| Format | Questions |
|---|---|
| compile-error | 43 |
| concept | 36 |
| does-it-compile | 7 |
| overload-resolution | 6 |
| polymorphism | 2 |
| predict-output | 164 |
| repair | 1 |
| runtime-exception | 47 |
| select-valid | 61 |
| trace | 17 |

## Objective map

Wording status: **reconstructed** = derived from the official 1Z0-830 objectives plus Java 22–25 final features, pending comparison with Oracle's 1Z0-831 topic list (see EXAM_BLUEPRINT.md).

| Objective | Status | Lessons | Questions (F/I/A/E) | JDK-verified | Exercises | Gaps |
|---|---|---|---|---|---|---|
| **D1.1** Use primitives and wrapper classes; evaluate arithmetic and boolean expressions using th… | reconstructed | values-primitives-operators | 16 (2/6/5/3) | 16 | 0 | no exercise |
| **D1.2** Manipulate text, including text blocks, using String and StringBuilder | reconstructed | values-strings-text | 14 (2/6/5/1) | 14 | 1 | — |
| **D1.3** Work with date, time, duration, period, instant and time-zone objects, including dayligh… | reconstructed | values-date-time | 15 (2/5/5/3) | 14 | 1 | — |
| **D2.1** Create program flow control constructs including if/else, switch statements and expressi… | reconstructed | flow-decisions-switch<br>flow-loops-branching | 30 (6/9/10/5) | 30 | 1 | — |
| **D3.1** Declare and instantiate Java objects including nested class objects, and explain the obj… | reconstructed | oop-objects-lifecycle | 11 (2/5/3/1) | 10 | 0 | no exercise |
| **D3.2** Create classes and records, and define and use instance and static fields and methods, c… | reconstructed | oop-constructors | 10 (1/5/4/0) | 9 | 1 | — |
| **D3.3** Implement overloaded methods, including var-arg methods | reconstructed | oop-overloading | 13 (2/4/4/3) | 13 | 0 | no exercise |
| **D3.4** Understand variable scopes, apply encapsulation, create immutable objects, and use local… | reconstructed | oop-encapsulation-scope | 11 (2/4/4/1) | 10 | 1 | — |
| **D3.5** Implement inheritance including abstract, sealed and record types; override methods incl… | reconstructed | oop-inheritance-polymorphism<br>oop-sealed-patterns | 16 (3/5/6/2) | 15 | 1 | — |
| **D3.6** Create and use interfaces, identify functional interfaces, and use private, static and d… | reconstructed | oop-interfaces | 15 (3/5/3/4) | 14 | 0 | no exercise |
| **D3.7** Create and use enum types with fields, methods and constructors | reconstructed | oop-enums | 13 (1/6/4/2) | 13 | 1 | — |
| **D4.1** Handle exceptions using try/catch/finally, try-with-resources and multi-catch blocks, in… | reconstructed | exc-fundamentals<br>exc-try-with-resources | 24 (5/8/7/4) | 22 | 1 | — |
| **D5.1** Create arrays and List, Set, Map and Deque collections, and add, remove, update, retriev… | reconstructed | coll-arrays<br>coll-lists-sets-deques<br>coll-maps-sorting-generics | 30 (6/10/8/6) | 29 | 1 | — |
| **D6.1** Use Java object and primitive streams, including lambda expressions implementing functio… | reconstructed | streams-lambdas<br>streams-pipelines | 19 (4/8/4/3) | 18 | 1 | — |
| **D6.2** Perform decomposition, concatenation, reduction, grouping and partitioning on sequential… | reconstructed | streams-collectors<br>streams-gatherers | 17 (4/5/6/2) | 15 | 1 | — |
| **D7.1** Define modules and expose module content including by reflection, declare module depende… | reconstructed | pkg-modules-services | 17 (2/6/6/3) | 16 | 1 | — |
| **D7.2** Compile Java code, create modular and non-modular JARs and runtime images, migrate to mo… | reconstructed | pkg-compile-package-run | 13 (3/5/4/1) | 6 | 0 | no exercise |
| **D8.1** Create both platform and virtual threads, use Runnable and Callable objects, manage the … | reconstructed | conc-threads-executors<br>conc-virtual-scoped | 22 (4/8/7/3) | 17 | 1 | — |
| **D8.2** Develop thread-safe code using different locking mechanisms and the concurrency API | reconstructed | conc-thread-safety | 10 (2/4/2/2) | 9 | 1 | — |
| **D8.3** Process Java collections concurrently and use parallel streams | reconstructed | conc-collections-parallel | 14 (1/6/4/3) | 13 | 0 | no exercise |
| **D9.1** Read and write console and file data using I/O streams | reconstructed | io-streams | 10 (3/3/3/1) | 9 | 1 | — |
| **D9.2** Serialize and de-serialize Java objects | reconstructed | io-serialization | 14 (2/3/5/4) | 13 | 0 | no exercise |
| **D9.3** Construct, traverse, create, read and write Path objects and their properties using the … | reconstructed | io-nio2 | 11 (1/5/4/1) | 10 | 1 | — |
| **D10.1** Implement localization using locales and resource bundles, and parse and format messages… | reconstructed | l10n-locales-bundles | 19 (3/7/6/3) | 18 | 1 | — |

## Known gaps (prioritised for the next content pass)

- **D1.1** — no exercise
- **D3.1** — no exercise
- **D3.3** — no exercise
- **D3.6** — no exercise
- **D7.2** — no exercise
- **D8.3** — no exercise
- **D9.2** — no exercise

Thresholds are deliberately modest; a bank this size is a solid start, not an exhaustive one. Question count alone is never the goal — every new question must test a distinct rule or combination.
