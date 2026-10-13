import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getExercise } from "@/server/services/exercises";
import { one, LEARNER_ID } from "@/server/db";
import { LessonMarkdown } from "@/components/LessonMarkdown";
import { Chip, DIFFICULTY_LABEL, DIFFICULTY_TONE } from "@/components/ui";
import { ExerciseWorkbench } from "@/components/exercise/ExerciseWorkbench";
import { BookmarkButton } from "@/components/lesson/LessonClient";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const e = await getExercise(id);
  return { title: e?.title ?? "Exercise" };
}

export default async function ExercisePage({ params }: Props) {
  const { id } = await params;
  const e = await getExercise(id);
  if (!e) notFound();
  const bm = await one("SELECT 1 FROM bookmark WHERE learner_id = $1 AND target_type = 'exercise' AND target_id = $2", [LEARNER_ID, id]);
  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2 text-[13px] text-faint">
            <Link href={`/curriculum/${e.domainId}`} className="hover:text-ink">{e.domainId}</Link><span aria-hidden>·</span><span title={e.objectiveTitle}>{e.objectiveId}</span>
            {e.lessonId && <><span aria-hidden>·</span><Link href={`/lessons/${e.lessonId}`} className="hover:text-ink">{e.lessonTitle}</Link></>}
          </div>
          <h1 className="mt-1 text-[26px] font-semibold leading-tight tracking-[-0.015em] text-ink">{e.title}</h1>
        </div>
        <div className="flex items-center gap-2">
          <Chip tone={DIFFICULTY_TONE[e.difficulty]}>{DIFFICULTY_LABEL[e.difficulty]}</Chip>
          {e.passedEver && <Chip tone="signal">Passed</Chip>}
          <BookmarkButton targetType="exercise" targetId={e.id} initial={Boolean(bm)} />
        </div>
      </header>
      <ExerciseWorkbench exercise={JSON.parse(JSON.stringify(e))} prompt={<div className="prose-lesson text-[15px]"><LessonMarkdown md={e.promptMd} /></div>} />
    </div>
  );
}
