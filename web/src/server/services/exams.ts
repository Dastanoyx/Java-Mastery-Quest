// Mock exams, timed challenges and boss battles.
// Strict attempts never expose correctness, explanations or hints before submission (enforced here, not in the UI).
import { z } from "zod";
import { query, one, tx, LEARNER_ID } from "../db.ts";
import { examBlueprint, domains as loadDomains, objectives as loadObjectives } from "../config.ts";
import { buildExam, mulberry32, type PoolQuestion, type Exposure } from "../domain/examBuilder.ts";
import { validateResponse, type Response } from "../domain/scoring.ts";
import { xpForMock, XP_RULES } from "../domain/xp.ts";
import { nextSteps } from "../domain/planner.ts";
import { getFullQuestions, toPublic, toFeedback, type PublicQuestion, type Feedback } from "./questions.ts";
import { recordAnswer } from "./answers.ts";
import { awardXp } from "./learner.ts";
import { selectPracticeQuestions, practiceFilterSchema } from "./practice.ts";
import { BadRequest, Conflict, NotFound } from "../errors.ts";

export const BOSS_PASS_PERCENT = 75;
export const BOSS_QUESTIONS = 12;
/** Share of questions that must be answered for an exam to count for XP, quests and achievements. */
export const EXAM_REWARD_MIN_ANSWERED = 0.8;
/** SQL condition on an `exam_attempt` row: enough questions were answered to count as a genuine attempt. */
export const GENUINE_ATTEMPT_SQL = `(SELECT count(*) FROM exam_attempt_answer x WHERE x.attempt_id = exam_attempt.id AND x.response IS NOT NULL) >= ${EXAM_REWARD_MIN_ANSWERED} * exam_attempt.score_total`;

export const createExamSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("full") }),
  z.object({ kind: z.literal("short"), count: z.number().int().min(5).max(30).default(15) }),
  z.object({ kind: z.literal("domain"), domainId: z.string().regex(/^D\d{1,2}$/), count: z.number().int().min(5).max(30).default(12) }),
  z.object({ kind: z.literal("boss"), domainId: z.string().regex(/^D\d{1,2}$/) }),
  z.object({ kind: z.literal("custom"), filter: practiceFilterSchema, title: z.string().max(80).optional() }),
]);
export type CreateExam = z.infer<typeof createExamSchema>;

async function poolAndExposure() {
  const pool = await query<PoolQuestion>(
    `SELECT q.id, o.domain_id AS "domainId", q.objective_id AS "objectiveId", q.difficulty FROM question q
     JOIN exam_objective o ON o.id = q.objective_id WHERE NOT q.retired AND q.exam_eligible AND q.type <> 'text'`);
  const ex = await query<{ question_id: string; n: number; last: Date }>(
    "SELECT question_id, count(*)::int AS n, max(answered_at) AS last FROM question_attempt WHERE learner_id = $1 GROUP BY question_id", [LEARNER_ID]);
  const exposure = new Map<string, Exposure>(ex.map((e) => [e.question_id, { attempts: e.n, lastSeen: new Date(e.last) }]));
  return { pool, exposure };
}

export async function createExam(input: CreateExam): Promise<number> {
  const bp = await examBlueprint();
  const secondsPerQuestion = (bp.durationMinutes * 60) / bp.questionCount;
  const doms = await loadDomains();
  const objs = await loadObjectives();
  const domainSpecs = doms.map((d) => ({ id: d.id, objectiveIds: objs.filter((o) => o.domainId === d.id).map((o) => o.id) }));
  const { pool, exposure } = await poolAndExposure();
  const rng = mulberry32((Date.now() ^ Math.floor(Math.random() * 1e9)) >>> 0);
  let ids: string[];
  let title: string;
  let duration: number;
  let pass = bp.passingPercent;
  switch (input.kind) {
    case "full":
      ids = buildExam(pool, { count: bp.questionCount, domains: domainSpecs, floorPerDomain: 3, exposure, rng });
      title = `Full mock exam · ${bp.code}`;
      duration = bp.durationMinutes * 60;
      break;
    case "short":
      ids = buildExam(pool, { count: input.count, domains: domainSpecs, floorPerDomain: 1, exposure, rng });
      title = `Short timed exam · ${input.count} questions`;
      duration = Math.round(input.count * secondsPerQuestion);
      break;
    case "domain": {
      const spec = domainSpecs.find((d) => d.id === input.domainId);
      if (!spec) throw new NotFound("unknown domain");
      ids = buildExam(pool, { count: input.count, domains: [spec], floorPerDomain: input.count, exposure, rng });
      title = `${doms.find((d) => d.id === input.domainId)!.short} · domain exam`;
      duration = Math.round(ids.length * secondsPerQuestion);
      break;
    }
    case "boss": {
      const spec = domainSpecs.find((d) => d.id === input.domainId);
      if (!spec) throw new NotFound("unknown domain");
      // At least half advanced/expert, the rest intermediate — the boss combines concepts of the whole domain.
      const hardN = Math.ceil(BOSS_QUESTIONS / 2);
      const hard = buildExam(pool, { count: hardN, domains: [spec], floorPerDomain: hardN, exposure, rng, difficulties: ["advanced", "expert"] });
      const rest = buildExam(pool.filter((q) => !hard.includes(q.id)), { count: BOSS_QUESTIONS - hard.length, domains: [spec], floorPerDomain: BOSS_QUESTIONS, exposure, rng, difficulties: ["intermediate", "advanced"] });
      ids = [...hard, ...rest];
      title = `Boss battle · ${doms.find((d) => d.id === input.domainId)!.region}`;
      duration = Math.round(ids.length * secondsPerQuestion * 0.9);
      pass = BOSS_PASS_PERCENT;
      break;
    }
    case "custom": {
      ids = await selectPracticeQuestions({ ...input.filter }, { examEligibleOnly: true });
      title = input.title ?? `Timed challenge · ${ids.length} questions`;
      const est = await query<{ s: number }>("SELECT COALESCE(sum(est_seconds),0)::int AS s FROM question WHERE id = ANY($1)", [ids]);
      duration = Math.max(120, Math.round((est[0]?.s ?? 60) * 1.1));
      break;
    }
  }
  if (ids.length < Math.min(5, input.kind === "custom" ? 1 : 5)) throw new BadRequest("not enough questions match this configuration");
  return tx(async (c) => {
    const s = await one<{ id: number }>("INSERT INTO study_session(learner_id, kind, config) VALUES ($1, $2, $3) RETURNING id",
      [LEARNER_ID, input.kind === "boss" ? "boss" : "exam", JSON.stringify(input)], c);
    const a = await one<{ id: number }>(
      `INSERT INTO exam_attempt(learner_id, kind, title, config, strict, duration_seconds, pass_percent, deadline_at, session_id)
       VALUES ($1,$2,$3,$4,true,$5::int,$6, now() + make_interval(secs => $5::int), $7) RETURNING id`,
      [LEARNER_ID, input.kind, title, JSON.stringify(input), duration, pass, s!.id], c);
    const versions = await query<{ id: string; version: number }>("SELECT id, version FROM question WHERE id = ANY($1)", [ids], c);
    const vmap = new Map(versions.map((v) => [v.id, v.version]));
    for (const [i, qid] of ids.entries()) {
      await query("INSERT INTO exam_attempt_answer(attempt_id, position, question_id, question_version) VALUES ($1,$2,$3,$4)", [a!.id, i + 1, qid, vmap.get(qid)], c);
    }
    return a!.id;
  });
}

export interface AttemptMeta {
  id: number; kind: string; title: string; strict: boolean; durationSeconds: number | null; passPercent: number;
  startedAt: string; deadlineAt: string | null; submittedAt: string | null; submitReason: string | null;
  scoreCorrect: number | null; scoreTotal: number | null; scorePercent: number | null; passed: boolean | null; config: Record<string, unknown>;
}

async function meta(id: number): Promise<AttemptMeta | null> {
  return one<AttemptMeta>(
    `SELECT id, kind, title, strict, duration_seconds AS "durationSeconds", pass_percent AS "passPercent",
       started_at AS "startedAt", deadline_at AS "deadlineAt", submitted_at AS "submittedAt", submit_reason AS "submitReason",
       score_correct AS "scoreCorrect", score_total AS "scoreTotal", score_percent AS "scorePercent", passed, config
     FROM exam_attempt WHERE id = $1 AND learner_id = $2`, [id, LEARNER_ID]);
}

const GRACE_MS = 5000;

/**
 * What a strict attempt may show about a question: the prompt, code and options — nothing else. Format, tags,
 * objective, lesson and even the question id hint at the answer ("compile-error", "empty-statement") or let
 * a second tab look it up, so they are replaced with neutral values until the attempt is submitted.
 */
export function examSafe(q: PublicQuestion, attemptId: number, position: number): PublicQuestion {
  return {
    ...q, id: `${attemptId}-${position}`, objectiveId: "", objectiveTitle: "", domainId: "", domainShort: "", format: "exam",
    tags: [], hintMd: null, lessonId: null, lessonTitle: null, verification: "exam", verifiedWith: null, version: 0, difficulty: "intermediate",
  };
}

export interface AttemptView {
  attempt: AttemptMeta;
  serverNow: string;
  questions: (PublicQuestion & { position: number; response: Response | null; flagged: boolean; confidence: number | null; timeMs: number })[];
}

/** Loads an attempt for taking. Auto-submits (reason: timeout) if the deadline has passed. */
export async function getAttemptForTaking(id: number): Promise<{ view: AttemptView | null; autoSubmitted: boolean }> {
  let m = await meta(id);
  if (!m) return { view: null, autoSubmitted: false };
  let autoSubmitted = false;
  if (!m.submittedAt && m.deadlineAt && Date.now() > new Date(m.deadlineAt).getTime() + GRACE_MS) {
    await submitExam(id, "timeout");
    autoSubmitted = true;
    m = (await meta(id))!;
  }
  const rows = await query<{ position: number; question_id: string; response: Response | null; flagged: boolean; confidence: number | null; time_ms: number }>(
    "SELECT position, question_id, response, flagged, confidence, time_ms FROM exam_attempt_answer WHERE attempt_id = $1 ORDER BY position", [id]);
  const full = await getFullQuestions(rows.map((r) => r.question_id));
  return {
    autoSubmitted,
    view: {
      attempt: m,
      serverNow: new Date().toISOString(),
      questions: rows.map((r) => ({
        ...(m!.strict ? examSafe(toPublic(full.get(r.question_id)!, { includeHint: false }), id, r.position) : toPublic(full.get(r.question_id)!)),
        position: r.position, response: r.response, flagged: r.flagged, confidence: r.confidence, timeMs: r.time_ms,
      })),
    },
  };
}

export const saveAnswerSchema = z.object({
  response: z.union([z.object({ options: z.array(z.string()).max(8) }), z.object({ text: z.string().max(2000) }), z.null()]).optional(),
  flagged: z.boolean().optional(),
  confidence: z.union([z.literal(1), z.literal(2), z.literal(3), z.null()]).optional(),
  timeMsDelta: z.number().int().min(0).max(3_600_000).optional(),
});

export async function saveExamAnswer(id: number, position: number, body: z.infer<typeof saveAnswerSchema>) {
  return tx(async (c) => {
    const a = await one<{ submitted_at: Date | null; deadline_at: Date | null }>(
      "SELECT submitted_at, deadline_at FROM exam_attempt WHERE id = $1 AND learner_id = $2 FOR UPDATE", [id, LEARNER_ID], c);
    if (!a) throw new NotFound("attempt not found");
    if (a.submitted_at) throw new Conflict("this attempt has already been submitted");
    if (a.deadline_at && Date.now() > new Date(a.deadline_at).getTime() + GRACE_MS) throw new Conflict("time is up — the attempt will be submitted");
    const row = await one<{ question_id: string }>("SELECT question_id FROM exam_attempt_answer WHERE attempt_id = $1 AND position = $2", [id, position], c);
    if (!row) throw new NotFound("no such question position");
    if (body.response) {
      const q = (await getFullQuestions([row.question_id], c)).get(row.question_id)!;
      const isEmpty = "options" in body.response && body.response.options.length === 0;
      if (!isEmpty) {
        const err = validateResponse(q.type, q.options.map((o) => o.key), body.response);
        if (err) throw new BadRequest(err);
      }
    }
    await query(
      `UPDATE exam_attempt_answer SET
         response = CASE WHEN $3::boolean THEN $4::jsonb ELSE response END,
         answered_at = CASE WHEN $3::boolean THEN now() ELSE answered_at END,
         flagged = COALESCE($5, flagged),
         confidence = CASE WHEN $6::boolean THEN $7::smallint ELSE confidence END,
         time_ms = time_ms + $8
       WHERE attempt_id = $1 AND position = $2`,
      [id, position, body.response !== undefined, body.response === undefined ? null : JSON.stringify(body.response && "options" in body.response && body.response.options.length === 0 ? null : body.response),
        body.flagged ?? null, body.confidence !== undefined, body.confidence ?? null, body.timeMsDelta ?? 0], c);
    return { ok: true };
  });
}

export async function submitExam(id: number, reason: "learner" | "timeout"): Promise<{ alreadySubmitted: boolean; xp: number }> {
  return tx(async (c) => {
    const a = await one<{ kind: string; config: { domainId?: string }; submitted_at: Date | null; pass_percent: number; session_id: number | null; deadline_at: Date | null }>(
      "SELECT kind, config, submitted_at, pass_percent, session_id, deadline_at FROM exam_attempt WHERE id = $1 AND learner_id = $2 FOR UPDATE", [id, LEARNER_ID], c);
    if (!a) throw new NotFound("attempt not found");
    if (a.submitted_at) return { alreadySubmitted: true, xp: 0 };
    const rows = await query<{ position: number; question_id: string; response: Response | null; confidence: 1 | 2 | 3 | null; time_ms: number }>(
      "SELECT position, question_id, response, confidence, time_ms FROM exam_attempt_answer WHERE attempt_id = $1 ORDER BY position", [id], c);
    const full = await getFullQuestions(rows.map((r) => r.question_id), c);
    let correct = 0, xp = 0;
    const timedOut = reason === "timeout";
    for (const r of rows) {
      const out = await recordAnswer(c, {
        question: full.get(r.question_id)!, response: r.response, mode: a.kind === "boss" ? "boss" : "exam",
        confidence: r.confidence, timeMs: r.time_ms || null, hintUsed: false, sessionId: a.session_id, timedOut,
      });
      if (out.correct) correct++;
      xp += out.xpAwarded;
      await query("UPDATE exam_attempt_answer SET is_correct = $3 WHERE attempt_id = $1 AND position = $2", [id, r.position, out.correct], c);
    }
    const total = rows.length;
    const percent = total ? Math.round((correct / total) * 10000) / 100 : 0;
    const passed = percent >= a.pass_percent;
    await query(
      `UPDATE exam_attempt SET submitted_at = now(), submit_reason = $2, score_correct = $3, score_total = $4, score_percent = $5, passed = $6
       WHERE id = $1`, [id, reason, correct, total, percent, passed], c);
    if (a.session_id) await query("UPDATE study_session SET ended_at = now() WHERE id = $1", [a.session_id], c);
    // Rewards need a genuine attempt: submitting an (almost) empty exam is recorded and scored, but pays nothing.
    const answered = rows.filter((r) => r.response && ("options" in r.response ? r.response.options.length > 0 : r.response.text.trim() !== "")).length;
    if (total > 0 && answered >= EXAM_REWARD_MIN_ANSWERED * total) {
      xp += await awardXp(c, `exam:${id}`, xpForMock(a.kind, percent, a.pass_percent), a.kind === "full" ? "Full mock exam completed" : "Timed assessment completed", { attemptId: id, percent });
    }
    if (a.kind === "boss" && passed && a.config.domainId) {
      xp += await awardXp(c, `boss:${a.config.domainId}`, XP_RULES.bossDefeated, "Boss defeated", { attemptId: id, domainId: a.config.domainId });
    }
    return { alreadySubmitted: false, xp };
  });
}

export interface ExamResults {
  attempt: AttemptMeta;
  timeUsedSeconds: number;
  items: (PublicQuestion & { position: number; response: Response | null; isCorrect: boolean; flagged: boolean; confidence: number | null; timeMs: number; feedback: Feedback })[];
  byDomain: { id: string; short: string; correct: number; total: number }[];
  byObjective: { id: string; title: string; correct: number; total: number; lessonId: string | null; lessonTitle: string | null }[];
  byDifficulty: { difficulty: string; correct: number; total: number }[];
  calibration: { confidence: number; label: string; correct: number; total: number }[];
  unanswered: number;
  remediation: string[];
  passPercent: number;
  readyTargetPercent: number;
}

export async function examResults(id: number): Promise<ExamResults> {
  const m = await meta(id);
  if (!m) throw new NotFound("attempt not found");
  if (!m.submittedAt) throw new Conflict("results are available after the attempt is submitted");
  const bp = await examBlueprint();
  const rows = await query<{ position: number; question_id: string; response: Response | null; is_correct: boolean; flagged: boolean; confidence: number | null; time_ms: number }>(
    "SELECT position, question_id, response, is_correct, flagged, confidence, time_ms FROM exam_attempt_answer WHERE attempt_id = $1 ORDER BY position", [id]);
  const full = await getFullQuestions(rows.map((r) => r.question_id));
  const items = rows.map((r) => {
    const q = full.get(r.question_id)!;
    return { ...toPublic(q), position: r.position, response: r.response, isCorrect: r.is_correct, flagged: r.flagged, confidence: r.confidence, timeMs: r.time_ms, feedback: toFeedback(q, r.is_correct) };
  });
  const agg = <K extends string>(key: (i: (typeof items)[number]) => K) => {
    const map = new Map<K, { correct: number; total: number }>();
    for (const i of items) { const k = key(i); const v = map.get(k) ?? { correct: 0, total: 0 }; v.total++; if (i.isCorrect) v.correct++; map.set(k, v); }
    return map;
  };
  const dm = agg((i) => i.domainId);
  const doms = await loadDomains();
  const om = agg((i) => i.objectiveId);
  const dif = agg((i) => i.difficulty);
  const conf = agg((i) => String(i.confidence ?? 0));
  const byObjective = [...om.entries()].map(([oid, v]) => {
    const sample = items.find((i) => i.objectiveId === oid)!;
    return { id: oid, title: sample.objectiveTitle, ...v, lessonId: sample.lessonId, lessonTitle: sample.lessonTitle };
  }).sort((a, b) => a.correct / a.total - b.correct / b.total);
  const confidentWrong = items.filter((i) => i.confidence === 3 && !i.isCorrect).length;
  const due = await one<{ n: number }>("SELECT count(*)::int AS n FROM review_item WHERE learner_id = $1 AND due_at <= now() AND NOT suspended", [LEARNER_ID]);
  const remediation = nextSteps({
    sessionKind: "exam",
    objectiveResults: byObjective.map((o) => ({ objectiveId: o.id, title: o.title, correct: o.correct, total: o.total, lessonId: o.lessonId, lessonTitle: o.lessonTitle })),
    confidentWrong, dueReviews: due?.n ?? 0,
    domainResults: doms.filter((d) => dm.has(d.id)).map((d) => ({ id: d.id, short: d.short, ...dm.get(d.id)! })),
    unanswered: items.filter((i) => !i.response).length,
    percent: m.scorePercent ?? 0, passPercent: m.passPercent,
  });
  return {
    attempt: m,
    timeUsedSeconds: Math.round((new Date(m.submittedAt).getTime() - new Date(m.startedAt).getTime()) / 1000),
    items,
    byDomain: doms.filter((d) => dm.has(d.id)).map((d) => ({ id: d.id, short: d.short, ...dm.get(d.id)! })),
    byObjective,
    byDifficulty: ["foundation", "intermediate", "advanced", "expert"].filter((d) => dif.has(d as never)).map((d) => ({ difficulty: d, ...dif.get(d as never)! })),
    calibration: [[3, "Sure"], [2, "Unsure"], [1, "Guessing"], [0, "Not rated"]].filter(([k]) => conf.has(String(k))).map(([k, label]) => ({ confidence: k as number, label: label as string, ...conf.get(String(k))! })),
    unanswered: items.filter((i) => !i.response).length,
    remediation,
    passPercent: m.passPercent,
    readyTargetPercent: bp.readyTargetPercent,
  };
}

export async function listAttempts(limit = 50) {
  return query<AttemptMeta>(
    `SELECT id, kind, title, strict, duration_seconds AS "durationSeconds", pass_percent AS "passPercent", started_at AS "startedAt",
       deadline_at AS "deadlineAt", submitted_at AS "submittedAt", submit_reason AS "submitReason", score_correct AS "scoreCorrect",
       score_total AS "scoreTotal", score_percent AS "scorePercent", passed, config
     FROM exam_attempt WHERE learner_id = $1 ORDER BY started_at DESC LIMIT $2`, [LEARNER_ID, limit]);
}

/** Submits any attempts whose deadline has passed (called on Exam Center load). */
export async function sweepExpiredAttempts() {
  const expired = await query<{ id: number }>(
    "SELECT id FROM exam_attempt WHERE learner_id = $1 AND submitted_at IS NULL AND deadline_at < now() - interval '5 seconds'", [LEARNER_ID]);
  for (const e of expired) await submitExam(e.id, "timeout");
  return expired.length;
}
