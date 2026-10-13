import { one, query, LEARNER_ID, type Db } from "../db.ts";
import { dayKey } from "../domain/time.ts";

export interface Learner {
  id: number;
  displayName: string;
  onboardedAt: Date | null;
  experienceLevel: string | null;
  priorCertification: string | null;
  dailyMinutes: number;
  studyDays: number[];
  targetExamDate: string | null;
  strongDomains: string[];
  weakDomains: string[];
  modePreference: "learning" | "balanced" | "exam";
  askConfidence: boolean;
  timezone: string;
  reducedMotion: boolean;
  theme: "dark" | "light" | "system";
  remindersEnabled: boolean;
  reminderTime: string | null;
  lastLessonId: string | null;
  difficultyPreference: string;
  reviewBatchSize: number;
  sidebarCollapsed: boolean;
  createdAt: Date;
}

export async function getLearner(db?: Db): Promise<Learner> {
  const r = await one<Learner>(
    `SELECT id, display_name AS "displayName", onboarded_at AS "onboardedAt", experience_level AS "experienceLevel",
       prior_certification AS "priorCertification", daily_minutes AS "dailyMinutes", study_days AS "studyDays",
       to_char(target_exam_date, 'YYYY-MM-DD') AS "targetExamDate", strong_domains AS "strongDomains", weak_domains AS "weakDomains",
       mode_preference AS "modePreference", ask_confidence AS "askConfidence", timezone, reduced_motion AS "reducedMotion", theme,
       reminders_enabled AS "remindersEnabled", to_char(reminder_time, 'HH24:MI') AS "reminderTime", last_lesson_id AS "lastLessonId",
       difficulty_preference AS "difficultyPreference", review_batch_size AS "reviewBatchSize", sidebar_collapsed AS "sidebarCollapsed",
       created_at AS "createdAt"
     FROM learner WHERE id = $1`, [LEARNER_ID], db);
  if (!r) throw new Error("Learner row missing — run `npm run seed`");
  return r;
}

export async function today(db?: Db): Promise<{ day: string; tz: string }> {
  const r = await one<{ timezone: string }>("SELECT timezone FROM learner WHERE id = $1", [LEARNER_ID], db);
  const tz = r?.timezone ?? "UTC";
  return { day: dayKey(new Date(), tz), tz };
}

export async function totalXp(db?: Db): Promise<number> {
  const r = await one<{ xp: number }>("SELECT COALESCE(SUM(amount),0)::int AS xp FROM xp_transaction WHERE learner_id = $1", [LEARNER_ID], db);
  return r?.xp ?? 0;
}

/** Idempotent XP award. Returns the amount actually awarded (0 if this source_key was already paid). */
export async function awardXp(db: Db, sourceKey: string, amount: number, reason: string, detail: Record<string, unknown> = {}): Promise<number> {
  if (amount <= 0) return 0;
  const r = await query<{ amount: number }>(
    `INSERT INTO xp_transaction(learner_id, amount, reason, source_key, detail) VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (learner_id, source_key) DO NOTHING RETURNING amount`,
    [LEARNER_ID, amount, reason, sourceKey, JSON.stringify(detail)], db);
  return r[0]?.amount ?? 0;
}

export async function bumpActivity(db: Db, fields: Partial<Record<"questions" | "correct" | "lessons" | "reviews" | "active_seconds", number>>) {
  const { day } = await today(db);
  const q = fields.questions ?? 0, c = fields.correct ?? 0, l = fields.lessons ?? 0, r = fields.reviews ?? 0, s = fields.active_seconds ?? 0;
  await query(
    `INSERT INTO activity_day(learner_id, day, questions, correct, lessons, reviews, active_seconds) VALUES ($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT (learner_id, day) DO UPDATE SET questions = activity_day.questions + EXCLUDED.questions,
       correct = activity_day.correct + EXCLUDED.correct, lessons = activity_day.lessons + EXCLUDED.lessons,
       reviews = activity_day.reviews + EXCLUDED.reviews, active_seconds = activity_day.active_seconds + EXCLUDED.active_seconds`,
    [LEARNER_ID, day, q, c, l, r, Math.min(s, 3600)], db);
}
