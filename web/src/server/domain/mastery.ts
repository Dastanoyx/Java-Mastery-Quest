// Evidence-weighted mastery (docs/LEARNING_METHODOLOGY.md §3).
//
// Mastery is NOT accuracy over everything ever answered. Each attempt is weighted by how much it says
// about durable, transferable knowledge:
//   • first attempt on a never-seen question ......... 1.0
//   • repeat after ≥ 1 day (spaced retrieval) ......... 1.0
//   • repeat within a day (immediate repeat) .......... 0.25
//   • lesson knowledge check (right after reading) .... ×0.5
//   • hint used ....................................... ×0.5
//   • difficulty: foundation 0.8, intermediate 1, advanced 1.2, expert 1.4
//   • recency: half-life 45 days
// The estimate is the posterior mean of a Beta(1,1) prior updated with weighted successes/failures.
// "Mastered" additionally requires breadth (distinct questions) and at least one spaced success.
import { DAY_MS, type AttemptEvidence, type Difficulty } from "./types.ts";

export const DIFFICULTY_WEIGHT: Record<Difficulty, number> = { foundation: 0.8, intermediate: 1, advanced: 1.2, expert: 1.4 };
export const RECENCY_HALF_LIFE_DAYS = 45;
export const MIN_EVIDENCE_WEIGHT = 5;
export const MIN_DISTINCT_QUESTIONS = 4;

export type MasteryStatus = "none" | "learning" | "developing" | "mastered";

export interface MasteryEstimate {
  score: number | null; // 0..1, null when no evidence
  evidenceWeight: number;
  attempts: number;
  distinctQuestions: number;
  spacedSuccesses: number;
  firstAttemptAccuracy: number | null;
  status: MasteryStatus;
}

export function attemptWeight(a: AttemptEvidence, now: Date): number {
  let w = !a.seenBefore ? 1 : (a.daysSinceLast ?? 0) >= 1 ? 1 : 0.25;
  if (a.mode === "lesson_check") w *= 0.5;
  if (a.hintUsed) w *= 0.5;
  w *= DIFFICULTY_WEIGHT[a.difficulty];
  const ageDays = Math.max(0, (now.getTime() - a.answeredAt.getTime()) / DAY_MS);
  w *= Math.pow(0.5, ageDays / RECENCY_HALF_LIFE_DAYS);
  return w;
}

export function estimateMastery(attempts: AttemptEvidence[], now: Date, threshold = 0.85): MasteryEstimate {
  if (!attempts.length) {
    return { score: null, evidenceWeight: 0, attempts: 0, distinctQuestions: 0, spacedSuccesses: 0, firstAttemptAccuracy: null, status: "none" };
  }
  let wSum = 0, wCorrect = 0, spaced = 0, firsts = 0, firstsCorrect = 0;
  const distinct = new Set<string>();
  for (const a of attempts) {
    const w = attemptWeight(a, now);
    wSum += w;
    if (a.correct) wCorrect += w;
    distinct.add(a.questionId);
    if (a.correct && a.seenBefore && (a.daysSinceLast ?? 0) >= 1) spaced++;
    if (!a.seenBefore) { firsts++; if (a.correct) firstsCorrect++; }
  }
  const score = (wCorrect + 1) / (wSum + 2);
  let status: MasteryStatus = "learning";
  if (score >= threshold && wSum >= MIN_EVIDENCE_WEIGHT && distinct.size >= MIN_DISTINCT_QUESTIONS && spaced >= 1) status = "mastered";
  else if (score >= 0.65 && wSum >= 2) status = "developing";
  return {
    score: Math.round(score * 1000) / 1000,
    evidenceWeight: Math.round(wSum * 100) / 100,
    attempts: attempts.length,
    distinctQuestions: distinct.size,
    spacedSuccesses: spaced,
    firstAttemptAccuracy: firsts ? firstsCorrect / firsts : null,
    status,
  };
}

/** Groups attempts by objective and estimates each. Objectives without attempts are reported as "none". */
export function masteryByObjective(objectiveIds: string[], attempts: AttemptEvidence[], now: Date, thresholds: Record<string, number> = {}) {
  const by = new Map<string, AttemptEvidence[]>();
  for (const a of attempts) {
    const list = by.get(a.objectiveId) ?? [];
    list.push(a);
    by.set(a.objectiveId, list);
  }
  const out: Record<string, MasteryEstimate> = {};
  for (const id of objectiveIds) out[id] = estimateMastery(by.get(id) ?? [], now, thresholds[id] ?? 0.85);
  return out;
}

/** Domain mastery = mean of its objectives' scores (objectives without evidence count as 0). */
export function domainScore(objectives: MasteryEstimate[]): number {
  if (!objectives.length) return 0;
  return objectives.reduce((s, o) => s + (o.score ?? 0) * (o.evidenceWeight > 0 ? 1 : 0), 0) / objectives.length;
}
