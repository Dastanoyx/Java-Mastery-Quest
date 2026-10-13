import Link from "next/link";
import type { Metadata } from "next";
import { Crown, Repeat2, NotebookPen } from "lucide-react";
import { worldData } from "@/server/services/curriculum";
import { WorldMap } from "@/components/WorldMap";
import { NamedIcon } from "@/components/icons";
import { Bar, Chip, PageHeader, pct } from "@/components/ui";
import { LessonStatusIcon } from "@/components/status";

export const metadata: Metadata = { title: "Learning World" };

const STATE_CHIP = {
  untouched: { tone: "neutral", label: "Not started" },
  exploring: { tone: "ion", label: "Exploring" },
  needs_review: { tone: "amber", label: "Needs review" },
  mastered: { tone: "signal", label: "Mastered" },
} as const;

export default async function CurriculumPage() {
  const { regions, totals, next } = await worldData();
  return (
    <>
      <PageHeader
        title="The Learning World"
        description="Ten regions, one per exam domain. Each region holds missions (lessons with checks and a mastery quiz), coding exercises and a boss battle. Mastery fills in from your answers — not from pages opened."
      >
        <dl className="mt-4 flex flex-wrap gap-x-8 gap-y-2 text-[13.5px]">
          <div><dt className="inline text-muted">Missions completed </dt><dd className="tabular inline font-semibold text-ink">{totals.completed} / {totals.lessons}</dd></div>
          <div><dt className="inline text-muted">Objectives mastered </dt><dd className="tabular inline font-semibold text-ink">{totals.mastered} / {totals.objectives}</dd></div>
        </dl>
      </PageHeader>

      <WorldMap regions={regions} next={next} />

      <section aria-labelledby="regions-h" className="mt-8">
        <h2 id="regions-h" className="mb-3 text-[15px] font-semibold text-ink">All regions</h2>
        <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {regions.map((r) => {
            const chip = STATE_CHIP[r.state];
            const done = r.lessons.filter((l) => ["completed", "needs_review", "mastered"].includes(l.status)).length;
            return (
              <li key={r.id} className="panel flex flex-col p-5">
                <div className="flex items-start gap-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[10px] border border-line bg-sunken text-ion-strong"><NamedIcon name={r.icon} size={19} /></span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[12px] text-faint">{r.id} · {r.region}</div>
                    <Link href={`/curriculum/${r.id}`} className="block text-[16px] font-semibold leading-snug text-ink hover:text-ion-strong">{r.short}</Link>
                  </div>
                  <Chip tone={chip.tone}>{chip.label}</Chip>
                </div>
                <p className="mt-2 line-clamp-2 text-[13.5px] text-muted">{r.summary}</p>
                <div className="mt-4 flex items-center gap-3">
                  <Bar value={r.score} tone="signal" label={`${r.short} mastery`} />
                  <span className="tabular w-10 text-right text-[13px] text-muted">{r.attempted ? pct(r.score) : "—"}</span>
                </div>
                <ul className="mt-4 space-y-1.5 text-[13.5px]">
                  {r.lessons.map((l) => (
                    <li key={l.id} className="flex items-center gap-2">
                      <LessonStatusIcon status={l.status} size={15} />
                      <Link href={`/lessons/${l.id}`} className="min-w-0 flex-1 truncate text-muted hover:text-ink">{l.title}</Link>
                      <span className="tabular shrink-0 text-[12px] text-faint">{l.minutes} min</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line pt-3 text-[12.5px] text-muted" style={{ marginTop: "1rem" }}>
                  <span className="tabular">{done}/{r.lessons.length} missions</span>
                  <span className="tabular">{r.objectives.length} objectives</span>
                  <span className="tabular">{r.questionsAvailable} questions</span>
                  {r.dueReviews > 0 && <span className="inline-flex items-center gap-1 text-amber"><Repeat2 size={13} aria-hidden />{r.dueReviews} due</span>}
                  {r.unresolvedMistakes > 0 && <span className="inline-flex items-center gap-1 text-rose"><NotebookPen size={13} aria-hidden />{r.unresolvedMistakes} open</span>}
                  {r.boss.defeated && <span className="inline-flex items-center gap-1 text-arc"><Crown size={13} aria-hidden />Boss defeated</span>}
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    </>
  );
}
