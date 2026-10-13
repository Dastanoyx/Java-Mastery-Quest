import type { Metadata } from "next";
import { AlertTriangle, BadgeCheck, CircleCheck, CircleX } from "lucide-react";
import { getLearner } from "@/server/services/learner";
import { RESET_PHRASE } from "@/server/services/settings";
import { runnerHealth } from "@/server/services/runner";
import { examBlueprint, domains as loadDomains, objectives as loadObjectives } from "@/server/config";
import { one } from "@/server/db";
import { PageHeader, Chip } from "@/components/ui";
import { SettingsForm } from "@/components/settings/SettingsForm";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const [learner, bp, doms, objs, runner, counts] = await Promise.all([
    getLearner(), examBlueprint(), loadDomains(), loadObjectives(), runnerHealth(),
    one<{ lessons: number; questions: number; verified: number; reviewed: number; needs: number; exercises: number; migrations: number }>(
      `SELECT (SELECT count(*)::int FROM lesson WHERE NOT retired) AS lessons, (SELECT count(*)::int FROM question WHERE NOT retired) AS questions,
         (SELECT count(*)::int FROM question WHERE NOT retired AND verification = 'jdk-verified') AS verified,
         (SELECT count(*)::int FROM question WHERE NOT retired AND verification = 'reviewed') AS reviewed,
         (SELECT count(*)::int FROM question WHERE NOT retired AND verification = 'needs-review') AS needs,
         (SELECT count(*)::int FROM coding_exercise WHERE NOT retired) AS exercises, (SELECT count(*)::int FROM schema_migrations) AS migrations`),
  ]);
  const pending = objs.filter((o) => o.verification !== "official").length;
  return (
    <>
      <PageHeader title="Settings" description="Everything stays on this machine: no account, no analytics, no cloud. Preferences shape the daily plan; nothing here changes how mastery is measured." />
      <div className="grid grid-cols-1 gap-6 2xl:grid-cols-[minmax(0,1fr)_400px]">
        <SettingsForm learner={JSON.parse(JSON.stringify(learner))} domains={doms.map((d) => ({ id: d.id, short: d.short }))} resetPhrase={RESET_PHRASE} />
        <div className="space-y-6">
          <section id="blueprint" className="panel scroll-mt-20 p-5" aria-labelledby="bp-h">
            <h2 id="bp-h" className="text-[16px] font-semibold text-ink">Exam blueprint</h2>
            <dl className="mt-3 grid grid-cols-[9rem_minmax(0,1fr)] gap-y-1.5 text-[13.5px]">
              <dt className="text-muted">Exam</dt><dd className="text-ink">{bp.code} · {bp.title}</dd>
              <dt className="text-muted">Format</dt><dd className="tabular text-ink">{bp.questionCount} questions · {bp.durationMinutes} min · pass {bp.passingPercent}%</dd>
              <dt className="text-muted">Your target</dt><dd className="tabular text-signal">{bp.readyTargetPercent}%</dd>
              <dt className="text-muted">Objectives</dt><dd className="tabular text-ink">{objs.length} in {doms.length} domains</dd>
            </dl>
            <div className={`mt-4 flex gap-2 rounded-[10px] border px-3 py-2.5 text-[13px] ${bp.verification === "official" && pending === 0 ? "border-signal/40 bg-signal-soft" : "border-amber/40 bg-amber-soft"}`}>
              {bp.verification === "official" && pending === 0 ? <BadgeCheck size={16} className="mt-0.5 shrink-0 text-signal" /> : <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber" />}
              <div className="text-ink">
                {bp.verification === "official" ? "Format verified against Oracle." : "Format from secondary sources."} {pending > 0 && `${pending} objective wordings are reconstructed and pending official verification.`}
                {bp.verificationNote && <p className="mt-1 text-muted">{bp.verificationNote}</p>}
                <p className="mt-1 text-muted">To finish: open Oracle&apos;s 1Z0-831 page → Review Exam Topics, update <span className="font-mono">content/blueprint.yaml</span>, then run the migrate job (see docs/EXAM_BLUEPRINT.md).</p>
              </div>
            </div>
          </section>
          <section className="panel p-5" aria-labelledby="sys-h">
            <h2 id="sys-h" className="text-[16px] font-semibold text-ink">System</h2>
            <ul className="mt-3 space-y-2 text-[13.5px]">
              <li className="flex items-center gap-2"><CircleCheck size={15} className="text-signal" aria-hidden /><span className="text-muted">Database</span><span className="ml-auto tabular text-ink">{counts?.migrations} migrations</span></li>
              <li className="flex items-center gap-2">{runner.ok ? <CircleCheck size={15} className="text-signal" aria-hidden /> : <CircleX size={15} className="text-rose" aria-hidden />}<span className="text-muted">Java runner</span>
                <span className="ml-auto text-ink">{runner.ok ? `JDK ${runner.java}` : <span className="text-rose">offline — Coding Lab unavailable</span>}</span></li>
            </ul>
            <h3 className="mb-2 mt-5 text-[13.5px] font-medium text-ink">Content</h3>
            <ul className="space-y-1.5 text-[13px] text-muted">
              <li className="flex justify-between"><span>Lessons</span><span className="tabular text-ink">{counts?.lessons}</span></li>
              <li className="flex justify-between"><span>Questions</span><span className="tabular text-ink">{counts?.questions}</span></li>
              <li className="flex justify-between pl-3"><span>compiled &amp; run on JDK 25</span><span className="tabular text-signal">{counts?.verified}</span></li>
              <li className="flex justify-between pl-3"><span>concept questions, reviewed</span><span className="tabular text-ink">{counts?.reviewed}</span></li>
              <li className="flex justify-between pl-3"><span>needs review</span><span className={`tabular ${counts?.needs ? "text-amber" : "text-ink"}`}>{counts?.needs}</span></li>
              <li className="flex justify-between"><span>Coding exercises</span><span className="tabular text-ink">{counts?.exercises}</span></li>
            </ul>
            <p className="mt-4 text-[12.5px] text-faint">Java Mastery Quest · created by Yassin Ghariani · <Chip>local-only</Chip></p>
          </section>
        </div>
      </div>
    </>
  );
}
