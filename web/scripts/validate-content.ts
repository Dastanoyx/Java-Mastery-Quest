// Static validation of all curriculum content (schema, references, duplicates, coverage minimums).
// Usage: npm run content:validate
import { loadContent, normalizeOutput } from "../src/content/load.ts";
import { loadConfusables } from "../src/content/confusables.ts";

const c = loadContent();
const errors = [...c.errors];
const warnings: string[] = [];

// near-duplicate detection: same code modulo identifiers & numbers
const fingerprint = (s: string) => normalizeOutput(s).replace(/\b[a-zA-Z_]\w*\b/g, "x").replace(/\d+/g, "0").replace(/\s+/g, "");
const seen = new Map<string, string>();
for (const q of c.questions) {
  if (q.code && q.code.length > 60) {
    const fp = fingerprint(q.code) + "|" + fingerprint(q.prompt);
    if (seen.has(fp)) errors.push(`${q.id}: near-duplicate of ${seen.get(fp)} (only identifiers/numbers differ)`);
    seen.set(fp, q.id);
  }
  if (q.format !== "concept" && q.format !== "short-answer" && !q.code && !q.options?.some((o) => o.java))
    warnings.push(`${q.id}: format ${q.format} without code`);
  if (q.code && !q.java && !q.options?.some((o) => o.java) && !q.manualReview)
    errors.push(`${q.id}: has code but no java verification block (set manualReview: true and justify if impossible)`);
  if (q.options) for (const o of q.options) if (o.why.trim().length < 15) warnings.push(`${q.id}/${o.key}: very short 'why'`);
}

// lessons: questions in mastery quiz should belong to lesson objectives
const qById = new Map(c.questions.map((q) => [q.id, q]));
for (const l of c.lessons) {
  for (const id of l.mastery) {
    const q = qById.get(id);
    if (q && !l.objectives.includes(q.objective)) warnings.push(`${l.id}: mastery question ${id} targets ${q.objective}, outside lesson objectives`);
  }
  if (l.predicts.length === 0) warnings.push(`${l.id}: no 'predict' code blocks`);
  if (!/\[!TRAP\]/.test(l.body)) warnings.push(`${l.id}: no exam-trap callout`);
}

// confusable pairs: schema + references
try {
  const pairs = loadConfusables(c.dir);
  const lessonIds = new Set(c.lessons.map((l) => l.id));
  const domainIds = new Set(c.blueprint.domains.map((d) => d.id));
  const ids = new Set<string>();
  for (const p of pairs) {
    if (ids.has(p.id)) errors.push(`confusables: duplicate id ${p.id}`);
    ids.add(p.id);
    for (const l of p.lessons) if (!lessonIds.has(l)) errors.push(`confusables/${p.id}: unknown lesson ${l}`);
    for (const d of p.domains) if (!domainIds.has(d)) errors.push(`confusables/${p.id}: unknown domain ${d}`);
  }
} catch (e) {
  errors.push(`confusables.yaml invalid: ${(e as Error).message.slice(0, 400)}`);
}

// objective coverage minimums
const objectives = c.blueprint.domains.flatMap((d) => d.objectives);
for (const o of objectives) {
  const lessons = c.lessons.filter((l) => l.objectives.includes(o.id)).length;
  const qs = c.questions.filter((q) => q.objective === o.id).length;
  if (!lessons) warnings.push(`objective ${o.id}: no lesson yet`);
  if (qs < 5) warnings.push(`objective ${o.id}: only ${qs} questions`);
}

for (const w of warnings) console.log("warn  " + w);
for (const e of errors) console.log("ERROR " + e);
console.log(`\n${c.lessons.length} lessons, ${c.questions.length} questions, ${c.exercises.length} exercises, ${c.achievements.length} achievements`);
console.log(`${errors.length} errors, ${warnings.length} warnings`);
process.exit(errors.length ? 1 : 0);
