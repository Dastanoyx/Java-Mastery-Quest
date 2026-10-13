// Spaced repetition: an SM-2 variant (see docs/LEARNING_METHODOLOGY.md §2).
//
// Key properties (all unit-tested):
//  • A wrong answer always lapses the item into a 10-minute relearning step and lowers its ease.
//  • A correct answer only grows the interval when the item was actually due ("spaced retrieval").
//    Answering again minutes later (an immediate repeat) is recorded but does not count as evidence.
//  • A correct answer after a long (even overdue) gap grows the interval from the *elapsed* time,
//    so durable recall is rewarded more than an on-time repeat.
//  • Ease is clamped to [1.3, 3.0]; intervals are capped at 180 days.
import { DAY_MS, type Confidence } from "./types.ts";

export interface SrsState {
  ease: number;
  intervalDays: number;
  repetitions: number; // consecutive successful due reviews
  successes: number;
  lapses: number;
  lastReviewedAt: Date | null;
  dueAt: Date;
}

export interface GradeInput {
  correct: boolean;
  confidence: Confidence;
  hintUsed: boolean;
  timeMs: number | null;
  estSeconds: number;
}

export const RELEARN_STEP_DAYS = 10 / (24 * 60);
export const MIN_EASE = 1.3;
export const MAX_EASE = 3.0;
export const MAX_INTERVAL_DAYS = 180;
/**
 * A graduated item (interval ≥ 1 day) counts as "due" if it falls due within this tolerance, so a morning
 * session can catch items due later that day. Items in a relearning step (interval < 1 day) get no tolerance:
 * answering again minutes after a miss is an immediate repeat, not a spaced review.
 */
export const DUE_TOLERANCE_MS = 6 * 3_600_000;
/** SQL equivalent of isDue() for a `review_item r` row. */
export const DUE_SQL = "(r.due_at <= now() + CASE WHEN r.interval_days >= 1 THEN interval '6 hours' ELSE interval '0' END)";

/** Converts one answer into an SM-2 quality grade 0–5. */
export function gradeAnswer(a: GradeInput): number {
  if (!a.correct) return a.confidence === 3 ? 0 : 1; // confidently wrong is the strongest signal of a misconception
  if (a.hintUsed || a.confidence === 1) return 3; // correct but not from memory
  const slow = a.timeMs != null && a.timeMs > a.estSeconds * 1000 * 1.5;
  if (a.confidence === 3 && !slow) return 5;
  return 4;
}

export function isDue(state: SrsState | null, now: Date): boolean {
  if (!state) return true;
  const tolerance = state.intervalDays >= 1 ? DUE_TOLERANCE_MS : 0;
  return state.dueAt.getTime() <= now.getTime() + tolerance;
}

function nextEase(ease: number, grade: number): number {
  const q = Math.max(0, Math.min(5, grade));
  const e = ease + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
  return Math.round(Math.min(MAX_EASE, Math.max(MIN_EASE, e)) * 100) / 100;
}

export interface ScheduleResult {
  state: SrsState;
  wasDue: boolean;
  /** true when this answer counted as a successful spaced retrieval */
  spacedSuccess: boolean;
}

export function schedule(prev: SrsState | null, grade: number, now: Date): ScheduleResult {
  const wasDue = isDue(prev, now);
  if (grade < 3) {
    const ease = prev ? nextEase(prev.ease, grade) : 2.3;
    return {
      wasDue,
      spacedSuccess: false,
      state: {
        ease,
        intervalDays: RELEARN_STEP_DAYS,
        repetitions: 0,
        successes: prev?.successes ?? 0,
        lapses: (prev?.lapses ?? 0) + (prev ? 1 : 0),
        lastReviewedAt: now,
        dueAt: new Date(now.getTime() + RELEARN_STEP_DAYS * DAY_MS),
      },
    };
  }
  if (!prev) {
    // First ever answer, correct: schedule the first spaced check soon.
    const intervalDays = grade === 5 ? 2 : 1;
    return {
      wasDue: true,
      spacedSuccess: false,
      state: {
        ease: grade === 5 ? 2.6 : 2.5,
        intervalDays,
        repetitions: 1,
        successes: 0,
        lapses: 0,
        lastReviewedAt: now,
        dueAt: new Date(now.getTime() + intervalDays * DAY_MS),
      },
    };
  }
  if (!wasDue) {
    // Early, correct: an immediate repeat is not evidence of retention — keep the schedule unchanged.
    return { wasDue, spacedSuccess: false, state: { ...prev, lastReviewedAt: now } };
  }
  const elapsedDays = prev.lastReviewedAt ? Math.max(0, (now.getTime() - prev.lastReviewedAt.getTime()) / DAY_MS) : 0;
  const repetitions = prev.repetitions + 1;
  const ease = nextEase(prev.ease, grade);
  let intervalDays: number;
  if (prev.repetitions === 0) intervalDays = 1; // graduating from relearning
  else if (repetitions === 2) intervalDays = grade === 5 ? 4 : 3;
  else intervalDays = Math.max(prev.intervalDays, elapsedDays) * ease;
  if (grade === 3) intervalDays = Math.max(1, intervalDays * 0.6); // shaky recall: come back sooner
  intervalDays = Math.min(MAX_INTERVAL_DAYS, Math.round(intervalDays * 100) / 100);
  return {
    wasDue,
    spacedSuccess: elapsedDays >= 0.5,
    state: {
      ease,
      intervalDays,
      repetitions,
      successes: prev.successes + 1,
      lapses: prev.lapses,
      lastReviewedAt: now,
      dueAt: new Date(now.getTime() + intervalDays * DAY_MS),
    },
  };
}
