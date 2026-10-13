import Link from "next/link";
import type { Metadata } from "next";
import { NotebookPen, RotateCcw, Flame, CircleCheck } from "lucide-react";
import { listMistakes } from "@/server/services/journal";
import { MISTAKE_CATEGORIES } from "@/server/domain/mistakes";
import { domains as loadDomains } from "@/server/config";
import { AnsweredQuestion } from "@/components/Feedback";
import { MistakeEditor } from "@/components/MistakeEditor";
import { Chip, Empty, LinkButton, PageHeader } from "@/components/ui";
import { relativeDay, shortDate, timeAgo } from "@/components/format";

export const metadata: Metadata = { title: "Mistake Journal" };

const MODE_LABEL: Record<string, string> = { practice: "practice", review: "review", lesson_check: "lesson check", lesson_mastery: "mastery quiz", exam: "exam", boss: "boss", timed: "timed" };
type Props = { searchParams: Promise<{ status?: string; domain?: string; category?: string }> };

export default async function MistakesPage({ searchParams }: Props) {
  const sp = await searchParams;
  const status = sp.status === "resolved" || sp.status === "all" ? sp.status : "open";
  const domainId = sp.domain && /^D\d{1,2}$/.test(sp.domain) ? sp.domain : undefined;
  const category = sp.category && sp.category in MISTAKE_CATEGORIES ? sp.category : undefined;
  const [list, all, doms] = await Promise.all([listMistakes({ status, domainId, category }), listMistakes({ status: "all" }), loadDomains()]);
  const open = all.filter((m) => !m.resolvedAt);
  const byCat = Object.entries(MISTAKE_CATEGORIES).map(([k, label]) => ({ k, label, n: open.filter((m) => m.category === k).length })).filter((c) => c.n > 0);
  const href = (patch: Record<string, string | undefined>) => {
    const q = new URLSearchParams(Object.entries({ status, domain: domainId, category, ...patch }).filter(([, v]) => v && v !== "open") as [string, string][]);
    return `/mistakes${q.size ? `?${q}` : ""}`;
  };

  return (
    <>
      <PageHeader title="Mistake Journal"
        description="Every wrong answer, kept with what you chose, why it was wrong and how often it happened. A mistake resolves only after two correct answers on different days — seeing the answer once is not enough."
        actions={open.length > 0 ? <LinkButton href="/practice?source=missed&autostart=1" variant="primary"><RotateCcw size={15} />Retry open mistakes</LinkButton> : undefined}>
        <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1 text-[13.5px] text-muted">
          <span><span className="tabular font-semibold text-rose">{open.length}</span> open</span>
          <span><span className="tabular font-semibold text-signal">{all.length - open.length}</span> resolved</span>
          <span><span className="tabular font-semibold text-amber">{open.filter((m) => m.highConfidenceWrong).length}</span> confident misses</span>
          <span><span className="tabular font-semibold text-ink">{open.filter((m) => m.wrongCount >= 2).length}</span> repeated</span>
        </div>
      </PageHeader>

      <nav className="mb-5 flex flex-wrap items-center gap-2 text-[13px]" aria-label="Filters">
        {(["open", "resolved", "all"] as const).map((s) => (
          <Link key={s} href={href({ status: s })} aria-current={status === s ? "page" : undefined}
            className={`h-8 rounded-full border px-3 leading-[30px] ${status === s ? "border-ion bg-ion-soft text-ink" : "border-line text-muted hover:text-ink"}`}>{s[0].toUpperCase() + s.slice(1)}</Link>
        ))}
        <span className="mx-1 h-5 w-px bg-line" aria-hidden />
        <Link href={href({ domain: undefined })} className={`h-8 rounded-full border px-3 leading-[30px] ${!domainId ? "border-ion bg-ion-soft text-ink" : "border-line text-muted hover:text-ink"}`}>All domains</Link>
        {doms.map((d) => (
          <Link key={d.id} href={href({ domain: d.id })} title={d.short} className={`h-8 rounded-full border px-3 leading-[30px] ${domainId === d.id ? "border-ion bg-ion-soft text-ink" : "border-line text-muted hover:text-ink"}`}>{d.id}</Link>
        ))}
      </nav>
      {byCat.length > 0 && (
        <div className="mb-5 flex flex-wrap items-center gap-2 text-[13px]">
          <span className="text-faint">Open by cause:</span>
          {byCat.map((c) => (
            <Link key={c.k} href={href({ category: category === c.k ? undefined : c.k })} className={`rounded-full px-2.5 py-0.5 ${category === c.k ? "bg-rose text-white" : "bg-rose-soft text-rose hover:bg-rose/25"}`}>{c.label} · {c.n}</Link>
          ))}
        </div>
      )}

      {list.length === 0 ? (
        <Empty icon={status === "open" ? <CircleCheck size={18} /> : <NotebookPen size={18} />} title={status === "open" ? (all.length ? "No open mistakes here" : "No mistakes yet") : "Nothing matches these filters"}
          action={<LinkButton href="/practice?autostart=1">Practise</LinkButton>}>
          {all.length ? "Resolved mistakes stay in spaced review so they don't come back." : "When you answer something wrong, it lands here with its explanation and a plan to fix it."}
        </Empty>
      ) : (
        <ul className="space-y-3">
          {list.map((m) => {
            const lr = m.lastResponse;
            return (
              <li key={m.question.id} id={m.question.id} className="scroll-mt-20">
                <details className="panel group" open={list.length <= 3}>
                  <summary className="flex cursor-pointer list-none flex-col gap-2 p-4 md:flex-row md:items-center md:gap-4 [&::-webkit-details-marker]:hidden">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5 text-[12.5px]">
                        <Chip>{m.question.objectiveId}</Chip>
                        {m.category && <Chip tone="rose">{MISTAKE_CATEGORIES[m.category as keyof typeof MISTAKE_CATEGORIES]}</Chip>}
                        {m.highConfidenceWrong && <Chip tone="amber" title="You marked “Sure” and were wrong"><Flame size={12} />Confident miss</Chip>}
                        {m.wrongCount >= 2 && <Chip tone="rose">Wrong {m.wrongCount}×</Chip>}
                        {m.resolvedAt && <Chip tone="signal"><CircleCheck size={12} />Resolved {shortDate(m.resolvedAt)}</Chip>}
                      </div>
                      <p className="mt-1.5 line-clamp-2 text-[14px] text-ink">{m.question.promptMd.replace(/[`*]/g, "")}</p>
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px] text-faint">
                      <span>last wrong {timeAgo(m.lastWrongAt)}</span>
                      {!m.resolvedAt && m.review && <span className={new Date(m.review.dueAt) <= new Date() ? "text-amber" : ""}>{new Date(m.review.dueAt) <= new Date() ? "review due now" : `review ${relativeDay(m.review.dueAt)}`}</span>}
                      <span className="text-muted group-open:hidden">Show</span><span className="hidden text-muted group-open:inline">Hide</span>
                    </div>
                  </summary>
                  <div className="border-t border-line p-5">
                    <div className="callout callout-note mb-5"><div className="callout-title">Recommended next action</div><p className="text-[14px] text-ink">{m.recommendation}</p>
                      {!m.resolvedAt && <div className="mt-2 flex flex-wrap gap-2"><LinkButton size="sm" href={`/practice?question=${encodeURIComponent(m.question.id)}`}>Retry this question</LinkButton>{m.question.lessonId && <LinkButton size="sm" variant="ghost" href={`/lessons/${m.question.lessonId}`}>Open lesson</LinkButton>}</div>}
                    </div>
                    <AnsweredQuestion q={m.question} chosen={lr && "options" in lr ? lr.options : []} textAnswer={lr && "text" in lr ? lr.text : null} feedback={m.feedback} />
                    <div className="mt-6 border-t border-line pt-5">
                      <MistakeEditor questionId={m.question.id} category={m.category} categorySource={m.categorySource} note={m.personalNote} categories={MISTAKE_CATEGORIES} />
                    </div>
                    <div className="mt-5">
                      <div className="mb-2 text-[12.5px] text-muted">History · first wrong {shortDate(m.firstWrongAt)} · {m.correctSince} correct since the last miss</div>
                      <ol className="flex flex-wrap gap-1.5" aria-label="Answer history, oldest first">
                        {m.history.map((h, i) => (
                          <li key={i} title={`${new Date(h.answeredAt).toLocaleString()} · ${MODE_LABEL[h.mode] ?? h.mode}`}
                            className={`rounded-[6px] px-2 py-0.5 text-[12px] ${h.correct ? "bg-signal-soft text-signal" : "bg-rose-soft text-rose"}`}>
                            {h.correct ? "✓" : "✗"} {MODE_LABEL[h.mode] ?? h.mode}
                          </li>
                        ))}
                      </ol>
                    </div>
                  </div>
                </details>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
