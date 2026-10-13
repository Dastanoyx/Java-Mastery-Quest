import { z } from "zod";
import { query, one, LEARNER_ID } from "../db.ts";
import { shuffle, mulberry32 } from "../domain/examBuilder.ts";
import { DUE_SQL } from "../domain/srs.ts";
import { getPublicQuestions, type PublicQuestion } from "./questions.ts";
import { notInOpenExam } from "./examLock.ts";

export const practiceFilterSchema = z.object({
  domains: z.array(z.string().regex(/^D\d{1,2}$/)).max(10).default([]),
  objectives: z.array(z.string().regex(/^D\d{1,2}\.\d{1,2}$/)).max(30).default([]),
  difficulties: z.array(z.enum(["foundation", "intermediate", "advanced", "expert"])).default([]),
  formats: z.array(z.string().max(40)).max(12).default([]),
  source: z.enum(["smart", "unseen", "missed", "bookmarked", "all"]).default("smart"),
  count: z.number().int().min(1).max(60).default(10),
  interleave: z.boolean().default(true),
});
export type PracticeFilter = z.infer<typeof practiceFilterSchema>;

interface Candidate { id: string; objective_id: string; domain_id: string; attempts: number; correct: number; last: Date | null; open_mistake: boolean }

export async function selectPracticeQuestions(f: PracticeFilter, opts: { examEligibleOnly?: boolean } = {}): Promise<string[]> {
  const rows = await query<Candidate>(
    `SELECT q.id, q.objective_id, o.domain_id,
       (SELECT count(*)::int FROM question_attempt a WHERE a.learner_id = $1 AND a.question_id = q.id) AS attempts,
       (SELECT count(*)::int FROM question_attempt a WHERE a.learner_id = $1 AND a.question_id = q.id AND a.is_correct) AS correct,
       (SELECT max(answered_at) FROM question_attempt a WHERE a.learner_id = $1 AND a.question_id = q.id) AS last,
       EXISTS (SELECT 1 FROM mistake_record m WHERE m.learner_id = $1 AND m.question_id = q.id AND m.resolved_at IS NULL) AS open_mistake
     FROM question q JOIN exam_objective o ON o.id = q.objective_id
     WHERE NOT q.retired AND ${notInOpenExam("q.id")}
       AND (cardinality($2::text[]) = 0 OR o.domain_id = ANY($2))
       AND (cardinality($3::text[]) = 0 OR q.objective_id = ANY($3))
       AND (cardinality($4::text[]) = 0 OR q.difficulty = ANY($4))
       AND (cardinality($5::text[]) = 0 OR q.format = ANY($5))
       AND ($6::boolean = false OR (q.exam_eligible AND q.type <> 'text'))
       AND ($7 <> 'bookmarked' OR EXISTS (SELECT 1 FROM bookmark b WHERE b.learner_id = $1 AND b.target_type = 'question' AND b.target_id = q.id))`,
    [LEARNER_ID, f.domains, f.objectives, f.difficulties, f.formats, opts.examEligibleOnly ?? false, f.source]);
  const rng = mulberry32(Date.now() & 0xffffffff);
  let pool = shuffle(rows, rng);
  if (f.source === "unseen") pool = pool.filter((r) => r.attempts === 0);
  if (f.source === "missed") pool = pool.filter((r) => r.open_mistake);
  if (f.source === "smart") {
    // Unseen first, then open mistakes, then lowest historical accuracy, least recently seen.
    const rank = (r: Candidate) => (r.attempts === 0 ? 0 : r.open_mistake ? 1 : 2);
    pool.sort((a, b) => rank(a) - rank(b) || (a.attempts ? a.correct / a.attempts : 0) - (b.attempts ? b.correct / b.attempts : 0) ||
      (a.last?.getTime() ?? 0) - (b.last?.getTime() ?? 0));
  }
  const chosen = pool.slice(0, Math.max(f.count * 3, f.count));
  let picked: Candidate[];
  if (f.interleave) {
    // Round-robin across objectives so similar concepts are mixed rather than blocked.
    const by = new Map<string, Candidate[]>();
    for (const c of chosen) by.set(c.objective_id, [...(by.get(c.objective_id) ?? []), c]);
    picked = [];
    const keys = shuffle([...by.keys()], rng);
    while (picked.length < f.count && keys.some((k) => by.get(k)!.length)) {
      for (const k of keys) { const l = by.get(k)!; if (l.length && picked.length < f.count) picked.push(l.shift()!); }
    }
  } else picked = chosen.slice(0, f.count);
  return picked.map((p) => p.id);
}

export async function startPractice(f: PracticeFilter): Promise<{ sessionId: number; questions: PublicQuestion[] }> {
  const ids = await selectPracticeQuestions(f);
  const s = await one<{ id: number }>("INSERT INTO study_session(learner_id, kind, config) VALUES ($1,'practice',$2) RETURNING id", [LEARNER_ID, JSON.stringify(f)]);
  return { sessionId: s!.id, questions: await getPublicQuestions(ids) };
}

// ── Review ─────────────────────────────────────────────────────────────────────────────────────────
export interface ReviewQueue { sessionId: number; items: (PublicQuestion & { variation: boolean; dueAt: string | null; lapses: number })[]; dueTotal: number; overdueTotal: number }

export async function reviewQueue(limit: number): Promise<ReviewQueue> {
  const due = await query<{ question_id: string; domain_id: string; due_at: Date; lapses: number; last_grade: number | null }>(
    `SELECT r.question_id, o.domain_id, r.due_at, r.lapses, r.last_grade
     FROM review_item r JOIN question q ON q.id = r.question_id JOIN exam_objective o ON o.id = q.objective_id
     WHERE r.learner_id = $1 AND NOT r.suspended AND NOT q.retired AND ${DUE_SQL} AND ${notInOpenExam("q.id")}
     ORDER BY (r.last_grade IS NOT NULL AND r.last_grade < 3) DESC, r.due_at ASC`, [LEARNER_ID]);
  const overdue = due.filter((d) => new Date(d.due_at).getTime() < Date.now() - 86_400_000).length;
  const head = due.slice(0, limit);
  // Interleave by domain while preserving priority order within each domain.
  const by = new Map<string, typeof head>();
  for (const d of head) by.set(d.domain_id, [...(by.get(d.domain_id) ?? []), d]);
  const order: typeof head = [];
  while (order.length < head.length) for (const l of by.values()) if (l.length) order.push(l.shift()!);

  // Add a few new variations of concepts with open mistakes (unseen questions on the same objectives).
  const variations: string[] = [];
  if (order.length < limit) {
    const v = await query<{ id: string }>(
      `SELECT DISTINCT ON (q.objective_id) q.id FROM question q
       WHERE NOT q.retired AND q.type <> 'text' AND ${notInOpenExam("q.id")} AND q.objective_id IN (
         SELECT q2.objective_id FROM mistake_record m JOIN question q2 ON q2.id = m.question_id WHERE m.learner_id = $1 AND m.resolved_at IS NULL)
       AND NOT EXISTS (SELECT 1 FROM question_attempt a WHERE a.learner_id = $1 AND a.question_id = q.id)
       ORDER BY q.objective_id, random()`, [LEARNER_ID]);
    variations.push(...v.slice(0, Math.min(3, limit - order.length)).map((r) => r.id));
  }
  const qs = await getPublicQuestions([...order.map((o) => o.question_id), ...variations]);
  const meta = new Map(order.map((o) => [o.question_id, o]));
  const s = await one<{ id: number }>("INSERT INTO study_session(learner_id, kind, config) VALUES ($1,'review',$2) RETURNING id", [LEARNER_ID, JSON.stringify({ limit })]);
  return {
    sessionId: s!.id,
    dueTotal: due.length,
    overdueTotal: overdue,
    items: qs.map((q) => ({ ...q, variation: !meta.has(q.id), dueAt: meta.get(q.id) ? new Date(meta.get(q.id)!.due_at).toISOString() : null, lapses: meta.get(q.id)?.lapses ?? 0 })),
  };
}

export async function dueCounts(): Promise<{ due: number; overdue: number; dueTomorrow: number; scheduled: number }> {
  const r = await one<{ due: number; overdue: number; tomorrow: number; scheduled: number }>(
    `SELECT count(*) FILTER (WHERE ${DUE_SQL})::int AS due,
            count(*) FILTER (WHERE r.due_at < now() - interval '1 day')::int AS overdue,
            count(*) FILTER (WHERE NOT ${DUE_SQL} AND r.due_at <= now() + interval '30 hours')::int AS tomorrow,
            count(*)::int AS scheduled
     FROM review_item r JOIN question q ON q.id = r.question_id WHERE r.learner_id = $1 AND NOT r.suspended AND NOT q.retired`, [LEARNER_ID]);
  return { due: r?.due ?? 0, overdue: r?.overdue ?? 0, dueTomorrow: r?.tomorrow ?? 0, scheduled: r?.scheduled ?? 0 };
}
