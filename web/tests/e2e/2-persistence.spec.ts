// Phase 2 — runs after the app (and database) were restarted. Everything from phase 1 must still be there.
import { test, expect } from "@playwright/test";
import { readFileSync, existsSync } from "node:fs";
import { db, one } from "./helpers";

const file = "test-results/e2e-state.json";
test.skip(!existsSync(file) || process.env.E2E_PHASE !== "2", "run by scripts/e2e.sh after a restart");
test.afterAll(async () => { await db.end(); });

test("progress survives a restart of the app and the database", async ({ page }) => {
  const s = JSON.parse(readFileSync(file, "utf8")) as { xp: number; attempts: number; completed: number; reviews: number; attemptId: number; examScore: number; wrongQuestion: string };
  const now = await one<{ xp: number; attempts: number; completed: number; reviews: number }>(
    `SELECT (SELECT sum(amount)::int FROM xp_transaction) AS xp, (SELECT count(*)::int FROM question_attempt) AS attempts,
            (SELECT count(*)::int FROM lesson_progress WHERE status = 'completed') AS completed, (SELECT count(*)::int FROM review_log) AS reviews`);
  expect(now).toEqual({ xp: s.xp, attempts: s.attempts, completed: s.completed, reviews: s.reviews });

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Welcome back, Yassin." })).toBeVisible();
  await page.goto(`/results/${s.attemptId}`);
  await expect(page.getByText(`${s.examScore}/15`).first()).toBeVisible();
  await page.goto("/progress");
  await expect(page.getByText("Lessons completed", { exact: true }).locator("..")).toContainText(`${s.completed} / `);
  await page.goto("/mistakes?status=all");
  await page.locator(`li[id="${s.wrongQuestion}"] summary`).click();
  await expect(page.locator(`[id="note-${s.wrongQuestion}"]`)).toHaveValue("I read the type of the second operand wrong.");
});
