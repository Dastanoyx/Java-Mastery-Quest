// While a strict exam is open, its questions must not be answerable or explainable anywhere else in the app
// (practice, review, follow-ups, lesson quizzes, search, the public question endpoint). Otherwise a second
// tab would reveal the answers mid-exam.
import { query, LEARNER_ID } from "../db.ts";
import { Conflict } from "../errors.ts";

const GRACE = "interval '5 seconds'";

/** SQL condition that is true when `col` (a question id expression) is NOT part of an open strict attempt. */
export function notInOpenExam(col: string): string {
  // LEARNER_ID is a numeric constant, never user input.
  return `NOT EXISTS (SELECT 1 FROM exam_attempt_answer xa JOIN exam_attempt ea ON ea.id = xa.attempt_id
    WHERE xa.question_id = ${col} AND ea.learner_id = ${Number(LEARNER_ID)} AND ea.strict AND ea.submitted_at IS NULL
      AND (ea.deadline_at IS NULL OR ea.deadline_at > now() - ${GRACE}))`;
}

export async function lockedQuestionIds(ids: string[]): Promise<Set<string>> {
  if (!ids.length) return new Set();
  const rows = await query<{ question_id: string }>(
    `SELECT DISTINCT xa.question_id FROM exam_attempt_answer xa JOIN exam_attempt ea ON ea.id = xa.attempt_id
     WHERE ea.learner_id = $1 AND ea.strict AND ea.submitted_at IS NULL AND (ea.deadline_at IS NULL OR ea.deadline_at > now() - ${GRACE})
       AND xa.question_id = ANY($2)`, [LEARNER_ID, ids]);
  return new Set(rows.map((r) => r.question_id));
}

export async function assertNotInOpenExam(ids: string[]): Promise<void> {
  if ((await lockedQuestionIds(ids)).size) {
    throw new Conflict("This question is part of an exam in progress. Finish or submit the exam first — answers stay hidden until then.");
  }
}
