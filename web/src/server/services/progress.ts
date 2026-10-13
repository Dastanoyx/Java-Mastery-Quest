// Aggregates persisted evidence into mastery, readiness, streak and level. Everything here is derived from
// the append-only history tables at request time (no cached statistics), except the daily readiness snapshot.
import { query, one, LEARNER_ID, type Db } from "../db.ts";
import { domains as loadDomains, objectives as loadObjectives, examBlueprint, readinessConfig, type DomainRow, type ObjectiveRow } from "../config.ts";
import { masteryByObjective, domainScore, type MasteryEstimate } from "../domain/mastery.ts";
import { computeReadiness, type ReadinessResult, type ReadinessInput, type MockSummary } from "../domain/readiness.ts";
import { computeStreak, type ActivityDay } from "../domain/streak.ts";
import { levelFromXp } from "../domain/xp.ts";
import { currentTitle, earnedTitles } from "../domain/titles.ts";
import { DAY_MS, type AttemptEvidence } from "../domain/types.ts";
import { today, totalXp } from "./learner.ts";

export interface ObjectiveProgress extends ObjectiveRow { mastery: MasteryEstimate; questionsAvailable: number; lessons: number }
export interface DomainProgress extends DomainRow {
  score: number; // 0..1
  objectives: ObjectiveProgress[];
  allMastered: boolean;
  attempted: boolean;
  lessonsTotal: number;
  lessonsCompleted: number;
  questionsAvailable: number;
  dueReviews: number;
  unresolvedMistakes: number;
}

export async function loadEvidence(db?: Db): Promise<AttemptEvidence[]> {
  const rows = await query<{
    question_id: string; objective_id: string; difficulty: AttemptEvidence["difficulty"]; is_correct: boolean; seen_before: boolean;
    days_since_last: number | null; hint_used: boolean; mode: AttemptEvidence["mode"]; answered_at: Date; confidence: number | null; time_ms: number | null;
  }>(
    `SELECT a.question_id, q.objective_id, q.difficulty, a.is_correct, a.seen_before, a.days_since_last, a.hint_used, a.mode,
            a.answered_at, a.confidence, a.time_ms
     FROM question_attempt a JOIN question q ON q.id = a.question_id
     -- Blank exam answers count as wrong in the exam score, but say nothing about knowledge: not evidence.
     WHERE a.learner_id = $1 AND a.response <> '{"options": []}'::jsonb ORDER BY a.answered_at`, [LEARNER_ID], db);
  return rows.map((r) => ({
    questionId: r.question_id, objectiveId: r.objective_id, difficulty: r.difficulty, correct: r.is_correct, seenBefore: r.seen_before,
    daysSinceLast: r.days_since_last, hintUsed: r.hint_used, mode: r.mode, answeredAt: new Date(r.answered_at),
    confidence: (r.confidence as AttemptEvidence["confidence"]) ?? null, timeMs: r.time_ms,
  }));
}

export async function activityDays(db?: Db): Promise<ActivityDay[]> {
  return query<ActivityDay>(`SELECT to_char(day,'YYYY-MM-DD') AS day, questions, lessons, reviews FROM activity_day WHERE learner_id = $1 ORDER BY day`, [LEARNER_ID], db);
}

export interface Progress {
  domains: DomainProgress[];
  objectives: ObjectiveProgress[];
  evidence: AttemptEvidence[];
  readiness: ReadinessResult;
  readinessInput: ReadinessInput;
  streak: ReturnType<typeof computeStreak>;
  xp: number;
  level: ReturnType<typeof levelFromXp>;
  title: string;
  titles: ReturnType<typeof earnedTitles>;
  bestFullMockPercent: number | null;
  today: string;
  timezone: string;
}

export async function computeProgress(db?: Db): Promise<Progress> {
  const now = new Date();
  const [doms, objs, evidence, bp, cfg, xp, t, days] = await Promise.all([
    loadDomains(), loadObjectives(), loadEvidence(db), examBlueprint(), Promise.resolve(readinessConfig()), totalXp(db), today(db), activityDays(db),
  ]);
  const counts = await query<{ objective_id: string; questions: number; lessons: number }>(
    `SELECT o.id AS objective_id,
       (SELECT count(*)::int FROM question q WHERE q.objective_id = o.id AND NOT q.retired) AS questions,
       (SELECT count(*)::int FROM lesson_objective lo JOIN lesson l ON l.id = lo.lesson_id WHERE lo.objective_id = o.id AND NOT l.retired) AS lessons
     FROM exam_objective o`, [], db);
  const countBy = new Map(counts.map((c) => [c.objective_id, c]));
  const thresholds = Object.fromEntries(objs.map((o) => [o.id, o.threshold]));
  const mastery = masteryByObjective(objs.map((o) => o.id), evidence, now, thresholds);
  const objectives: ObjectiveProgress[] = objs.map((o) => ({ ...o, mastery: mastery[o.id], questionsAvailable: countBy.get(o.id)?.questions ?? 0, lessons: countBy.get(o.id)?.lessons ?? 0 }));

  const perDomain = await query<{ domain_id: string; lessons_total: number; lessons_completed: number; due: number; mistakes: number }>(
    `SELECT d.id AS domain_id,
       (SELECT count(*)::int FROM lesson l WHERE l.domain_id = d.id AND NOT l.retired) AS lessons_total,
       (SELECT count(*)::int FROM lesson_progress lp JOIN lesson l ON l.id = lp.lesson_id WHERE lp.learner_id = $1 AND l.domain_id = d.id AND lp.status = 'completed') AS lessons_completed,
       (SELECT count(*)::int FROM review_item r JOIN question q ON q.id = r.question_id JOIN exam_objective o ON o.id = q.objective_id
          WHERE r.learner_id = $1 AND o.domain_id = d.id AND r.due_at <= now() AND NOT r.suspended AND NOT q.retired) AS due,
       (SELECT count(*)::int FROM mistake_record m JOIN question q ON q.id = m.question_id JOIN exam_objective o ON o.id = q.objective_id
          WHERE m.learner_id = $1 AND o.domain_id = d.id AND m.resolved_at IS NULL) AS mistakes
     FROM exam_domain d`, [LEARNER_ID], db);
  const pd = new Map(perDomain.map((p) => [p.domain_id, p]));

  const domains: DomainProgress[] = doms.map((d) => {
    const os = objectives.filter((o) => o.domainId === d.id);
    const p = pd.get(d.id);
    return {
      ...d, objectives: os, score: domainScore(os.map((o) => o.mastery)),
      allMastered: os.length > 0 && os.every((o) => o.mastery.status === "mastered"),
      attempted: os.some((o) => o.mastery.attempts > 0),
      lessonsTotal: p?.lessons_total ?? 0, lessonsCompleted: p?.lessons_completed ?? 0,
      questionsAvailable: os.reduce((s, o) => s + o.questionsAvailable, 0), dueReviews: p?.due ?? 0, unresolvedMistakes: p?.mistakes ?? 0,
    };
  });

  // ── readiness inputs ──
  const scored = evidence.filter((e) => e.mode !== "lesson_check");
  const firsts = scored.filter((e) => !e.seenBefore).slice(-200);
  const hard = firsts.filter((e) => e.difficulty === "advanced" || e.difficulty === "expert");
  const distinctPerObjective = new Map<string, Set<string>>();
  for (const e of evidence) {
    const s = distinctPerObjective.get(e.objectiveId) ?? new Set<string>();
    s.add(e.questionId);
    distinctPerObjective.set(e.objectiveId, s);
  }
  const covered = objs.filter((o) => (distinctPerObjective.get(o.id)?.size ?? 0) >= 3).length;
  const reviews = await one<{ n: number; ok: number }>(
    `SELECT count(*)::int AS n, count(*) FILTER (WHERE grade >= 3)::int AS ok FROM review_log
     WHERE learner_id = $1 AND was_due AND reviewed_at >= now() - ($2 || ' days')::interval`, [LEARNER_ID, String(cfg.retentionWindowDays)], db);
  const mocks = await query<{ id: number; score_percent: number; submitted_at: Date; started_at: Date; duration_seconds: number | null; qids: string[] }>(
    `SELECT e.id, e.score_percent, e.submitted_at, e.started_at, e.duration_seconds,
       ARRAY(SELECT question_id FROM exam_attempt_answer x WHERE x.attempt_id = e.id) AS qids
     FROM exam_attempt e WHERE e.learner_id = $1 AND e.kind = 'full' AND e.submitted_at IS NOT NULL
       AND e.submitted_at >= now() - ($2 || ' days')::interval ORDER BY e.submitted_at DESC`, [LEARNER_ID, String(cfg.recentMockWindowDays)], db);
  const recentFullMocks: MockSummary[] = mocks.map((m) => ({
    attemptId: m.id, percent: m.score_percent, submittedAt: new Date(m.submitted_at), questionIds: m.qids,
    timeUsedRatio: m.duration_seconds ? Math.min(1, (new Date(m.submitted_at).getTime() - new Date(m.started_at).getTime()) / 1000 / m.duration_seconds) : 1,
  }));
  const best = await one<{ best: number | null }>(
    "SELECT max(score_percent) AS best FROM exam_attempt WHERE learner_id = $1 AND kind = 'full' AND submitted_at IS NOT NULL", [LEARNER_ID], db);
  const confident = await one<{ n: number }>(
    "SELECT count(*)::int AS n FROM mistake_record WHERE learner_id = $1 AND high_confidence_wrong AND resolved_at IS NULL", [LEARNER_ID], db);

  const domainScores = Object.fromEntries(domains.map((d) => [d.id, d.score]));
  const readinessInput: ReadinessInput = {
    objectivesTotal: objs.length, objectivesCovered: covered, attempts: evidence.length,
    firstAttempts: firsts.length, firstAttemptsCorrect: firsts.filter((e) => e.correct).length,
    hardFirstAttempts: hard.length, hardFirstAttemptsCorrect: hard.filter((e) => e.correct).length,
    domainScores, dueReviews: reviews?.n ?? 0, dueReviewsCorrect: reviews?.ok ?? 0, recentFullMocks,
    passPercent: bp.passingPercent, readyTargetPercent: bp.readyTargetPercent, unresolvedConfidentMistakes: confident?.n ?? 0,
  };
  const readiness = computeReadiness(readinessInput, cfg);
  const level = levelFromXp(xp);
  const titleCtx = {
    level: level.level, domainScores, domainsMastered: domains.filter((d) => d.allMastered).length,
    bestFullMockPercent: best?.best ?? null, readyTargetPercent: bp.readyTargetPercent, readinessLevel: readiness.level,
  };
  return {
    domains, objectives, evidence, readiness, readinessInput, streak: computeStreak(days, t.day), xp, level,
    title: currentTitle(titleCtx), titles: earnedTitles(titleCtx), bestFullMockPercent: best?.best ?? null, today: t.day, timezone: t.tz,
  };
}

/** Records today's readiness (the trend chart shows what the model said on each day). */
export async function snapshotReadiness(p: Progress, db?: Db) {
  await query(
    `INSERT INTO readiness_snapshot(learner_id, day, index_value, level, preliminary, detail, updated_at) VALUES ($1,$2,$3,$4,$5,$6, now())
     ON CONFLICT (learner_id, day) DO UPDATE SET index_value = EXCLUDED.index_value, level = EXCLUDED.level,
       preliminary = EXCLUDED.preliminary, detail = EXCLUDED.detail, updated_at = now()`,
    [LEARNER_ID, p.today, p.readiness.index, p.readiness.level, p.readiness.preliminary,
      JSON.stringify({ coverage: p.readiness.components.coverage.value, unseen: p.readiness.components.unseenAccuracy.value, attempts: p.readinessInput.attempts })], db);
}

export function daysSince(d: Date | null): number | null {
  return d ? Math.floor((Date.now() - d.getTime()) / DAY_MS) : null;
}
