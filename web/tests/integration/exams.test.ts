import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { freshDatabase, sql } from "./helpers.ts";
import { pool } from "../../src/server/db.ts";
import { createExam, getAttemptForTaking, saveExamAnswer, submitExam, examResults, sweepExpiredAttempts } from "../../src/server/services/exams.ts";
import { getFullQuestions } from "../../src/server/services/questions.ts";
import { computeProgress } from "../../src/server/services/progress.ts";
import { evaluateAchievements } from "../../src/server/services/gamification.ts";

beforeAll(async () => { await freshDatabase(); }, 120_000);

/** The strict payload hides question ids and metadata; tests read the real set from the database by position. */
async function realQuestions(attemptId: number) {
  return sql<{ position: number; id: string; domain_id: string; difficulty: string; format: string }>(
    `SELECT x.position, q.id, o.domain_id, q.difficulty, q.format FROM exam_attempt_answer x JOIN question q ON q.id = x.question_id
     JOIN exam_objective o ON o.id = q.objective_id WHERE x.attempt_id = $1 ORDER BY x.position`, [attemptId]);
}
afterAll(async () => { await pool().end(); });

describe("full mock exam", () => {
  let id: number;
  it("builds a 50-question exam covering all 10 domains from the blueprint, timed at 120 minutes", async () => {
    id = await createExam({ kind: "full" });
    const { view } = await getAttemptForTaking(id);
    expect(view!.questions).toHaveLength(50);
    const real = await realQuestions(id);
    expect(new Set(real.map((q) => q.domain_id)).size).toBe(10);
    expect(new Set(real.map((q) => q.id)).size).toBe(50);
    expect(view!.attempt.durationSeconds).toBe(120 * 60);
    expect(view!.attempt.passPercent).toBe(68);
    expect(view!.questions.every((q) => q.type !== "text")).toBe(true);
  });

  it("conceals answers, explanations and hints during the attempt", async () => {
    const { view } = await getAttemptForTaking(id);
    const s = JSON.stringify(view);
    expect(s).not.toMatch(/isCorrect|whyMd|explanationMd|ruleMd|"answer"/);
    expect(view!.questions.every((q) => q.hintMd === null)).toBe(true);
    // No metadata that hints at the answer or lets another tab look the question up.
    const real = await realQuestions(id);
    for (const r of real) expect(s).not.toContain(`"${r.id}"`);
    expect(view!.questions.every((q) => q.format === "exam" && q.tags.length === 0 && q.objectiveId === "" && q.lessonId === null)).toBe(true);
    await expect(examResults(id)).rejects.toThrow(/after the attempt is submitted/);
  });

  it("autosaves answers, flags and time without revealing correctness; validates responses", async () => {
    const { view } = await getAttemptForTaking(id);
    const real = await realQuestions(id);
    const idAt = new Map(real.map((r) => [r.position, r.id]));
    const full = await getFullQuestions(real.map((r) => r.id));
    // Answer the first 30 correctly, the next 10 wrongly, leave 10 unanswered.
    for (const q of view!.questions.slice(0, 40)) {
      const f = full.get(idAt.get(q.position)!)!;
      const correct = q.position <= 30;
      const opts = correct ? f.optionsFull.filter((o) => o.isCorrect).map((o) => o.key) : [f.optionsFull.find((o) => !o.isCorrect)!.key];
      const r = await saveExamAnswer(id, q.position, { response: { options: opts }, timeMsDelta: 60_000, confidence: correct ? 3 : 2 });
      expect(r).toEqual({ ok: true });
    }
    await saveExamAnswer(id, 41, { flagged: true });
    const single = view!.questions.find((q) => q.type === "single" && q.position > 41)!;
    await expect(saveExamAnswer(id, single.position, { response: { options: ["a", "b"] } })).rejects.toThrow(/exactly one/);
    const reloaded = await getAttemptForTaking(id);
    expect(reloaded.view!.questions.filter((q) => q.response).length).toBe(40);
    expect(reloaded.view!.questions.find((q) => q.position === 41)!.flagged).toBe(true);
  });

  it("scores deterministically on submit, records history, and is idempotent", async () => {
    const r = await submitExam(id, "learner");
    expect(r.alreadySubmitted).toBe(false);
    const again = await submitExam(id, "learner");
    expect(again.alreadySubmitted).toBe(true);
    const res = await examResults(id);
    expect(res.attempt.scoreCorrect).toBe(30);
    expect(res.attempt.scoreTotal).toBe(50);
    expect(res.attempt.scorePercent).toBe(60);
    expect(res.attempt.passed).toBe(false);
    expect(res.unanswered).toBe(10);
    expect(res.byDomain.reduce((s, d) => s + d.total, 0)).toBe(50);
    expect(res.items.every((i) => i.feedback.explanationMd.length > 0)).toBe(true);
    expect(res.remediation.length).toBeGreaterThan(0);
    const [n] = await sql<{ attempts: number; mistakes: number; xp: number }>(
      "SELECT (SELECT count(*) FROM question_attempt WHERE mode='exam')::int attempts, (SELECT count(*) FROM mistake_record)::int mistakes, (SELECT count(*) FROM xp_transaction WHERE source_key = 'exam:' || $1)::int xp", [id]);
    expect(n.attempts).toBe(50);
    expect(n.mistakes).toBe(20);
    expect(n.xp).toBe(1);
    await expect(saveExamAnswer(id, 1, { flagged: true })).rejects.toThrow(/already been submitted/);
  });

  it("counts the mock for achievements and readiness (but one mock below pass is not readiness)", async () => {
    const p = await computeProgress();
    expect(p.readinessInput.recentFullMocks).toHaveLength(1);
    const unlocked = await evaluateAchievements(p);
    expect(unlocked.map((u) => u.id)).toContain("first-mock");
    expect(unlocked.map((u) => u.id)).not.toContain("mock-pass");
  });

  it("prefers unseen questions in the next mock", async () => {
    const first = new Set((await sql<{ question_id: string }>("SELECT question_id FROM exam_attempt_answer WHERE attempt_id = $1", [id])).map((r) => r.question_id));
    const id2 = await createExam({ kind: "full" });
    const second = (await sql<{ question_id: string }>("SELECT question_id FROM exam_attempt_answer WHERE attempt_id = $1", [id2])).map((r) => r.question_id);
    const overlap = second.filter((q) => first.has(q)).length;
    expect(overlap).toBeLessThan(10);
  });
});

describe("deadline handling", () => {
  it("auto-submits an expired attempt with reason 'timeout' and records unanswered questions", async () => {
    const id = await createExam({ kind: "short", count: 5 });
    await sql("UPDATE exam_attempt SET deadline_at = now() - interval '1 minute' WHERE id = $1", [id]);
    await expect(saveExamAnswer(id, 1, { flagged: true })).rejects.toThrow(/time is up/);
    const { view, autoSubmitted } = await getAttemptForTaking(id);
    expect(autoSubmitted).toBe(true);
    expect(view!.attempt.submitReason).toBe("timeout");
    const res = await examResults(id);
    expect(res.unanswered).toBe(5);
    const cats = await sql<{ category: string }>("SELECT m.category FROM mistake_record m JOIN exam_attempt_answer x ON x.question_id = m.question_id WHERE x.attempt_id = $1", [id]);
    expect(cats.every((c) => c.category === "time_pressure" || c.category === "repeated_misconception")).toBe(true);
  });

  it("sweeps other expired attempts", async () => {
    const id = await createExam({ kind: "short", count: 5 });
    await sql("UPDATE exam_attempt SET deadline_at = now() - interval '1 minute' WHERE id = $1", [id]);
    expect(await sweepExpiredAttempts()).toBeGreaterThanOrEqual(1);
  });
});

describe("boss battle", () => {
  it("mixes at least half advanced/expert questions from one domain with a 75 % bar", async () => {
    const id = await createExam({ kind: "boss", domainId: "D3" });
    const { view } = await getAttemptForTaking(id);
    expect(view!.questions).toHaveLength(12);
    const real = await realQuestions(id);
    expect(real.every((q) => q.domain_id === "D3")).toBe(true);
    expect(real.filter((q) => q.difficulty === "advanced" || q.difficulty === "expert").length).toBeGreaterThanOrEqual(6);
    expect(view!.attempt.passPercent).toBe(75);
  });
});

describe("questions of an open strict exam are locked everywhere else", () => {
  it("blocks answering, looking up and practising them until the attempt is submitted", async () => {
    const { lockedQuestionIds, assertNotInOpenExam } = await import("../../src/server/services/examLock.ts");
    const { selectPracticeQuestions } = await import("../../src/server/services/practice.ts");
    await sql("UPDATE exam_attempt SET submitted_at = now(), submit_reason = 'learner' WHERE submitted_at IS NULL"); // isolate from earlier tests
    const id = await createExam({ kind: "short", count: 5 });
    const ids = (await realQuestions(id)).map((r) => r.id);
    expect((await lockedQuestionIds(ids)).size).toBe(5);
    await expect(assertNotInOpenExam([ids[0]])).rejects.toThrow(/exam in progress/);
    const practice = await selectPracticeQuestions({ domains: [], objectives: [], difficulties: [], formats: [], source: "all", count: 60, interleave: false });
    expect(practice.some((q) => ids.includes(q))).toBe(false);
    await submitExam(id, "learner");
    expect((await lockedQuestionIds(ids)).size).toBe(0);
    await expect(assertNotInOpenExam(ids)).resolves.toBeUndefined();
  });
});

describe("rewards need a genuine attempt", () => {
  it("scores an empty exam but pays no XP and completes no timed quest", async () => {
    await sql("UPDATE exam_attempt SET submitted_at = now(), submit_reason = 'learner' WHERE submitted_at IS NULL");
    const id = await createExam({ kind: "short", count: 5 });
    await submitExam(id, "learner");
    const [r] = await sql<{ xp: number; scored: number }>(
      "SELECT (SELECT count(*) FROM xp_transaction WHERE source_key = 'exam:' || $1::text)::int xp, (SELECT count(*) FROM exam_attempt WHERE id = $1::bigint AND score_total = 5)::int scored", [String(id)]);
    expect(r).toEqual({ xp: 0, scored: 1 });
  });
});
