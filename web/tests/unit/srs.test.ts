import { describe, expect, it } from "vitest";
import { gradeAnswer, schedule, RELEARN_STEP_DAYS, MIN_EASE, type SrsState } from "../../src/server/domain/srs.ts";
import { isDue } from "../../src/server/domain/srs.ts";
import { DAY_MS } from "../../src/server/domain/types.ts";

const t0 = new Date("2026-10-01T08:00:00Z");
const at = (days: number) => new Date(t0.getTime() + days * DAY_MS);

describe("gradeAnswer", () => {
  it("grades a confident wrong answer lowest", () => {
    expect(gradeAnswer({ correct: false, confidence: 3, hintUsed: false, timeMs: 1000, estSeconds: 60 })).toBe(0);
    expect(gradeAnswer({ correct: false, confidence: 1, hintUsed: false, timeMs: 1000, estSeconds: 60 })).toBe(1);
  });
  it("does not reward guesses or hinted answers as full recall", () => {
    expect(gradeAnswer({ correct: true, confidence: 1, hintUsed: false, timeMs: 1000, estSeconds: 60 })).toBe(3);
    expect(gradeAnswer({ correct: true, confidence: 3, hintUsed: true, timeMs: 1000, estSeconds: 60 })).toBe(3);
  });
  it("gives 5 only for confident, timely recall", () => {
    expect(gradeAnswer({ correct: true, confidence: 3, hintUsed: false, timeMs: 30_000, estSeconds: 60 })).toBe(5);
    expect(gradeAnswer({ correct: true, confidence: 3, hintUsed: false, timeMs: 200_000, estSeconds: 60 })).toBe(4);
    expect(gradeAnswer({ correct: true, confidence: null, hintUsed: false, timeMs: 10_000, estSeconds: 60 })).toBe(4);
  });
});

describe("schedule", () => {
  it("schedules a first correct answer for a spaced check 1–2 days later", () => {
    const r = schedule(null, 4, t0);
    expect(r.state.intervalDays).toBe(1);
    expect(r.state.dueAt.getTime()).toBe(at(1).getTime());
    expect(r.spacedSuccess).toBe(false);
  });

  it("puts a wrong answer into a 10-minute relearning step and lowers ease", () => {
    const first = schedule(null, 4, t0).state;
    const r = schedule(first, 1, at(1));
    expect(r.state.intervalDays).toBeCloseTo(RELEARN_STEP_DAYS);
    expect(r.state.repetitions).toBe(0);
    expect(r.state.lapses).toBe(1);
    expect(r.state.ease).toBeLessThan(first.ease);
  });

  it("does not grow the interval for an immediate (not due) correct repeat", () => {
    const first = schedule(null, 5, t0).state; // due in 2 days
    const r = schedule(first, 5, new Date(t0.getTime() + 60_000));
    expect(r.wasDue).toBe(false);
    expect(r.spacedSuccess).toBe(false);
    expect(r.state.intervalDays).toBe(first.intervalDays);
    expect(r.state.dueAt.getTime()).toBe(first.dueAt.getTime());
  });

  it("does not let a single correct answer after a lapse jump far ahead (graduates to 1 day)", () => {
    const lapsed = schedule(schedule(null, 4, t0).state, 1, at(1)).state;
    const r = schedule(lapsed, 5, new Date(at(1).getTime() + 15 * 60_000));
    expect(r.state.intervalDays).toBe(1);
  });

  it("rewards long-interval recall more than on-time recall (uses elapsed time)", () => {
    let s: SrsState = schedule(null, 4, t0).state;
    s = schedule(s, 4, at(1)).state; // rep 2 → 3 days
    expect(s.intervalDays).toBe(3);
    const onTime = schedule(s, 4, at(4)).state;
    const late = schedule(s, 4, at(20)).state;
    expect(late.intervalDays).toBeGreaterThan(onTime.intervalDays);
    expect(schedule(s, 4, at(20)).spacedSuccess).toBe(true);
  });

  it("keeps ease within bounds after repeated failures", () => {
    let s: SrsState = schedule(null, 4, t0).state;
    for (let i = 1; i < 20; i++) s = schedule(s, 0, at(i)).state;
    expect(s.ease).toBe(MIN_EASE);
    expect(s.lapses).toBe(19);
  });

  it("caps intervals at 180 days", () => {
    let s: SrsState = schedule(null, 5, t0).state;
    let now = t0;
    for (let i = 0; i < 15; i++) { now = s.dueAt; s = schedule(s, 5, now).state; }
    expect(s.intervalDays).toBeLessThanOrEqual(180);
  });
});

describe("relearning steps get no due tolerance", () => {
  it("a correct answer seconds after a miss is an immediate repeat, not a due review", () => {
    const t0 = new Date("2026-10-13T10:00:00Z");
    const lapsed = schedule(null, 1, t0).state; // wrong: 10-minute relearning step
    const t1 = new Date(t0.getTime() + 20_000);
    const r = schedule(lapsed, 4, t1);
    expect(r.wasDue).toBe(false);
    expect(r.spacedSuccess).toBe(false);
    expect(r.state.intervalDays).toBe(lapsed.intervalDays);
    expect(r.state.successes).toBe(lapsed.successes);
  });
  it("after the relearning step has elapsed, the same answer graduates the item", () => {
    const t0 = new Date("2026-10-13T10:00:00Z");
    const lapsed = schedule(null, 1, t0).state;
    const r = schedule(lapsed, 4, new Date(t0.getTime() + 11 * 60_000));
    expect(r.wasDue).toBe(true);
    expect(r.state.intervalDays).toBe(1);
  });
  it("graduated items keep the 6-hour tolerance", () => {
    const due = new Date("2026-10-14T15:00:00Z");
    expect(isDue({ ease: 2.5, intervalDays: 3, repetitions: 2, successes: 2, lapses: 0, lastReviewedAt: null, dueAt: due }, new Date("2026-10-14T10:00:00Z"))).toBe(true);
  });
});
