import type pg from "pg";
import { query, one, tx, LEARNER_ID } from "../db.ts";
import { estimateMastery } from "../domain/mastery.ts";
import { XP_RULES } from "../domain/xp.ts";
import { awardXp, bumpActivity } from "./learner.ts";
import { getFullQuestions, toPublic, type PublicQuestion, type Feedback } from "./questions.ts";
import { recordAnswer } from "./answers.ts";
import { loadEvidence } from "./progress.ts";
import type { Response } from "../domain/scoring.ts";
import type { Confidence } from "../domain/types.ts";
import { NotFound, BadRequest } from "../errors.ts";
import { assertNotInOpenExam, lockedQuestionIds } from "./examLock.ts";

export const MASTERY_PASS = 0.7;

export type LessonStatus = "locked" | "available" | "in_progress" | "completed" | "needs_review" | "mastered";

export interface LessonCard {
  id: string; domainId: string; ordinal: number; title: string; summary: string; minutes: number; supplementary: boolean;
  objectives: string[]; prerequisites: { id: string; title: string; completed: boolean }[];
  status: LessonStatus; masteryScore: number | null; evidenceScore: number | null;
  checks: number; masteryQuestions: number; predicts: number; dueReviews: number; unresolvedMistakes: number;
  completedAt: Date | null; startedAt: Date | null;
}

export async function listLessons(domainId?: string): Promise<LessonCard[]> {
  const rows = await query<{
    id: string; domain_id: string; ordinal: number; title: string; summary: string; minutes: number; supplementary: boolean;
    objectives: string[]; prereqs: { id: string; title: string }[]; status: string | null; mastery_score: number | null;
    completed_at: Date | null; started_at: Date | null; checks: number; mastery_n: number; predicts_total: number; due: number; mistakes: number;
  }>(
    `SELECT l.id, l.domain_id, l.ordinal, l.title, l.summary, l.minutes, l.supplementary, l.predicts_total,
       ARRAY(SELECT objective_id FROM lesson_objective WHERE lesson_id = l.id ORDER BY objective_id) AS objectives,
       COALESCE((SELECT json_agg(json_build_object('id', p.id, 'title', p.title)) FROM lesson_prerequisite lp JOIN lesson p ON p.id = lp.prerequisite_id WHERE lp.lesson_id = l.id), '[]') AS prereqs,
       pr.status, pr.mastery_score, pr.completed_at, pr.started_at,
       (SELECT count(*)::int FROM lesson_question WHERE lesson_id = l.id AND role = 'check') AS checks,
       (SELECT count(*)::int FROM lesson_question WHERE lesson_id = l.id AND role = 'mastery') AS mastery_n,
       (SELECT count(*)::int FROM review_item r JOIN question q ON q.id = r.question_id WHERE r.learner_id = $1 AND q.lesson_id = l.id AND r.due_at <= now() AND NOT r.suspended) AS due,
       (SELECT count(*)::int FROM mistake_record m JOIN question q ON q.id = m.question_id WHERE m.learner_id = $1 AND q.lesson_id = l.id AND m.resolved_at IS NULL) AS mistakes
     FROM lesson l JOIN exam_domain d ON d.id = l.domain_id
     LEFT JOIN lesson_progress pr ON pr.lesson_id = l.id AND pr.learner_id = $1
     WHERE NOT l.retired AND ($2::text IS NULL OR l.domain_id = $2)
     ORDER BY d.ordinal, l.ordinal`, [LEARNER_ID, domainId ?? null]);
  const completed = new Set((await query<{ lesson_id: string }>("SELECT lesson_id FROM lesson_progress WHERE learner_id = $1 AND status = 'completed'", [LEARNER_ID])).map((r) => r.lesson_id));
  const evidence = await loadEvidence();
  const lessonOfQuestion = new Map((await query<{ id: string; lesson_id: string | null }>("SELECT id, lesson_id FROM question WHERE lesson_id IS NOT NULL")).map((r) => [r.id, r.lesson_id]));
  const now = new Date();
  return rows.map((r) => {
    const ev = evidence.filter((e) => lessonOfQuestion.get(e.questionId) === r.id);
    const m = estimateMastery(ev, now);
    const prerequisites = r.prereqs.map((p) => ({ ...p, completed: completed.has(p.id) }));
    let status: LessonStatus;
    if (r.status === "completed") {
      if (m.status === "mastered" && r.due === 0 && r.mistakes === 0) status = "mastered";
      else if (r.due > 0 || r.mistakes > 0) status = "needs_review";
      else status = "completed";
    } else if (r.status === "in_progress") status = "in_progress";
    else status = prerequisites.every((p) => p.completed) ? "available" : "locked";
    return {
      id: r.id, domainId: r.domain_id, ordinal: r.ordinal, title: r.title, summary: r.summary, minutes: r.minutes, supplementary: r.supplementary,
      objectives: r.objectives, prerequisites, status, masteryScore: r.mastery_score, evidenceScore: m.score,
      checks: r.checks, masteryQuestions: r.mastery_n, predicts: r.predicts_total, dueReviews: r.due, unresolvedMistakes: r.mistakes,
      completedAt: r.completed_at, startedAt: r.started_at,
    };
  });
}

/** Next lesson to study: the one in progress, else the first available lesson (weak domains from onboarding first). */
export async function nextLessonFor(): Promise<LessonCard | null> {
  const lessons = await listLessons();
  const learner = await one<{ last_lesson_id: string | null; weak_domains: string[] }>("SELECT last_lesson_id, weak_domains FROM learner WHERE id = $1", [LEARNER_ID]);
  const last = lessons.find((l) => l.id === learner?.last_lesson_id && l.status === "in_progress");
  if (last) return last;
  const inProgress = lessons.find((l) => l.status === "in_progress");
  if (inProgress) return inProgress;
  const available = lessons.filter((l) => l.status === "available" && !l.supplementary);
  const weak = new Set(learner?.weak_domains ?? []);
  return available.find((l) => weak.has(l.domainId)) ?? available[0] ?? null;
}

export interface LessonView {
  lesson: {
    id: string; domainId: string; domainShort: string; domainTitle: string; region: string; ordinal: number; title: string; summary: string;
    minutes: number; bodyMd: string; contract: string[]; keyRules: string[]; retrieval: string[]; supplementary: boolean;
    javaVersion: string; predictsTotal: number; predictsVerified: number; objectives: { id: string; title: string; verification: string }[];
    version: number; updatedAt: Date;
  };
  card: LessonCard;
  checks: Record<string, PublicQuestion>;
  masteryQuiz: PublicQuestion[];
  exercises: Record<string, { id: string; title: string; difficulty: string; kind: string; verification: string }>;
  progress: { status: string | null; lastSection: string | null; masteryScore: number | null; reflection: string | null; completedAt: Date | null };
  predictionsMade: string[];
  bookmarked: boolean;
  notes: { id: number; title: string; bodyMd: string; updatedAt: Date }[];
  prev: { id: string; title: string } | null;
  next: { id: string; title: string } | null;
  answeredChecks: Record<string, { correct: boolean; response: Response }>;
}

export async function getLessonView(id: string): Promise<LessonView | null> {
  const l = await one<Record<string, unknown>>(
    `SELECT l.*, d.short_title, d.title AS domain_title, d.region_name FROM lesson l JOIN exam_domain d ON d.id = l.domain_id WHERE l.id = $1`, [id]);
  if (!l) return null;
  const cards = await listLessons();
  const idx = cards.findIndex((c) => c.id === id);
  const card = cards[idx] ?? (await listLessons(l.domain_id as string)).find((c) => c.id === id)!;
  const objectives = await query<{ id: string; title: string; verification: string }>(
    "SELECT o.id, o.title, o.verification FROM lesson_objective lo JOIN exam_objective o ON o.id = lo.objective_id WHERE lo.lesson_id = $1 ORDER BY o.id", [id]);
  const lq = await query<{ question_id: string; role: string }>("SELECT question_id, role FROM lesson_question WHERE lesson_id = $1 ORDER BY role, ordinal", [id]);
  const full = await getFullQuestions(lq.map((r) => r.question_id));
  const locked = await lockedQuestionIds(lq.map((r) => r.question_id));
  const checks: Record<string, PublicQuestion> = {};
  const masteryQuiz: PublicQuestion[] = [];
  for (const r of lq) {
    const q = full.get(r.question_id);
    if (!q) continue;
    if (r.role === "check") checks[q.id] = toPublic(q, { includeHint: !locked.has(q.id) });
    else masteryQuiz.push(toPublic(q, { includeHint: false }));
  }
  const exRows = await query<{ id: string; title: string; difficulty: string; kind: string; verification: string }>(
    "SELECT id, title, difficulty, kind, verification FROM coding_exercise WHERE lesson_id = $1 OR id = ANY($2)", [id, [...String(l.body_md).matchAll(/^::exercise\s+(\S+)/gm)].map((m) => m[1])]);
  const progress = await one<{ status: string; last_section: string | null; mastery_score: number | null; reflection: string | null; completed_at: Date | null }>(
    "SELECT status, last_section, mastery_score, reflection, completed_at FROM lesson_progress WHERE learner_id = $1 AND lesson_id = $2", [LEARNER_ID, id]);
  const preds = await query<{ ref: string }>("SELECT DISTINCT ref FROM lesson_event WHERE learner_id = $1 AND lesson_id = $2 AND kind = 'prediction'", [LEARNER_ID, id]);
  const bm = await one("SELECT 1 FROM bookmark WHERE learner_id = $1 AND target_type = 'lesson' AND target_id = $2", [LEARNER_ID, id]);
  const notes = await query<{ id: number; title: string; bodyMd: string; updatedAt: Date }>(
    `SELECT id, title, body_md AS "bodyMd", updated_at AS "updatedAt" FROM personal_note WHERE learner_id = $1 AND lesson_id = $2 ORDER BY updated_at DESC`, [LEARNER_ID, id]);
  const answered = await query<{ question_id: string; is_correct: boolean; response: Response }>(
    `SELECT DISTINCT ON (question_id) question_id, is_correct, response FROM question_attempt
     WHERE learner_id = $1 AND mode = 'lesson_check' AND question_id = ANY($2) ORDER BY question_id, answered_at DESC`, [LEARNER_ID, Object.keys(checks)]);
  return {
    lesson: {
      id, domainId: l.domain_id as string, domainShort: l.short_title as string, domainTitle: l.domain_title as string, region: l.region_name as string,
      ordinal: l.ordinal as number, title: l.title as string, summary: l.summary as string, minutes: l.minutes as number, bodyMd: l.body_md as string,
      contract: l.learning_contract as string[], keyRules: l.key_rules as string[], retrieval: l.retrieval_prompts as string[],
      supplementary: l.supplementary as boolean, javaVersion: l.java_version as string, predictsTotal: l.predicts_total as number,
      predictsVerified: l.predicts_verified as number, objectives, version: l.version as number, updatedAt: l.updated_at as Date,
    },
    card, checks, masteryQuiz,
    exercises: Object.fromEntries(exRows.map((e) => [e.id, e])),
    progress: { status: progress?.status ?? null, lastSection: progress?.last_section ?? null, masteryScore: progress?.mastery_score ?? null, reflection: progress?.reflection ?? null, completedAt: progress?.completed_at ?? null },
    predictionsMade: preds.map((p) => p.ref),
    bookmarked: Boolean(bm), notes,
    prev: idx > 0 ? { id: cards[idx - 1].id, title: cards[idx - 1].title } : null,
    next: idx >= 0 && idx < cards.length - 1 ? { id: cards[idx + 1].id, title: cards[idx + 1].title } : null,
    answeredChecks: Object.fromEntries(answered.map((a) => [a.question_id, { correct: a.is_correct, response: a.response }])),
  };
}

async function touchProgress(c: pg.PoolClient, lessonId: string, section?: string | null) {
  await query(
    `INSERT INTO lesson_progress(learner_id, lesson_id, status, last_section) VALUES ($1,$2,'in_progress',$3)
     ON CONFLICT (learner_id, lesson_id) DO UPDATE SET last_section = COALESCE(EXCLUDED.last_section, lesson_progress.last_section), updated_at = now()`,
    [LEARNER_ID, lessonId, section ?? null], c);
  await query("UPDATE learner SET last_lesson_id = $2 WHERE id = $1", [LEARNER_ID, lessonId], c);
}

export async function recordLessonEvent(lessonId: string, kind: "opened" | "section" | "prediction" | "retrieval", ref: string | null, payload: Record<string, unknown>) {
  return tx(async (c) => {
    const exists = await one("SELECT 1 FROM lesson WHERE id = $1 AND NOT retired", [lessonId], c);
    if (!exists) throw new NotFound("lesson not found");
    await query("INSERT INTO lesson_event(learner_id, lesson_id, kind, ref, payload) VALUES ($1,$2,$3,$4,$5)", [LEARNER_ID, lessonId, kind, ref, JSON.stringify(payload)], c);
    await touchProgress(c, lessonId, kind === "section" ? ref : null);
    let xp = 0;
    if (kind === "prediction" && ref && typeof payload.prediction === "string" && payload.prediction.trim().length > 0) {
      xp = await awardXp(c, `prediction:${lessonId}:${ref}`, XP_RULES.predictionWritten, "Wrote an output prediction", { lessonId, ref });
      if (typeof payload.prediction === "string") {
        await query("UPDATE lesson_progress SET predictions_revealed = predictions_revealed + 1 WHERE learner_id = $1 AND lesson_id = $2", [LEARNER_ID, lessonId], c);
      }
    }
    return { xp };
  });
}


export interface MasteryAnswer { questionId: string; response: Response; confidence: Confidence; timeMs: number | null }
export interface MasteryResult { score: number; passed: boolean; correct: number; total: number; firstCompletion: boolean; xp: number; feedback: Feedback[] }

export async function submitMasteryQuiz(lessonId: string, answers: MasteryAnswer[]): Promise<MasteryResult> {
  const quiz = await query<{ question_id: string }>("SELECT question_id FROM lesson_question WHERE lesson_id = $1 AND role = 'mastery' ORDER BY ordinal", [lessonId]);
  if (!quiz.length) throw new NotFound("lesson has no mastery quiz");
  const ids = quiz.map((q) => q.question_id);
  const byId = new Map(answers.map((a) => [a.questionId, a]));
  if (ids.some((id) => !byId.has(id))) throw new BadRequest("answer every mastery question before submitting");
  await assertNotInOpenExam(ids);
  const full = await getFullQuestions(ids);
  return tx(async (c) => {
    const session = await one<{ id: number }>("INSERT INTO study_session(learner_id, kind, ref, ended_at) VALUES ($1,'lesson',$2, now()) RETURNING id", [LEARNER_ID, lessonId], c);
    const feedback: Feedback[] = [];
    let correct = 0, xp = 0;
    for (const id of ids) {
      const a = byId.get(id)!;
      const out = await recordAnswer(c, { question: full.get(id)!, response: a.response, mode: "lesson_mastery", confidence: a.confidence, timeMs: a.timeMs, hintUsed: false, sessionId: session!.id });
      if (out.correct) correct++;
      xp += out.xpAwarded;
      feedback.push(out.feedback);
    }
    const score = correct / ids.length;
    const passed = score >= MASTERY_PASS;
    await touchProgress(c, lessonId);
    const before = await one<{ completed_at: Date | null }>("SELECT completed_at FROM lesson_progress WHERE learner_id = $1 AND lesson_id = $2", [LEARNER_ID, lessonId], c);
    await query(
      `UPDATE lesson_progress SET mastery_score = GREATEST(COALESCE(mastery_score, 0), $3),
         status = CASE WHEN $4 THEN 'completed' ELSE status END,
         completed_at = CASE WHEN $4 AND completed_at IS NULL THEN now() ELSE completed_at END, updated_at = now()
       WHERE learner_id = $1 AND lesson_id = $2`, [LEARNER_ID, lessonId, score, passed], c);
    await query("INSERT INTO lesson_event(learner_id, lesson_id, kind, payload) VALUES ($1,$2,'mastery_quiz',$3)", [LEARNER_ID, lessonId, JSON.stringify({ score, correct, total: ids.length })], c);
    const firstCompletion = passed && !before?.completed_at;
    if (passed) {
      xp += await awardXp(c, `lesson-complete:${lessonId}`, XP_RULES.lessonCompleted, "Lesson completed", { lessonId, score });
      if (score === 1) xp += await awardXp(c, `lesson-perfect:${lessonId}`, XP_RULES.lessonPerfectQuiz, "Perfect mastery quiz", { lessonId });
    }
    if (firstCompletion) await bumpActivity(c, { lessons: 1 });
    return { score, passed, correct, total: ids.length, firstCompletion, xp, feedback };
  });
}


export async function saveReflection(lessonId: string, text: string) {
  await tx(async (c) => {
    await touchProgress(c, lessonId);
    await query("UPDATE lesson_progress SET reflection = $3, updated_at = now() WHERE learner_id = $1 AND lesson_id = $2", [LEARNER_ID, lessonId, text.slice(0, 10000)], c);
    await query("INSERT INTO lesson_event(learner_id, lesson_id, kind, payload) VALUES ($1,$2,'retrieval',$3)", [LEARNER_ID, lessonId, JSON.stringify({ length: text.length })], c);
  });
}
