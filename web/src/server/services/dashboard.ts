import { query, one, LEARNER_ID } from "../db.ts";
import { planDay } from "../domain/planner.ts";
import { getLearner } from "./learner.ts";
import { computeProgress } from "./progress.ts";
import { dueCounts } from "./practice.ts";
import { ensureQuests, currentQuests } from "./gamification.ts";
import { nextLessonFor } from "./lessons.ts";

export async function dashboardData() {
  await ensureQuests();
  const [learner, progress, due, quests, next] = await Promise.all([getLearner(), computeProgress(), dueCounts(), currentQuests(), nextLessonFor()]);
  const lastActivity = await one<{ at: Date | null }>(
    `SELECT greatest((SELECT max(answered_at) FROM question_attempt WHERE learner_id = $1), (SELECT max(created_at) FROM lesson_event WHERE learner_id = $1)) AS at`, [LEARNER_ID]);
  const daysSince = lastActivity?.at ? Math.floor((Date.now() - new Date(lastActivity.at).getTime()) / 86_400_000) : null;
  const weakObjectives = progress.objectives.filter((o) => o.mastery.evidenceWeight > 0 && o.mastery.status !== "mastered")
    .sort((a, b) => (a.mastery.score ?? 0) - (b.mastery.score ?? 0))
    .map((o) => ({ id: o.id, domainId: o.domainId, title: o.title, score: o.mastery.score, evidenceWeight: o.mastery.evidenceWeight, status: o.mastery.status }));
  const repeated = await query<{ objective_id: string; title: string; lesson_id: string | null; lesson_title: string | null; n: number }>(
    `SELECT q.objective_id, o.title, q.lesson_id, l.title AS lesson_title, sum(m.wrong_count)::int AS n
     FROM mistake_record m JOIN question q ON q.id = m.question_id JOIN exam_objective o ON o.id = q.objective_id LEFT JOIN lesson l ON l.id = q.lesson_id
     WHERE m.learner_id = $1 AND m.resolved_at IS NULL AND m.wrong_count >= 2
     GROUP BY q.objective_id, o.title, q.lesson_id, l.title ORDER BY n DESC LIMIT 3`, [LEARNER_ID]);
  const exercise = await one<{ id: string; title: string }>(
    `SELECT e.id, e.title FROM coding_exercise e
     WHERE NOT e.retired AND NOT EXISTS (SELECT 1 FROM coding_submission s WHERE s.learner_id = $1 AND s.exercise_id = e.id AND s.passed)
       AND (e.lesson_id IS NULL OR EXISTS (SELECT 1 FROM lesson_progress p WHERE p.learner_id = $1 AND p.lesson_id = e.lesson_id))
     ORDER BY e.id LIMIT 1`, [LEARNER_ID]);
  const hasCompleted = progress.domains.some((d) => d.lessonsCompleted > 0);
  const plan = planDay({
    dailyMinutes: learner.dailyMinutes, dueReviews: due.due, overdueReviews: due.overdue, daysSinceLastStudy: daysSince,
    nextLesson: next ? { id: next.id, title: next.title, minutes: next.minutes, domainId: next.domainId, inProgress: next.status === "in_progress" } : null,
    weakObjectives, repeatedMistakeObjectives: repeated.map((r) => ({ objectiveId: r.objective_id, title: r.title, lessonId: r.lesson_id, lessonTitle: r.lesson_title, count: r.n })),
    exercise: exercise ?? null, modePreference: learner.modePreference, hasCompletedAnyLesson: hasCompleted,
  });
  const recentXp = await query<{ amount: number; reason: string; created_at: Date; detail: Record<string, unknown> }>(
    "SELECT amount, reason, created_at, detail FROM xp_transaction WHERE learner_id = $1 ORDER BY created_at DESC, id DESC LIMIT 8", [LEARNER_ID]);
  const recentMistakes = await query<{ question_id: string; prompt: string; objective_id: string; category: string | null; wrong_count: number; last_wrong_at: Date; high: boolean }>(
    `SELECT m.question_id, left(q.prompt_md, 120) AS prompt, q.objective_id, m.category, m.wrong_count, m.last_wrong_at, m.high_confidence_wrong AS high
     FROM mistake_record m JOIN question q ON q.id = m.question_id WHERE m.learner_id = $1 AND m.resolved_at IS NULL
     ORDER BY m.high_confidence_wrong DESC, m.last_wrong_at DESC LIMIT 4`, [LEARNER_ID]);
  const trend = await query<{ day: string; index_value: number; level: string; preliminary: boolean }>(
    "SELECT to_char(day,'YYYY-MM-DD') AS day, index_value, level, preliminary FROM readiness_snapshot WHERE learner_id = $1 ORDER BY day DESC LIMIT 60", [LEARNER_ID]);
  const openExam = await one<{ id: number; title: string; deadline_at: Date }>(
    "SELECT id, title, deadline_at FROM exam_attempt WHERE learner_id = $1 AND submitted_at IS NULL AND deadline_at > now() ORDER BY started_at DESC LIMIT 1", [LEARNER_ID]);
  const lastLesson = learner.lastLessonId ? await one<{ id: string; title: string; status: string | null }>(
    `SELECT l.id, l.title, p.status FROM lesson l LEFT JOIN lesson_progress p ON p.lesson_id = l.id AND p.learner_id = $1 WHERE l.id = $2`, [LEARNER_ID, learner.lastLessonId]) : null;
  const totals = await one<{ lessons_total: number; lessons_done: number; questions_total: number; questions_seen: number }>(
    `SELECT (SELECT count(*)::int FROM lesson WHERE NOT retired) AS lessons_total,
            (SELECT count(*)::int FROM lesson_progress WHERE learner_id = $1 AND status = 'completed') AS lessons_done,
            (SELECT count(*)::int FROM question WHERE NOT retired) AS questions_total,
            (SELECT count(DISTINCT question_id)::int FROM question_attempt WHERE learner_id = $1) AS questions_seen`, [LEARNER_ID]);
  return { learner, progress, due, quests, plan, next, recentXp, recentMistakes, trend: trend.reverse(), openExam, lastLesson, totals: totals!, daysSince };
}
