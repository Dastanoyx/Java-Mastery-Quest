// Exam-readiness engine. Pure function of aggregated evidence + configuration (content/readiness.yaml).
// The readiness LEVEL is the highest level whose every gate passes; the INDEX is an informative composite.
import { z } from "zod";

const gatesSchema = z.object({
  coveragePercent: z.number().optional(),
  attempts: z.number().optional(),
  firstAttempts: z.number().optional(),
  unseenAccuracyPercent: z.number().optional(),
  weakestDomainPercent: z.number().optional(),
  retentionPercent: z.number().optional(),
  dueReviews: z.number().optional(),
  hardAccuracyPercent: z.number().optional(),
  fullMocksAtOrAbovePass: z.number().optional(),
  recentFullMocksAtOrAboveTarget: z.number().optional(),
  maxMockQuestionOverlapPercent: z.number().optional(),
  maxTimeUsedPercent: z.number().optional(),
  maxUnresolvedConfidentMistakes: z.number().optional(),
}).strict();

export const readinessConfigSchema = z.object({
  minimumEvidence: z.object({ attempts: z.number(), firstAttempts: z.number(), dueReviews: z.number(), fullMocks: z.number() }),
  indexWeights: z.object({
    coverage: z.number(), unseenAccuracy: z.number(), weakestDomain: z.number(), retention: z.number(),
    recentMocks: z.number(), hardAccuracy: z.number(),
  }),
  recentMockWindowDays: z.number().int().positive(),
  retentionWindowDays: z.number().int().positive(),
  levels: z.array(z.object({ id: z.string(), label: z.string(), gates: gatesSchema })).min(2),
});
export type ReadinessConfig = z.infer<typeof readinessConfigSchema>;
type Gates = z.infer<typeof gatesSchema>;

export interface MockSummary {
  attemptId: number;
  percent: number;
  submittedAt: Date;
  timeUsedRatio: number; // seconds used / seconds allowed
  questionIds: string[];
}

export interface ReadinessInput {
  objectivesTotal: number;
  objectivesCovered: number; // objectives with ≥ 3 distinct questions attempted
  attempts: number;
  firstAttempts: number;
  firstAttemptsCorrect: number;
  hardFirstAttempts: number; // advanced + expert
  hardFirstAttemptsCorrect: number;
  domainScores: Record<string, number>; // 0..1 for every domain (0 when no evidence)
  dueReviews: number;
  dueReviewsCorrect: number;
  recentFullMocks: MockSummary[]; // newest first, within the window
  passPercent: number;
  readyTargetPercent: number;
  unresolvedConfidentMistakes: number;
}

export interface GateResult { key: keyof Gates; label: string; required: string; actual: string; passed: boolean }

export interface ReadinessResult {
  level: string;
  label: string;
  index: number;
  preliminary: boolean;
  preliminaryReasons: string[];
  nextLevel: { id: string; label: string; gates: GateResult[] } | null;
  levels: { id: string; label: string; reached: boolean; gates: GateResult[] }[];
  components: Record<string, { value: number | null; n: number; label: string }>;
  recommendBooking: boolean;
}

const pct = (v: number | null) => (v == null ? "—" : `${Math.round(v * 100)} %`);

/** Overlap between the two most-overlapping recent mocks, as a share of the smaller set. */
export function maxPairwiseOverlap(mocks: MockSummary[]): number {
  let worst = 0;
  for (let i = 0; i < mocks.length; i++) {
    for (let j = i + 1; j < mocks.length; j++) {
      const a = new Set(mocks[i].questionIds);
      const shared = mocks[j].questionIds.filter((q) => a.has(q)).length;
      const denom = Math.min(mocks[i].questionIds.length, mocks[j].questionIds.length) || 1;
      worst = Math.max(worst, shared / denom);
    }
  }
  return worst;
}

export function computeReadiness(input: ReadinessInput, cfg: ReadinessConfig): ReadinessResult {
  const coverage = input.objectivesTotal ? input.objectivesCovered / input.objectivesTotal : 0;
  const unseenAcc = input.firstAttempts ? input.firstAttemptsCorrect / input.firstAttempts : null;
  const hardAcc = input.hardFirstAttempts ? input.hardFirstAttemptsCorrect / input.hardFirstAttempts : null;
  const scores = Object.values(input.domainScores);
  const weakest = scores.length ? Math.min(...scores) : 0;
  const retention = input.dueReviews ? input.dueReviewsCorrect / input.dueReviews : null;
  const last3 = input.recentFullMocks.slice(0, 3);
  const mockAvg = last3.length ? last3.reduce((s, m) => s + m.percent, 0) / last3.length / 100 : null;

  const components = {
    coverage: { value: coverage, n: input.objectivesTotal, label: "Objective coverage" },
    unseenAccuracy: { value: unseenAcc, n: input.firstAttempts, label: "Accuracy on unseen questions" },
    weakestDomain: { value: weakest, n: scores.length, label: "Weakest domain mastery" },
    retention: { value: retention, n: input.dueReviews, label: "Retention (due reviews recalled)" },
    recentMocks: { value: mockAvg, n: last3.length, label: "Recent full mock exams (avg of last 3)" },
    hardAccuracy: { value: hardAcc, n: input.hardFirstAttempts, label: "Accuracy on advanced/expert questions" },
  };
  const w = cfg.indexWeights;
  const index = 100 * (w.coverage * coverage + w.unseenAccuracy * (unseenAcc ?? 0) + w.weakestDomain * weakest +
    w.retention * (retention ?? 0) + w.recentMocks * (mockAvg ?? 0) + w.hardAccuracy * (hardAcc ?? 0));

  const mocksAbovePass = input.recentFullMocks.filter((m) => m.percent >= input.passPercent).length;
  const recentTarget = last3.filter((m) => m.percent >= input.readyTargetPercent).length;
  const overlap = maxPairwiseOverlap(last3);
  const maxTimeUsed = last3.length ? Math.max(...last3.map((m) => m.timeUsedRatio)) : null;

  function evalGates(g: Gates): GateResult[] {
    const out: GateResult[] = [];
    const add = (key: keyof Gates, label: string, required: string, actual: string, passed: boolean) => out.push({ key, label, required, actual, passed });
    if (g.coveragePercent != null) add("coveragePercent", "Objectives covered (≥ 3 questions each)", `≥ ${g.coveragePercent} %`, pct(coverage), coverage * 100 >= g.coveragePercent - 1e-9);
    if (g.attempts != null) add("attempts", "Questions answered", `≥ ${g.attempts}`, String(input.attempts), input.attempts >= g.attempts);
    if (g.firstAttempts != null) add("firstAttempts", "Unseen questions attempted", `≥ ${g.firstAttempts}`, String(input.firstAttempts), input.firstAttempts >= g.firstAttempts);
    if (g.unseenAccuracyPercent != null) add("unseenAccuracyPercent", "Accuracy on unseen questions", `≥ ${g.unseenAccuracyPercent} %`, pct(unseenAcc), (unseenAcc ?? 0) * 100 >= g.unseenAccuracyPercent);
    if (g.weakestDomainPercent != null) add("weakestDomainPercent", "Weakest domain mastery", `≥ ${g.weakestDomainPercent} %`, pct(weakest), weakest * 100 >= g.weakestDomainPercent);
    if (g.retentionPercent != null) add("retentionPercent", "Retention on due reviews", `≥ ${g.retentionPercent} %`, pct(retention), (retention ?? 0) * 100 >= g.retentionPercent);
    if (g.dueReviews != null) add("dueReviews", "Due reviews completed", `≥ ${g.dueReviews}`, String(input.dueReviews), input.dueReviews >= g.dueReviews);
    if (g.hardAccuracyPercent != null) add("hardAccuracyPercent", "Advanced/expert first-attempt accuracy", `≥ ${g.hardAccuracyPercent} %`, pct(hardAcc), (hardAcc ?? 0) * 100 >= g.hardAccuracyPercent);
    if (g.fullMocksAtOrAbovePass != null) add("fullMocksAtOrAbovePass", `Recent full mocks ≥ pass mark (${input.passPercent} %)`, `≥ ${g.fullMocksAtOrAbovePass}`, String(mocksAbovePass), mocksAbovePass >= g.fullMocksAtOrAbovePass);
    if (g.recentFullMocksAtOrAboveTarget != null) add("recentFullMocksAtOrAboveTarget", `Last 3 full mocks ≥ personal target (${input.readyTargetPercent} %)`, `${g.recentFullMocksAtOrAboveTarget} of 3`, `${recentTarget} of ${last3.length}`, recentTarget >= g.recentFullMocksAtOrAboveTarget);
    if (g.maxMockQuestionOverlapPercent != null) add("maxMockQuestionOverlapPercent", "Question overlap between those mocks", `≤ ${g.maxMockQuestionOverlapPercent} %`, last3.length >= 2 ? pct(overlap) : "—", last3.length >= 2 && overlap * 100 <= g.maxMockQuestionOverlapPercent);
    if (g.maxTimeUsedPercent != null) add("maxTimeUsedPercent", "Time used in those mocks", `≤ ${g.maxTimeUsedPercent} %`, pct(maxTimeUsed), maxTimeUsed != null && maxTimeUsed * 100 <= g.maxTimeUsedPercent);
    if (g.maxUnresolvedConfidentMistakes != null) add("maxUnresolvedConfidentMistakes", "Unresolved high-confidence mistakes", `≤ ${g.maxUnresolvedConfidentMistakes}`, String(input.unresolvedConfidentMistakes), input.unresolvedConfidentMistakes <= g.maxUnresolvedConfidentMistakes);
    return out;
  }

  const levels: ReadinessResult["levels"] = [];
  let reachedIdx = 0;
  let blocked = false;
  cfg.levels.forEach((l, i) => {
    const gates = evalGates(l.gates);
    const ok = gates.every((g) => g.passed);
    const reached = !blocked && ok;
    if (reached) reachedIdx = i; else blocked = true;
    levels.push({ id: l.id, label: l.label, reached, gates });
  });
  const current = cfg.levels[reachedIdx];
  const next = levels[reachedIdx + 1] ?? null;

  const m = cfg.minimumEvidence;
  const reasons: string[] = [];
  if (input.attempts < m.attempts) reasons.push(`only ${input.attempts} of ${m.attempts} answers recorded`);
  if (input.firstAttempts < m.firstAttempts) reasons.push(`only ${input.firstAttempts} of ${m.firstAttempts} unseen questions attempted`);
  if (input.dueReviews < m.dueReviews) reasons.push(`only ${input.dueReviews} of ${m.dueReviews} spaced reviews completed`);
  if (input.recentFullMocks.length < m.fullMocks) reasons.push(`no recent full-length mock exam`);

  return {
    level: current.id,
    label: current.label,
    index: Math.round(index * 10) / 10,
    preliminary: reasons.length > 0,
    preliminaryReasons: reasons,
    nextLevel: next ? { id: next.id, label: next.label, gates: next.gates } : null,
    levels,
    components,
    recommendBooking: current.id === cfg.levels[cfg.levels.length - 1].id,
  };
}
