import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Crown, Swords, Dumbbell, Timer, Code2, CircleCheck, Repeat2, NotebookPen } from "lucide-react";
import { regionData } from "@/server/services/curriculum";
import { BOSS_PASS_PERCENT, BOSS_QUESTIONS } from "@/server/services/exams";
import { NamedIcon } from "@/components/icons";
import { Bar, Chip, LinkButton, SectionTitle, Stat, DIFFICULTY_LABEL, DIFFICULTY_TONE, pct } from "@/components/ui";
import { LessonStatusIcon, LESSON_STATUS, VerificationBadge } from "@/components/status";
import { StartExamButton } from "@/components/StartExamButton";
import { Md } from "@/components/Md";

type Props = { params: Promise<{ domain: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { domain } = await params;
  const r = await regionData(domain.toUpperCase());
  return { title: r ? `${r.id} · ${r.short}` : "Region" };
}

const MASTERY_LABEL = { none: "No evidence yet", learning: "Learning", developing: "Developing", mastered: "Mastered" } as const;
const MASTERY_TONE = { none: "neutral", learning: "rose", developing: "amber", mastered: "signal" } as const;

export default async function RegionPage({ params }: Props) {
  const { domain } = await params;
  const r = await regionData(domain.toUpperCase());
  if (!r) notFound();
  const done = r.lessons.filter((l) => ["completed", "needs_review", "mastered"].includes(l.status)).length;
  const coreLessons = r.lessons.filter((l) => !l.supplementary);
  const bossReady = coreLessons.every((l) => ["completed", "needs_review", "mastered"].includes(l.status));

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
        <div className="flex min-w-0 items-start gap-4">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-[12px] border border-line bg-surface text-ion-strong"><NamedIcon name={r.icon} size={24} /></span>
          <div className="min-w-0">
            <div className="text-[13px] text-faint">{r.id} · {r.region}</div>
            <h1 className="text-[26px] font-semibold leading-tight tracking-[-0.015em] text-ink">{r.short}</h1>
            <p className="mt-1 text-[14px] text-muted">Official domain: <span className="text-ink">{r.title}</span></p>
            <p className="mt-2 max-w-[70ch] text-muted">{r.summary}</p>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <LinkButton href={`/practice?domain=${r.id}&autostart=1`} variant="primary"><Dumbbell size={16} />Practise this region</LinkButton>
          <StartExamButton config={{ kind: "domain", domainId: r.id, count: 12 }}><Timer size={16} />12-question domain exam</StartExamButton>
        </div>
      </header>

      <section className="panel grid grid-cols-2 gap-5 p-5 sm:grid-cols-4" aria-label="Region summary">
        <Stat label="Mastery" value={r.attempted ? pct(r.score) : "—"} sub="evidence-weighted" tone="signal" />
        <Stat label="Missions" value={`${done} / ${r.lessons.length}`} sub="lessons completed" />
        <Stat label="Due reviews" value={r.dueReviews} sub={r.dueReviews ? <Link href="/review" className="text-amber hover:underline">Review now</Link> : "nothing due"} tone={r.dueReviews ? "amber" : undefined} />
        <Stat label="Open mistakes" value={r.unresolvedMistakes} sub={r.unresolvedMistakes ? <Link href={`/mistakes?domain=${r.id}`} className="text-rose hover:underline">Open journal</Link> : "none open"} tone={r.unresolvedMistakes ? "rose" : undefined} />
      </section>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <section aria-labelledby="missions-h" className="panel p-5 md:p-6">
          <SectionTitle id="missions-h" aside={`${r.lessons.reduce((s, l) => s + l.minutes, 0)} min in total`}>Missions</SectionTitle>
          <ol className="relative">
            {r.lessons.map((l, i) => {
              const st = LESSON_STATUS[l.status];
              return (
                <li key={l.id} className="relative flex gap-4 pb-6 last:pb-0">
                  {i < r.lessons.length - 1 && <span aria-hidden className="absolute left-[15px] top-9 bottom-0 w-px bg-line" />}
                  <span className="relative z-10 grid h-8 w-8 shrink-0 place-items-center rounded-full border border-line bg-sunken"><LessonStatusIcon status={l.status} /></span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link href={`/lessons/${l.id}`} className="font-medium text-ink hover:text-ion-strong">{l.title}</Link>
                      {l.supplementary && <Chip>Supplementary</Chip>}
                    </div>
                    <Md className="mt-0.5 text-[13.5px] text-muted">{l.summary}</Md>
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-faint">
                      <span className={st.cls}>{st.label}</span>
                      <span className="tabular">{l.minutes} min</span>
                      <span className="tabular">{l.checks} checks · {l.predicts} predictions · {l.masteryQuestions}-question mastery quiz</span>
                      <span>{l.objectives.join(", ")}</span>
                      {l.masteryScore != null && <span className="tabular">best quiz {pct(l.masteryScore)}</span>}
                      {l.dueReviews > 0 && <span className="inline-flex items-center gap-1 text-amber"><Repeat2 size={12} aria-hidden />{l.dueReviews} due</span>}
                      {l.unresolvedMistakes > 0 && <span className="inline-flex items-center gap-1 text-rose"><NotebookPen size={12} aria-hidden />{l.unresolvedMistakes}</span>}
                    </div>
                    {l.status === "locked" && (
                      <p className="mt-1.5 text-[12.5px] text-muted">Unlocks after: {l.prerequisites.filter((p) => !p.completed).map((p, k) => (
                        <span key={p.id}>{k > 0 && ", "}<Link href={`/lessons/${p.id}`} className="text-ion-strong hover:underline">{p.title}</Link></span>
                      ))}</p>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        </section>

        <div className="space-y-6">
          <section aria-labelledby="boss-h" className="panel p-5">
            <SectionTitle id="boss-h">Boss battle</SectionTitle>
            <div className="flex items-start gap-3">
              <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-full ${r.boss.defeated ? "bg-arc-soft text-arc" : "bg-raised text-muted"}`}>{r.boss.defeated ? <Crown size={18} /> : <Swords size={18} />}</span>
              <div className="text-[13.5px] text-muted">
                {BOSS_QUESTIONS} mixed questions from the whole region, at least half advanced or expert. No hints, a tight clock (90 % of exam pace), pass at {BOSS_PASS_PERCENT} %.
                {r.boss.attempts > 0 && <div className="mt-1 text-ink">{r.boss.defeated ? "Defeated" : "Not yet defeated"} · best {r.boss.bestPercent?.toFixed(0)} % in {r.boss.attempts} attempt{r.boss.attempts > 1 ? "s" : ""}</div>}
              </div>
            </div>
            {!bossReady && <p className="mt-3 text-[12.5px] text-amber">Recommended after completing the core missions — but you can challenge it any time.</p>}
            <StartExamButton config={{ kind: "boss", domainId: r.id }} variant={bossReady ? "primary" : "secondary"} className="mt-4 w-full"
              confirm={`Start the ${r.region} boss battle? The timer starts immediately and answers are revealed only after you submit.`}>
              <Swords size={16} />{r.boss.defeated ? "Fight again" : "Challenge the boss"}
            </StartExamButton>
          </section>

          <section aria-labelledby="obj-h" className="panel p-5">
            <SectionTitle id="obj-h">Exam objectives</SectionTitle>
            <ul className="space-y-4">
              {r.objectives.map((o) => (
                <li key={o.id}>
                  <div className="flex items-start gap-2">
                    <span className="mt-0.5 text-[12.5px] font-semibold text-faint">{o.id}</span>
                    <p className="flex-1 text-[13.5px] text-ink">{o.title}</p>
                  </div>
                  <div className="mt-2 flex items-center gap-2 pl-9">
                    <Bar value={o.mastery.score ?? 0} tone="signal" label={`${o.id} mastery`} />
                    <span className="tabular w-10 text-right text-[12.5px] text-muted">{o.mastery.score != null ? pct(o.mastery.score) : "—"}</span>
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 pl-9 text-[12px] text-faint">
                    <Chip tone={MASTERY_TONE[o.mastery.status]}>{MASTERY_LABEL[o.mastery.status]}</Chip>
                    <span className="tabular">{o.mastery.distinctQuestions}/{o.questionsAvailable} questions seen</span>
                    <span className="tabular">{o.mastery.spacedSuccesses} spaced</span>
                    <VerificationBadge verification={o.verification} />
                  </div>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-[12px] text-faint">Mastered = score ≥ threshold with enough weighted evidence, ≥ 4 distinct questions and at least one correct spaced recall.</p>
          </section>

          {r.exercises.length > 0 && (
            <section aria-labelledby="ex-h" className="panel p-5">
              <SectionTitle id="ex-h">Coding Lab</SectionTitle>
              <ul className="space-y-2">
                {r.exercises.map((e) => (
                  <li key={e.id} className="flex items-center gap-2 text-[13.5px]">
                    {e.passed ? <CircleCheck size={15} className="text-signal" aria-label="Passed" /> : <Code2 size={15} className="text-faint" aria-hidden />}
                    <Link href={`/exercises/${e.id}`} className="min-w-0 flex-1 truncate text-muted hover:text-ink">{e.title}</Link>
                    <Chip tone={DIFFICULTY_TONE[e.difficulty]}>{DIFFICULTY_LABEL[e.difficulty].split(" ")[0]}</Chip>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
