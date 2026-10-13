// Quests, achievements and the post-event pipeline. Everything is recomputed from persisted events and every
// reward is paid through the idempotent XP ledger, so running this twice never double-pays.
import { query, one, tx, pool, LEARNER_ID, type Db } from "../db.ts";
import { dailyQuests, weeklyQuests, type QuestKind } from "../domain/quests.ts";
import { earnedAchievements, longestRun } from "../domain/achievements.ts";
import { addDays, startOfDay, weekStart } from "../domain/time.ts";
import { XP_RULES, levelFromXp } from "../domain/xp.ts";
import { awardXp, getLearner, today, totalXp } from "./learner.ts";
import { computeProgress, snapshotReadiness, type Progress } from "./progress.ts";
import { nextLessonFor } from "./lessons.ts";
import { GENUINE_ATTEMPT_SQL } from "./exams.ts";

const MILESTONE_MIN_EVIDENCE = 3;

export interface QuestView { id: number; cadence: string; kind: QuestKind; title: string; target: number; progress: number; xp: number; completedAt: Date | null; windowEnd: Date }

async function questProgress(db: Db, kind: QuestKind, params: Record<string, unknown>, start: Date, end: Date): Promise<number> {
  const L = LEARNER_ID;
  const n = async (sql: string, extra: unknown[] = []) => (await one<{ n: number }>(sql, [L, start, end, ...extra], db))?.n ?? 0;
  switch (kind) {
    case "review_due":
    case "weekly_reviews":
      return n("SELECT count(*)::int AS n FROM review_log WHERE learner_id=$1 AND was_due AND reviewed_at >= $2 AND reviewed_at < $3");
    case "answer_new":
      return n("SELECT count(*)::int AS n FROM question_attempt WHERE learner_id=$1 AND NOT seen_before AND answered_at >= $2 AND answered_at < $3");
    case "no_hint_correct":
      return n("SELECT count(*)::int AS n FROM question_attempt WHERE learner_id=$1 AND NOT seen_before AND is_correct AND NOT hint_used AND answered_at >= $2 AND answered_at < $3");
    case "complete_lesson":
      return n("SELECT count(*)::int AS n FROM lesson_progress WHERE learner_id=$1 AND status='completed' AND completed_at >= $2 AND completed_at < $3 AND lesson_id = $4", [params.lessonId]);
    case "weekly_lessons":
      return n("SELECT count(*)::int AS n FROM lesson_progress WHERE learner_id=$1 AND status='completed' AND completed_at >= $2 AND completed_at < $3");
    case "domain_correct":
      return n(`SELECT count(*)::int AS n FROM question_attempt a JOIN question q ON q.id=a.question_id JOIN exam_objective o ON o.id=q.objective_id
                WHERE a.learner_id=$1 AND a.is_correct AND a.answered_at >= $2 AND a.answered_at < $3 AND o.domain_id = $4`, [params.domainId]);
    case "timed_challenge":
      return n(`SELECT count(*)::int AS n FROM exam_attempt WHERE learner_id=$1 AND submitted_at >= $2 AND submitted_at < $3 AND score_total >= $4 AND ${GENUINE_ATTEMPT_SQL}`, [params.minQuestions ?? 10]);
    case "weekly_timed":
      return n(`SELECT count(*)::int AS n FROM exam_attempt WHERE learner_id=$1 AND submitted_at >= $2 AND submitted_at < $3 AND ${GENUINE_ATTEMPT_SQL}`);
    case "fix_mistakes":
      return n(`SELECT count(*)::int AS n FROM question_attempt a JOIN mistake_record m ON m.question_id = a.question_id AND m.learner_id = a.learner_id
                WHERE a.learner_id=$1 AND a.is_correct AND a.answered_at >= $2 AND a.answered_at < $3 AND m.first_wrong_at < a.answered_at`);
    case "pass_exercise":
      return n("SELECT count(DISTINCT exercise_id)::int AS n FROM coding_submission WHERE learner_id=$1 AND passed AND submitted_at >= $2 AND submitted_at < $3");
    case "weekly_active_days":
      return n(`SELECT count(*)::int AS n FROM activity_day WHERE learner_id=$1 AND day >= ($2::timestamptz AT TIME ZONE (SELECT timezone FROM learner WHERE id=$1))::date
                AND day < ($3::timestamptz AT TIME ZONE (SELECT timezone FROM learner WHERE id=$1))::date AND (questions >= 5 OR lessons >= 1 OR reviews >= 5)`);
  }
}

/** Creates today's and this week's quests if they don't exist yet (generated from the learner's current state). */
export async function ensureQuests(): Promise<void> {
  const { day, tz } = await today();
  const dStart = startOfDay(day, tz), dEnd = startOfDay(addDays(day, 1), tz);
  const wDay = weekStart(day);
  const wStart = startOfDay(wDay, tz), wEnd = startOfDay(addDays(wDay, 7), tz);
  const existing = await query<{ cadence: string; window_start: Date }>(
    "SELECT cadence, window_start FROM quest WHERE learner_id = $1 AND window_end > now()", [LEARNER_ID]);
  const haveDaily = existing.some((e) => e.cadence === "daily" && new Date(e.window_start).getTime() === dStart.getTime());
  const haveWeekly = existing.some((e) => e.cadence === "weekly" && new Date(e.window_start).getTime() === wStart.getTime());
  if (haveDaily && haveWeekly) return;

  const learner = await getLearner();
  const due = await one<{ n: number }>("SELECT count(*)::int AS n FROM review_item r JOIN question q ON q.id=r.question_id WHERE r.learner_id=$1 AND r.due_at <= $2 AND NOT r.suspended AND NOT q.retired", [LEARNER_ID, dEnd]);
  const mistakes = await one<{ n: number }>("SELECT count(*)::int AS n FROM mistake_record WHERE learner_id=$1 AND resolved_at IS NULL", [LEARNER_ID]);
  const next = await nextLessonFor();
  const p = await computeProgress();
  const weakest = p.domains.filter((d) => d.attempted).sort((a, b) => a.score - b.score)[0] ?? null;
  const ctx = {
    dueReviews: due?.n ?? 0, unresolvedMistakes: mistakes?.n ?? 0,
    nextLesson: next ? { id: next.id, title: next.title } : null,
    weakestDomain: weakest ? { id: weakest.id, short: weakest.short } : null,
    dailyMinutes: learner.dailyMinutes, exerciseAvailable: true, studyDaysPerWeek: learner.studyDays.length,
  };
  await tx(async (c) => {
    const ins = async (cadence: string, defs: ReturnType<typeof dailyQuests>, s: Date, e: Date) => {
      for (const q of defs) {
        await query(
          `INSERT INTO quest(learner_id, cadence, kind, title, params, target, xp_reward, window_start, window_end)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT DO NOTHING`,
          [LEARNER_ID, cadence, q.kind, q.title, JSON.stringify(q.params), q.target, q.xp, s, e], c);
      }
    };
    if (!haveDaily) await ins("daily", dailyQuests(ctx), dStart, dEnd);
    if (!haveWeekly) await ins("weekly", weeklyQuests(ctx), wStart, wEnd);
  });
}

export async function currentQuests(db?: Db): Promise<QuestView[]> {
  const rows = await query<{ id: number; cadence: string; kind: QuestKind; title: string; target: number; xp_reward: number; params: Record<string, unknown>; window_start: Date; window_end: Date; completed_at: Date | null }>(
    "SELECT * FROM quest WHERE learner_id = $1 AND window_start <= now() AND window_end > now() ORDER BY cadence, id", [LEARNER_ID], db);
  const out: QuestView[] = [];
  for (const r of rows) {
    const progress = await questProgress(db ?? pool(), r.kind, r.params, new Date(r.window_start), new Date(r.window_end));
    out.push({ id: r.id, cadence: r.cadence, kind: r.kind, title: r.title, target: r.target, progress: Math.min(progress, r.target), xp: r.xp_reward, completedAt: r.completed_at, windowEnd: new Date(r.window_end) });
  }
  return out;
}

export interface EventRewards {
  xpGained: number;
  questsCompleted: { title: string; xp: number }[];
  achievementsUnlocked: { id: string; title: string; xp: number }[];
  levelUp: { from: number; to: number } | null;
}

/**
 * Post-event pipeline, run after any learning event has committed:
 * quest completion → domain milestones → achievements → readiness snapshot.
 */
export async function afterLearningEvent(xpBefore: number): Promise<EventRewards> {
  const rewards: EventRewards = { xpGained: 0, questsCompleted: [], achievementsUnlocked: [], levelUp: null };
  await ensureQuests();
  const quests = await currentQuests();
  for (const q of quests) {
    if (!q.completedAt && q.progress >= q.target) {
      await tx(async (c) => {
        const upd = await query("UPDATE quest SET completed_at = now() WHERE id = $1 AND completed_at IS NULL RETURNING id", [q.id], c);
        if (upd.length) {
          const paid = await awardXp(c, `quest:${q.id}`, q.xp, `Quest completed: ${q.title}`, { questId: q.id });
          rewards.questsCompleted.push({ title: q.title, xp: paid });
        }
      });
    }
  }
  // Daily review bonus: once per study day, after at least 10 due reviews (the day follows the learner's time zone).
  {
    const { day, tz } = await today();
    const r = await one<{ n: number }>("SELECT count(*)::int AS n FROM review_log WHERE learner_id = $1 AND was_due AND reviewed_at >= $2 AND reviewed_at < $3",
      [LEARNER_ID, startOfDay(day, tz), startOfDay(addDays(day, 1), tz)]);
    if ((r?.n ?? 0) >= 10) await tx((c) => awardXp(c, `daily-review:${day}`, XP_RULES.dailyReviewSession, "Daily review session (10+ due reviews)", { day }));
  }
  const p = await computeProgress();
  // Domain mastery milestones (first time a domain crosses 50/70/85 %).
  for (const d of p.domains) {
    // Milestones need real evidence on every objective of the domain; a few lucky answers on a small prior
    // must not pay out (each objective needs ≥ MILESTONE_MIN_EVIDENCE of weighted attempts).
    if (!d.objectives.every((o) => o.mastery.evidenceWeight >= MILESTONE_MIN_EVIDENCE)) continue;
    for (const m of XP_RULES.domainMilestones) {
      if (d.score >= m.at) await tx((c) => awardXp(c, `domain-milestone:${d.id}:${m.at}`, m.xp, `${d.short} reached ${Math.round(m.at * 100)} % mastery`, { domainId: d.id }));
    }
  }
  rewards.achievementsUnlocked = await evaluateAchievements(p);
  await snapshotReadiness(p);
  const xpAfter = await totalXp();
  rewards.xpGained = xpAfter - xpBefore;
  const from = levelFromXp(xpBefore).level, to = levelFromXp(xpAfter).level;
  if (to > from) rewards.levelUp = { from, to };
  return rewards;
}

export async function evaluateAchievements(p: Progress) {
  const L = LEARNER_ID;
  const c = async (sql: string) => (await one<{ n: number }>(sql, [L]))?.n ?? 0;
  const firstAttempts = await query<{ is_correct: boolean; seen_before: boolean; hint_used: boolean }>(
    "SELECT is_correct, seen_before, hint_used FROM question_attempt WHERE learner_id = $1 AND NOT seen_before ORDER BY answered_at", [L]);
  const stats = {
    lessonsCompleted: await c("SELECT count(*)::int AS n FROM lesson_progress WHERE learner_id=$1 AND status='completed'"),
    exercisesPassed: await c("SELECT count(DISTINCT exercise_id)::int AS n FROM coding_submission WHERE learner_id=$1 AND passed"),
    predictionsWritten: await c("SELECT count(DISTINCT (lesson_id, ref))::int AS n FROM lesson_event WHERE learner_id=$1 AND kind='prediction'"),
    bestStreak: p.streak.best,
    longestNoHintUnseenCorrectRun: longestRun(firstAttempts.map((a) => ({ correct: a.is_correct, seenBefore: a.seen_before, hintUsed: a.hint_used }))),
    dueReviewsCompleted: await c("SELECT count(*)::int AS n FROM review_log WHERE learner_id=$1 AND was_due"),
    mistakesResolved: await c("SELECT count(*)::int AS n FROM mistake_record WHERE learner_id=$1 AND resolved_at IS NOT NULL"),
    bossesDefeated: await c("SELECT count(*)::int AS n FROM exam_attempt WHERE learner_id=$1 AND kind='boss' AND passed"),
    domainsFullyMastered: p.domains.filter((d) => d.allMastered).length,
    objectivesTotal: p.objectives.length,
    objectivesWith3Questions: p.readinessInput.objectivesCovered,
    fullMocksCompleted: await c(`SELECT count(*)::int AS n FROM exam_attempt WHERE learner_id=$1 AND kind='full' AND submitted_at IS NOT NULL AND ${GENUINE_ATTEMPT_SQL}`),
    fullMocksPassed: await c("SELECT count(*)::int AS n FROM exam_attempt WHERE learner_id=$1 AND kind='full' AND passed"),
    readinessLevel: p.readiness.level,
  };
  const earned = earnedAchievements(stats);
  const unlocked: { id: string; title: string; xp: number }[] = [];
  for (const id of earned) {
    await tx(async (cl) => {
      const ins = await query<{ achievement_id: string }>(
        `INSERT INTO learner_achievement(learner_id, achievement_id, evidence) SELECT $1, a.id, $3 FROM achievement a WHERE a.id = $2
         ON CONFLICT DO NOTHING RETURNING achievement_id`, [L, id, JSON.stringify(stats)], cl);
      if (ins.length) {
        const a = await one<{ title: string; xp_reward: number }>("SELECT title, xp_reward FROM achievement WHERE id = $1", [id], cl);
        const paid = await awardXp(cl, `achievement:${id}`, a?.xp_reward ?? 0, `Achievement: ${a?.title}`, { achievementId: id });
        unlocked.push({ id, title: a?.title ?? id, xp: paid });
      }
    });
  }
  return unlocked;
}
