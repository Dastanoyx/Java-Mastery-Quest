// Progress & Readiness analytics. Every number is aggregated from the append-only history tables at request
// time; nothing here is stored or estimated.
import { query, LEARNER_ID } from "../db.ts";
import { XP_RULES } from "../domain/xp.ts";

export interface WeekRow { week: string; firstN: number; firstOk: number; repeatN: number; repeatOk: number; reviewsN: number; reviewsOk: number }

export async function analytics() {
  const L = [LEARNER_ID];
  const [weeks, reviewWeeks, byDifficulty, byMode, timing, heat, xp, achievements, trend, totals] = await Promise.all([
    query<{ week: string; first_n: number; first_ok: number; repeat_n: number; repeat_ok: number }>(
      `SELECT to_char(date_trunc('week', answered_at AT TIME ZONE l.timezone), 'YYYY-MM-DD') AS week,
         count(*) FILTER (WHERE NOT seen_before AND mode <> 'lesson_check')::int AS first_n,
         count(*) FILTER (WHERE NOT seen_before AND mode <> 'lesson_check' AND is_correct)::int AS first_ok,
         count(*) FILTER (WHERE seen_before)::int AS repeat_n, count(*) FILTER (WHERE seen_before AND is_correct)::int AS repeat_ok
       FROM question_attempt a JOIN learner l ON l.id = a.learner_id
       WHERE a.learner_id = $1 AND answered_at >= now() - interval '16 weeks' GROUP BY 1 ORDER BY 1`, L),
    query<{ week: string; n: number; ok: number }>(
      `SELECT to_char(date_trunc('week', reviewed_at AT TIME ZONE l.timezone), 'YYYY-MM-DD') AS week, count(*)::int AS n, count(*) FILTER (WHERE grade >= 3)::int AS ok
       FROM review_log r JOIN learner l ON l.id = r.learner_id WHERE r.learner_id = $1 AND was_due AND reviewed_at >= now() - interval '16 weeks' GROUP BY 1 ORDER BY 1`, L),
    query<{ difficulty: string; n: number; ok: number }>(
      `SELECT q.difficulty, count(*)::int AS n, count(*) FILTER (WHERE a.is_correct)::int AS ok FROM question_attempt a JOIN question q ON q.id = a.question_id
       WHERE a.learner_id = $1 AND NOT a.seen_before AND a.mode <> 'lesson_check' GROUP BY 1`, L),
    query<{ mode: string; n: number; ok: number }>(
      "SELECT mode, count(*)::int AS n, count(*) FILTER (WHERE is_correct)::int AS ok FROM question_attempt WHERE learner_id = $1 GROUP BY 1 ORDER BY 2 DESC", L),
    query<{ mode: string; avg_ms: number; est_ms: number; n: number }>(
      `SELECT a.mode, avg(a.time_ms)::int AS avg_ms, avg(q.est_seconds * 1000)::int AS est_ms, count(*)::int AS n
       FROM question_attempt a JOIN question q ON q.id = a.question_id
       WHERE a.learner_id = $1 AND a.time_ms IS NOT NULL AND a.time_ms BETWEEN 1000 AND 1800000 GROUP BY 1`, L),
    query<{ day: string; questions: number; lessons: number; reviews: number }>(
      "SELECT to_char(day,'YYYY-MM-DD') AS day, questions, lessons, reviews FROM activity_day WHERE learner_id = $1 AND day >= current_date - 111 ORDER BY day", L),
    query<{ amount: number; reason: string; created_at: Date }>("SELECT amount, reason, created_at FROM xp_transaction WHERE learner_id = $1 ORDER BY created_at DESC, id DESC LIMIT 40", L),
    query<{ id: string; title: string; description: string; icon: string; xp_reward: number; earned_at: Date | null }>(
      `SELECT a.id, a.title, a.description, a.icon, a.xp_reward, la.earned_at FROM achievement a
       LEFT JOIN learner_achievement la ON la.achievement_id = a.id AND la.learner_id = $1 ORDER BY la.earned_at IS NULL, la.earned_at, a.id`, L),
    query<{ day: string; index_value: number; level: string; preliminary: boolean }>(
      "SELECT to_char(day,'YYYY-MM-DD') AS day, index_value, level, preliminary FROM readiness_snapshot WHERE learner_id = $1 ORDER BY day DESC LIMIT 90", L),
    query<{ attempts: number; correct: number; questions_seen: number; minutes: number }>(
      `SELECT count(*)::int AS attempts, count(*) FILTER (WHERE is_correct)::int AS correct, count(DISTINCT question_id)::int AS questions_seen,
         COALESCE((SELECT sum(active_seconds) FROM activity_day WHERE learner_id = $1), 0)::int / 60 AS minutes
       FROM question_attempt WHERE learner_id = $1`, L),
  ]);
  const rw = new Map(reviewWeeks.map((r) => [r.week, r]));
  const allWeeks = [...new Set([...weeks.map((w) => w.week), ...reviewWeeks.map((r) => r.week)])].sort();
  const weekRows: WeekRow[] = allWeeks.map((wk) => {
    const w = weeks.find((x) => x.week === wk);
    const r = rw.get(wk);
    return { week: wk, firstN: w?.first_n ?? 0, firstOk: w?.first_ok ?? 0, repeatN: w?.repeat_n ?? 0, repeatOk: w?.repeat_ok ?? 0, reviewsN: r?.n ?? 0, reviewsOk: r?.ok ?? 0 };
  });
  return { weeks: weekRows, byDifficulty, byMode, timing, heat, xp, achievements, trend: trend.reverse(), totals: totals[0], xpRules: XP_RULES };
}
export type Analytics = Awaited<ReturnType<typeof analytics>>;
