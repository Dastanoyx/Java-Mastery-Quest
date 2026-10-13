// Mistake journal, notes, bookmarks and Knowledge-Vault search.
import { z } from "zod";
import { query, one, LEARNER_ID } from "../db.ts";
import { MISTAKE_CATEGORIES } from "../domain/mistakes.ts";
import { getFullQuestions, toPublic, toFeedback, type PublicQuestion, type Feedback } from "./questions.ts";
import type { Response } from "../domain/scoring.ts";
import { NotFound, BadRequest } from "../errors.ts";
import { notInOpenExam } from "./examLock.ts";

export interface MistakeView {
  question: PublicQuestion;
  feedback: Feedback;
  firstWrongAt: Date; lastWrongAt: Date; wrongCount: number; lastResponse: Response; category: string | null; categorySource: string;
  personalNote: string | null; highConfidenceWrong: boolean; correctSince: number; resolvedAt: Date | null;
  review: { dueAt: Date; intervalDays: number; lapses: number } | null;
  history: { answeredAt: Date; correct: boolean; mode: string }[];
  recommendation: string;
}

export async function listMistakes(filter: { status?: "open" | "resolved" | "all"; domainId?: string; category?: string }): Promise<MistakeView[]> {
  const rows = await query<{
    question_id: string; first_wrong_at: Date; last_wrong_at: Date; wrong_count: number; last_response: Response; category: string | null;
    category_source: string; personal_note: string | null; high_confidence_wrong: boolean; correct_since: number; resolved_at: Date | null;
    due_at: Date | null; interval_days: number | null; lapses: number | null;
  }>(
    `SELECT m.*, r.due_at, r.interval_days, r.lapses FROM mistake_record m
     JOIN question q ON q.id = m.question_id JOIN exam_objective o ON o.id = q.objective_id
     LEFT JOIN review_item r ON r.learner_id = m.learner_id AND r.question_id = m.question_id
     WHERE m.learner_id = $1
       AND ($2 = 'all' OR ($2 = 'open' AND m.resolved_at IS NULL) OR ($2 = 'resolved' AND m.resolved_at IS NOT NULL))
       AND ($3::text IS NULL OR o.domain_id = $3) AND ($4::text IS NULL OR m.category = $4)
     ORDER BY m.resolved_at IS NOT NULL, m.high_confidence_wrong DESC, m.wrong_count DESC, m.last_wrong_at DESC`,
    [LEARNER_ID, filter.status ?? "open", filter.domainId ?? null, filter.category ?? null]);
  const full = await getFullQuestions(rows.map((r) => r.question_id));
  const hist = await query<{ question_id: string; answered_at: Date; is_correct: boolean; mode: string }>(
    "SELECT question_id, answered_at, is_correct, mode FROM question_attempt WHERE learner_id = $1 AND question_id = ANY($2) ORDER BY answered_at", [LEARNER_ID, rows.map((r) => r.question_id)]);
  return rows.map((r) => {
    const q = full.get(r.question_id)!;
    const rec = r.resolved_at ? "Resolved — it stays in spaced review so it doesn't come back."
      : r.wrong_count >= 2 && q.lessonTitle ? `Repeated mistake: re-read “${q.lessonTitle}”, write the rule in your own words, then retry.`
        : r.high_confidence_wrong ? "You were sure and wrong — read the rule and the misconception below, then answer a follow-up question."
          : r.due_at ? `Retry in review (scheduled ${new Date(r.due_at) <= new Date() ? "now" : "for " + new Date(r.due_at).toISOString().slice(0, 10)}). Resolves after two correct answers on different days.`
            : "Retry this question in practice.";
    return {
      question: toPublic(q), feedback: toFeedback(q, false), firstWrongAt: r.first_wrong_at, lastWrongAt: r.last_wrong_at, wrongCount: r.wrong_count,
      lastResponse: r.last_response, category: r.category, categorySource: r.category_source, personalNote: r.personal_note,
      highConfidenceWrong: r.high_confidence_wrong, correctSince: r.correct_since, resolvedAt: r.resolved_at,
      review: r.due_at ? { dueAt: r.due_at, intervalDays: r.interval_days!, lapses: r.lapses! } : null,
      history: hist.filter((h) => h.question_id === r.question_id).map((h) => ({ answeredAt: h.answered_at, correct: h.is_correct, mode: h.mode })),
      recommendation: rec,
    };
  });
}

export const updateMistakeSchema = z.object({
  category: z.enum(Object.keys(MISTAKE_CATEGORIES) as [keyof typeof MISTAKE_CATEGORIES, ...(keyof typeof MISTAKE_CATEGORIES)[]]).optional(),
  personalNote: z.string().max(5000).nullable().optional(),
});

export async function updateMistake(questionId: string, body: z.infer<typeof updateMistakeSchema>) {
  const r = await query(
    `UPDATE mistake_record SET category = COALESCE($3, category), category_source = CASE WHEN $3::text IS NULL THEN category_source ELSE 'learner' END,
       personal_note = CASE WHEN $4::boolean THEN $5 ELSE personal_note END
     WHERE learner_id = $1 AND question_id = $2 RETURNING question_id`,
    [LEARNER_ID, questionId, body.category ?? null, body.personalNote !== undefined, body.personalNote ?? null]);
  if (!r.length) throw new NotFound("mistake not found");
}

// ── Notes ──────────────────────────────────────────────────────────────────────────────────────────
export const noteSchema = z.object({
  title: z.string().max(200).default(""),
  bodyMd: z.string().min(1).max(50_000),
  lessonId: z.string().max(100).nullable().optional(),
  questionId: z.string().max(100).nullable().optional(),
  exerciseId: z.string().max(100).nullable().optional(),
  domainId: z.string().regex(/^D\d{1,2}$/).nullable().optional(),
  tags: z.array(z.string().max(40)).max(20).default([]),
});
export type NoteInput = z.infer<typeof noteSchema>;

export interface Note { id: number; title: string; bodyMd: string; lessonId: string | null; lessonTitle: string | null; questionId: string | null; exerciseId: string | null; domainId: string | null; tags: string[]; createdAt: Date; updatedAt: Date }

const NOTE_SELECT = `SELECT n.id, n.title, n.body_md AS "bodyMd", n.lesson_id AS "lessonId", l.title AS "lessonTitle", n.question_id AS "questionId",
  n.exercise_id AS "exerciseId", COALESCE(n.domain_id, l.domain_id) AS "domainId", n.tags, n.created_at AS "createdAt", n.updated_at AS "updatedAt"
  FROM personal_note n LEFT JOIN lesson l ON l.id = n.lesson_id`;

export async function listNotes(): Promise<Note[]> {
  return query<Note>(`${NOTE_SELECT} WHERE n.learner_id = $1 ORDER BY n.updated_at DESC`, [LEARNER_ID]);
}

async function assertNoteRefs(n: Partial<NoteInput>) {
  const refs: [string, string | null | undefined][] = [["lesson", n.lessonId], ["question", n.questionId], ["coding_exercise", n.exerciseId]];
  for (const [table, id] of refs) {
    if (id && !(await one(`SELECT 1 FROM ${table} WHERE id = $1`, [id]))) throw new BadRequest(`unknown ${table.replace("coding_", "")} ${id}`);
  }
}

export async function createNote(n: NoteInput): Promise<Note> {
  await assertNoteRefs(n);
  const r = await one<{ id: number }>(
    `INSERT INTO personal_note(learner_id, title, body_md, lesson_id, question_id, exercise_id, domain_id, tags) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
    [LEARNER_ID, n.title, n.bodyMd, n.lessonId ?? null, n.questionId ?? null, n.exerciseId ?? null, n.domainId ?? null, n.tags]);
  return (await one<Note>(`${NOTE_SELECT} WHERE n.id = $1`, [r!.id]))!;
}

export async function updateNote(id: number, n: Partial<NoteInput>): Promise<Note> {
  const r = await query(
    `UPDATE personal_note SET title = COALESCE($3, title), body_md = COALESCE($4, body_md), tags = COALESCE($5, tags), updated_at = now()
     WHERE id = $1 AND learner_id = $2 RETURNING id`, [id, LEARNER_ID, n.title ?? null, n.bodyMd ?? null, n.tags ?? null]);
  if (!r.length) throw new NotFound("note not found");
  return (await one<Note>(`${NOTE_SELECT} WHERE n.id = $1`, [id]))!;
}

export async function deleteNote(id: number) {
  const r = await query("DELETE FROM personal_note WHERE id = $1 AND learner_id = $2 RETURNING id", [id, LEARNER_ID]);
  if (!r.length) throw new NotFound("note not found");
}

// ── Bookmarks ──────────────────────────────────────────────────────────────────────────────────────
export const bookmarkSchema = z.object({ targetType: z.enum(["lesson", "question", "exercise"]), targetId: z.string().min(1).max(100) });

export async function toggleBookmark(b: z.infer<typeof bookmarkSchema>): Promise<boolean> {
  const del = await query("DELETE FROM bookmark WHERE learner_id = $1 AND target_type = $2 AND target_id = $3 RETURNING 1", [LEARNER_ID, b.targetType, b.targetId]);
  if (del.length) return false;
  const table = { lesson: "lesson", question: "question", exercise: "coding_exercise" }[b.targetType]; // fixed map, never input
  if (!(await one(`SELECT 1 FROM ${table} WHERE id = $1`, [b.targetId]))) throw new NotFound(`${b.targetType} not found`);
  await query("INSERT INTO bookmark(learner_id, target_type, target_id) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING", [LEARNER_ID, b.targetType, b.targetId]);
  return true;
}

export async function bookmarks() {
  return query<{ targetType: string; targetId: string; title: string | null; domainId: string | null; createdAt: Date }>(
    `SELECT b.target_type AS "targetType", b.target_id AS "targetId", b.created_at AS "createdAt",
       COALESCE(l.title, left(q.prompt_md, 140), e.title) AS title, COALESCE(l.domain_id, o.domain_id, o2.domain_id) AS "domainId"
     FROM bookmark b
     LEFT JOIN lesson l ON b.target_type = 'lesson' AND l.id = b.target_id
     LEFT JOIN question q ON b.target_type = 'question' AND q.id = b.target_id LEFT JOIN exam_objective o ON o.id = q.objective_id
     LEFT JOIN coding_exercise e ON b.target_type = 'exercise' AND e.id = b.target_id LEFT JOIN exam_objective o2 ON o2.id = e.objective_id
     WHERE b.learner_id = $1 ORDER BY b.created_at DESC`, [LEARNER_ID]);
}

// ── Search ─────────────────────────────────────────────────────────────────────────────────────────
export interface SearchHit { type: "lesson" | "rule" | "note" | "question"; id: string; title: string; snippet: string; href: string; domainId: string | null }

/**
 * Full-text search over lessons, key rules, personal notes and questions the learner has already attempted
 * (unseen questions are excluded so search can't spoil future practice or exams).
 * Snippets mark matches with «…» — rendered as <mark> by the UI without HTML injection.
 */
export async function search(q: string, limit = 30): Promise<SearchHit[]> {
  const term = q.trim().slice(0, 200);
  if (term.length < 2) return [];
  const like = `%${term.replace(/[%_\\]/g, (c) => "\\" + c)}%`;
  const hl = "StartSel=«, StopSel=», MaxWords=28, MinWords=10, ShortWord=2, MaxFragments=1";
  const rows = await query<SearchHit & { rank: number }>(
    `WITH tsq AS (SELECT websearch_to_tsquery('english', $2) AS q)
     SELECT * FROM (
       SELECT 'lesson' AS type, l.id, l.title, ts_headline('english', l.summary || ' ' || l.body_md, tsq.q, $4) AS snippet,
              '/lessons/' || l.id AS href, l.domain_id AS "domainId",
              ts_rank(to_tsvector('english', l.title || ' ' || l.summary || ' ' || l.body_md), tsq.q) + CASE WHEN l.title ILIKE $3 THEN 1 ELSE 0 END AS rank
       FROM lesson l, tsq WHERE NOT l.retired AND (to_tsvector('english', l.title || ' ' || l.summary || ' ' || l.body_md) @@ tsq.q OR l.title ILIKE $3)
       UNION ALL
       SELECT 'rule', l.id || '#' || r.ord, l.title, r.rule, '/lessons/' || l.id, l.domain_id, 2 + CASE WHEN r.rule ILIKE $3 THEN 1 ELSE 0 END
       FROM lesson l CROSS JOIN LATERAL jsonb_array_elements_text(l.key_rules) WITH ORDINALITY AS r(rule, ord), tsq
       WHERE NOT l.retired AND (r.rule ILIKE $3 OR to_tsvector('english', r.rule) @@ tsq.q)
       UNION ALL
       SELECT 'note', n.id::text, COALESCE(NULLIF(n.title,''), 'Note'), ts_headline('english', n.body_md, tsq.q, $4), '/knowledge?note=' || n.id,
              n.domain_id, 3 + ts_rank(to_tsvector('english', n.title || ' ' || n.body_md), tsq.q)
       FROM personal_note n, tsq WHERE n.learner_id = $1 AND (to_tsvector('english', n.title || ' ' || n.body_md) @@ tsq.q OR n.body_md ILIKE $3 OR n.title ILIKE $3)
       UNION ALL
       SELECT 'question', q.id, q.id || ' · ' || left(q.prompt_md, 90), ts_headline('english', q.prompt_md || ' ' || q.rule_md, tsq.q, $4),
              '/practice?question=' || q.id, o.domain_id, ts_rank(to_tsvector('english', q.prompt_md || ' ' || coalesce(q.code,'') || ' ' || q.rule_md), tsq.q)
       FROM question q JOIN exam_objective o ON o.id = q.objective_id, tsq
       WHERE NOT q.retired AND ${notInOpenExam("q.id")} AND EXISTS (SELECT 1 FROM question_attempt a WHERE a.learner_id = $1 AND a.question_id = q.id)
         AND (to_tsvector('english', q.prompt_md || ' ' || coalesce(q.code,'') || ' ' || q.rule_md) @@ tsq.q OR q.code ILIKE $3 OR q.rule_md ILIKE $3)
     ) hits ORDER BY rank DESC LIMIT $5`, [LEARNER_ID, term, like, hl, limit]);
  return rows.map(({ rank: _rank, ...h }) => h);
}
