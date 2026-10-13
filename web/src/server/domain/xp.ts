// XP economy and levels (transparent rules — shown verbatim on the Progress page).
// Every award is written to the xp_transaction ledger with an idempotency key, so the same event can
// never pay twice. XP rewards learning events, not time spent or repetition.
import type { Difficulty, AttemptMode } from "./types.ts";

export const XP_RULES = {
  firstCorrect: { foundation: 10, intermediate: 15, advanced: 20, expert: 30 } as Record<Difficulty, number>,
  spacedReviewCorrect: 6, // a due review answered correctly (+ difficulty bonus below)
  spacedReviewDifficultyBonus: { foundation: 0, intermediate: 1, advanced: 2, expert: 4 } as Record<Difficulty, number>,
  hintPenaltyFactor: 0.5,
  lessonCompleted: 100,
  lessonPerfectQuiz: 25,
  predictionWritten: 2,
  exercisePassed: { foundation: 50, intermediate: 75, advanced: 100, expert: 150 } as Record<Difficulty, number>,
  dailyReviewSession: 25, // ≥ 10 due reviews in a day, once per day
  mockCompleted: { full: 100, short: 30, domain: 30, custom: 20, boss: 30 } as Record<string, number>,
  mockScoreBonusPerPercentAbovePass: 2, // full mocks only
  bossDefeated: 200,
  mistakeResolved: 15,
  domainMilestones: [{ at: 0.5, xp: 50 }, { at: 0.7, xp: 100 }, { at: 0.85, xp: 150 }],
} as const;

export interface AnswerXpInput {
  difficulty: Difficulty;
  correct: boolean;
  seenBefore: boolean;
  spacedSuccess: boolean;
  hintUsed: boolean;
  mode: AttemptMode;
}

/** XP for a single answer. Exam/boss answers earn nothing individually (the exam itself is rewarded once scored). */
export function xpForAnswer(a: AnswerXpInput): { amount: number; reason: string } | null {
  if (!a.correct || a.mode === "exam" || a.mode === "boss") return null;
  const factor = a.hintUsed ? XP_RULES.hintPenaltyFactor : 1;
  if (!a.seenBefore) {
    return { amount: Math.max(1, Math.round(XP_RULES.firstCorrect[a.difficulty] * factor)), reason: "New question answered correctly" };
  }
  if (a.spacedSuccess) {
    const base = XP_RULES.spacedReviewCorrect + XP_RULES.spacedReviewDifficultyBonus[a.difficulty];
    return { amount: Math.max(1, Math.round(base * factor)), reason: "Spaced retrieval succeeded" };
  }
  return null; // immediate repeats earn nothing
}

export function xpForMock(kind: string, percent: number, passPercent: number): number {
  const base = XP_RULES.mockCompleted[kind] ?? 20;
  if (kind !== "full") return base;
  return base + Math.max(0, Math.round((percent - passPercent) * XP_RULES.mockScoreBonusPerPercentAbovePass));
}

// ── Levels ─────────────────────────────────────────────────────────────────────────────────────────
/** Total XP required to reach `level` (level 1 = 0 XP). Grows gently: 150, 410, 738, 1121, ... */
export function xpForLevel(level: number): number {
  if (level <= 1) return 0;
  return Math.round(150 * Math.pow(level - 1, 1.45));
}

export function levelFromXp(totalXp: number) {
  let level = 1;
  while (xpForLevel(level + 1) <= totalXp) level++;
  const floor = xpForLevel(level);
  const next = xpForLevel(level + 1);
  return { level, xpIntoLevel: totalXp - floor, xpForNext: next - floor, nextLevelAt: next, progress: (totalXp - floor) / (next - floor) };
}
