import Link from "next/link";
import type { Metadata } from "next";
import { CircleCheck, CircleX, Lock, Trophy, Award, Info } from "lucide-react";
import { computeProgress } from "@/server/services/progress";
import { analytics } from "@/server/services/analytics";
import { listAttempts } from "@/server/services/exams";
import { examBlueprint, readinessConfig } from "@/server/config";
import { xpForLevel } from "@/server/domain/xp";
import { Bar, Chip, PageHeader, SectionTitle, Ring, DIFFICULTY_LABEL, pct } from "@/components/ui";
import { LineChart } from "@/components/charts/LineChart";
import { Heatmap } from "@/components/charts/Heatmap";
import { NamedIcon } from "@/components/icons";
import { timeAgo, shortDate } from "@/components/format";

export const metadata: Metadata = { title: "Progress & Readiness" };

const MASTERY_LABEL = { none: "No evidence", learning: "Learning", developing: "Developing", mastered: "Mastered" } as const;
const MASTERY_TONE = { none: "neutral", learning: "rose", developing: "amber", mastered: "signal" } as const;
const MODE_LABEL: Record<string, string> = { practice: "Practice", review: "Review", lesson_check: "Lesson checks", lesson_mastery: "Mastery quizzes", exam: "Mock exams", boss: "Boss battles", timed: "Timed" };

export default async function ProgressPage() {
  const [p, a, attempts, bp] = await Promise.all([computeProgress(), analytics(), listAttempts(30), examBlueprint()]);
  const cfg = readinessConfig();
  const r = p.readiness;
  const first = p.evidence.filter((e) => !e.seenBefore && e.mode !== "lesson_check");
  const firstAcc = first.length ? first.filter((e) => e.correct).length / first.length : null;
  const repeats = p.evidence.filter((e) => e.seenBefore);
  const repeatAcc = repeats.length ? repeats.filter((e) => e.correct).length / repeats.length : null;
  const reviews = a.weeks.reduce((s, w) => ({ n: s.n + w.reviewsN, ok: s.ok + w.reviewsOk }), { n: 0, ok: 0 });
  const mastered = p.objectives.filter((o) => o.mastery.status === "mastered").length;
  const fulls = attempts.filter((x) => x.kind === "full" && x.submittedAt);
  const reachedIdx = r.levels.reduce((m, l, i) => (l.reached ? i : m), 0);

  return (
    <>
      <PageHeader title="Progress & Readiness"
        description="Three different things, kept apart on purpose: lessons completed (what you studied), accuracy (how you answered) and mastery (what you can still do on unseen questions, days later). Only the last one predicts the exam." />

      <section className="panel mb-6 grid grid-cols-2 gap-5 p-5 sm:grid-cols-3 xl:grid-cols-6" aria-label="Summary">
        <div><div className="text-[13px] text-muted">Readiness</div><div className="text-[18px] font-semibold text-ink">{r.label}</div><div className="text-[12px] text-faint">index {r.index.toFixed(0)}/100{r.preliminary ? " · preliminary" : ""}</div></div>
        <div><div className="text-[13px] text-muted">Objectives mastered</div><div className="tabular text-[22px] font-semibold text-signal">{mastered}<span className="text-[15px] text-faint"> / {p.objectives.length}</span></div></div>
        <div><div className="text-[13px] text-muted">Unseen-question accuracy</div><div className="tabular text-[22px] font-semibold text-ink">{pct(firstAcc)}</div><div className="text-[12px] text-faint">n = {first.length}</div></div>
        <div><div className="text-[13px] text-muted">Repeat accuracy</div><div className="tabular text-[22px] font-semibold text-ink">{pct(repeatAcc)}</div><div className="text-[12px] text-faint">n = {repeats.length} · weaker evidence</div></div>
        <div><div className="text-[13px] text-muted">Due reviews recalled</div><div className="tabular text-[22px] font-semibold text-ink">{reviews.n ? pct(reviews.ok / reviews.n) : "—"}</div><div className="text-[12px] text-faint">n = {reviews.n}, 16 weeks</div></div>
        <div><div className="text-[13px] text-muted">Lessons completed</div><div className="tabular text-[22px] font-semibold text-ink">{p.domains.reduce((s, d) => s + d.lessonsCompleted, 0)}<span className="text-[15px] text-faint"> / {p.domains.reduce((s, d) => s + d.lessonsTotal, 0)}</span></div></div>
      </section>

      <section id="readiness" className="panel mb-6 scroll-mt-20 p-5 md:p-6" aria-labelledby="ready-h">
        <SectionTitle id="ready-h" aside={<span>Personal target {bp.readyTargetPercent}% · pass mark {bp.passingPercent}%</span>}>Exam readiness</SectionTitle>
        {r.preliminary && (
          <div className="mb-4 flex gap-2 rounded-[10px] border border-amber/40 bg-amber-soft px-4 py-3 text-[13.5px] text-ink">
            <Info size={16} className="mt-0.5 shrink-0 text-amber" aria-hidden />
            <div><span className="font-medium">Preliminary estimate.</span> Not enough evidence yet: {r.preliminaryReasons.join("; ")}. Treat the level as a direction, not a verdict.</div>
          </div>
        )}
        {r.recommendBooking && <p className="mb-4 rounded-[10px] border border-signal/40 bg-signal-soft px-4 py-3 text-[14px] text-ink">Every gate passes. The evidence supports booking the exam — keep reviewing until the day; readiness decays without retrieval.</p>}
        <ol className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {r.levels.map((l, i) => {
            const passed = l.gates.filter((g) => g.passed).length;
            const current = i === reachedIdx;
            return (
              <li key={l.id} className={`rounded-[12px] border p-4 ${current ? "border-ion bg-ion-soft/50" : l.reached ? "border-signal/40" : "border-line"}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 font-medium text-ink">{l.reached ? <CircleCheck size={16} className="text-signal" aria-label="Reached" /> : <Lock size={15} className="text-faint" aria-label="Not reached" />}{l.label}</span>
                  {current ? <Chip tone="ion">You are here</Chip> : l.gates.length > 0 && <span className="tabular text-[12px] text-faint">{passed}/{l.gates.length} gates</span>}
                </div>
                {l.gates.length > 0 && (
                  <ul className="mt-3 space-y-1.5 text-[12.5px]">
                    {l.gates.map((g) => (
                      <li key={g.key} className="flex items-start gap-2">
                        {g.passed ? <CircleCheck size={13} className="mt-0.5 shrink-0 text-signal" aria-label="Passed" /> : <CircleX size={13} className="mt-0.5 shrink-0 text-faint" aria-label="Not passed" />}
                        <span className="flex-1 text-muted">{g.label}</span>
                        <span className="tabular shrink-0 text-faint">{g.actual} / {g.required}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ol>
        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div>
            <h3 className="mb-2 text-[13.5px] font-medium text-ink">What the index is made of</h3>
            <table className="w-full text-[13px]">
              <thead><tr className="text-left text-[12px] text-faint"><th className="py-1 font-medium">Signal</th><th className="py-1 text-right font-medium">Value</th><th className="py-1 text-right font-medium">Sample</th><th className="py-1 text-right font-medium">Weight</th></tr></thead>
              <tbody>
                {Object.entries(r.components).map(([k, c]) => (
                  <tr key={k} className="border-t border-line"><td className="py-1.5 text-muted">{c.label}</td><td className="tabular py-1.5 text-right text-ink">{pct(c.value)}</td><td className="tabular py-1.5 text-right text-faint">n={c.n}</td><td className="tabular py-1.5 text-right text-faint">{Math.round((cfg.indexWeights[k as keyof typeof cfg.indexWeights] ?? 0) * 100)}%</td></tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-[12px] text-faint">The level comes from the gates, not from the index. Thresholds live in content/readiness.yaml.</p>
          </div>
          <div>
            <h3 className="mb-2 text-[13.5px] font-medium text-ink">Readiness index over time</h3>
            {a.trend.length >= 2 ? (
              <LineChart label="Readiness index per day" labels={a.trend.map((t) => t.day)} xFormat="day"
                series={[{ name: "Readiness index", color: "var(--series-1)", values: a.trend.map((t) => t.index_value) }]} height={180} />
            ) : <p className="text-[13px] text-muted">One point per study day. The line appears after your second day.</p>}
          </div>
        </div>
      </section>

      <section className="panel mb-6 p-5 md:p-6" aria-labelledby="mastery-h">
        <SectionTitle id="mastery-h" aside="evidence-weighted, decays without review">Mastery by domain and objective</SectionTitle>
        <div className="space-y-5">
          {p.domains.map((d) => (
            <div key={d.id}>
              <div className="mb-2 grid grid-cols-[3rem_minmax(0,1fr)_8rem_3rem] items-center gap-3">
                <span className="text-[13px] font-semibold text-faint">{d.id}</span>
                <Link href={`/curriculum/${d.id}`} className="truncate text-[14px] font-medium text-ink hover:text-ion-strong">{d.short}</Link>
                <Bar value={d.score} tone="signal" label={`${d.short} mastery`} />
                <span className="tabular text-right text-[13px] text-ink">{d.attempted ? pct(d.score) : "—"}</span>
              </div>
              <ul className="space-y-1 border-l border-line pl-4 ml-6">
                {d.objectives.map((o) => (
                  <li key={o.id} className="grid grid-cols-[3rem_minmax(0,1fr)_auto] items-center gap-3 text-[12.5px] md:grid-cols-[3rem_minmax(0,1fr)_6rem_5rem_6rem]">
                    <span className="text-faint">{o.id}</span>
                    <span className="truncate text-muted" title={o.title}>{o.title}</span>
                    <span className="hidden md:block"><Bar value={o.mastery.score ?? 0} tone="signal" label={`${o.id} mastery`} /></span>
                    <span className="tabular hidden text-right text-faint md:block" title="distinct questions seen / available">{o.mastery.distinctQuestions}/{o.questionsAvailable} seen</span>
                    <span className="text-right"><Chip tone={MASTERY_TONE[o.mastery.status]}>{MASTERY_LABEL[o.mastery.status]}</Chip></span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <div className="mb-6 grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <section id="retention" className="panel scroll-mt-20 p-5" aria-labelledby="acc-h">
          <SectionTitle id="acc-h" aside="per week">Accuracy and retention over time</SectionTitle>
          {a.weeks.length >= 2 ? (
            <LineChart label="Weekly first-attempt accuracy on unseen questions and recall rate on due reviews" labels={a.weeks.map((w) => w.week)} xFormat="day"
              refLines={[{ value: bp.passingPercent, label: `pass ${bp.passingPercent}%` }]}
              series={[
                { name: "Unseen questions", color: "var(--series-1)", values: a.weeks.map((w) => (w.firstN ? (w.firstOk / w.firstN) * 100 : null)), counts: a.weeks.map((w) => w.firstN) },
                { name: "Due reviews recalled", color: "var(--series-2)", values: a.weeks.map((w) => (w.reviewsN ? (w.reviewsOk / w.reviewsN) * 100 : null)), counts: a.weeks.map((w) => w.reviewsN) },
              ]} />
          ) : <p className="text-[13.5px] text-muted">Weekly lines appear after two weeks of study. Unseen-question accuracy shows transfer; due-review recall shows retention.</p>}
        </section>
        <section className="panel p-5" aria-labelledby="diff-h">
          <SectionTitle id="diff-h">First attempts by difficulty</SectionTitle>
          <ul className="space-y-2.5">
            {["foundation", "intermediate", "advanced", "expert"].map((dname) => {
              const row = a.byDifficulty.find((x) => x.difficulty === dname);
              return (
                <li key={dname} className="grid grid-cols-[8.5rem_minmax(0,1fr)_5.5rem] items-center gap-3 text-[13px]">
                  <span className="text-muted">{DIFFICULTY_LABEL[dname]}</span>
                  <Bar value={row ? row.ok / row.n : 0} tone="ion" label={`${dname} accuracy`} />
                  <span className="tabular text-right text-ink">{row ? `${Math.round((row.ok / row.n) * 100)}%` : "—"} <span className="text-faint">n={row?.n ?? 0}</span></span>
                </li>
              );
            })}
          </ul>
          <h3 className="mb-2 mt-6 text-[13.5px] font-medium text-ink">By activity</h3>
          <table className="w-full text-[13px]">
            <thead><tr className="text-left text-[12px] text-faint"><th className="py-1 font-medium">Mode</th><th className="py-1 text-right font-medium">Answers</th><th className="py-1 text-right font-medium">Accuracy</th><th className="py-1 text-right font-medium">Avg time</th></tr></thead>
            <tbody>
              {a.byMode.map((m) => {
                const t = a.timing.find((x) => x.mode === m.mode);
                return <tr key={m.mode} className="border-t border-line"><td className="py-1.5 text-muted">{MODE_LABEL[m.mode] ?? m.mode}</td><td className="tabular py-1.5 text-right text-ink">{m.n}</td><td className="tabular py-1.5 text-right text-ink">{Math.round((m.ok / m.n) * 100)}%</td><td className="tabular py-1.5 text-right text-faint" title={t ? `estimate ${Math.round(t.est_ms / 1000)} s` : ""}>{t ? `${Math.round(t.avg_ms / 1000)} s` : "—"}</td></tr>;
              })}
              {a.byMode.length === 0 && <tr><td colSpan={4} className="py-2 text-muted">No answers yet.</td></tr>}
            </tbody>
          </table>
        </section>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-6 xl:grid-cols-2">
        <section className="panel p-5" aria-labelledby="cons-h">
          <SectionTitle id="cons-h" aside={`${p.streak.current}-day streak · best ${p.streak.best}`}>Study consistency</SectionTitle>
          <Heatmap days={a.heat} today={p.today} />
          <p className="mt-3 text-[12.5px] text-faint">A day counts towards the streak with 5 questions, 5 reviews or one completed lesson. Missing days is normal — the review queue is built to catch you up.</p>
        </section>
        <section className="panel p-5" aria-labelledby="mocks-h">
          <SectionTitle id="mocks-h" aside={<Link href="/exams" className="hover:text-ink">Mock Exam Center</Link>}>Full mock exams</SectionTitle>
          {fulls.length === 0 ? <p className="text-[13.5px] text-muted">No full mocks yet. The readiness model needs recent full-length mocks — they are the closest thing to the real exam.</p> : (
            <ul className="space-y-2">
              {fulls.slice(0, 8).map((m) => (
                <li key={m.id} className="grid grid-cols-[6.5rem_minmax(0,1fr)_3.5rem] items-center gap-3 text-[13px]">
                  <Link href={`/results/${m.id}`} className="tabular text-muted hover:text-ink">{shortDate(m.submittedAt!)}</Link>
                  <Bar value={(m.scorePercent ?? 0) / 100} tone={(m.scorePercent ?? 0) >= bp.readyTargetPercent ? "signal" : (m.scorePercent ?? 0) >= bp.passingPercent ? "ion" : "rose"} label={`Mock ${m.id} score`} />
                  <span className="tabular text-right text-ink">{m.scorePercent?.toFixed(0)}%</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section id="xp" className="panel scroll-mt-20 p-5 md:p-6" aria-labelledby="xp-h">
        <SectionTitle id="xp-h" aside={`${p.xp.toLocaleString()} XP total`}>Player profile</SectionTitle>
        <div className="grid grid-cols-1 gap-8 xl:grid-cols-3">
          <div>
            <div className="flex items-center gap-4">
              <Ring value={p.level.progress} size={72} stroke={5} tone="arc" label={`Level ${p.level.level}`}><span className="text-[22px] font-semibold text-ink">{p.level.level}</span></Ring>
              <div><div className="font-semibold text-ink">{p.title}</div><div className="text-[13px] text-muted"><span className="tabular">{p.level.xpForNext - p.level.xpIntoLevel}</span> XP to level {p.level.level + 1} (at {xpForLevel(p.level.level + 1).toLocaleString()})</div></div>
            </div>
            <h3 className="mb-2 mt-6 text-[13.5px] font-medium text-ink">Titles</h3>
            <ul className="space-y-1.5 text-[13px]">
              {p.titles.map((t) => (
                <li key={t.id} className="flex items-start gap-2">{t.earned ? <Award size={14} className="mt-0.5 shrink-0 text-arc" aria-label="Earned" /> : <Lock size={13} className="mt-0.5 shrink-0 text-faint" aria-label="Locked" />}
                  <span><span className={t.earned ? "text-ink" : "text-muted"}>{t.title}</span> <span className="text-faint">— {t.requirement}</span></span></li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="mb-2 text-[13.5px] font-medium text-ink">Achievements <span className="tabular text-faint">{a.achievements.filter((x) => x.earned_at).length}/{a.achievements.length}</span></h3>
            <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-1">
              {a.achievements.map((x) => (
                <li key={x.id} className={`flex items-start gap-3 rounded-[10px] border p-2.5 ${x.earned_at ? "border-arc/40 bg-arc-soft/40" : "border-line opacity-70"}`}>
                  <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full ${x.earned_at ? "bg-arc-soft text-arc" : "bg-raised text-faint"}`}>{x.earned_at ? <NamedIcon name={x.icon} size={15} /> : <Lock size={14} />}</span>
                  <span className="min-w-0 text-[12.5px]"><span className="block font-medium text-ink">{x.title}</span><span className="block text-muted">{x.description}</span>{x.earned_at && <span className="text-faint">earned {shortDate(x.earned_at)}</span>}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="mb-2 text-[13.5px] font-medium text-ink">How XP is earned</h3>
            <ul className="space-y-1 text-[12.5px] text-muted">
              <li>New question correct: <span className="tabular text-ink">{Object.values(a.xpRules.firstCorrect).join(" / ")}</span> by difficulty (half with a hint)</li>
              <li>Due review recalled: <span className="tabular text-ink">{a.xpRules.spacedReviewCorrect}+</span> · 10+ due reviews in a day: <span className="tabular text-ink">+{a.xpRules.dailyReviewSession}</span> · immediate repeats: <span className="text-ink">0</span></li>
              <li>Lesson completed: <span className="tabular text-ink">{a.xpRules.lessonCompleted}</span> (+{a.xpRules.lessonPerfectQuiz} for a perfect quiz), once</li>
              <li>Coding exercise passed: <span className="tabular text-ink">{Object.values(a.xpRules.exercisePassed).join(" / ")}</span>, once each</li>
              <li>Full mock: <span className="tabular text-ink">{a.xpRules.mockCompleted.full}</span> + {a.xpRules.mockScoreBonusPerPercentAbovePass} per point above the pass mark · boss defeated: <span className="tabular text-ink">{a.xpRules.bossDefeated}</span></li>
              <li>Mistake resolved: <span className="tabular text-ink">{a.xpRules.mistakeResolved}</span> · domain milestones at 50/70/85 %</li>
            </ul>
            <h3 className="mb-2 mt-6 flex items-center gap-1.5 text-[13.5px] font-medium text-ink"><Trophy size={14} className="text-arc" aria-hidden />XP ledger</h3>
            {a.xp.length === 0 ? <p className="text-[13px] text-muted">Empty — XP is only paid for verified learning events.</p> : (
              <ul className="max-h-[320px] space-y-1.5 overflow-y-auto pr-1 text-[12.5px]">
                {a.xp.map((x, i) => <li key={i} className="flex justify-between gap-3"><span className="min-w-0 truncate text-muted">{x.reason}</span><span className="flex shrink-0 gap-2"><span className="text-faint">{timeAgo(x.created_at)}</span><span className="tabular text-arc">+{x.amount}</span></span></li>)}
              </ul>
            )}
          </div>
        </div>
      </section>
    </>
  );
}
