// Lightweight numbers for the app shell (rendered on every page; avoids the full progress computation).
import { one, LEARNER_ID } from "../db.ts";
import { levelFromXp } from "../domain/xp.ts";
import { computeStreak } from "../domain/streak.ts";
import { DUE_SQL } from "../domain/srs.ts";
import { activityDays } from "./progress.ts";
import { getLearner, today } from "./learner.ts";

export async function shellStats() {
  const [learner, xpRow, dueRow, days, t, open] = await Promise.all([
    getLearner(),
    one<{ xp: number }>("SELECT COALESCE(SUM(amount),0)::int AS xp FROM xp_transaction WHERE learner_id = $1", [LEARNER_ID]),
    one<{ n: number }>(`SELECT count(*)::int AS n FROM review_item r JOIN question q ON q.id = r.question_id WHERE r.learner_id = $1 AND NOT r.suspended AND NOT q.retired AND ${DUE_SQL}`, [LEARNER_ID]),
    activityDays(),
    today(),
    one<{ n: number }>("SELECT count(*)::int AS n FROM mistake_record WHERE learner_id = $1 AND resolved_at IS NULL", [LEARNER_ID]),
  ]);
  const xp = xpRow?.xp ?? 0;
  return {
    learner: { displayName: learner.displayName, theme: learner.theme, reducedMotion: learner.reducedMotion, sidebarCollapsed: learner.sidebarCollapsed, onboarded: Boolean(learner.onboardedAt) },
    xp, level: levelFromXp(xp), due: dueRow?.n ?? 0, openMistakes: open?.n ?? 0, streak: computeStreak(days, t.day),
  };
}
export type ShellStats = Awaited<ReturnType<typeof shellStats>>;
