// Shared domain types. Pure data — no I/O.
export type Difficulty = "foundation" | "intermediate" | "advanced" | "expert";
export type QuestionType = "single" | "multi" | "text";
export type AttemptMode = "lesson_check" | "lesson_mastery" | "practice" | "timed" | "review" | "exam" | "boss";
/** 1 = guessing, 2 = unsure, 3 = sure; null when not asked. */
export type Confidence = 1 | 2 | 3 | null;

export const DIFFICULTIES: readonly Difficulty[] = ["foundation", "intermediate", "advanced", "expert"];

export interface AttemptEvidence {
  questionId: string;
  objectiveId: string;
  difficulty: Difficulty;
  correct: boolean;
  seenBefore: boolean;
  /** days since the previous attempt of the same question; null for a first attempt */
  daysSinceLast: number | null;
  hintUsed: boolean;
  mode: AttemptMode;
  answeredAt: Date;
  confidence: Confidence;
  timeMs: number | null;
}

export const DAY_MS = 86_400_000;
