import Link from "next/link";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Check, X, Flag, Timer, ArrowRight, Swords, Gauge } from "lucide-react";
import { examResults } from "@/server/services/exams";
import { one, LEARNER_ID } from "@/server/db";
import { AnsweredQuestion } from "@/components/Feedback";
import { Bar, Chip, LinkButton, SectionTitle, DIFFICULTY_LABEL } from "@/components/ui";
import { StartExamButton, type ExamConfig } from "@/components/StartExamButton";
import { Md } from "@/components/Md";
import { minutesText, shortDate } from "@/components/format";

type Props = { params: Promise<{ attemptId: string }> };
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const raw = (await params).attemptId;
  const id = Number(raw);
  const r = /^[1-9]\d{0,8}$/.test(raw) ? await one<{ title: string }>("SELECT title FROM exam_attempt WHERE id = $1 AND learner_id = $2", [id, LEARNER_ID]) : null;
  return { title: r ? `Results · ${r.title}` : "Results" };
}

export default async function ResultsPage({ params }: Props) {
  const { attemptId } = await params;
  const id = Number(attemptId);
  if (!/^[1-9]\d{0,8}$/.test(attemptId)) notFound();
  const exists = await one<{ submitted_at: Date | null }>("SELECT submitted_at FROM exam_attempt WHERE id = $1 AND learner_id = $2", [id, LEARNER_ID]);
  if (!exists) notFound();
  if (!exists.submitted_at) redirect(`/exams/${id}`);
  const r = await examResults(id);
  const a = r.attempt;
  const pct = a.scorePercent ?? 0;
  const wrong = r.items.filter((i) => !i.isCorrect);
  const right = r.items.filter((i) => i.isCorrect);
  const avgSec = r.items.length ? r.items.reduce((s, i) => s + i.timeMs, 0) / r.items.length / 1000 : 0;
  const retry: ExamConfig = a.kind === "boss" || a.kind === "domain"
    ? (a.kind === "boss" ? { kind: "boss", domainId: String(a.config.domainId) } : { kind: "domain", domainId: String(a.config.domainId), count: Number(a.config.count ?? 12) })
    : a.kind === "short" ? { kind: "short", count: Number(a.config.count ?? 15) } : a.kind === "full" ? { kind: "full" } : { kind: "custom", filter: (a.config.filter ?? {}) as Record<string, unknown>, title: a.title };
  const verdict = a.passed ? (pct >= r.readyTargetPercent ? "At or above your personal target" : "Above the pass mark — below your target") : a.kind === "boss" ? "The boss holds — for now" : "Below the pass mark";
  const confident = r.calibration.find((c) => c.confidence === 3);

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="text-[13px] text-faint">{shortDate(a.submittedAt!)} · {a.submitReason === "timeout" ? "submitted automatically when time ran out" : "submitted by you"}</div>
          <h1 className="text-[26px] font-semibold leading-tight tracking-[-0.015em] text-ink">{a.title}</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <StartExamButton config={retry} confirm="A new attempt starts immediately with a fresh question selection.">{a.kind === "boss" ? <><Swords size={15} />Fight again</> : <><Timer size={15} />New attempt</>}</StartExamButton>
          <LinkButton href="/exams" variant="ghost">All attempts</LinkButton>
        </div>
      </header>

      <section className="panel grid grid-cols-1 gap-6 p-5 md:grid-cols-[auto_minmax(0,1fr)] md:p-6" aria-label="Score">
        <div className="flex items-center gap-5">
          <div className={`tabular text-[52px] font-semibold leading-none tracking-[-0.03em] ${a.passed ? "text-signal" : "text-rose"}`}>{pct.toFixed(0)}<span className="text-[26px]">%</span></div>
          <div>
            <div className="font-semibold text-ink">{verdict}</div>
            <div className="text-[13.5px] text-muted"><span className="tabular">{a.scoreCorrect}/{a.scoreTotal}</span> correct · pass {r.passPercent}% · target {r.readyTargetPercent}%</div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div><div className="text-[13px] text-muted">Time used</div><div className="tabular text-[18px] font-semibold text-ink">{minutesText(r.timeUsedSeconds)}</div><div className="text-[12px] text-faint">of {minutesText(a.durationSeconds ?? 0)}</div></div>
          <div><div className="text-[13px] text-muted">Per question</div><div className="tabular text-[18px] font-semibold text-ink">{Math.round(avgSec)} s</div><div className="text-[12px] text-faint">allowed ≈ {Math.round((a.durationSeconds ?? 0) / Math.max(1, a.scoreTotal ?? 1))} s</div></div>
          <div><div className="text-[13px] text-muted">Unanswered</div><div className={`tabular text-[18px] font-semibold ${r.unanswered ? "text-amber" : "text-ink"}`}>{r.unanswered}</div></div>
          <div><div className="text-[13px] text-muted">Sure &amp; wrong</div><div className={`tabular text-[18px] font-semibold ${confident && confident.total - confident.correct > 0 ? "text-rose" : "text-ink"}`}>{confident ? confident.total - confident.correct : "—"}</div><div className="text-[12px] text-faint">overconfidence</div></div>
        </div>
        <div className="md:col-span-2">
          <div className="relative h-2.5 overflow-hidden rounded-full bg-raised" role="img" aria-label={`Score ${pct.toFixed(0)}%, pass mark ${r.passPercent}%, target ${r.readyTargetPercent}%`}>
            <div className={`h-full rounded-full ${a.passed ? "bg-signal" : "bg-rose"}`} style={{ width: `${pct}%` }} />
          </div>
          <div className="relative mt-1 h-4 text-[11px] text-faint">
            <span className="absolute -translate-x-1/2" style={{ left: `${r.passPercent}%` }}>▲ pass</span>
            <span className="absolute -translate-x-1/2" style={{ left: `${r.readyTargetPercent}%` }}>▲ target</span>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <section className="panel p-5 xl:col-span-2" aria-labelledby="plan-h">
          <SectionTitle id="plan-h">Remediation plan</SectionTitle>
          <ol className="list-decimal space-y-2 pl-5 text-[14px] text-ink marker:text-faint">{r.remediation.map((s, i) => <li key={i}><Md>{s}</Md></li>)}</ol>
          <SectionTitle id="obj-h"><span className="mt-6 block">Weakest objectives in this attempt</span></SectionTitle>
          <ul className="space-y-2.5">
            {r.byObjective.slice(0, 6).map((o) => (
              <li key={o.id} className="grid grid-cols-[3rem_minmax(0,1fr)_7rem] items-center gap-3 text-[13.5px]">
                <span className="font-semibold text-faint">{o.id}</span>
                <span className="min-w-0">
                  <span className="line-clamp-1 text-muted" title={o.title}>{o.title}</span>
                  {o.lessonId && o.correct < o.total && <Link href={`/lessons/${o.lessonId}`} className="text-[12.5px] text-ion-strong hover:underline">{o.lessonTitle}</Link>}
                </span>
                <span className="flex items-center gap-2"><Bar value={o.correct / o.total} tone={o.correct === o.total ? "signal" : "rose"} label={`${o.id} score`} /><span className="tabular w-9 text-right text-faint">{o.correct}/{o.total}</span></span>
              </li>
            ))}
          </ul>
        </section>
        <div className="space-y-6">
          <section className="panel p-5" aria-labelledby="dom-h">
            <SectionTitle id="dom-h">By domain</SectionTitle>
            <ul className="space-y-2">
              {r.byDomain.map((d) => (
                <li key={d.id} className="grid grid-cols-[2.4rem_minmax(0,1fr)_3rem] items-center gap-2 text-[13px]">
                  <Link href={`/curriculum/${d.id}`} className="font-semibold text-faint hover:text-ink" title={d.short}>{d.id}</Link>
                  <Bar value={d.correct / d.total} tone={d.correct / d.total >= r.passPercent / 100 ? "signal" : "rose"} label={`${d.short} score`} />
                  <span className="tabular text-right text-muted">{d.correct}/{d.total}</span>
                </li>
              ))}
            </ul>
          </section>
          <section className="panel p-5" aria-labelledby="diff-h">
            <SectionTitle id="diff-h">By difficulty</SectionTitle>
            <ul className="space-y-1.5 text-[13px]">{r.byDifficulty.map((d) => <li key={d.difficulty} className="flex justify-between"><span className="text-muted">{DIFFICULTY_LABEL[d.difficulty]}</span><span className="tabular text-ink">{d.correct}/{d.total}</span></li>)}</ul>
          </section>
          {r.calibration.some((c) => c.confidence > 0) && (
            <section className="panel p-5" aria-labelledby="cal-h">
              <SectionTitle id="cal-h"><span className="inline-flex items-center gap-1.5"><Gauge size={15} aria-hidden />Confidence calibration</span></SectionTitle>
              <table className="w-full text-[13px]">
                <thead><tr className="text-left text-[12px] text-faint"><th className="py-1 font-medium">You felt</th><th className="py-1 text-right font-medium">Answers</th><th className="py-1 text-right font-medium">Accuracy</th></tr></thead>
                <tbody>{r.calibration.map((c) => <tr key={c.confidence}><td className="py-1 text-muted">{c.label}</td><td className="tabular py-1 text-right text-ink">{c.total}</td><td className="tabular py-1 text-right text-ink">{Math.round((c.correct / c.total) * 100)}%</td></tr>)}</tbody>
              </table>
              <p className="mt-2 text-[12px] text-faint">Well calibrated means “Sure” is near 100 % and “Guessing” near chance.</p>
            </section>
          )}
        </div>
      </div>

      <section aria-labelledby="wrong-h">
        <SectionTitle id="wrong-h" aside={`${wrong.length} to learn from`}>Questions you missed</SectionTitle>
        {wrong.length === 0 ? <p className="text-muted">None — a clean sheet. These questions still enter spaced review to keep them that way.</p> : (
          <ol className="space-y-4">
            {wrong.map((i) => (
              <li key={i.position} className="panel p-5" id={`q${i.position}`}>
                <AnsweredQuestion q={i} chosen={i.response && "options" in i.response ? i.response.options : []} textAnswer={i.response && "text" in i.response ? i.response.text : null} feedback={i.feedback}
                  header={<span className="flex items-center gap-2 text-[12.5px]"><span className="text-faint">#{i.position}</span>{i.flagged && <Flag size={13} className="text-amber" aria-label="Flagged" />}{!i.response && <Chip tone="amber">Unanswered</Chip>}<Chip tone="rose"><X size={12} />Incorrect</Chip></span>} />
              </li>
            ))}
          </ol>
        )}
      </section>

      {right.length > 0 && (
        <details className="panel p-5">
          <summary className="cursor-pointer text-[15px] font-semibold text-ink">Questions you got right ({right.length}) <span className="text-[13px] font-normal text-muted">— check the reasoning matched yours</span></summary>
          <ol className="mt-4 space-y-4">
            {right.map((i) => (
              <li key={i.position} className="rounded-[12px] border border-line p-5">
                <AnsweredQuestion q={i} chosen={i.response && "options" in i.response ? i.response.options : []} feedback={i.feedback}
                  header={<span className="flex items-center gap-2 text-[12.5px]"><span className="text-faint">#{i.position}</span><Chip tone="signal"><Check size={12} />Correct</Chip></span>} />
              </li>
            ))}
          </ol>
        </details>
      )}

      <div className="flex justify-end"><LinkButton href="/mistakes" variant="primary">Open the Mistake Journal<ArrowRight size={15} /></LinkButton></div>
    </div>
  );
}
