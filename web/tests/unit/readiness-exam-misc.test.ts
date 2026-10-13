import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { parse } from "yaml";
import { computeReadiness, readinessConfigSchema, type ReadinessInput, maxPairwiseOverlap } from "../../src/server/domain/readiness.ts";
import { allocate, buildExam, mulberry32, type PoolQuestion } from "../../src/server/domain/examBuilder.ts";
import { computeStreak } from "../../src/server/domain/streak.ts";
import { dayKey, startOfDay, addDays, weekStart } from "../../src/server/domain/time.ts";
import { dailyQuests } from "../../src/server/domain/quests.ts";
import { earnedAchievements, longestRun, type AchievementStats } from "../../src/server/domain/achievements.ts";
import { planDay } from "../../src/server/domain/planner.ts";
import { currentTitle } from "../../src/server/domain/titles.ts";

const cfg = readinessConfigSchema.parse(parse(readFileSync(new URL("../../../content/readiness.yaml", import.meta.url), "utf8")));
const domains10 = Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`D${i + 1}`, 0.9]));
const strong: ReadinessInput = {
  objectivesTotal: 25, objectivesCovered: 25, attempts: 900, firstAttempts: 340, firstAttemptsCorrect: 290,
  hardFirstAttempts: 150, hardFirstAttemptsCorrect: 110, domainScores: domains10, dueReviews: 400, dueReviewsCorrect: 360,
  recentFullMocks: [
    { attemptId: 3, percent: 86, submittedAt: new Date(), timeUsedRatio: 0.7, questionIds: Array.from({ length: 50 }, (_, i) => `a${i}`) },
    { attemptId: 2, percent: 84, submittedAt: new Date(), timeUsedRatio: 0.75, questionIds: Array.from({ length: 50 }, (_, i) => `b${i}`) },
    { attemptId: 1, percent: 82, submittedAt: new Date(), timeUsedRatio: 0.8, questionIds: Array.from({ length: 50 }, (_, i) => (i < 10 ? `a${i}` : `c${i}`)) },
  ],
  passPercent: 68, readyTargetPercent: 80, unresolvedConfidentMistakes: 2,
};

describe("readiness", () => {
  it("starts at Exploring with a preliminary label when there is no evidence", () => {
    const r = computeReadiness({ ...strong, objectivesCovered: 0, attempts: 0, firstAttempts: 0, firstAttemptsCorrect: 0, hardFirstAttempts: 0, hardFirstAttemptsCorrect: 0, domainScores: {}, dueReviews: 0, dueReviewsCorrect: 0, recentFullMocks: [] }, cfg);
    expect(r.level).toBe("exploring");
    expect(r.preliminary).toBe(true);
    expect(r.recommendBooking).toBe(false);
  });
  it("reaches Consistently Exam Ready only when every gate passes", () => {
    const r = computeReadiness(strong, cfg);
    expect(r.level).toBe("consistently_ready");
    expect(r.recommendBooking).toBe(true);
    expect(r.preliminary).toBe(false);
  });
  it("one high mock score is not enough", () => {
    const r = computeReadiness({ ...strong, recentFullMocks: strong.recentFullMocks.slice(0, 1) }, cfg);
    expect(r.level).toBe("near_ready");
    expect(r.nextLevel?.gates.find((g) => g.key === "recentFullMocksAtOrAboveTarget")?.passed).toBe(false);
  });
  it("a single weak domain blocks the top levels regardless of averages", () => {
    const r = computeReadiness({ ...strong, domainScores: { ...domains10, D7: 0.4 } }, cfg);
    expect(["advanced", "competence"]).toContain(r.level);
  });
  it("repeating the same mock questions does not demonstrate stability", () => {
    const same = strong.recentFullMocks.map((m) => ({ ...m, questionIds: strong.recentFullMocks[0].questionIds }));
    expect(maxPairwiseOverlap(same)).toBe(1);
    expect(computeReadiness({ ...strong, recentFullMocks: same }, cfg).level).toBe("near_ready");
  });
  it("levels are cumulative: a failing lower gate blocks higher levels", () => {
    const r = computeReadiness({ ...strong, objectivesCovered: 10 }, cfg);
    expect(r.level).toBe("foundations");
  });
});

describe("exam builder", () => {
  it("allocates proportionally with a floor and respects availability", () => {
    const a = allocate(50, [
      { id: "D1", weight: 3, available: 40 }, { id: "D2", weight: 1, available: 30 }, { id: "D3", weight: 7, available: 100 },
      { id: "D4", weight: 1, available: 2 },
    ], 3);
    expect(Object.values(a).reduce((s, n) => s + n, 0)).toBe(50);
    expect(a.D4).toBe(2);
    expect(a.D3).toBeGreaterThan(a.D1);
    expect(a.D2).toBeGreaterThanOrEqual(3);
  });
  const pool: PoolQuestion[] = [];
  for (let d = 1; d <= 3; d++) for (let o = 1; o <= 2; o++) for (let q = 0; q < 10; q++)
    pool.push({ id: `D${d}.${o}-${q}`, domainId: `D${d}`, objectiveId: `D${d}.${o}`, difficulty: q % 2 ? "advanced" : "foundation" });
  const domains = [1, 2, 3].map((d) => ({ id: `D${d}`, objectiveIds: [`D${d}.1`, `D${d}.2`] }));
  it("is reproducible with a seed and has no duplicates", () => {
    const a = buildExam(pool, { count: 12, domains, floorPerDomain: 3, exposure: new Map(), rng: mulberry32(7) });
    const b = buildExam(pool, { count: 12, domains, floorPerDomain: 3, exposure: new Map(), rng: mulberry32(7) });
    expect(a).toEqual(b);
    expect(new Set(a).size).toBe(12);
  });
  it("covers every objective and prefers unseen questions", () => {
    const exposure = new Map(pool.filter((q) => q.id.endsWith("-0") || q.id.endsWith("-1")).map((q) => [q.id, { attempts: 3, lastSeen: new Date() }]));
    const ids = buildExam(pool, { count: 24, domains, floorPerDomain: 3, exposure, rng: mulberry32(1) });
    const objs = new Set(ids.map((id) => id.split("-")[0]));
    expect(objs.size).toBe(6);
    expect(ids.filter((id) => exposure.has(id))).toHaveLength(0);
  });
});

describe("time & streaks", () => {
  it("computes day keys in the learner's zone", () => {
    expect(dayKey(new Date("2026-10-12T23:30:00Z"), "Africa/Tunis")).toBe("2026-10-13");
    expect(dayKey(new Date("2026-10-12T23:30:00Z"), "America/New_York")).toBe("2026-10-12");
  });
  it("finds the start of a local day across DST", () => {
    expect(startOfDay("2026-03-29", "Europe/Paris").toISOString()).toBe("2026-03-28T23:00:00.000Z");
    expect(startOfDay("2026-03-30", "Europe/Paris").toISOString()).toBe("2026-03-29T22:00:00.000Z");
  });
  it("computes ISO week start", () => {
    expect(weekStart("2026-10-11")).toBe("2026-10-05"); // Sunday → Monday before
    expect(weekStart("2026-10-12")).toBe("2026-10-12");
  });
  it("keeps the streak alive until today is over and finds the best run", () => {
    const today = "2026-10-12";
    const days = [-1, -2, -3, -10, -11].map((n) => ({ day: addDays(today, n), questions: 6, lessons: 0, reviews: 0 }));
    expect(computeStreak(days, today)).toMatchObject({ current: 3, best: 3, todayActive: false });
    const light = [{ day: addDays(today, -1), questions: 2, lessons: 0, reviews: 0 }];
    expect(computeStreak(light, today).current).toBe(0);
  });
});

describe("quests, achievements, planner, titles", () => {
  const ctx = { dueReviews: 2, unresolvedMistakes: 0, nextLesson: { id: "l1", title: "Arrays" }, weakestDomain: { id: "D5", short: "Arrays & Collections" }, dailyMinutes: 45, exerciseAvailable: true, studyDaysPerWeek: 5 };
  it("never asks for more due reviews than exist", () => {
    expect(dailyQuests({ ...ctx, dueReviews: 4 })[0]).toMatchObject({ kind: "review_due", target: 4 });
    expect(dailyQuests(ctx)[0].kind).toBe("answer_new");
  });
  it("only offers mistake quests when there are mistakes", () => {
    expect(dailyQuests(ctx).map((q) => q.kind)).not.toContain("fix_mistakes");
    expect(dailyQuests({ ...ctx, unresolvedMistakes: 5 }).find((q) => q.kind === "fix_mistakes")?.target).toBe(3);
  });
  it("evaluates achievements from stats", () => {
    const zero: AchievementStats = { lessonsCompleted: 0, exercisesPassed: 0, predictionsWritten: 0, bestStreak: 0, longestNoHintUnseenCorrectRun: 0, dueReviewsCompleted: 0, mistakesResolved: 0, bossesDefeated: 0, domainsFullyMastered: 0, objectivesTotal: 25, objectivesWith3Questions: 0, fullMocksCompleted: 0, fullMocksPassed: 0, readinessLevel: "exploring" };
    expect(earnedAchievements(zero)).toEqual([]);
    expect(earnedAchievements({ ...zero, lessonsCompleted: 1, bestStreak: 7 })).toEqual(["first-lesson", "streak-7"]);
  });
  it("counts the no-hint run only on unseen questions", () => {
    expect(longestRun([
      { correct: true, seenBefore: false, hintUsed: false }, { correct: true, seenBefore: true, hintUsed: false },
      { correct: true, seenBefore: false, hintUsed: false }, { correct: true, seenBefore: false, hintUsed: true },
      { correct: true, seenBefore: false, hintUsed: false },
    ])).toBe(2);
  });
  it("puts overdue reviews first after a break", () => {
    const plan = planDay({ dailyMinutes: 60, dueReviews: 30, overdueReviews: 25, daysSinceLastStudy: 6, nextLesson: { id: "l", title: "Streams", minutes: 40, domainId: "D6", inProgress: false }, weakObjectives: [], repeatedMistakeObjectives: [], exercise: null, modePreference: "balanced", hasCompletedAnyLesson: true });
    expect(plan.reentry).toBe(true);
    expect(plan.blocks[0].kind).toBe("review");
    expect(plan.headline).toMatch(/Welcome back/);
  });
  it("titles require demonstrated mastery, not just XP", () => {
    const c = { level: 30, domainScores: { D3: 0.2 }, domainsMastered: 0, bestFullMockPercent: null, readyTargetPercent: 80, readinessLevel: "exploring" };
    expect(currentTitle(c)).toBe("Bytecode Explorer");
    expect(currentTitle({ ...c, domainScores: { D3: 0.75 } })).toBe("Object-Oriented Craftsman");
  });
});
