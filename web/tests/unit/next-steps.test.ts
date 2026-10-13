import { describe, it, expect } from "vitest";
import { nextSteps, type NextStepInput } from "../../src/server/domain/planner.ts";

const obj = (objectiveId: string, correct: number, total: number, lesson: string | null = `Lesson ${objectiveId}`) =>
  ({ objectiveId, title: objectiveId, correct, total, lessonId: lesson ? lesson.toLowerCase() : null, lessonTitle: lesson });

const base: NextStepInput = { sessionKind: "exam", objectiveResults: [], confidentWrong: 0, dueReviews: 0 };

describe("nextSteps (post-session recommendations)", () => {
  it("names the lesson for an objective missed repeatedly", () => {
    const s = nextSteps({ ...base, objectiveResults: [obj("D3.3", 0, 3), obj("D1.1", 2, 2)] });
    expect(s[0]).toMatch(/Revisit “Lesson D3.3” — 0\/3 on D3.3/);
  });

  it("does not stay silent on a poor short exam where every objective has one question", () => {
    const s = nextSteps({
      ...base,
      objectiveResults: [obj("D6.1", 0, 1), obj("D10.1", 0, 1), obj("D3.7", 0, 1), obj("D1.3", 1, 1)],
      domainResults: [{ id: "D3", short: "Object-Oriented Java", correct: 0, total: 3 }, { id: "D1", short: "Values", correct: 1, total: 2 }],
      unanswered: 4, percent: 7, passPercent: 68,
    });
    expect(s.some((x) => x.includes("Object-Oriented Java (D3)"))).toBe(true);
    expect(s.some((x) => x.startsWith("Single misses"))).toBe(true);
    expect(s.some((x) => x.includes("4 questions were left unanswered"))).toBe(true);
    expect(s).not.toContain("Take a short mixed-domain assessment to test transfer to unseen questions.");
  });

  it("frames single misses as weak evidence, not a diagnosis", () => {
    const s = nextSteps({ ...base, objectiveResults: [obj("D9.2", 0, 1)] });
    expect(s.join(" ")).toMatch(/hints, not verdicts/);
  });

  it("flags high-confidence errors and due reviews", () => {
    const s = nextSteps({ ...base, confidentWrong: 2, dueReviews: 5 });
    expect(s.some((x) => x.includes("2 answers were wrong with high confidence"))).toBe(true);
    expect(s.some((x) => x.includes("5 review items are due"))).toBe(true);
  });

  it("tells a strong learner not to re-drill solid objectives", () => {
    const s = nextSteps({ ...base, objectiveResults: [obj("D5.1", 3, 3)], percent: 100, passPercent: 68 });
    expect(s[0]).toMatch(/Solid on D5.1/);
  });

  it("falls back to a transfer test when there is no signal at all", () => {
    expect(nextSteps(base)).toEqual(["Take a short mixed-domain assessment to test transfer to unseen questions."]);
  });
});
