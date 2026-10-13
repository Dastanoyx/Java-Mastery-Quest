import Link from "next/link";
import type { Metadata } from "next";
import { Timer, Zap, Layers, Swords, SlidersHorizontal, AlertTriangle, ArrowRight } from "lucide-react";
import { listAttempts, sweepExpiredAttempts } from "@/server/services/exams";
import { examBlueprint, domains as loadDomains } from "@/server/config";
import { Chip, Empty, LinkButton, PageHeader, SectionTitle } from "@/components/ui";
import { StartExamButton } from "@/components/StartExamButton";
import { DomainExamPicker } from "@/components/exam/DomainExamPicker";
import { clock, shortDate, minutesText } from "@/components/format";

export const metadata: Metadata = { title: "Mock Exams" };

const KIND_LABEL: Record<string, string> = { full: "Full mock", short: "Short timed", domain: "Domain", boss: "Boss battle", custom: "Timed challenge" };

function MockTrend({ points, pass, target }: { points: { pct: number; date: string }[]; pass: number; target: number }) {
  if (points.length < 2) return null;
  const W = 520, H = 140, P = 24;
  const x = (i: number) => P + (i * (W - 2 * P)) / (points.length - 1);
  const y = (v: number) => H - P - (v / 100) * (H - 2 * P);
  const d = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.pct).toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`Full mock scores, oldest to newest: ${points.map((p) => p.pct.toFixed(0) + "%").join(", ")}. Pass mark ${pass}%, personal target ${target}%.`}>
      {[[pass, "pass"], [target, "target"]].map(([v, l]) => (
        <g key={l as string}>
          <line x1={P} x2={W - P} y1={y(v as number)} y2={y(v as number)} stroke={l === "pass" ? "var(--border-strong)" : "var(--signal)"} strokeDasharray="4 4" strokeWidth={1} />
          <text x={W - P} y={y(v as number) - 4} textAnchor="end" fontSize="10" fill="var(--faint)">{l} {v}%</text>
        </g>
      ))}
      <path d={d} fill="none" stroke="var(--series-1)" strokeWidth={2} strokeLinejoin="round" />
      {points.map((p, i) => <circle key={i} cx={x(i)} cy={y(p.pct)} r={3.5} fill="var(--series-1)" stroke="var(--surface)" strokeWidth={1.5}><title>{`${p.date}: ${p.pct.toFixed(1)}%`}</title></circle>)}
    </svg>
  );
}

type Props = { searchParams: Promise<{ preset?: string }> };

export default async function ExamsPage({ searchParams }: Props) {
  const { preset } = await searchParams;
  await sweepExpiredAttempts();
  const [attempts, bp, doms] = await Promise.all([listAttempts(100), examBlueprint(), loadDomains()]);
  const open = attempts.filter((a) => !a.submittedAt);
  const done = attempts.filter((a) => a.submittedAt);
  const fulls = done.filter((a) => a.kind === "full").reverse().map((a) => ({ pct: a.scorePercent ?? 0, date: shortDate(a.submittedAt!) }));
  const shortCount = 15;
  const shortMinutes = Math.round((shortCount * bp.durationMinutes) / bp.questionCount);

  return (
    <>
      <PageHeader title="Mock Exam Center"
        description="Strict simulations: a real countdown, no hints, no feedback and no correctness indicators until you submit. Answers save as you go, so a refresh never costs you an attempt.">
        <div className="mt-4 flex flex-wrap items-center gap-2 text-[13px]">
          <Chip tone="ion">{bp.code}</Chip>
          <span className="text-muted"><span className="tabular text-ink">{bp.questionCount}</span> questions · <span className="tabular text-ink">{bp.durationMinutes}</span> min · pass <span className="tabular text-ink">{bp.passingPercent}%</span> · your target <span className="tabular text-signal">{bp.readyTargetPercent}%</span></span>
          {bp.verification !== "official" && <span className="inline-flex items-center gap-1 text-amber" title={bp.verificationNote ?? ""}><AlertTriangle size={13} aria-hidden />format from secondary sources — <Link href="/settings#blueprint" className="underline underline-offset-2">details</Link></span>}
        </div>
      </PageHeader>

      {open.length > 0 && (
        <section className="panel mb-6 border-amber/50 p-4" aria-label="Attempts in progress">
          {open.map((a) => (
            <div key={a.id} className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-[14px]"><span className="font-medium text-ink">{a.title}</span> <span className="text-muted">— in progress, {a.deadlineAt ? `${clock((new Date(a.deadlineAt).getTime() - Date.now()) / 1000)} left` : "untimed"}</span></div>
              <LinkButton href={`/exams/${a.id}`} variant="primary" size="sm">Resume<ArrowRight size={14} /></LinkButton>
            </div>
          ))}
        </section>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-4">
        <section className={`panel flex flex-col p-5 ${preset === "full" ? "ring-2 ring-ion" : ""}`} aria-labelledby="full-h">
          <div className="flex items-center gap-2"><Timer size={18} className="text-ion-strong" aria-hidden /><h2 id="full-h" className="font-semibold text-ink">Full mock exam</h2></div>
          <p className="mt-2 flex-1 text-[13.5px] text-muted">{bp.questionCount} questions across all ten domains in {bp.durationMinutes} minutes, preferring questions you have seen least. The only attempt type that feeds the readiness model.</p>
          <StartExamButton config={{ kind: "full" }} variant="primary" className="mt-4 w-full"
            confirm={`${bp.questionCount} questions, ${bp.durationMinutes} minutes. Set aside the time — the clock keeps running if you leave.`}>Start full mock</StartExamButton>
        </section>
        <section className={`panel flex flex-col p-5 ${preset === "short" ? "ring-2 ring-ion" : ""}`} aria-labelledby="short-h">
          <div className="flex items-center gap-2"><Zap size={18} className="text-amber" aria-hidden /><h2 id="short-h" className="font-semibold text-ink">Short timed exam</h2></div>
          <p className="mt-2 flex-1 text-[13.5px] text-muted">{shortCount} mixed-domain questions in {shortMinutes} minutes — the real exam&apos;s pace. Good for a busy day.</p>
          <StartExamButton config={{ kind: "short", count: shortCount }} className="mt-4 w-full" confirm={`${shortCount} questions, ${shortMinutes} minutes. Ready?`}>Start short exam</StartExamButton>
        </section>
        <section className="panel flex flex-col p-5" aria-labelledby="dom-h">
          <div className="flex items-center gap-2"><Layers size={18} className="text-signal" aria-hidden /><h2 id="dom-h" className="font-semibold text-ink">Domain exam</h2></div>
          <p className="mb-4 mt-2 flex-1 text-[13.5px] text-muted">One domain, exam pace. Use it to confirm a region before moving on.</p>
          <DomainExamPicker domains={doms.map((d) => ({ id: d.id, short: d.short }))} />
        </section>
        <section className="panel flex flex-col p-5" aria-labelledby="other-h">
          <div className="flex items-center gap-2"><Swords size={18} className="text-arc" aria-hidden /><h2 id="other-h" className="font-semibold text-ink">Boss battles &amp; custom</h2></div>
          <p className="mt-2 flex-1 text-[13.5px] text-muted">Each region has a boss: harder questions, a tighter clock, pass at 75 %. Or build a timed challenge from any filter.</p>
          <div className="mt-4 flex flex-col gap-2">
            <LinkButton href="/curriculum" className="w-full"><Swords size={15} />Choose a region</LinkButton>
            <LinkButton href="/practice" variant="ghost" className="w-full"><SlidersHorizontal size={15} />Custom timed challenge</LinkButton>
          </div>
        </section>
      </div>

      <div className="mt-8 grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <section className="panel p-5" aria-labelledby="hist-h">
          <SectionTitle id="hist-h" aside={`${done.length} submitted`}>Attempt history</SectionTitle>
          {done.length === 0 ? (
            <Empty icon={<Timer size={18} />} title="No attempts yet">Every attempt is kept with its questions, your answers and the time you used — old attempts are never overwritten.</Empty>
          ) : (
            <div className="relative -mx-1 overflow-x-auto">
              <table className="w-full min-w-[560px] text-[13.5px]">
                <thead><tr className="text-left text-[12px] text-faint"><th className="px-1 py-2 font-medium">Date</th><th className="px-1 py-2 font-medium">Attempt</th><th className="px-1 py-2 text-right font-medium">Score</th><th className="px-1 py-2 text-right font-medium">Time</th><th className="px-1 py-2 font-medium"><span className="sr-only">Result</span></th></tr></thead>
                <tbody className="divide-y divide-line">
                  {done.map((a) => {
                    const used = (new Date(a.submittedAt!).getTime() - new Date(a.startedAt).getTime()) / 1000;
                    return (
                      <tr key={a.id}>
                        <td className="tabular whitespace-nowrap px-1 py-2.5 text-muted">{shortDate(a.submittedAt!)}</td>
                        <td className="px-1 py-2.5"><Link href={`/results/${a.id}`} className="text-ink hover:text-ion-strong">{a.title}</Link><div className="text-[12px] text-faint">{KIND_LABEL[a.kind]}{a.submitReason === "timeout" ? " · time ran out" : ""}</div></td>
                        <td className="tabular px-1 py-2.5 text-right text-ink">{a.scorePercent?.toFixed(0)}% <span className="text-faint">({a.scoreCorrect}/{a.scoreTotal})</span></td>
                        <td className="tabular whitespace-nowrap px-1 py-2.5 text-right text-muted">{minutesText(used)}</td>
                        <td className="px-1 py-2.5 text-right">{a.passed ? <Chip tone="signal">Pass</Chip> : <Chip tone="rose">Below pass</Chip>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
        <section className="panel p-5" aria-labelledby="trend-h">
          <SectionTitle id="trend-h">Full mock trend</SectionTitle>
          {fulls.length >= 2 ? <MockTrend points={fulls} pass={bp.passingPercent} target={bp.readyTargetPercent} /> : (
            <p className="text-[13.5px] text-muted">The trend appears after two full mocks. Readiness asks for three recent full mocks at or above your {bp.readyTargetPercent} % target, on different question sets, with time to spare.</p>
          )}
        </section>
      </div>
    </>
  );
}
