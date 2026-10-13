import Link from "next/link";
import type { Metadata } from "next";
import { CircleCheck, Code2, ShieldCheck } from "lucide-react";
import { listExercises } from "@/server/services/exercises";
import { runnerHealth } from "@/server/services/runner";
import { domains as loadDomains } from "@/server/config";
import { Chip, PageHeader, DIFFICULTY_LABEL, DIFFICULTY_TONE } from "@/components/ui";

export const metadata: Metadata = { title: "Coding Lab" };

const KIND_LABEL: Record<string, string> = { implement: "Implement", repair: "Repair", complete: "Complete", trace: "Trace" };

export default async function ExercisesPage() {
  const [list, doms, runner] = await Promise.all([listExercises(), loadDomains(), runnerHealth()]);
  return (
    <>
      <PageHeader title="Coding Lab"
        description="Write real Java and run it against hidden tests on JDK 25. Code runs in a separate, locked-down runner service — never inside the app — with time, memory and output limits." />
      <div className={`mb-6 flex items-center gap-2 rounded-[10px] border px-4 py-2.5 text-[13.5px] ${runner.ok ? "border-line text-muted" : "border-rose/50 bg-rose-soft text-ink"}`}>
        <ShieldCheck size={16} className={runner.ok ? "text-signal" : "text-rose"} aria-hidden />
        {runner.ok ? <>Runner online · JDK {runner.java}</> : <>The Java runner is offline, so code can&apos;t run right now. Start it with <span className="kbd">docker compose up -d runner</span> (or <span className="kbd">./runner/run-local.sh</span>). Everything else in the app keeps working.</>}
      </div>
      <div className="space-y-6">
        {doms.filter((d) => list.some((e) => e.domainId === d.id)).map((d) => (
          <section key={d.id} aria-labelledby={`ex-${d.id}`}>
            <h2 id={`ex-${d.id}`} className="mb-2 text-[14px] font-semibold text-ink"><span className="mr-2 text-faint">{d.id}</span>{d.short}</h2>
            <ul className="panel divide-y divide-line">
              {list.filter((e) => e.domainId === d.id).map((e) => (
                <li key={e.id}>
                  <Link href={`/exercises/${e.id}`} className="flex flex-wrap items-center gap-3 px-4 py-3 hover:bg-raised/50">
                    {e.passed ? <CircleCheck size={17} className="text-signal" aria-label="Passed" /> : <Code2 size={17} className="text-faint" aria-hidden />}
                    <span className="min-w-0 flex-1 text-[14.5px] text-ink">{e.title}</span>
                    <span className="text-[12.5px] text-faint">{e.objectiveId} · {KIND_LABEL[e.kind] ?? e.kind}{e.submissions ? ` · ${e.submissions} submission${e.submissions > 1 ? "s" : ""}` : ""}</span>
                    <Chip tone={DIFFICULTY_TONE[e.difficulty]}>{DIFFICULTY_LABEL[e.difficulty]}</Chip>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </>
  );
}
