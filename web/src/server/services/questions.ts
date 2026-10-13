// Question payloads. `PublicQuestion` never contains the answer, option explanations or the explanation —
// it is safe to send to the browser before the learner answers (and during strict exams).
import { query, type Db } from "../db.ts";
import type { Answer } from "../domain/scoring.ts";
import type { Difficulty, QuestionType } from "../domain/types.ts";

export interface PublicQuestion {
  id: string;
  objectiveId: string;
  objectiveTitle: string;
  domainId: string;
  domainShort: string;
  type: QuestionType;
  format: string;
  difficulty: Difficulty;
  promptMd: string;
  codeHtml: string | null;
  code: string | null;
  options: { key: string; textMd: string }[];
  estSeconds: number;
  hintMd: string | null;
  verification: string;
  verifiedWith: string | null;
  lessonId: string | null;
  lessonTitle: string | null;
  tags: string[];
  version: number;
  /** Multi-select only: how many options to choose. The real exam states this ("Choose two."), so we do too. */
  choose: number | null;
}

export interface Feedback {
  questionId: string;
  correct: boolean;
  correctKeys: string[];
  acceptedText: string[] | null;
  options: { key: string; textMd: string; isCorrect: boolean; whyMd: string }[];
  explanationMd: string;
  ruleMd: string;
  misconceptionMd: string | null;
  lessonId: string | null;
  lessonTitle: string | null;
}

const NUMBER_WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight"];
export function chooseLabel(n: number): string {
  return `Choose ${NUMBER_WORDS[n] ?? n}.`;
}
/** Content written before the format rule was confirmed says "Choose all that apply"; the exam never does. */
function normalizePrompt(prompt: string): string {
  return prompt.replace(/\s*\(?\s*(choose|select) all that apply\.?\s*\)?/gi, "").trimEnd();
}

export interface FullQuestion extends PublicQuestion {
  answer: Answer;
  explanationMd: string;
  ruleMd: string;
  misconceptionMd: string | null;
  optionsFull: { key: string; textMd: string; isCorrect: boolean; whyMd: string }[];
  retired: boolean;
}

const BASE = `SELECT q.id, q.objective_id AS "objectiveId", o.title AS "objectiveTitle", o.domain_id AS "domainId", d.short_title AS "domainShort",
    q.type, q.format, q.difficulty, q.prompt_md AS "promptMd", q.code_html AS "codeHtml", q.code, q.est_seconds AS "estSeconds",
    q.hint_md AS "hintMd", q.verification, q.verified_with AS "verifiedWith", q.lesson_id AS "lessonId", l.title AS "lessonTitle",
    q.tags, q.version, q.answer, q.explanation_md AS "explanationMd", q.rule_md AS "ruleMd", q.misconception_md AS "misconceptionMd",
    q.retired,
    COALESCE((SELECT json_agg(json_build_object('key', qo.key, 'textMd', qo.text_md, 'isCorrect', qo.is_correct, 'whyMd', qo.why_md) ORDER BY qo.ordinal)
              FROM question_option qo WHERE qo.question_id = q.id), '[]') AS "optionsFull"
  FROM question q JOIN exam_objective o ON o.id = q.objective_id JOIN exam_domain d ON d.id = o.domain_id
  LEFT JOIN lesson l ON l.id = q.lesson_id`;

export async function getFullQuestions(ids: string[], db?: Db): Promise<Map<string, FullQuestion>> {
  if (!ids.length) return new Map();
  const rows = await query<FullQuestion>(`${BASE} WHERE q.id = ANY($1)`, [ids], db);
  return new Map(rows.map((r) => [r.id, {
    ...r, options: r.optionsFull.map(({ key, textMd }) => ({ key, textMd })),
    choose: r.type === "multi" && "options" in r.answer ? r.answer.options.length : null,
  }]));
}

export async function getFullQuestion(id: string, db?: Db): Promise<FullQuestion | null> {
  return (await getFullQuestions([id], db)).get(id) ?? null;
}

export function toPublic(q: FullQuestion, opts: { includeHint: boolean } = { includeHint: true }): PublicQuestion {
  return {
    id: q.id, objectiveId: q.objectiveId, objectiveTitle: q.objectiveTitle, domainId: q.domainId, domainShort: q.domainShort,
    type: q.type, format: q.format, difficulty: q.difficulty, promptMd: normalizePrompt(q.promptMd), codeHtml: q.codeHtml, code: q.code,
    options: q.options, estSeconds: q.estSeconds, hintMd: opts.includeHint ? q.hintMd : null, verification: q.verification,
    verifiedWith: q.verifiedWith, lessonId: q.lessonId, lessonTitle: q.lessonTitle, tags: q.tags, version: q.version,
    choose: q.type === "multi" && "options" in q.answer ? q.answer.options.length : null,
  };
}

export function toFeedback(q: FullQuestion, correct: boolean): Feedback {
  return {
    questionId: q.id,
    correct,
    correctKeys: "options" in q.answer ? q.answer.options : [],
    acceptedText: "text" in q.answer ? q.answer.text : null,
    options: q.optionsFull,
    explanationMd: q.explanationMd,
    ruleMd: q.ruleMd,
    misconceptionMd: q.misconceptionMd,
    lessonId: q.lessonId,
    lessonTitle: q.lessonTitle,
  };
}

export async function getPublicQuestions(ids: string[], opts?: { includeHint: boolean }, db?: Db): Promise<PublicQuestion[]> {
  const map = await getFullQuestions(ids, db);
  return ids.map((id) => map.get(id)).filter((q): q is FullQuestion => Boolean(q)).map((q) => toPublic(q, opts));
}
