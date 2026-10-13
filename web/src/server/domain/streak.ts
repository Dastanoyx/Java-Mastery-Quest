// Study streaks. A day counts when the learner did meaningful work (see `isActiveDay`).
// Missing today does not break the streak until the day is over (no shaming before midnight).
import { addDays } from "./time.ts";

export interface ActivityDay { day: string; questions: number; lessons: number; reviews: number }

export const isActiveDay = (d: ActivityDay) => d.questions >= 5 || d.lessons >= 1 || d.reviews >= 5;

export function computeStreak(days: ActivityDay[], today: string) {
  const active = new Set(days.filter(isActiveDay).map((d) => d.day));
  let current = 0;
  let cursor = active.has(today) ? today : addDays(today, -1);
  while (active.has(cursor)) { current++; cursor = addDays(cursor, -1); }
  let best = 0;
  const sorted = [...active].sort();
  let run = 0;
  let prev: string | null = null;
  for (const d of sorted) {
    run = prev && addDays(prev, 1) === d ? run + 1 : 1;
    best = Math.max(best, run);
    prev = d;
  }
  const lastActive = sorted[sorted.length - 1] ?? null;
  return { current, best, todayActive: active.has(today), lastActive };
}
