// Test-only helpers. The browser never sees correct answers; the test reads them from the test database
// so it can drive the UI down both the "correct" and the "wrong" path deterministically.
import pg from "pg";
import type { Locator } from "@playwright/test";

const url = process.env.E2E_DATABASE_URL;
if (!url) throw new Error("E2E_DATABASE_URL must point at the (fresh) database the app under test uses");
export const db = new pg.Pool({ connectionString: url, max: 2 });

export async function one<T>(sql: string, params: unknown[] = []): Promise<T> {
  const r = await db.query(sql, params);
  return r.rows[0] as T;
}

/** Option letters (A, B, …) in display order, split into correct and incorrect. */
export async function optionLetters(questionId: string): Promise<{ correct: string[]; wrong: string[]; type: string; accept: string[] }> {
  const q = await one<{ type: string; answer: { options?: string[]; text?: string[] } }>("SELECT type, answer FROM question WHERE id = $1", [questionId]);
  const opts = (await db.query("SELECT key FROM question_option WHERE question_id = $1 ORDER BY ordinal", [questionId])).rows as { key: string }[];
  const letter = (i: number) => String.fromCharCode(65 + i);
  const correctKeys = new Set(q.answer.options ?? []);
  return {
    type: q.type,
    correct: opts.flatMap((o, i) => (correctKeys.has(o.key) ? [letter(i)] : [])),
    wrong: opts.flatMap((o, i) => (correctKeys.has(o.key) ? [] : [letter(i)])),
    accept: q.answer.text ?? [],
  };
}

/** Answers the question rendered inside `card` (QuestionCard, OptionPicker): correctly, or with one wrong option. */
export async function answer(card: Locator, questionId: string, correctly: boolean) {
  const o = await optionLetters(questionId);
  if (o.type === "text") {
    await card.locator("textarea, input[type=text], input:not([type])").first().fill(correctly ? o.accept[0] : "definitely wrong");
    return;
  }
  const letters = correctly ? o.correct : [o.wrong[0]];
  const buttons = card.locator('button[role="radio"], button[role="checkbox"]');
  for (const l of letters) await buttons.nth(l.charCodeAt(0) - 65).click();
}
