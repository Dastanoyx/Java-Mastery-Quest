// Loads and validates all curriculum content from disk.
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import {
  blueprintSchema, questionSchema, exerciseSchema, lessonFrontSchema, achievementSchema,
  type Blueprint, type QuestionDef, type ExerciseDef, type LessonFront,
} from "./schema.ts";
import { z } from "zod";

export interface PredictBlock { index: number; code: string; output: string; line: number }
export interface LessonDef extends LessonFront { body: string; file: string; predicts: PredictBlock[]; embeddedChecks: string[]; embeddedExercises: string[] }
export interface QuestionWithFile extends QuestionDef { file: string }
export interface ExerciseWithFile extends ExerciseDef { file: string }
export interface Achievement { id: string; title: string; description: string; icon: string; xp: number }

export interface Content {
  dir: string;
  blueprint: Blueprint;
  lessons: LessonDef[];
  questions: QuestionWithFile[];
  exercises: ExerciseWithFile[];
  achievements: Achievement[];
  errors: string[];
}

export function contentDir(): string {
  return resolve(process.env.CONTENT_DIR ?? join(/*turbopackIgnore: true*/ process.cwd(), "..", "content"));
}

export function hashOf(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 16);
}

function walk(dir: string, ext: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const name of readdirSync(dir).sort()) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p, ext));
    else if (name.endsWith(ext)) out.push(p);
  }
  return out;
}

function fmtZod(e: z.ZodError): string {
  return e.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ");
}

export function splitFrontMatter(src: string): { front: unknown; body: string } {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(src);
  if (!m) throw new Error("missing front matter (--- ... ---)");
  return { front: parseYaml(m[1]), body: m[2] };
}

/** Finds ```java predict blocks followed by an ```output block. */
export function extractPredicts(body: string): PredictBlock[] {
  const re = /```java[^\n]*\bpredict\b[^\n]*\n([\s\S]*?)```\s*\n```output\n([\s\S]*?)```/g;
  const out: PredictBlock[] = [];
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(body))) {
    const line = body.slice(0, m.index).split("\n").length;
    out.push({ index: i++, code: m[1], output: m[2], line });
  }
  return out;
}

export function loadContent(dir = contentDir()): Content {
  const errors: string[] = [];
  const rel = (p: string) => relative(dir, p);

  const bpRaw = parseYaml(readFileSync(join(dir, "blueprint.yaml"), "utf8"));
  const bp = blueprintSchema.safeParse(bpRaw);
  if (!bp.success) throw new Error("blueprint.yaml invalid: " + fmtZod(bp.error));
  const blueprint = bp.data;
  const objectiveIds = new Set(blueprint.domains.flatMap((d) => d.objectives.map((o) => o.id)));
  const domainIds = new Set(blueprint.domains.map((d) => d.id));

  const questions: QuestionWithFile[] = [];
  for (const file of walk(join(dir, "questions"), ".yaml")) {
    let docs: unknown;
    try { docs = parseYaml(readFileSync(file, "utf8")); } catch (e) { errors.push(`${rel(file)}: YAML error ${(e as Error).message}`); continue; }
    if (!Array.isArray(docs)) { errors.push(`${rel(file)}: expected a list of questions`); continue; }
    docs.forEach((raw, idx) => {
      const r = questionSchema.safeParse(raw);
      if (!r.success) errors.push(`${rel(file)}[${idx}] ${(raw as { id?: string })?.id ?? ""}: ${fmtZod(r.error)}`);
      else questions.push({ ...r.data, file: rel(file) });
    });
  }

  const exercises: ExerciseWithFile[] = [];
  for (const file of walk(join(dir, "exercises"), ".yaml")) {
    const docs = parseYaml(readFileSync(file, "utf8"));
    if (!Array.isArray(docs)) { errors.push(`${rel(file)}: expected a list`); continue; }
    docs.forEach((raw, idx) => {
      const r = exerciseSchema.safeParse(raw);
      if (!r.success) errors.push(`${rel(file)}[${idx}]: ${fmtZod(r.error)}`);
      else exercises.push({ ...r.data, file: rel(file) });
    });
  }

  const lessons: LessonDef[] = [];
  for (const file of walk(join(dir, "lessons"), ".md")) {
    try {
      const { front, body } = splitFrontMatter(readFileSync(file, "utf8"));
      const r = lessonFrontSchema.safeParse(front);
      if (!r.success) { errors.push(`${rel(file)}: ${fmtZod(r.error)}`); continue; }
      const embeddedChecks = [...body.matchAll(/^::check\s+(\S+)\s*$/gm)].map((m) => m[1]);
      const embeddedExercises = [...body.matchAll(/^::exercise\s+(\S+)\s*$/gm)].map((m) => m[1]);
      lessons.push({ ...r.data, body, file: rel(file), predicts: extractPredicts(body), embeddedChecks, embeddedExercises });
    } catch (e) {
      errors.push(`${rel(file)}: ${(e as Error).message}`);
    }
  }

  let achievements: Achievement[] = [];
  const achFile = join(dir, "achievements.yaml");
  if (existsSync(achFile)) {
    const raw = parseYaml(readFileSync(achFile, "utf8"));
    const r = z.array(achievementSchema).safeParse(raw);
    if (!r.success) errors.push(`achievements.yaml: ${fmtZod(r.error)}`);
    else achievements = r.data;
  }

  // ───── cross-reference checks ─────
  const qIds = new Map<string, string>();
  for (const q of questions) {
    if (qIds.has(q.id)) errors.push(`duplicate question id ${q.id} (${q.file} and ${qIds.get(q.id)})`);
    qIds.set(q.id, q.file);
    if (!objectiveIds.has(q.objective)) errors.push(`${q.id}: unknown objective ${q.objective}`);
  }
  const lessonIds = new Map<string, LessonDef>();
  for (const l of lessons) {
    if (lessonIds.has(l.id)) errors.push(`duplicate lesson id ${l.id}`);
    lessonIds.set(l.id, l);
  }
  const exIds = new Set<string>();
  for (const e of exercises) {
    if (exIds.has(e.id)) errors.push(`duplicate exercise id ${e.id}`);
    exIds.add(e.id);
    if (!objectiveIds.has(e.objective)) errors.push(`${e.id}: unknown objective ${e.objective}`);
    if (e.lesson && !lessonIds.has(e.lesson)) errors.push(`${e.id}: unknown lesson ${e.lesson}`);
  }
  for (const q of questions) {
    if (q.lesson && !lessonIds.has(q.lesson)) errors.push(`${q.id}: unknown lesson ${q.lesson}`);
  }
  const orderKeys = new Set<string>();
  for (const l of lessons) {
    if (!domainIds.has(l.domain)) errors.push(`${l.id}: unknown domain ${l.domain}`);
    const ok = `${l.domain}#${l.order}`;
    if (orderKeys.has(ok)) errors.push(`${l.id}: duplicate order ${l.order} in ${l.domain}`);
    orderKeys.add(ok);
    for (const o of l.objectives) if (!objectiveIds.has(o)) errors.push(`${l.id}: unknown objective ${o}`);
    for (const p of l.prerequisites) if (!lessonIds.has(p)) errors.push(`${l.id}: unknown prerequisite ${p}`);
    for (const c of [...l.checks, ...l.mastery, ...l.embeddedChecks]) if (!qIds.has(c)) errors.push(`${l.id}: unknown question ${c}`);
    for (const x of l.embeddedExercises) if (!exIds.has(x)) errors.push(`${l.id}: unknown exercise ${x}`);
    const dupInMastery = l.mastery.filter((m) => l.checks.includes(m) || l.embeddedChecks.includes(m));
    if (dupInMastery.length) errors.push(`${l.id}: mastery quiz reuses knowledge-check questions ${dupInMastery.join(",")}`);
    const sections = (l.body.match(/^## /gm) ?? []).length;
    if (sections < 3) errors.push(`${l.id}: lesson needs ≥3 '## ' sections (has ${sections})`);
    if (/<script|javascript:/i.test(l.body)) errors.push(`${l.id}: script content is not allowed in lessons`);
  }
  // prerequisite cycles
  const visiting = new Set<string>(), done = new Set<string>();
  const visit = (id: string, path: string[]) => {
    if (done.has(id)) return;
    if (visiting.has(id)) { errors.push(`prerequisite cycle: ${[...path, id].join(" → ")}`); return; }
    visiting.add(id);
    for (const p of lessonIds.get(id)?.prerequisites ?? []) visit(p, [...path, id]);
    visiting.delete(id); done.add(id);
  };
  for (const l of lessons) visit(l.id, []);

  return { dir, blueprint, lessons, questions, exercises, achievements, errors };
}

/** Normalises program output for comparison: trims trailing spaces per line and trailing newlines. */
export function normalizeOutput(s: string): string {
  return s.replace(/\r\n/g, "\n").split("\n").map((l) => l.replace(/\s+$/, "")).join("\n").replace(/\n+$/, "");
}
