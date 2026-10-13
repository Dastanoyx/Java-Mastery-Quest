// The single write path for every answer in every mode. One transaction records:
//   question_attempt (append-only) → review_item/review_log (SRS) → mistake_record → xp_transaction → activity_day
import type pg from "pg";
import { query, one, LEARNER_ID } from "../db.ts";
import { isCorrect, type Response } from "../domain/scoring.ts";
import { gradeAnswer, schedule, type SrsState } from "../domain/srs.ts";
import { classifyMistake } from "../domain/mistakes.ts";
import { xpForAnswer, XP_RULES } from "../domain/xp.ts";
import { dayKey } from "../domain/time.ts";
import { DAY_MS, type AttemptMode, type Confidence } from "../domain/types.ts";
import { toFeedback, type FullQuestion, type Feedback } from "./questions.ts";
import { awardXp, bumpActivity } from "./learner.ts";
import { notInOpenExam } from "./examLock.ts";

export interface RecordAnswerInput {
  question: FullQuestion;
  response: Response | null; // null = left unanswered (exam)
  mode: AttemptMode;
  confidence: Confidence;
  timeMs: number | null;
  hintUsed: boolean;
  sessionId?: number | null;
  timedOut?: boolean;
}

export interface AnswerOutcome {
  attemptId: number;
  correct: boolean;
  seenBefore: boolean;
  spacedSuccess: boolean;
  wasDue: boolean;
  xpAwarded: number;
  mistakeResolved: boolean;
  nextReviewAt: string;
  feedback: Feedback;
}

interface ReviewRow { ease: number; interval_days: number; repetitions: number; successes: number; lapses: number; last_reviewed_at: Date | null; due_at: Date }

export async function recordAnswer(db: pg.PoolClient, input: RecordAnswerInput): Promise<AnswerOutcome> {
  const q = input.question;
  const now = new Date();
  const tzRow = await one<{ timezone: string }>("SELECT timezone FROM learner WHERE id = $1", [LEARNER_ID], db);
  const tz = tzRow?.timezone ?? "UTC";

  const prev = await one<{ n: number; last: Date | null }>(
    "SELECT count(*)::int AS n, max(answered_at) AS last FROM question_attempt WHERE learner_id = $1 AND question_id = $2",
    [LEARNER_ID, q.id], db);
  const seenBefore = (prev?.n ?? 0) > 0;
  const daysSinceLast = prev?.last ? (now.getTime() - new Date(prev.last).getTime()) / DAY_MS : null;
  const correct = input.response ? isCorrect(q.type, q.answer, input.response) : false;

  const attempt = await one<{ id: number }>(
    `INSERT INTO question_attempt(learner_id, question_id, question_version, session_id, mode, response, is_correct, confidence,
       time_ms, hint_used, seen_before, days_since_last, answered_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id`,
    [LEARNER_ID, q.id, q.version, input.sessionId ?? null, input.mode, JSON.stringify(input.response ?? { options: [] }), correct,
      input.confidence, input.timeMs, input.hintUsed, seenBefore, daysSinceLast, now], db);
  const attemptId = attempt!.id;

  // ── spaced repetition ──
  const row = await one<ReviewRow>("SELECT * FROM review_item WHERE learner_id = $1 AND question_id = $2 FOR UPDATE", [LEARNER_ID, q.id], db);
  const prevState: SrsState | null = row ? {
    ease: row.ease, intervalDays: row.interval_days, repetitions: row.repetitions, successes: row.successes, lapses: row.lapses,
    lastReviewedAt: row.last_reviewed_at ? new Date(row.last_reviewed_at) : null, dueAt: new Date(row.due_at),
  } : null;
  const grade = gradeAnswer({ correct, confidence: input.confidence, hintUsed: input.hintUsed, timeMs: input.timeMs, estSeconds: q.estSeconds });
  const sched = schedule(prevState, grade, now);
  const s = sched.state;
  await query(
    `INSERT INTO review_item(learner_id, question_id, ease, interval_days, repetitions, successes, lapses, last_grade, last_confidence, last_reviewed_at, due_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     ON CONFLICT (learner_id, question_id) DO UPDATE SET ease=EXCLUDED.ease, interval_days=EXCLUDED.interval_days,
       repetitions=EXCLUDED.repetitions, successes=EXCLUDED.successes, lapses=EXCLUDED.lapses, last_grade=EXCLUDED.last_grade,
       last_confidence=EXCLUDED.last_confidence, last_reviewed_at=EXCLUDED.last_reviewed_at, due_at=EXCLUDED.due_at`,
    [LEARNER_ID, q.id, s.ease, s.intervalDays, s.repetitions, s.successes, s.lapses, grade, input.confidence, s.lastReviewedAt, s.dueAt], db);
  const countsAsDueReview = Boolean(prevState) && sched.wasDue;
  await query(
    `INSERT INTO review_log(learner_id, question_id, attempt_id, grade, prev_interval, new_interval, prev_ease, new_ease, was_due)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [LEARNER_ID, q.id, attemptId, grade, prevState?.intervalDays ?? 0, s.intervalDays, prevState?.ease ?? s.ease, s.ease, countsAsDueReview], db);

  // ── mistake journal ──
  let mistakeResolved = false;
  let xpAwarded = 0;
  const mistake = await one<{ wrong_count: number; category_source: string; last_wrong_at: Date; resolved_at: Date | null; high_confidence_wrong: boolean }>(
    "SELECT wrong_count, category_source, last_wrong_at, resolved_at, high_confidence_wrong FROM mistake_record WHERE learner_id = $1 AND question_id = $2 FOR UPDATE",
    [LEARNER_ID, q.id], db);
  if (!correct) {
    const chosen = input.response && "options" in input.response ? input.response.options : [];
    const category = !input.response || chosen.length === 0
      ? (input.timedOut ? "time_pressure" : "unanswered")
      : classifyMistake({
        format: q.format, mode: input.mode, confidence: input.confidence, timeMs: input.timeMs, estSeconds: q.estSeconds,
        previousWrongCount: mistake?.wrong_count ?? 0,
        chosenTexts: q.optionsFull.filter((o) => chosen.includes(o.key)).map((o) => o.textMd),
        correctTexts: q.optionsFull.filter((o) => o.isCorrect).map((o) => o.textMd),
      });
    await query(
      `INSERT INTO mistake_record(learner_id, question_id, first_wrong_at, last_wrong_at, wrong_count, last_response, category, category_source,
         high_confidence_wrong, correct_since, resolved_at)
       VALUES ($1,$2,$3,$3,1,$4,$5,'auto',$6,0,NULL)
       ON CONFLICT (learner_id, question_id) DO UPDATE SET last_wrong_at = EXCLUDED.last_wrong_at,
         wrong_count = mistake_record.wrong_count + 1, last_response = EXCLUDED.last_response,
         category = CASE WHEN mistake_record.category_source = 'learner' THEN mistake_record.category ELSE EXCLUDED.category END,
         high_confidence_wrong = mistake_record.high_confidence_wrong OR EXCLUDED.high_confidence_wrong,
         correct_since = 0, resolved_at = NULL`,
      [LEARNER_ID, q.id, now, JSON.stringify(input.response ?? { options: [] }), category, input.confidence === 3], db);
  } else if (mistake && !mistake.resolved_at) {
    const correctSince = await query<{ answered_at: Date }>(
      "SELECT answered_at FROM question_attempt WHERE learner_id = $1 AND question_id = $2 AND is_correct AND answered_at > $3",
      [LEARNER_ID, q.id, mistake.last_wrong_at], db);
    const days = new Set(correctSince.map((r) => dayKey(new Date(r.answered_at), tz)));
    mistakeResolved = days.size >= 2;
    await query("UPDATE mistake_record SET correct_since = $3, resolved_at = $4 WHERE learner_id = $1 AND question_id = $2",
      [LEARNER_ID, q.id, correctSince.length, mistakeResolved ? now : null], db);
    if (mistakeResolved) {
      xpAwarded += await awardXp(db, `mistake-resolved:${q.id}:${new Date(mistake.last_wrong_at).getTime()}`, XP_RULES.mistakeResolved,
        "Mistake resolved", { questionId: q.id });
    }
  }

  // ── XP ──
  const xp = xpForAnswer({ difficulty: q.difficulty, correct, seenBefore, spacedSuccess: sched.spacedSuccess, hintUsed: input.hintUsed, mode: input.mode });
  if (xp) {
    const key = seenBefore ? `spaced:${q.id}:${attemptId}` : `first-correct:${q.id}`;
    xpAwarded += await awardXp(db, key, xp.amount, xp.reason, { questionId: q.id, attemptId });
  }

  await bumpActivity(db, { questions: 1, correct: correct ? 1 : 0, reviews: countsAsDueReview ? 1 : 0 });

  return {
    attemptId, correct, seenBefore, spacedSuccess: sched.spacedSuccess && correct, wasDue: countsAsDueReview, xpAwarded, mistakeResolved,
    nextReviewAt: s.dueAt.toISOString(), feedback: toFeedback(q, correct),
  };
}

/** A different question on the same objective that tests the concept from another angle (unseen preferred). */
export async function followUpQuestion(db: pg.PoolClient | undefined, questionId: string, objectiveId: string): Promise<string | null> {
  const r = await one<{ id: string }>(
    `SELECT q.id FROM question q
     WHERE q.objective_id = $2 AND q.id <> $1 AND NOT q.retired AND q.type <> 'text' AND ${notInOpenExam("q.id")}
     ORDER BY (SELECT count(*) FROM question_attempt a WHERE a.learner_id = $3 AND a.question_id = q.id), random() LIMIT 1`,
    [questionId, objectiveId, LEARNER_ID], db);
  return r?.id ?? null;
}
