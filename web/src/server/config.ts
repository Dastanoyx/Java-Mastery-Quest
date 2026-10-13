// Runtime configuration read from content/ and the database.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import { readinessConfigSchema, type ReadinessConfig } from "./domain/readiness.ts";
import { contentDir } from "../content/load.ts";
import { one, query } from "./db.ts";

let readinessCache: ReadinessConfig | null = null;
export function readinessConfig(): ReadinessConfig {
  if (!readinessCache) {
    const raw = parse(readFileSync(join(contentDir(), "readiness.yaml"), "utf8"));
    readinessCache = readinessConfigSchema.parse(raw);
  }
  return readinessCache;
}

export interface ExamBlueprint {
  code: string; title: string; questionCount: number; durationMinutes: number; passingPercent: number;
  readyTargetPercent: number; verification: string; verificationNote: string | null;
}

export async function examBlueprint(): Promise<ExamBlueprint> {
  const r = await one<Record<string, unknown>>("SELECT * FROM exam_blueprint LIMIT 1");
  if (!r) throw new Error("Exam blueprint missing — run `npm run seed`");
  return {
    code: r.code as string, title: r.title as string, questionCount: r.question_count as number,
    durationMinutes: r.duration_minutes as number, passingPercent: r.passing_percent as number,
    readyTargetPercent: r.ready_target_percent as number, verification: r.verification as string,
    verificationNote: (r.verification_note as string) ?? null,
  };
}

export interface DomainRow { id: string; ordinal: number; title: string; short: string; region: string; summary: string; icon: string }
export interface ObjectiveRow { id: string; domainId: string; ordinal: number; title: string; basis: string; verification: string; javaNotes: string | null; threshold: number }

export async function domains(): Promise<DomainRow[]> {
  return query<DomainRow>(`SELECT id, ordinal, title, short_title AS short, region_name AS region, summary, icon FROM exam_domain ORDER BY ordinal`);
}

export async function objectives(): Promise<ObjectiveRow[]> {
  return query<ObjectiveRow>(`SELECT o.id, o.domain_id AS "domainId", o.ordinal, o.title, o.basis, o.verification, o.java_notes AS "javaNotes",
      o.mastery_threshold AS threshold
    FROM exam_objective o JOIN exam_domain d ON d.id = o.domain_id ORDER BY d.ordinal, o.ordinal`);
}

export function runnerUrl(): string {
  return process.env.RUNNER_URL ?? "http://127.0.0.1:8090";
}
