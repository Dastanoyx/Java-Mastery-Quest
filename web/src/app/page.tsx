import Link from "next/link";
import type { Metadata } from "next";
import { BookOpen, Dumbbell, Timer, Repeat2, Code2, PenLine, Flame, Target, Sparkles, CircleCheck, Circle, NotebookPen } from "lucide-react";
import { dashboardData } from "@/server/services/dashboard";
import { Bar, Chip, LinkButton, Ring, SectionTitle, Empty, pct } from "@/components/ui";
import { Sparkline } from "@/components/Sparkline";
import { MISTAKE_CATEGORIES } from "@/server/domain/mistakes";
import { timeAgo } from "@/components/format";

export const metadata: Metadata = { title: "Command Center" };

const BLOCK_ICON = { review: Repeat2, lesson: BookOpen, exercise: Code2, practice: Dumbbell, exam: Timer, reflect: PenLine } as const;

export default async function CommandCenter() {
  const d = await dashboardData();
  const { learner, progress: p, due, quests, plan, totals } = d;
  const fresh = totals.questions_seen === 0 && totals.lessons_done === 0;
  const daily = quests.filter((q) => q.cadence === "daily");
  const weekly = quests.filter((q) => q.cadence === "weekly");
  const covered = p.readinessInput.objectivesCovered;
  const nowHm = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: learner.timezone }).format(new Date());
  const remind = learner.remindersEnabled && learner.reminderTime != null && nowHm >= learner.reminderTime && !p.streak.todayActive;
  const greeting = d.daysSince == null ? `Welcome, ${learner.displayName}.` : `Welcome back, ${learner.displayName}.`;

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="min-w-0 space-y-6">
        <section aria-labelledby="hello">
          <h1 id="hello" className="text-[30px] font-semibold leading-tight tracking-[-0.02em] text-ink">{greeting}</h1>
          <p className="mt-1.5 max-w-[64ch] text-[15.5px] text-muted">{plan.headline}</p>
          {remind && (
            <div className="panel mt-5 flex flex-col gap-3 border-amber/50 p-4 sm:flex-row sm:items-center sm:justify-between" role="status">
              <div className="text-[14px] text-ink">It&apos;s past your {learner.reminderTime} study time and today isn&apos;t counted yet.{p.streak.current > 0 ? ` A short session keeps your ${p.streak.current}-day streak.` : ""}</div>
              <LinkButton href={due.due > 0 ? "/review" : "/practice?autostart=1"} variant="primary" size="sm">{due.due > 0 ? `Review ${due.due} due` : "10-minute practice"}</LinkButton>
            </div>
          )}
          {!learner.onboardedAt && (
            <div className="panel mt-5 flex flex-col gap-3 border-ion/40 p-5 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="font-medium text-ink">Set up your study plan in two minutes</div>
                <p className="mt-1 max-w-[60ch] text-[14px] text-muted">Tell the planner your daily time, exam date and weak spots. Everything else works without it — you can start a lesson right now.</p>
              </div>
              <LinkButton href="/onboarding" variant="primary">Set up my plan</LinkButton>
            </div>
          )}
        </section>

        <section aria-labelledby="today" className="panel p-5 md:p-6">
          <SectionTitle id="today" aside={<span className="tabular">{plan.totalMinutes} min · target {learner.dailyMinutes} min</span>}>Today&apos;s session</SectionTitle>
          <ol className="relative mt-1">
            {plan.blocks.map((b, i) => {
              const Icon = BLOCK_ICON[b.kind];
              return (
                <li key={i} className="group relative flex gap-4 pb-4 last:pb-0">
                  {i < plan.blocks.length - 1 && <span aria-hidden className="absolute left-[15px] top-9 bottom-0 w-px bg-line" />}
                  <span className={`relative z-10 grid h-8 w-8 shrink-0 place-items-center rounded-full border ${i === 0 ? "border-ion bg-ion-soft text-ion-strong" : "border-line bg-sunken text-muted"}`}>
                    <Icon size={15} aria-hidden />
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <Link href={b.href} className="font-medium text-ink hover:text-ion-strong">{b.title}</Link>
                      <div className="text-[13.5px] text-muted">{b.detail}</div>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <span className="tabular text-[13px] text-faint">{b.minutes} min</span>
                      {i === 0 && <LinkButton href={b.href} variant="primary" size="sm">Start</LinkButton>}
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
          <div className="mt-5 flex flex-wrap gap-2 border-t border-line pt-4">
            {d.lastLesson && d.lastLesson.status !== "completed" && <LinkButton href={`/lessons/${d.lastLesson.id}`} size="sm" className="max-w-full"><BookOpen size={15} className="shrink-0" /><span className="truncate">Resume “{d.lastLesson.title}”</span></LinkButton>}
            {d.openExam && <LinkButton href={`/exams/${d.openExam.id}`} size="sm" className="border-amber/50 text-amber"><Timer size={15} />Resume exam in progress</LinkButton>}
            <LinkButton href="/practice?mode=mixed&autostart=1" size="sm"><Dumbbell size={15} />Quick practice</LinkButton>
            <LinkButton href="/exams?preset=full" size="sm"><Timer size={15} />Full mock exam</LinkButton>
          </div>
        </section>

        <section aria-labelledby="domains" className="panel p-5 md:p-6">
          <SectionTitle id="domains" aside={<Link href="/curriculum" className="hover:text-ink">Open the Learning World</Link>}>Mastery by exam domain</SectionTitle>
          {fresh && <p className="mb-3 text-[13.5px] text-muted">Mastery is measured from your answers — spaced, unseen and harder questions count most. It fills in as you study.</p>}
          <ul className="divide-y divide-line">
            {p.domains.map((dm) => (
              <li key={dm.id}>
                <Link href={`/curriculum/${dm.id}`} className="grid grid-cols-[2.6rem_minmax(0,1fr)_auto] items-center gap-3 py-2.5 hover:bg-raised/40 sm:grid-cols-[2.6rem_minmax(0,1.2fr)_minmax(0,1fr)_auto]">
                  <span className="text-[13px] font-semibold text-faint">{dm.id}</span>
                  <span className="truncate text-[14px] text-ink">{dm.short}</span>
                  <span className="hidden sm:block"><Bar value={dm.score} tone="signal" label={`${dm.short} mastery`} /></span>
                  <span className="flex items-center gap-2 text-[12.5px]">
                    {dm.dueReviews > 0 && <Chip tone="amber" title="Review items due">{dm.dueReviews} due</Chip>}
                    {dm.unresolvedMistakes > 0 && <Chip tone="rose" title="Open mistakes">{dm.unresolvedMistakes}</Chip>}
                    <span className="tabular w-11 text-right text-muted">{dm.attempted ? pct(dm.score) : "—"}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <section aria-labelledby="mistakes-h" className="panel p-5">
            <SectionTitle id="mistakes-h" aside={<Link href="/mistakes" className="hover:text-ink">Mistake Journal</Link>}>Mistakes worth your attention</SectionTitle>
            {d.recentMistakes.length === 0 ? (
              <Empty icon={<NotebookPen size={18} />} title="No open mistakes">Every wrong answer lands here with its explanation and a plan to fix it.</Empty>
            ) : (
              <ul className="space-y-3">
                {d.recentMistakes.map((m) => (
                  <li key={m.question_id}>
                    <Link href={`/mistakes#${m.question_id}`} className="block rounded-[8px] p-2 -m-2 hover:bg-raised/50">
                      <div className="flex flex-wrap items-center gap-1.5 text-[12.5px]">
                        <Chip>{m.objective_id}</Chip>
                        {m.category && <Chip tone="rose">{MISTAKE_CATEGORIES[m.category as keyof typeof MISTAKE_CATEGORIES]}</Chip>}
                        {m.high && <Chip tone="amber" title="You were sure and wrong">Confident miss</Chip>}
                        <span className="text-faint">{timeAgo(m.last_wrong_at)}</span>
                      </div>
                      <p className="mt-1 line-clamp-2 text-[13.5px] text-muted">{m.prompt.replace(/[`*]/g, "")}</p>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section aria-labelledby="activity-h" className="panel p-5">
            <SectionTitle id="activity-h" aside={<Link href="/progress#xp" className="hover:text-ink">XP ledger</Link>}>Recent learning</SectionTitle>
            {d.recentXp.length === 0 ? (
              <Empty icon={<Sparkles size={18} />} title="Nothing yet">XP is only paid for verifiable learning: new correct answers, spaced recall, completed lessons and exams.</Empty>
            ) : (
              <ul className="space-y-2">
                {d.recentXp.map((x, i) => (
                  <li key={i} className="flex items-center justify-between gap-3 text-[13.5px]">
                    <span className="min-w-0 truncate text-muted">{x.reason}</span>
                    <span className="flex shrink-0 items-center gap-2"><span className="text-faint">{timeAgo(x.created_at)}</span><span className="tabular font-medium text-arc">+{x.amount}</span></span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>

      <aside className="space-y-6" aria-label="Player and readiness">
        <section className="panel p-5" aria-labelledby="player-h">
          <h2 id="player-h" className="sr-only">Player</h2>
          <div className="flex items-center gap-4">
            <Ring value={p.level.progress} size={68} stroke={5} tone="arc" label={`Level ${p.level.level}, ${Math.round(p.level.progress * 100)}% to next`}>
              <span className="text-[20px] font-semibold text-ink">{p.level.level}</span>
            </Ring>
            <div className="min-w-0">
              <div className="truncate font-semibold text-ink">{p.title}</div>
              <div className="text-[13px] text-muted"><span className="tabular">{p.xp.toLocaleString()}</span> XP · <span className="tabular">{p.level.xpForNext - p.level.xpIntoLevel}</span> to level {p.level.level + 1}</div>
              <div className="mt-1 flex items-center gap-1.5 text-[13px]"><Flame size={14} className={p.streak.todayActive ? "text-amber" : "text-faint"} aria-hidden /><span className="text-muted">{p.streak.current}-day streak{p.streak.best > p.streak.current ? `, best ${p.streak.best}` : ""}</span></div>
            </div>
          </div>
          <div className="mt-5">
            <div className="mb-2 flex items-center justify-between text-[13px]"><span className="font-medium text-ink">Daily quests</span><span className="text-faint">reset at midnight</span></div>
            <ul className="space-y-3">
              {daily.map((q) => (
                <li key={q.id}>
                  <div className="flex items-start gap-2 text-[13.5px]">
                    {q.completedAt ? <CircleCheck size={16} className="mt-0.5 shrink-0 text-arc" aria-label="Completed" /> : <Circle size={16} className="mt-0.5 shrink-0 text-faint" aria-hidden />}
                    <span className={q.completedAt ? "text-muted line-through decoration-faint" : "text-ink"}>{q.title}</span>
                    <span className="ml-auto shrink-0 text-[12px] text-arc">+{q.xp}</span>
                  </div>
                  <div className="ml-6 mt-1 flex items-center gap-2"><Bar value={q.progress / q.target} tone="arc" label={q.title} /><span className="tabular w-10 text-right text-[12px] text-faint">{q.progress}/{q.target}</span></div>
                </li>
              ))}
            </ul>
            {weekly.length > 0 && (
              <details className="mt-4 text-[13.5px]">
                <summary className="cursor-pointer text-muted hover:text-ink">Weekly quests ({weekly.filter((w) => w.completedAt).length}/{weekly.length})</summary>
                <ul className="mt-2 space-y-2">
                  {weekly.map((q) => (
                    <li key={q.id} className="flex items-center gap-2">
                      <Target size={14} className={q.completedAt ? "text-arc" : "text-faint"} aria-hidden />
                      <span className="min-w-0 flex-1 truncate text-muted">{q.title}</span>
                      <span className="tabular text-[12px] text-faint">{q.progress}/{q.target}</span>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        </section>

        <section className="panel p-5" aria-labelledby="ready-h">
          <SectionTitle id="ready-h" aside={<Link href="/progress#readiness" className="hover:text-ink">Details</Link>}>Exam readiness</SectionTitle>
          <div className="flex items-baseline justify-between gap-3">
            <div className="text-[19px] font-semibold text-ink">{p.readiness.label}</div>
            <div className="text-[13px] text-muted">index <span className="font-semibold text-ink">{p.readiness.index.toFixed(0)}</span>/100</div>
          </div>
          {p.readiness.preliminary && <p className="mt-1 text-[12.5px] text-amber">Preliminary — {p.readiness.preliminaryReasons[0]}.</p>}
          {d.trend.length >= 2 ? (
            <div className="mt-3"><Sparkline values={d.trend.map((t) => t.index_value)} labels={d.trend.map((t) => t.day)} label="Readiness index trend" /></div>
          ) : <p className="mt-2 text-[12.5px] text-faint">The trend appears after a second day of study.</p>}
          {p.readiness.nextLevel && (
            <div className="mt-3 border-t border-line pt-3">
              <div className="text-[12.5px] text-muted">Next: {p.readiness.nextLevel.label}</div>
              <ul className="mt-1.5 space-y-1">
                {p.readiness.nextLevel.gates.filter((g) => !g.passed).slice(0, 3).map((g) => (
                  <li key={g.key} className="flex justify-between gap-2 text-[12.5px]"><span className="text-muted">{g.label}</span><span className="tabular shrink-0 text-faint">{g.actual} / {g.required}</span></li>
                ))}
              </ul>
            </div>
          )}
        </section>

        <section className="panel p-5" aria-labelledby="mem-h">
          <SectionTitle id="mem-h" aside={<Link href="/review" className="hover:text-ink">Review</Link>}>Memory</SectionTitle>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div><div className="text-[22px] font-semibold text-amber">{due.due}</div><div className="text-[12px] text-muted">due now</div></div>
            <div><div className="text-[22px] font-semibold text-ink">{due.overdue}</div><div className="text-[12px] text-muted">overdue</div></div>
            <div><div className="text-[22px] font-semibold text-ink">{due.dueTomorrow}</div><div className="text-[12px] text-muted">tomorrow</div></div>
          </div>
          {due.due > 0 && <LinkButton href="/review" variant="primary" className="mt-4 w-full"><Repeat2 size={16} />Review {due.due} due items</LinkButton>}
        </section>

        <section className="panel p-5" aria-labelledby="cov-h">
          <SectionTitle id="cov-h">Syllabus coverage</SectionTitle>
          <dl className="space-y-3 text-[13.5px]">
            {[
              ["Objectives practised (≥ 3 questions)", covered, p.objectives.length],
              ["Lessons completed", totals.lessons_done, totals.lessons_total],
              ["Questions seen", totals.questions_seen, totals.questions_total],
            ].map(([label, a, b]) => (
              <div key={label as string}>
                <div className="flex justify-between"><dt className="text-muted">{label}</dt><dd className="tabular text-ink">{a} / {b}</dd></div>
                <Bar value={(a as number) / Math.max(1, b as number)} tone="ion" className="mt-1.5" label={label as string} />
              </div>
            ))}
          </dl>
        </section>
      </aside>
    </div>
  );
}
