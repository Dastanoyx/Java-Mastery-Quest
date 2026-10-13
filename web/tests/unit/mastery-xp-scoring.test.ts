import { describe, expect, it } from "vitest";
import { estimateMastery, attemptWeight } from "../../src/server/domain/mastery.ts";
import { xpForAnswer, levelFromXp, xpForLevel, xpForMock } from "../../src/server/domain/xp.ts";
import { isCorrect, validateResponse, normalizeText } from "../../src/server/domain/scoring.ts";
import { classifyMistake } from "../../src/server/domain/mistakes.ts";
import type { AttemptEvidence } from "../../src/server/domain/types.ts";

const now = new Date("2026-10-10T12:00:00Z");
const ev = (o: Partial<AttemptEvidence>): AttemptEvidence => ({
  questionId: "Q1", objectiveId: "D3.3", difficulty: "intermediate", correct: true, seenBefore: false, daysSinceLast: null,
  hintUsed: false, mode: "practice", answeredAt: now, confidence: null, timeMs: 30_000, ...o,
});

describe("mastery", () => {
  it("reports no evidence as 'none' rather than 0 %", () => {
    expect(estimateMastery([], now)).toMatchObject({ score: null, status: "none" });
  });
  it("weights immediate repeats far below unseen or spaced attempts", () => {
    expect(attemptWeight(ev({ seenBefore: true, daysSinceLast: 0.01 }), now)).toBeCloseTo(0.25);
    expect(attemptWeight(ev({ seenBefore: true, daysSinceLast: 3 }), now)).toBeCloseTo(1);
    expect(attemptWeight(ev({ hintUsed: true }), now)).toBeCloseTo(0.5);
  });
  it("does not call grinding one question 'mastered'", () => {
    const grind = Array.from({ length: 30 }, (_, i) => ev({ questionId: "Q1", seenBefore: i > 0, daysSinceLast: i > 0 ? 0.001 : null }));
    const m = estimateMastery(grind, now);
    expect(m.distinctQuestions).toBe(1);
    expect(m.status).not.toBe("mastered");
  });
  it("requires breadth and a spaced success to reach 'mastered'", () => {
    const unseen = ["A", "B", "C", "D", "E", "F"].map((q) => ev({ questionId: q }));
    expect(estimateMastery(unseen, now).status).not.toBe("mastered"); // no spaced success yet
    const withSpaced = [...unseen, ev({ questionId: "A", seenBefore: true, daysSinceLast: 2 })];
    expect(estimateMastery(withSpaced, now).status).toBe("mastered");
  });
  it("decays old evidence", () => {
    const old = new Date(now.getTime() - 90 * 86_400_000);
    expect(attemptWeight(ev({ answeredAt: old }), now)).toBeCloseTo(0.25, 2);
  });
});

describe("xp", () => {
  it("pays for new correct answers by difficulty, nothing for wrong answers", () => {
    expect(xpForAnswer({ difficulty: "expert", correct: true, seenBefore: false, spacedSuccess: false, hintUsed: false, mode: "practice" })?.amount).toBe(30);
    expect(xpForAnswer({ difficulty: "expert", correct: false, seenBefore: false, spacedSuccess: false, hintUsed: false, mode: "practice" })).toBeNull();
  });
  it("pays nothing for immediate repeats (anti-grinding)", () => {
    expect(xpForAnswer({ difficulty: "foundation", correct: true, seenBefore: true, spacedSuccess: false, hintUsed: false, mode: "practice" })).toBeNull();
  });
  it("pays for spaced retrieval and halves hinted answers", () => {
    expect(xpForAnswer({ difficulty: "advanced", correct: true, seenBefore: true, spacedSuccess: true, hintUsed: false, mode: "review" })?.amount).toBe(8);
    expect(xpForAnswer({ difficulty: "advanced", correct: true, seenBefore: false, spacedSuccess: false, hintUsed: true, mode: "practice" })?.amount).toBe(10);
  });
  it("does not pay per-answer XP inside exams", () => {
    expect(xpForAnswer({ difficulty: "expert", correct: true, seenBefore: false, spacedSuccess: false, hintUsed: false, mode: "exam" })).toBeNull();
  });
  it("computes levels monotonically", () => {
    expect(levelFromXp(0).level).toBe(1);
    expect(levelFromXp(xpForLevel(2)).level).toBe(2);
    expect(levelFromXp(xpForLevel(2) - 1).level).toBe(1);
    for (let l = 2; l < 40; l++) expect(xpForLevel(l + 1)).toBeGreaterThan(xpForLevel(l));
  });
  it("adds a score bonus only for full mocks above the pass mark", () => {
    expect(xpForMock("full", 80, 68)).toBe(100 + 24);
    expect(xpForMock("full", 50, 68)).toBe(100);
    expect(xpForMock("short", 100, 68)).toBe(30);
  });
});

describe("scoring", () => {
  it("scores single and multi exactly (no partial credit)", () => {
    expect(isCorrect("single", { options: ["b"] }, { options: ["b"] })).toBe(true);
    expect(isCorrect("single", { options: ["b"] }, { options: ["a", "b"] })).toBe(false);
    expect(isCorrect("multi", { options: ["a", "c"] }, { options: ["c", "a"] })).toBe(true);
    expect(isCorrect("multi", { options: ["a", "c"] }, { options: ["a"] })).toBe(false);
    expect(isCorrect("multi", { options: ["a", "c"] }, { options: ["a", "c", "d"] })).toBe(false);
    expect(isCorrect("multi", { options: ["a", "c"] }, null)).toBe(false);
  });
  it("normalises whitespace and case for text answers", () => {
    expect(isCorrect("text", { text: ["Hello World"] }, { text: "  hello   world " })).toBe(true);
    expect(isCorrect("text", { text: ["a\nb"] }, { text: "a \r\n b" })).toBe(true);
    expect(isCorrect("text", { text: ["x"] }, { text: "" })).toBe(false);
    expect(normalizeText("1 234")).toBe("1 234");
  });
  it("validates response shape", () => {
    expect(validateResponse("single", ["a", "b"], { options: ["a", "b"] })).toMatch(/exactly one/);
    expect(validateResponse("multi", ["a", "b"], { options: ["z"] })).toMatch(/unknown/);
    expect(validateResponse("multi", ["a", "b"], { options: [] })).toMatch(/at least one/);
    expect(validateResponse("text", [], { text: 4 })).toMatch(/text/);
    expect(validateResponse("single", ["a"], { options: ["a"] })).toBeNull();
  });
});

describe("mistake classification", () => {
  const base = { format: "concept", mode: "practice" as const, confidence: null, timeMs: 40_000, estSeconds: 60, previousWrongCount: 0, chosenTexts: ["x"], correctTexts: ["y"] };
  it("detects repeated misconceptions first", () => expect(classifyMistake({ ...base, previousWrongCount: 1 })).toBe("repeated_misconception"));
  it("detects compile-vs-runtime confusion", () =>
    expect(classifyMistake({ ...base, chosenTexts: ["Compilation fails at line 5"], correctTexts: ["A ClassCastException is thrown"] })).toBe("compile_vs_runtime"));
  it("detects time pressure only in timed modes", () => {
    expect(classifyMistake({ ...base, mode: "exam", timeMs: 200_000 })).toBe("time_pressure");
    expect(classifyMistake({ ...base, mode: "practice", timeMs: 200_000 })).toBe("knowledge_gap");
  });
  it("flags very fast wrong answers as careless", () => expect(classifyMistake({ ...base, timeMs: 3000 })).toBe("careless"));
  it("flags output predictions", () => expect(classifyMistake({ ...base, format: "predict-output" })).toBe("output_prediction"));
  it("flags confident wrong answers as rule confusion", () => expect(classifyMistake({ ...base, confidence: 3 })).toBe("rule_confusion"));
});
