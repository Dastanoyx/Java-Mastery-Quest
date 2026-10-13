import { z } from "zod";
import { query, tx, LEARNER_ID } from "../db.ts";
import { BadRequest } from "../errors.ts";

const domainId = z.string().regex(/^D\d{1,2}$/);

export const onboardingSchema = z.object({
  experienceLevel: z.enum(["new", "some", "professional", "expert"]).nullable().optional(),
  priorCertification: z.string().max(200).nullable().optional(),
  dailyMinutes: z.number().int().min(10).max(480).optional(),
  studyDays: z.array(z.number().int().min(1).max(7)).max(7).optional(),
  targetExamDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  strongDomains: z.array(domainId).max(10).optional(),
  weakDomains: z.array(domainId).max(10).optional(),
  modePreference: z.enum(["learning", "balanced", "exam"]).optional(),
});

export const settingsSchema = onboardingSchema.extend({
  displayName: z.string().min(1).max(60).optional(),
  askConfidence: z.boolean().optional(),
  timezone: z.string().max(64).refine((tz) => { try { new Intl.DateTimeFormat("en", { timeZone: tz }); return true; } catch { return false; } }, "unknown time zone").optional(),
  reducedMotion: z.boolean().optional(),
  theme: z.enum(["dark", "light", "system"]).optional(),
  remindersEnabled: z.boolean().optional(),
  reminderTime: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
  difficultyPreference: z.enum(["adaptive", "foundation", "intermediate", "advanced", "expert"]).optional(),
  reviewBatchSize: z.number().int().min(5).max(100).optional(),
  sidebarCollapsed: z.boolean().optional(),
});
export type SettingsInput = z.infer<typeof settingsSchema>;

const COLUMNS: Record<keyof SettingsInput, string> = {
  displayName: "display_name", experienceLevel: "experience_level", priorCertification: "prior_certification", dailyMinutes: "daily_minutes",
  studyDays: "study_days", targetExamDate: "target_exam_date", strongDomains: "strong_domains", weakDomains: "weak_domains",
  modePreference: "mode_preference", askConfidence: "ask_confidence", timezone: "timezone", reducedMotion: "reduced_motion", theme: "theme",
  remindersEnabled: "reminders_enabled", reminderTime: "reminder_time", difficultyPreference: "difficulty_preference",
  reviewBatchSize: "review_batch_size", sidebarCollapsed: "sidebar_collapsed",
};

export async function updateSettings(input: SettingsInput, opts: { completeOnboarding?: boolean } = {}) {
  const sets: string[] = [];
  const params: unknown[] = [LEARNER_ID];
  for (const [k, v] of Object.entries(input) as [keyof SettingsInput, unknown][]) {
    if (v === undefined || !COLUMNS[k]) continue;
    params.push(v);
    sets.push(`${COLUMNS[k]} = $${params.length}`); // column names come from the fixed map above, never from input
  }
  if (opts.completeOnboarding) sets.push("onboarded_at = COALESCE(onboarded_at, now())");
  if (!sets.length) return;
  await query(`UPDATE learner SET ${sets.join(", ")} WHERE id = $1`, params);
}

const LEARNER_TABLES = [
  "lesson_event", "readiness_snapshot", "coding_submission", "exam_attempt_answer", "exam_attempt", "review_log", "review_item",
  "mistake_record", "xp_transaction", "learner_achievement", "quest", "question_attempt", "lesson_progress", "bookmark", "personal_note",
  "activity_day", "study_session",
] as const;

/** Full export of everything the learner produced (JSON). Content is not included — it lives in /content. */
export async function exportData() {
  const out: Record<string, unknown> = { exportedAt: new Date().toISOString(), app: "java-mastery-quest", formatVersion: 1 };
  out.learner = (await query("SELECT * FROM learner WHERE id = $1", [LEARNER_ID]))[0];
  for (const t of LEARNER_TABLES) {
    out[t] = t === "exam_attempt_answer"
      ? await query("SELECT x.* FROM exam_attempt_answer x JOIN exam_attempt e ON e.id = x.attempt_id WHERE e.learner_id = $1 ORDER BY x.attempt_id, x.position", [LEARNER_ID])
      : await query(`SELECT * FROM ${t} WHERE learner_id = $1`, [LEARNER_ID]);
  }
  return out;
}

export const RESET_PHRASE = "RESET MY PROGRESS";

/** Deletes all learning history. Keeps the profile/preferences unless `includeProfile`. Requires the exact phrase. */
export async function resetProgress(phrase: string, includeProfile: boolean) {
  if (phrase !== RESET_PHRASE) throw new BadRequest(`type "${RESET_PHRASE}" to confirm`);
  await tx(async (c) => {
    for (const t of LEARNER_TABLES) {
      if (t === "exam_attempt_answer") await query("DELETE FROM exam_attempt_answer x USING exam_attempt e WHERE e.id = x.attempt_id AND e.learner_id = $1", [LEARNER_ID], c);
      else await query(`DELETE FROM ${t} WHERE learner_id = $1`, [LEARNER_ID], c);
    }
    await query("UPDATE learner SET last_lesson_id = NULL WHERE id = $1", [LEARNER_ID], c);
    if (includeProfile) {
      await query("DELETE FROM learner WHERE id = $1", [LEARNER_ID], c);
      await query("INSERT INTO learner(id, display_name) VALUES ($1, 'Yassin')", [LEARNER_ID], c);
    }
  });
}
