import type { Metadata } from "next";
import { domains as loadDomains, objectives as loadObjectives } from "@/server/config";
import { query, LEARNER_ID } from "@/server/db";
import { getLearner } from "@/server/services/learner";
import { PageHeader } from "@/components/ui";
import { PracticeArena } from "@/components/practice/PracticeArena";

export const metadata: Metadata = { title: "Practice Arena" };

const FORMAT_LABEL: Record<string, string> = {
  "predict-output": "Predict the output", "select-valid": "Find the valid code", "compile-error": "Identify the compilation error",
  "runtime-exception": "Runtime exception", concept: "Concept", trace: "Execution tracing", "does-it-compile": "Does it compile?",
  "overload-resolution": "Overload resolution", polymorphism: "Polymorphism", repair: "Repair broken code",
};

type Props = { searchParams: Promise<{ domain?: string; mode?: string; autostart?: string; question?: string; source?: string }> };

export default async function PracticePage({ searchParams }: Props) {
  const sp = await searchParams;
  const [doms, objs, formats, learner, counts] = await Promise.all([
    loadDomains(), loadObjectives(),
    query<{ format: string; n: number }>("SELECT format, count(*)::int AS n FROM question WHERE NOT retired GROUP BY format ORDER BY n DESC"),
    getLearner(),
    query<{ missed: number; bookmarked: number; unseen: number }>(
      `SELECT (SELECT count(*)::int FROM mistake_record WHERE learner_id = $1 AND resolved_at IS NULL) AS missed,
              (SELECT count(*)::int FROM bookmark WHERE learner_id = $1 AND target_type = 'question') AS bookmarked,
              (SELECT count(*)::int FROM question q WHERE NOT q.retired AND NOT EXISTS (SELECT 1 FROM question_attempt a WHERE a.learner_id = $1 AND a.question_id = q.id)) AS unseen`, [LEARNER_ID]),
  ]);
  const initialDomains = sp.domain && /^D\d{1,2}$/.test(sp.domain.toUpperCase()) ? [sp.domain.toUpperCase()] : [];
  const source = (["smart", "unseen", "missed", "bookmarked", "all"] as const).find((s) => s === sp.source) ?? "smart";
  return (
    <>
      <PageHeader title="Practice Arena"
        description="Learning mode: answer, then see why every option is right or wrong. Mixed sessions interleave objectives so you learn to tell similar rules apart. Want exam conditions instead? Use a timed challenge." />
      <PracticeArena
        domains={doms.map((d) => ({ id: d.id, short: d.short }))}
        objectives={objs.map((o) => ({ id: o.id, domainId: o.domainId, title: o.title }))}
        formats={formats.map((f) => ({ id: f.format, label: FORMAT_LABEL[f.format] ?? f.format, n: f.n }))}
        counts={counts[0]}
        initial={{ domains: initialDomains, source, autostart: sp.autostart === "1", questionId: sp.question ?? null }}
        askConfidence={learner.askConfidence}
        defaultDifficulty={learner.difficultyPreference}
      />
    </>
  );
}
