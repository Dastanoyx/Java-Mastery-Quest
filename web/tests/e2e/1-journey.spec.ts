// Phase 1 — the full learning journey on a fresh installation, through the real UI.
import { test, expect, type Page } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
import { db, one, answer } from "./helpers";

test.describe.configure({ mode: "serial" });
let page: Page;
const state: Record<string, unknown> = {};
const LESSON = "values-primitives-operators";

test.beforeAll(async ({ browser }) => {
  page = await browser.newPage();
  page.on("pageerror", (e) => { throw new Error(`page error: ${e.message}`); });
});
test.afterAll(async () => { await db.end(); });

test("a fresh install opens on the Command Center with onboarding offered", async () => {
  const n = await one<{ n: number }>("SELECT count(*)::int AS n FROM question_attempt");
  expect(n.n, "the E2E database must be fresh").toBe(0);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Welcome, Yassin." })).toBeVisible();
  await expect(page.getByRole("link", { name: "Set up my plan" })).toBeVisible();
});

test("onboarding can be completed and shapes the plan", async () => {
  await page.goto("/onboarding");
  await page.getByRole("button", { name: /Professional/ }).click();
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("button", { name: /^60 min/ }).click();
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("button", { name: /^Concurrency: not set/ }).click(); // mark Concurrency weak
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("button", { name: /Balanced/ }).click();
  await page.getByRole("button", { name: "Build my plan" }).click();
  await page.waitForURL("/");
  await expect(page.getByText("Set up your study plan in two minutes")).toHaveCount(0);
  const l = await one<{ daily_minutes: number; weak_domains: string[]; onboarded_at: Date | null }>("SELECT daily_minutes, weak_domains, onboarded_at FROM learner WHERE id = 1");
  expect(l.daily_minutes).toBe(60);
  expect(l.weak_domains).toEqual(["D8"]);
  expect(l.onboarded_at).not.toBeNull();
});

test("a lesson: write a prediction, then answer a knowledge check", async () => {
  await page.goto(`/lessons/${LESSON}`);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Primitives");
  const block = page.locator("[data-predict='0']");
  await block.locator("textarea").fill("my prediction");
  await block.getByRole("button", { name: "Commit & reveal" }).click();
  await expect(block.getByText(/Exact match|Not the same/)).toBeVisible();

  const check = page.locator("#lesson-body [data-question]").first();
  const qid = (await check.getAttribute("data-question"))!;
  await answer(check, qid, true);
  await check.getByRole("button", { name: "Check answer" }).click();
  await expect(check.getByText("Correct", { exact: true })).toBeVisible();
  await expect(check.getByText("The rule")).toBeVisible();
});

test("completing the mastery quiz completes the lesson and pays XP once", async () => {
  const items = page.locator("#mastery li[data-question]");
  const n = await items.count();
  expect(n).toBeGreaterThanOrEqual(3);
  for (let i = 0; i < n; i++) {
    const li = items.nth(i);
    await answer(li, (await li.getAttribute("data-question"))!, true);
  }
  await page.getByRole("button", { name: "Submit mastery quiz" }).click();
  await expect(page.getByText("Mission complete")).toBeVisible();
  const p = await one<{ status: string; mastery_score: number }>("SELECT status, mastery_score FROM lesson_progress WHERE lesson_id = $1", [LESSON]);
  expect(p.status).toBe("completed");
  expect(Number(p.mastery_score)).toBe(1);
  const xp = await one<{ n: number }>("SELECT count(*)::int AS n FROM xp_transaction WHERE source_key = $1", [`lesson-complete:${LESSON}`]);
  expect(xp.n).toBe(1);
});

test("a practice session gives feedback, records a mistake and earns XP for new correct answers", async () => {
  await page.goto("/practice");
  await page.getByLabel("Questions").selectOption("5");
  const xpBefore = (await one<{ xp: number }>("SELECT COALESCE(sum(amount),0)::int AS xp FROM xp_transaction")).xp;
  await page.getByRole("button", { name: "Start 5 questions" }).click();
  for (let i = 0; i < 5; i++) {
    const card = page.locator("[data-question]").first();
    await expect(card).toBeVisible();
    const qid = (await card.getAttribute("data-question"))!;
    await answer(card, qid, i !== 0); // the first one is answered wrong on purpose
    await card.getByRole("button", { name: "Check answer" }).click();
    await expect(card.locator("[data-feedback]")).toBeVisible();
    if (i === 0) { state.wrongQuestion = qid; await expect(card.getByText("Not quite")).toBeVisible(); }
    await page.getByRole("button", { name: i === 4 ? /Finish session/ : /Next question/ }).click();
    // Fail fast (instead of hanging on the next card) if the session did not advance.
    if (i < 4) await expect(page.getByText(`Question ${i + 2} of 5`)).toBeVisible();
  }
  await expect(page.getByRole("heading", { name: "Session complete" })).toBeVisible();
  const xpAfter = (await one<{ xp: number }>("SELECT COALESCE(sum(amount),0)::int AS xp FROM xp_transaction")).xp;
  expect(xpAfter).toBeGreaterThan(xpBefore);
  const m = await one<{ n: number }>("SELECT count(*)::int AS n FROM mistake_record WHERE question_id = $1 AND resolved_at IS NULL", [state.wrongQuestion]);
  expect(m.n).toBe(1);
});

test("the missed question is scheduled and can be reviewed", async () => {
  // A miss enters a 10-minute relearning step; answering earlier would be an immediate repeat, not a review.
  const r0 = await one<{ due_at: Date; interval_days: number }>("SELECT due_at, interval_days FROM review_item WHERE question_id = $1", [state.wrongQuestion]);
  expect(Number(r0.interval_days)).toBeLessThan(1);
  await page.goto("/review");
  await expect(page.getByRole("button", { name: /Start review/ })).toHaveCount(0); // nothing due yet
  // Fast-forward 15 minutes for the relearning items (the only time travel in this test).
  await db.query("UPDATE review_item SET due_at = due_at - interval '15 minutes', last_reviewed_at = last_reviewed_at - interval '15 minutes' WHERE interval_days < 1");
  await page.goto("/review");
  await page.getByRole("button", { name: /Start review/ }).click();
  let reviewed = 0;
  for (let i = 0; i < 40; i++) {
    if (await page.getByRole("heading", { name: "Review done" }).isVisible()) break;
    const card = page.locator("[data-question]").first();
    await expect(card).toBeVisible();
    await answer(card, (await card.getAttribute("data-question"))!, true);
    await card.getByRole("button", { name: "Check answer" }).click();
    await expect(card.locator("[data-feedback]")).toBeVisible();
    reviewed++;
    await page.getByRole("button", { name: /^(Next|Finish review)/ }).click();
  }
  await expect(page.getByRole("heading", { name: "Review done" })).toBeVisible();
  expect(reviewed).toBeGreaterThan(0);
  const r = await one<{ n: number }>("SELECT count(*)::int AS n FROM review_log WHERE question_id = $1", [state.wrongQuestion]);
  expect(r.n).toBeGreaterThanOrEqual(1);
});

test("a strict mock exam survives a refresh, hides answers, and is scored on submit", async () => {
  await page.goto("/exams");
  await page.getByRole("button", { name: "Start short exam" }).click();
  await page.getByRole("button", { name: "Start now" }).click();
  await page.waitForURL(/\/exams\/\d+$/);
  const attemptId = Number(page.url().split("/").pop());
  state.attemptId = attemptId;
  await expect(page.getByRole("timer")).toBeVisible();
  // No correctness signal anywhere before submission, and no answer leak through the rest of the app.
  await expect(page.getByText(/^(Correct|Not quite|The rule)$/)).toHaveCount(0);
  const firstId = await one<{ question_id: string }>("SELECT question_id FROM exam_attempt_answer WHERE attempt_id = $1 AND position = 1", [attemptId]);
  const leak = await page.request.post("/api/answers", { data: { questionId: firstId.question_id, response: { options: ["a"] }, mode: "practice" } });
  expect(leak.status()).toBe(409);
  expect((await page.request.get(`/api/questions/${firstId.question_id}`)).status()).toBe(409);
  const payload = JSON.stringify(await (await page.request.get(`/api/exams/${attemptId}`)).json());
  expect(payload).not.toContain(firstId.question_id);
  expect(payload).not.toMatch(/isCorrect|whyMd|explanationMd|hintMd":"|compile-error|runtime-exception|predict-output/);
  // The strict payload carries no question ids; the test maps position → question via the database.
  const idAt = async (pos: string) => (await one<{ question_id: string }>("SELECT question_id FROM exam_attempt_answer WHERE attempt_id = $1 AND position = $2", [attemptId, Number(pos)])).question_id;
  for (let i = 0; i < 3; i++) {
    const q = page.locator("section[data-position]");
    await answer(q, await idAt((await q.getAttribute("data-position"))!), true);
    if (i === 1) await page.getByRole("button", { name: "Flag for review" }).click();
    await page.getByRole("button", { name: "Next", exact: true }).click();
  }
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText("3/15 answered")).toBeVisible();
  await expect(page.locator('ol[aria-label="Questions"] button[aria-label*="flagged"]')).toHaveCount(1);
  await page.getByRole("button", { name: "Review & submit" }).first().click();
  await expect(page.getByText(/12\s*unanswered/)).toBeVisible();
  await page.getByRole("button", { name: "Submit for scoring" }).click();
  await page.waitForURL(`/results/${attemptId}`);
  await expect(page.getByText("Remediation plan")).toBeVisible();
  const a = await one<{ score_correct: number; score_total: number; submit_reason: string }>("SELECT score_correct, score_total, submit_reason FROM exam_attempt WHERE id = $1", [attemptId]);
  expect(a.score_total).toBe(15);
  expect(a.score_correct).toBe(3);
  expect(a.submit_reason).toBe("learner");
  state.examScore = a.score_correct;
});

test("a mistake can be classified and explained in the journal", async () => {
  await page.goto("/mistakes");
  const entry = page.locator(`li[id="${state.wrongQuestion}"] details`);
  await entry.locator("summary").click();
  await entry.getByLabel(/Why it happened/).selectOption("misread");
  await entry.getByLabel(/In your own words/).fill("I read the type of the second operand wrong.");
  await entry.getByRole("button", { name: "Save explanation" }).click();
  await expect(page.getByText("Saved", { exact: true }).first()).toBeVisible();
  const m = await one<{ category: string; category_source: string; personal_note: string }>("SELECT category, category_source, personal_note FROM mistake_record WHERE question_id = $1", [state.wrongQuestion]);
  expect(m).toEqual({ category: "misread", category_source: "learner", personal_note: "I read the type of the second operand wrong." });
});

test("record the state to verify after a restart", async () => {
  const s = await one<{ xp: number; attempts: number; completed: number; reviews: number }>(
    `SELECT (SELECT sum(amount)::int FROM xp_transaction) AS xp, (SELECT count(*)::int FROM question_attempt) AS attempts,
            (SELECT count(*)::int FROM lesson_progress WHERE status = 'completed') AS completed, (SELECT count(*)::int FROM review_log) AS reviews`);
  Object.assign(state, s);
  mkdirSync("test-results", { recursive: true });
  writeFileSync("test-results/e2e-state.json", JSON.stringify(state, null, 2));
});
