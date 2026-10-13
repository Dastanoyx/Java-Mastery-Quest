import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { freshDatabase, sql } from "./helpers.ts";
import { tx, pool } from "../../src/server/db.ts";
import { getFullQuestion, getPublicQuestions } from "../../src/server/services/questions.ts";
import { recordAnswer } from "../../src/server/services/answers.ts";
import { afterLearningEvent, ensureQuests, currentQuests } from "../../src/server/services/gamification.ts";
import { totalXp } from "../../src/server/services/learner.ts";
import { submitMasteryQuiz, listLessons, recordLessonEvent, getLessonView } from "../../src/server/services/lessons.ts";
import { computeProgress } from "../../src/server/services/progress.ts";
import { reviewQueue, startPractice } from "../../src/server/services/practice.ts";
import { listMistakes, updateMistake, createNote, search, toggleBookmark } from "../../src/server/services/journal.ts";
import { exportData, resetProgress } from "../../src/server/services/settings.ts";
import type { FullQuestion } from "../../src/server/services/questions.ts";

beforeAll(async () => { await freshDatabase(); }, 120_000);
afterAll(async () => { await pool().end(); });

const wrongResponse = (q: FullQuestion) => ({ options: [q.optionsFull.find((o) => !o.isCorrect)!.key] });
const rightResponse = (q: FullQuestion) => ({ options: q.optionsFull.filter((o) => o.isCorrect).map((o) => o.key) });

async function answer(id: string, correct: boolean, extra: Partial<{ confidence: 1 | 2 | 3 | null; mode: "practice" | "review"; hintUsed: boolean }> = {}) {
  const q = (await getFullQuestion(id))!;
  return tx((c) => recordAnswer(c, { question: q, response: correct ? rightResponse(q) : wrongResponse(q), mode: extra.mode ?? "practice", confidence: extra.confidence ?? null, timeMs: 40_000, hintUsed: extra.hintUsed ?? false }));
}

describe("content seed", () => {
  it("seeded every domain, lesson and question with verification status", async () => {
    const [r] = await sql<{ d: number; l: number; q: number; unverified: number }>(
      "SELECT (SELECT count(*) FROM exam_domain)::int d, (SELECT count(*) FROM lesson)::int l, (SELECT count(*) FROM question)::int q, (SELECT count(*) FROM question WHERE verification = 'needs-review')::int unverified");
    expect(r.d).toBe(10);
    expect(r.l).toBeGreaterThanOrEqual(30);
    expect(r.q).toBeGreaterThanOrEqual(250);
    expect(r.unverified).toBe(0);
  });
  it("never sends answers in public question payloads", async () => {
    const [q] = await getPublicQuestions(["D3-OVL-004"]);
    const s = JSON.stringify(q);
    expect(s).not.toMatch(/isCorrect|whyMd|explanationMd|"answer"/);
  });
});

describe("answer write path", () => {
  it("records a wrong answer: attempt, relearning schedule, mistake, no XP", async () => {
    const xp0 = await totalXp();
    const out = await answer("D3-OVL-004", false, { confidence: 3 });
    expect(out.correct).toBe(false);
    expect(out.seenBefore).toBe(false);
    expect(out.xpAwarded).toBe(0);
    expect(await totalXp()).toBe(xp0);
    const [m] = await sql<{ wrong_count: number; high_confidence_wrong: boolean; category: string }>("SELECT * FROM mistake_record WHERE question_id = 'D3-OVL-004'");
    expect(m.wrong_count).toBe(1);
    expect(m.high_confidence_wrong).toBe(true);
    const [r] = await sql<{ interval_days: number; due_at: Date }>("SELECT * FROM review_item WHERE question_id = 'D3-OVL-004'");
    expect(Number(r.interval_days)).toBeLessThan(0.01);
    expect(out.feedback.explanationMd.length).toBeGreaterThan(20);
    expect(out.feedback.options.every((o) => o.whyMd.length > 0)).toBe(true);
  });

  it("gives XP once for a new correct answer and nothing for immediate repeats", async () => {
    const first = await answer("D3-OVL-005", true);
    expect(first.xpAwarded).toBeGreaterThan(0);
    const again = await answer("D3-OVL-005", true);
    expect(again.seenBefore).toBe(true);
    expect(again.xpAwarded).toBe(0);
    expect(again.spacedSuccess).toBe(false);
  });

  it("marks a repeated wrong answer as a repeated misconception", async () => {
    await answer("D3-OVL-004", false);
    const [m] = await sql<{ wrong_count: number; category: string }>("SELECT * FROM mistake_record WHERE question_id = 'D3-OVL-004'");
    expect(m.wrong_count).toBe(2);
    expect(m.category).toBe("repeated_misconception");
  });

  it("resolves a mistake only after correct answers on two different days", async () => {
    await answer("D3-OVL-004", true);
    let [m] = await sql<{ resolved_at: Date | null; correct_since: number }>("SELECT * FROM mistake_record WHERE question_id = 'D3-OVL-004'");
    expect(m.resolved_at).toBeNull();
    // Simulate the earlier correct answer having happened two days ago.
    await sql("UPDATE question_attempt SET answered_at = answered_at - interval '2 days' WHERE question_id = 'D3-OVL-004' AND is_correct");
    await sql("UPDATE mistake_record SET last_wrong_at = last_wrong_at - interval '3 days' WHERE question_id = 'D3-OVL-004'");
    await answer("D3-OVL-004", true);
    [m] = await sql("SELECT * FROM mistake_record WHERE question_id = 'D3-OVL-004'");
    expect(m.resolved_at).not.toBeNull();
  });

  it("learner can override a mistake category and add a note", async () => {
    await answer("D3-OVL-007", false);
    await updateMistake("D3-OVL-007", { category: "misread", personalNote: "I skipped the varargs line" });
    await answer("D3-OVL-007", false);
    const [m] = await sql<{ category: string; category_source: string; personal_note: string }>("SELECT * FROM mistake_record WHERE question_id = 'D3-OVL-007'");
    expect(m.category).toBe("misread"); // not overwritten by auto-classification
    expect(m.category_source).toBe("learner");
    const list = await listMistakes({ status: "open" });
    expect(list.some((x) => x.question.id === "D3-OVL-007" && x.personalNote?.includes("varargs"))).toBe(true);
  });
});

describe("spaced review", () => {
  it("counts a correct answer as spaced only when the item is due, and pays review XP", async () => {
    await answer("D4-EXC-001", true);
    await sql("UPDATE review_item SET due_at = now() - interval '1 hour', last_reviewed_at = now() - interval '2 days' WHERE question_id = 'D4-EXC-001'");
    await sql("UPDATE question_attempt SET answered_at = now() - interval '2 days' WHERE question_id = 'D4-EXC-001'");
    const queue = await reviewQueue(20);
    expect(queue.items.map((i) => i.id)).toContain("D4-EXC-001");
    const out = await answer("D4-EXC-001", true, { mode: "review", confidence: 3 });
    expect(out.wasDue).toBe(true);
    expect(out.spacedSuccess).toBe(true);
    expect(out.xpAwarded).toBeGreaterThan(0);
    const [r] = await sql<{ interval_days: number }>("SELECT interval_days FROM review_item WHERE question_id = 'D4-EXC-001'");
    expect(Number(r.interval_days)).toBeGreaterThanOrEqual(3);
  });
});

describe("lessons", () => {
  it("does not complete a lesson below the mastery threshold, completes it above, pays once", async () => {
    const view = await getLessonView("oop-overloading");
    expect(view).not.toBeNull();
    const quiz = view!.masteryQuiz;
    expect(quiz.length).toBeGreaterThanOrEqual(3);
    const full = new Map<string, FullQuestion>();
    for (const q of quiz) full.set(q.id, (await getFullQuestion(q.id))!);
    const failing = await submitMasteryQuiz("oop-overloading", quiz.map((q) => ({ questionId: q.id, response: wrongResponse(full.get(q.id)!), confidence: null, timeMs: 30000 })));
    expect(failing.passed).toBe(false);
    let card = (await listLessons("D3")).find((l) => l.id === "oop-overloading")!;
    expect(card.status).toBe("in_progress");
    const passing = await submitMasteryQuiz("oop-overloading", quiz.map((q) => ({ questionId: q.id, response: rightResponse(full.get(q.id)!), confidence: 3, timeMs: 30000 })));
    expect(passing.passed).toBe(true);
    expect(passing.firstCompletion).toBe(true);
    const again = await submitMasteryQuiz("oop-overloading", quiz.map((q) => ({ questionId: q.id, response: rightResponse(full.get(q.id)!), confidence: 3, timeMs: 30000 })));
    expect(again.firstCompletion).toBe(false);
    const paid = await sql<{ n: number }>("SELECT count(*)::int n FROM xp_transaction WHERE source_key = 'lesson-complete:oop-overloading'");
    expect(paid[0].n).toBe(1);
    card = (await listLessons("D3")).find((l) => l.id === "oop-overloading")!;
    expect(["completed", "needs_review", "mastered"]).toContain(card.status);
  });

  it("awards prediction XP once per block and only for a written prediction", async () => {
    const a = await recordLessonEvent("oop-overloading", "prediction", "0", { prediction: "long" });
    const b = await recordLessonEvent("oop-overloading", "prediction", "0", { prediction: "long again" });
    const c = await recordLessonEvent("oop-overloading", "prediction", "1", { prediction: "" });
    expect(a.xp).toBeGreaterThan(0);
    expect(b.xp).toBe(0);
    expect(c.xp).toBe(0);
  });

  it("locks lessons with incomplete prerequisites (soft lock) and unlocks dependants", async () => {
    const lessons = await listLessons();
    const locked = lessons.filter((l) => l.status === "locked");
    expect(locked.length).toBeGreaterThan(0);
    for (const l of locked) expect(l.prerequisites.some((p) => !p.completed)).toBe(true);
  });
});

describe("gamification pipeline", () => {
  it("creates achievable quests, completes them from real events, unlocks achievements idempotently", async () => {
    await ensureQuests();
    const quests = await currentQuests();
    expect(quests.filter((q) => q.cadence === "daily")).toHaveLength(3);
    for (const q of quests) expect(q.target).toBeGreaterThan(0);
    const xp0 = await totalXp();
    const r1 = await afterLearningEvent(xp0);
    expect(r1.achievementsUnlocked.map((a) => a.id)).toContain("first-lesson");
    const r2 = await afterLearningEvent(await totalXp());
    expect(r2.achievementsUnlocked).toHaveLength(0);
    expect(r2.questsCompleted).toHaveLength(0);
    const [snap] = await sql<{ n: number }>("SELECT count(*)::int n FROM readiness_snapshot");
    expect(snap.n).toBe(1);
  });

  it("computes progress from evidence, with honest readiness", async () => {
    const p = await computeProgress();
    expect(p.domains).toHaveLength(10);
    expect(p.readiness.level).toBe("exploring");
    expect(p.readiness.preliminary).toBe(true);
    expect(p.domains.find((d) => d.id === "D3")!.score).toBeGreaterThan(0);
    expect(p.domains.find((d) => d.id === "D10")!.attempted).toBe(false);
  });
});

describe("practice, notes, search, export, reset", () => {
  it("builds interleaved practice sets honoring filters", async () => {
    const s = await startPractice({ domains: ["D5", "D6"], objectives: [], difficulties: ["advanced", "expert"], formats: [], source: "unseen", count: 8, interleave: true });
    expect(s.questions).toHaveLength(8);
    expect(s.questions.every((q) => ["D5", "D6"].includes(q.domainId) && ["advanced", "expert"].includes(q.difficulty))).toBe(true);
    expect(new Set(s.questions.map((q) => q.objectiveId)).size).toBeGreaterThan(1);
  });
  it("searches lessons, rules and notes but not unseen questions", async () => {
    await createNote({ title: "Varargs trap", bodyMd: "Varargs is phase three of overload resolution", tags: ["overloading"] });
    const hits = await search("varargs");
    expect(hits.some((h) => h.type === "note")).toBe(true);
    expect(hits.some((h) => h.type === "lesson")).toBe(true);
    const qHits = hits.filter((h) => h.type === "question").map((h) => h.id);
    const attempted = new Set((await sql<{ question_id: string }>("SELECT DISTINCT question_id FROM question_attempt")).map((r) => r.question_id));
    for (const id of qHits) expect(attempted.has(id)).toBe(true);
  });
  it("toggles bookmarks", async () => {
    expect(await toggleBookmark({ targetType: "lesson", targetId: "oop-overloading" })).toBe(true);
    expect(await toggleBookmark({ targetType: "lesson", targetId: "oop-overloading" })).toBe(false);
  });
  it("exports everything and resets only with the exact phrase", async () => {
    const data = await exportData();
    expect((data.question_attempt as unknown[]).length).toBeGreaterThan(5);
    await expect(resetProgress("yes", false)).rejects.toThrow(/RESET MY PROGRESS/);
    await resetProgress("RESET MY PROGRESS", false);
    const [r] = await sql<{ a: number; q: number }>("SELECT (SELECT count(*) FROM question_attempt)::int a, (SELECT count(*) FROM question)::int q");
    expect(r.a).toBe(0);
    expect(r.q).toBeGreaterThan(250); // content untouched
  });
});

describe("daily review bonus", () => {
  it("pays once per day after 10 due reviews, and only then", async () => {
    const before = await sql<{ n: number }>("SELECT count(*)::int n FROM xp_transaction WHERE source_key LIKE 'daily-review:%'");
    expect(before[0].n).toBe(0);
    const ids = (await sql<{ id: string }>("SELECT id FROM question WHERE type <> 'text' ORDER BY id LIMIT 10")).map((r) => r.id);
    const insert = (qid: string) => sql("INSERT INTO review_log(learner_id, question_id, grade, prev_interval, new_interval, prev_ease, new_ease, was_due) VALUES (1,$1,4,1,3,2.5,2.5,true)", [qid]);
    const xpBefore = await totalXp();
    for (const id of ids.slice(0, 9)) await insert(id);
    await afterLearningEvent(xpBefore);
    expect((await sql<{ n: number }>("SELECT count(*)::int n FROM xp_transaction WHERE source_key LIKE 'daily-review:%'"))[0].n).toBe(0);
    await insert(ids[9]);
    await afterLearningEvent(await totalXp());
    await afterLearningEvent(await totalXp());
    const paid = await sql<{ n: number; amount: number }>("SELECT count(*)::int n, max(amount)::int amount FROM xp_transaction WHERE source_key LIKE 'daily-review:%'");
    expect(paid[0]).toEqual({ n: 1, amount: 25 });
  });
});
