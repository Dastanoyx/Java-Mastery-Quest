// Generates docs/COVERAGE_REPORT.md: every exam objective with its lessons, questions (by difficulty and
// verification status), exercises and gaps. Usage: npm run content:report
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { loadContent } from "../src/content/load.ts";
import { loadConfusables } from "../src/content/confusables.ts";

interface VResult { ok: boolean; jdk: string }

export function buildReport(): string {
  const c = loadContent();
  const vf = join(c.dir, ".verification", "java-results.json");
  const vraw = existsSync(vf) ? JSON.parse(readFileSync(vf, "utf8")) as { jdk?: string; generatedAt?: string; results: Record<string, VResult> } : { results: {} };
  const verified = (id: string) => Object.entries(vraw.results).some(([k, v]) => (k === `question:${id}` || k.startsWith(`question:${id}/`)) && v.ok);
  const pairs = loadConfusables(c.dir);
  const DIFFS = ["foundation", "intermediate", "advanced", "expert"] as const;
  const lines: string[] = [];
  const objectives = c.blueprint.domains.flatMap((d) => d.objectives.map((o) => ({ ...o, domain: d })));
  const examEligible = c.questions.filter((q) => q.examEligible && q.type !== "text");

  lines.push("# Curriculum & Question-Bank Coverage Report", "");
  lines.push(`Generated ${new Date().toISOString().slice(0, 10)} by \`npm run content:report\` from \`content/\`. Do not edit by hand.`, "");
  lines.push("## Totals", "");
  lines.push("| Item | Count |", "|---|---|");
  lines.push(`| Domains / objectives | ${c.blueprint.domains.length} / ${objectives.length} |`);
  lines.push(`| Lessons (core + supplementary) | ${c.lessons.length} (${c.lessons.filter((l) => !l.supplementary).length} + ${c.lessons.filter((l) => l.supplementary).length}) |`);
  lines.push(`| Lesson words | ${c.lessons.reduce((s, l) => s + l.body.split(/\s+/).length, 0).toLocaleString("en")} |`);
  lines.push(`| Predict-the-output blocks in lessons | ${c.lessons.reduce((s, l) => s + l.predicts.length, 0)} |`);
  lines.push(`| Questions | ${c.questions.length} (${examEligible.length} exam-eligible) |`);
  lines.push(`| Questions compiled & run on JDK ${vraw.jdk ?? "25"} | ${c.questions.filter((q) => verified(q.id)).length} |`);
  lines.push(`| Concept questions without code (reviewed, not machine-checkable) | ${c.questions.filter((q) => !q.code && !q.java && !q.options?.some((o) => o.java)).length} |`);
  lines.push(`| Questions flagged for manual review | ${c.questions.filter((q) => q.manualReview).length} |`);
  lines.push(`| Coding exercises | ${c.exercises.length} |`);
  lines.push(`| Confusable-concept pairs | ${pairs.length} |`, "");

  lines.push("## By difficulty", "", "| Difficulty | Questions | Exam-eligible |", "|---|---|---|");
  for (const d of DIFFS) lines.push(`| ${d} | ${c.questions.filter((q) => q.difficulty === d).length} | ${examEligible.filter((q) => q.difficulty === d).length} |`);
  lines.push("", "## By format", "", "| Format | Questions |", "|---|---|");
  const formats = [...new Set(c.questions.map((q) => q.format))].sort();
  for (const f of formats) lines.push(`| ${f} | ${c.questions.filter((q) => q.format === f).length} |`);

  lines.push("", "## Objective map", "");
  lines.push("Wording status: **reconstructed** = derived from the official 1Z0-830 objectives plus Java 22–25 final features, pending comparison with Oracle's 1Z0-831 topic list (see EXAM_BLUEPRINT.md).", "");
  lines.push("| Objective | Status | Lessons | Questions (F/I/A/E) | JDK-verified | Exercises | Gaps |", "|---|---|---|---|---|---|---|");
  const gaps: string[] = [];
  for (const o of objectives) {
    const ls = c.lessons.filter((l) => l.objectives.includes(o.id));
    const qs = c.questions.filter((q) => q.objective === o.id);
    const ex = c.exercises.filter((e) => e.objective === o.id);
    const byD = DIFFS.map((d) => qs.filter((q) => q.difficulty === d).length);
    const g: string[] = [];
    if (!ls.length) g.push("no lesson");
    if (qs.length < 10) g.push(`only ${qs.length} questions`);
    if (byD[2] + byD[3] < 3) g.push("few advanced/expert");
    if (!ex.length) g.push("no exercise");
    if (g.length) gaps.push(`- **${o.id}** — ${g.join(", ")}`);
    lines.push(`| **${o.id}** ${o.title.length > 90 ? o.title.slice(0, 88) + "…" : o.title} | ${o.verification} | ${ls.map((l) => l.id).join("<br>") || "—"} | ${qs.length} (${byD.join("/")}) | ${qs.filter((q) => verified(q.id)).length} | ${ex.length} | ${g.join("; ") || "—"} |`);
  }
  lines.push("", "## Known gaps (prioritised for the next content pass)", "");
  lines.push(...(gaps.length ? gaps : ["- None by the thresholds above (≥ 10 questions, ≥ 3 advanced/expert, ≥ 1 lesson and exercise per objective)."]));
  lines.push("", "Thresholds are deliberately modest; a bank this size is a solid start, not an exhaustive one. Question count alone is never the goal — every new question must test a distinct rule or combination.");
  return lines.join("\n") + "\n";
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const out = resolve(process.cwd(), "..", "docs", "COVERAGE_REPORT.md");
  writeFileSync(out, buildReport());
  console.log(`✓ wrote ${out}`);
}
