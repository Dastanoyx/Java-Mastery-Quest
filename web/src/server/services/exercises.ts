import { query, one, tx, LEARNER_ID } from "../db.ts";
import { XP_RULES } from "../domain/xp.ts";
import type { Difficulty } from "../domain/types.ts";
import { awardXp, bumpActivity } from "./learner.ts";
import { runJava, type RunnerResult } from "./runner.ts";
import { NotFound, BadRequest } from "../errors.ts";

export interface ExerciseView {
  id: string; objectiveId: string; objectiveTitle: string; domainId: string; lessonId: string | null; lessonTitle: string | null; title: string;
  difficulty: Difficulty; kind: string; promptMd: string; starterCode: string; fileName: string; hints: string[]; timeLimitMs: number;
  verification: string; lastCode: string | null; passedEver: boolean; submissions: number; bestTests: { passed: number; total: number } | null;
}

export async function getExercise(id: string): Promise<ExerciseView | null> {
  return one<ExerciseView>(
    `SELECT e.id, e.objective_id AS "objectiveId", o.title AS "objectiveTitle", o.domain_id AS "domainId", e.lesson_id AS "lessonId", l.title AS "lessonTitle",
       e.title, e.difficulty, e.kind, e.prompt_md AS "promptMd", e.starter_code AS "starterCode", e.file_name AS "fileName", e.hints,
       e.time_limit_ms AS "timeLimitMs", e.verification,
       (SELECT code FROM coding_submission s WHERE s.learner_id = $2 AND s.exercise_id = e.id ORDER BY submitted_at DESC LIMIT 1) AS "lastCode",
       EXISTS (SELECT 1 FROM coding_submission s WHERE s.learner_id = $2 AND s.exercise_id = e.id AND s.passed) AS "passedEver",
       (SELECT count(*)::int FROM coding_submission s WHERE s.learner_id = $2 AND s.exercise_id = e.id) AS submissions,
       (SELECT json_build_object('passed', tests_passed, 'total', tests_total) FROM coding_submission s WHERE s.learner_id = $2 AND s.exercise_id = e.id
          ORDER BY tests_passed DESC, submitted_at DESC LIMIT 1) AS "bestTests"
     FROM coding_exercise e JOIN exam_objective o ON o.id = e.objective_id LEFT JOIN lesson l ON l.id = e.lesson_id
     WHERE e.id = $1 AND NOT e.retired`, [id, LEARNER_ID]);
}

export async function listExercises() {
  return query<{ id: string; title: string; difficulty: Difficulty; kind: string; objectiveId: string; domainId: string; lessonId: string | null; passed: boolean; submissions: number }>(
    `SELECT e.id, e.title, e.difficulty, e.kind, e.objective_id AS "objectiveId", o.domain_id AS "domainId", e.lesson_id AS "lessonId",
       EXISTS (SELECT 1 FROM coding_submission s WHERE s.learner_id = $1 AND s.exercise_id = e.id AND s.passed) AS passed,
       (SELECT count(*)::int FROM coding_submission s WHERE s.learner_id = $1 AND s.exercise_id = e.id) AS submissions
     FROM coding_exercise e JOIN exam_objective o ON o.id = e.objective_id JOIN exam_domain d ON d.id = o.domain_id
     WHERE NOT e.retired ORDER BY d.ordinal, e.id`, [LEARNER_ID]);
}

export interface TestLine { name: string; passed: boolean; detail: string | null }
export interface ExerciseRunResult { result: RunnerResult; tests: TestLine[]; passed: boolean; xp: number; submissionId: number | null; harnessOutput: string }

export function parseTests(stdout: string): TestLine[] {
  const out: TestLine[] = [];
  for (const line of stdout.split("\n")) {
    const m = /^(PASS|FAIL) ([^:]+?)(?::\s*(.*))?$/.exec(line.trim());
    if (m) out.push({ name: m[2].trim(), passed: m[1] === "PASS", detail: m[3] ?? null });
  }
  return out;
}

/** Runs the hidden test harness against the learner's code. `submit` records a submission (and XP on first pass). */
export async function runExercise(id: string, code: string, submit: boolean): Promise<ExerciseRunResult> {
  if (code.length > 60_000) throw new BadRequest("code is too long");
  const e = await one<{ harness_code: string; file_name: string; time_limit_ms: number; difficulty: Difficulty }>(
    "SELECT harness_code, file_name, time_limit_ms, difficulty FROM coding_exercise WHERE id = $1 AND NOT retired", [id]);
  if (!e) throw new NotFound("exercise not found");
  const result = await runJava([{ name: "Main.java", content: e.harness_code }, { name: e.file_name, content: code }], { mainClass: "Main", timeoutMs: e.time_limit_ms });
  const tests = result.run ? parseTests(result.run.stdout) : [];
  const passed = result.compile.ok && !!result.run && !result.run.timedOut && tests.length > 0 && tests.every((t) => t.passed);
  // Harness output lines that are not test lines (e.g. learner System.out calls) are shown separately.
  const harnessOutput = result.run ? result.run.stdout.split("\n").filter((l) => !/^(PASS|FAIL) /.test(l.trim())).join("\n").trim() : "";
  if (!submit) return { result, tests, passed, xp: 0, submissionId: null, harnessOutput };
  return tx(async (c) => {
    const s = await one<{ id: number }>(
      `INSERT INTO coding_submission(learner_id, exercise_id, code, passed, tests_passed, tests_total, result) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [LEARNER_ID, id, code, passed, tests.filter((t) => t.passed).length, tests.length, JSON.stringify({ compile: result.compile, run: result.run ? { ...result.run, stdout: result.run.stdout.slice(0, 8000), stderr: result.run.stderr.slice(0, 4000) } : null })], c);
    let xp = 0;
    if (passed) {
      xp = await awardXp(c, `exercise:${id}`, XP_RULES.exercisePassed[e.difficulty], "Coding exercise passed", { exerciseId: id });
      await bumpActivity(c, { questions: 0 });
    }
    return { result, tests, passed, xp, submissionId: s!.id, harnessOutput };
  });
}

/** The reference solution is only revealed after the learner has submitted at least once. */
export async function revealSolution(id: string): Promise<{ solution: string; explanationMd: string } | null> {
  const n = await one<{ n: number }>("SELECT count(*)::int AS n FROM coding_submission WHERE learner_id = $1 AND exercise_id = $2", [LEARNER_ID, id]);
  if (!n?.n) throw new BadRequest("submit at least one attempt before revealing the reference solution");
  return one<{ solution: string; explanationMd: string }>(`SELECT solution_code AS solution, explanation_md AS "explanationMd" FROM coding_exercise WHERE id = $1`, [id]);
}
