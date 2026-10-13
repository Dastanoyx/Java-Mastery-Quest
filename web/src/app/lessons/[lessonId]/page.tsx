import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, Clock, Lock, Target, Code2, CircleCheck, Circle, ListChecks, Scale, Sparkles, BadgeCheck } from "lucide-react";
import { getLessonView, listLessons, MASTERY_PASS } from "@/server/services/lessons";
import { getLearner } from "@/server/services/learner";
import { lessonSegments, lessonOutline } from "@/content/segments";
import { highlight } from "@/server/highlight";
import { LessonMarkdown } from "@/components/LessonMarkdown";
import { QuestionCard } from "@/components/QuestionCard";
import { PredictBlock } from "@/components/lesson/PredictBlock";
import { LessonTracker, BookmarkButton, ReflectionBox, QuickNote } from "@/components/lesson/LessonClient";
import { MasteryQuiz } from "@/components/lesson/MasteryQuiz";
import { Md } from "@/components/Md";
import { Chip, LinkButton, DIFFICULTY_LABEL, DIFFICULTY_TONE, pct } from "@/components/ui";
import { LessonStatusIcon, LESSON_STATUS, VerificationBadge } from "@/components/status";

type Props = { params: Promise<{ lessonId: string }>; searchParams: Promise<{ preview?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lessonId } = await params;
  const v = await getLessonView(lessonId);
  return { title: v?.lesson.title ?? "Lesson" };
}

export default async function LessonPage({ params, searchParams }: Props) {
  const { lessonId } = await params;
  const { preview } = await searchParams;
  const v = await getLessonView(lessonId);
  if (!v) notFound();
  const { lesson, card, progress } = v;

  if (card.status === "locked" && preview !== "1") {
    const missing = card.prerequisites.filter((p) => !p.completed);
    return (
      <div className="mx-auto max-w-xl py-10">
        <div className="panel p-6">
          <div className="flex items-center gap-2 text-[13px] text-faint"><Lock size={15} aria-hidden />{lesson.domainId} · {lesson.region}</div>
          <h1 className="mt-2 text-[22px] font-semibold text-ink">{lesson.title}</h1>
          <p className="mt-2 text-muted">This mission builds on {missing.length === 1 ? "a lesson" : "lessons"} you haven&apos;t completed yet. Completing {missing.length === 1 ? "it" : "them"} first makes this one far easier to absorb:</p>
          <ul className="mt-4 space-y-2">
            {missing.map((p) => (
              <li key={p.id}><Link href={`/lessons/${p.id}`} className="flex items-center gap-2 rounded-[8px] border border-line bg-sunken px-3 py-2.5 text-ink hover:border-ion"><ArrowRight size={15} className="text-ion-strong" />{p.title}</Link></li>
            ))}
          </ul>
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
            <span className="text-[13px] text-faint">Already comfortable with the prerequisites?</span>
            <LinkButton href={`/lessons/${lesson.id}?preview=1`} size="sm">Open it anyway</LinkButton>
          </div>
        </div>
      </div>
    );
  }

  const [learner, domainLessons] = await Promise.all([getLearner(), listLessons(lesson.domainId)]);
  const segments = lessonSegments(lesson.bodyMd);
  const outline = lessonOutline(lesson.bodyMd).filter((o) => o.level === 2);
  const predictHtml = await Promise.all(segments.map((s) => (s.kind === "predict" ? highlight(s.code, "java") : Promise.resolve(""))));
  const checkIds = Object.keys(v.checks);
  const checksDone = checkIds.filter((id) => v.answeredChecks[id]).length;
  const predictsDone = v.predictionsMade.length;
  const quizPassed = (progress.masteryScore ?? 0) >= MASTERY_PASS;
  const checklist = [
    { label: `Predictions written`, done: predictsDone >= lesson.predictsTotal && lesson.predictsTotal > 0, detail: `${Math.min(predictsDone, lesson.predictsTotal)}/${lesson.predictsTotal}`, href: "#lesson-body" },
    { label: `Knowledge checks answered`, done: checksDone >= checkIds.length && checkIds.length > 0, detail: `${checksDone}/${checkIds.length}`, href: "#lesson-body" },
    { label: "Retrieval answered from memory", done: Boolean(progress.reflection?.trim()), detail: progress.reflection?.trim() ? "saved" : "", href: "#retrieval" },
    { label: `Mastery quiz ≥ ${Math.round(MASTERY_PASS * 100)} %`, done: quizPassed, detail: progress.masteryScore != null ? pct(progress.masteryScore) : "", href: "#mastery" },
  ];
  const st = LESSON_STATUS[card.status];

  const Outline = () => (
    <nav aria-label="Lesson outline" className="text-[13.5px]">
      <div className="mb-2 font-medium text-ink">In this lesson</div>
      <ol className="space-y-1 border-l border-line">
        {outline.map((o) => <li key={o.slug}><a href={`#${o.slug}`} className="-ml-px block border-l border-transparent py-0.5 pl-3 text-muted hover:border-ion hover:text-ink">{o.title}</a></li>)}
        <li><a href="#retrieval" className="-ml-px block border-l border-transparent py-0.5 pl-3 text-muted hover:border-ion hover:text-ink">Retrieval &amp; reflection</a></li>
        <li><a href="#mastery" className="-ml-px block border-l border-transparent py-0.5 pl-3 text-muted hover:border-ion hover:text-ink">Mastery quiz</a></li>
      </ol>
    </nav>
  );
  const RegionNav = () => (
    <nav aria-label={`${lesson.domainId} missions`} className="text-[13.5px]">
      <Link href={`/curriculum/${lesson.domainId}`} className="mb-2 block font-medium text-ink hover:text-ion-strong">{lesson.domainId} · {lesson.domainShort}</Link>
      <ol className="space-y-1">
        {domainLessons.map((l) => (
          <li key={l.id}>
            <Link href={`/lessons/${l.id}`} aria-current={l.id === lesson.id ? "page" : undefined}
              className={`flex items-start gap-2 rounded-[6px] px-1.5 py-1 ${l.id === lesson.id ? "bg-ion-soft text-ink" : "text-muted hover:text-ink"}`}>
              <LessonStatusIcon status={l.status} size={14} className="mt-[3px]" /><span className="line-clamp-2">{l.title}</span>
            </Link>
          </li>
        ))}
      </ol>
    </nav>
  );
  const KeyRules = () => (
    <section aria-labelledby="rules-h">
      <h2 id="rules-h" className="mb-2 flex items-center gap-2 text-[13.5px] font-medium text-ink"><Scale size={15} className="text-ion-strong" aria-hidden />Key rules</h2>
      <ul className="space-y-2.5 text-[13px] leading-relaxed text-muted">
        {lesson.keyRules.map((r, i) => <li key={i} className="border-l-2 border-ion/40 pl-2.5"><Md>{r}</Md></li>)}
      </ul>
    </section>
  );
  const Checklist = () => (
    <section aria-labelledby="check-h">
      <h2 id="check-h" className="mb-2 flex items-center gap-2 text-[13.5px] font-medium text-ink"><ListChecks size={15} className="text-signal" aria-hidden />Mastery checklist</h2>
      <ul className="space-y-1.5 text-[13px]">
        {checklist.map((c) => (
          <li key={c.label}><a href={c.href} className="flex items-center gap-2 text-muted hover:text-ink">
            {c.done ? <CircleCheck size={15} className="shrink-0 text-signal" aria-label="Done" /> : <Circle size={15} className="shrink-0 text-faint" aria-label="Not done" />}
            <span className="flex-1">{c.label}</span><span className="tabular text-faint">{c.detail}</span>
          </a></li>
        ))}
      </ul>
    </section>
  );

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_270px] 2xl:grid-cols-[220px_minmax(0,1fr)_280px]">
      <aside className="hidden 2xl:block">
        <div className="sticky top-20 max-h-[calc(100dvh-6rem)] space-y-6 overflow-y-auto pr-1"><RegionNav /><Outline /></div>
      </aside>

      <article className="min-w-0" aria-labelledby="lesson-title">
        <LessonTracker lessonId={lesson.id} lastSection={progress.lastSection} />
        <header className="mb-6">
          <div className="flex flex-wrap items-center gap-2 text-[13px] text-faint">
            <Link href={`/curriculum/${lesson.domainId}`} className="hover:text-ink">{lesson.domainId} · {lesson.region}</Link>
            <span aria-hidden>·</span><span>Mission {lesson.ordinal}</span>
            <span aria-hidden>·</span><span className={`inline-flex items-center gap-1 ${st.cls}`}><LessonStatusIcon status={card.status} size={13} />{st.label}</span>
            {lesson.supplementary && <Chip>Supplementary — beyond the exam objectives</Chip>}
          </div>
          <h1 id="lesson-title" className="mt-2 text-[30px] font-semibold leading-tight tracking-[-0.02em] text-ink">{lesson.title}</h1>
          <Md className="mt-2 max-w-[72ch] text-[16px] text-muted">{lesson.summary}</Md>
          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px] text-muted">
            <span className="inline-flex items-center gap-1.5"><Clock size={14} aria-hidden />{lesson.minutes} min</span>
            <span className="inline-flex items-center gap-1.5"><Sparkles size={14} aria-hidden />Java {lesson.javaVersion}</span>
            {lesson.predictsTotal > 0 && <span className="inline-flex items-center gap-1.5" title="Output blocks whose shown output was produced by compiling and running the code on JDK 25"><BadgeCheck size={14} className="text-signal" aria-hidden />{lesson.predictsVerified}/{lesson.predictsTotal} outputs JDK-verified</span>}
            <span className="flex-1" />
            <BookmarkButton targetType="lesson" targetId={lesson.id} initial={v.bookmarked} />
          </div>
        </header>

        <details className="panel mb-6 p-4 lg:hidden">
          <summary className="cursor-pointer text-[14px] font-medium text-ink">Contents, key rules &amp; checklist</summary>
          <div className="mt-4 space-y-6"><Outline /><Checklist /><KeyRules /></div>
        </details>

        <section aria-labelledby="contract-h" className="panel mb-8 p-5">
          <h2 id="contract-h" className="flex items-center gap-2 text-[15px] font-semibold text-ink"><Target size={16} className="text-ion-strong" aria-hidden />Learning contract</h2>
          <p className="mt-1 text-[13.5px] text-muted">After this lesson you will be able to:</p>
          <ul className="mt-3 space-y-2 text-[14.5px] text-ink">
            {lesson.contract.map((c, i) => <li key={i} className="flex gap-2.5"><span className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full bg-ion" aria-hidden /><Md>{c}</Md></li>)}
          </ul>
          <div className="mt-4 grid grid-cols-1 gap-4 border-t border-line pt-4 text-[13px] md:grid-cols-2">
            <div>
              <div className="mb-1 text-faint">Exam objectives</div>
              <ul className="space-y-1.5">{lesson.objectives.map((o) => <li key={o.id} className="text-muted"><span className="font-semibold text-ink">{o.id}</span> {o.title} <VerificationBadge verification={o.verification} /></li>)}</ul>
            </div>
            <div>
              <div className="mb-1 text-faint">Prerequisites</div>
              {card.prerequisites.length === 0 ? <span className="text-muted">None — a good starting point.</span> : (
                <ul className="space-y-1">{card.prerequisites.map((p) => (
                  <li key={p.id} className="flex items-center gap-2">{p.completed ? <CircleCheck size={14} className="text-signal" aria-label="Completed" /> : <Circle size={14} className="text-faint" aria-label="Not completed" />}<Link href={`/lessons/${p.id}`} className="text-muted hover:text-ink">{p.title}</Link></li>
                ))}</ul>
              )}
            </div>
          </div>
        </section>

        <div id="lesson-body" className="prose-lesson">
          {segments.map((s, i) => {
            if (s.kind === "markdown") return <LessonMarkdown key={i} md={s.md} />;
            if (s.kind === "predict") return <PredictBlock key={i} lessonId={lesson.id} index={s.index} codeHtml={predictHtml[i]} output={s.output} alreadyPredicted={v.predictionsMade.includes(String(s.index))} verified={lesson.predictsVerified >= lesson.predictsTotal} />;
            if (s.kind === "check") {
              const q = v.checks[s.questionId];
              if (!q) return null;
              const prev = v.answeredChecks[q.id];
              return (
                <div key={i} className="not-prose my-8">
                  <div className="mb-2 text-[13px] font-medium text-ion-strong">Knowledge check</div>
                  <QuestionCard question={q} mode="lesson_check" askConfidence={learner.askConfidence} compact
                    initial={prev ? { correct: prev.correct, response: "options" in prev.response ? { options: prev.response.options } : { text: prev.response.text } } : null} />
                </div>
              );
            }
            const ex = v.exercises[s.exerciseId];
            if (!ex) return null;
            return (
              <Link key={i} href={`/exercises/${ex.id}`} className="not-prose my-8 flex items-center gap-4 rounded-[12px] border border-line bg-surface p-4 hover:border-ion">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[10px] bg-ion-soft text-ion-strong"><Code2 size={18} /></span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[12.5px] text-faint">Coding exercise · runs on JDK 25 in the isolated runner</span>
                  <span className="block font-medium text-ink">{ex.title}</span>
                </span>
                <Chip tone={DIFFICULTY_TONE[ex.difficulty]}>{DIFFICULTY_LABEL[ex.difficulty]}</Chip>
                <ArrowRight size={16} className="text-faint" aria-hidden />
              </Link>
            );
          })}
        </div>

        <section id="retrieval" aria-labelledby="retrieval-h" className="mt-14 scroll-mt-20">
          <h2 id="retrieval-h" className="text-[1.45rem] font-semibold tracking-[-0.012em] text-ink">Retrieval &amp; reflection</h2>
          <p className="mt-1 max-w-[70ch] text-muted">Close your eyes on the lesson for a moment. Recalling a rule — not re-reading it — is what makes it stick.</p>
          <div className="panel mt-4 p-5"><ReflectionBox lessonId={lesson.id} initial={progress.reflection} prompts={lesson.retrieval} /></div>
        </section>

        <section id="mastery" aria-labelledby="mastery-h" className="mt-14 scroll-mt-20">
          <h2 id="mastery-h" className="text-[1.45rem] font-semibold tracking-[-0.012em] text-ink">Mastery quiz</h2>
          <p className="mb-4 mt-1 max-w-[70ch] text-muted">Pass to complete the mission. Questions you miss go to your Mistake Journal and come back in spaced review.</p>
          {v.masteryQuiz.length ? (
            <MasteryQuiz lessonId={lesson.id} questions={v.masteryQuiz} passPercent={Math.round(MASTERY_PASS * 100)} bestScore={progress.masteryScore}
              completed={Boolean(progress.completedAt)} next={v.next} askConfidence={learner.askConfidence} />
          ) : <p className="text-muted">This lesson has no mastery quiz.</p>}
        </section>

        <nav aria-label="Lesson navigation" className="mt-12 grid grid-cols-1 gap-3 border-t border-line pt-6 sm:grid-cols-2">
          {v.prev ? <Link href={`/lessons/${v.prev.id}`} className="rounded-[10px] border border-line p-3 hover:border-line-strong"><span className="flex items-center gap-1 text-[12.5px] text-faint"><ArrowLeft size={13} />Previous</span><span className="text-[14px] text-ink">{v.prev.title}</span></Link> : <span />}
          {v.next && <Link href={`/lessons/${v.next.id}`} className="rounded-[10px] border border-line p-3 text-right hover:border-line-strong"><span className="flex items-center justify-end gap-1 text-[12.5px] text-faint">Next<ArrowRight size={13} /></span><span className="text-[14px] text-ink">{v.next.title}</span></Link>}
        </nav>
      </article>

      <aside className="hidden lg:block" aria-label="Lesson companion">
        <div className="sticky top-20 max-h-[calc(100dvh-6rem)] space-y-7 overflow-y-auto pr-1">
          <div className="2xl:hidden"><Outline /></div>
          <Checklist />
          <KeyRules />
          <section aria-labelledby="notes-h">
            <h2 id="notes-h" className="mb-2 text-[13.5px] font-medium text-ink">Your notes</h2>
            {v.notes.length > 0 && (
              <ul className="mb-3 space-y-2">{v.notes.map((n) => <li key={n.id} className="rounded-[8px] border border-line p-2 text-[13px] text-muted"><Md>{n.bodyMd}</Md></li>)}</ul>
            )}
            <QuickNote lessonId={lesson.id} domainId={lesson.domainId} />
          </section>
        </div>
      </aside>
    </div>
  );
}
