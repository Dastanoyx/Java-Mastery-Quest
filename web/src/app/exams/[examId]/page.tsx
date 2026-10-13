import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getAttemptForTaking } from "@/server/services/exams";
import { getLearner } from "@/server/services/learner";
import { one, LEARNER_ID } from "@/server/db";
import { ExamRunner } from "@/components/exam/ExamRunner";

type Props = { params: Promise<{ examId: string }> };
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const raw = (await params).examId;
  const id = Number(raw);
  const r = /^[1-9]\d{0,8}$/.test(raw) ? await one<{ title: string }>("SELECT title FROM exam_attempt WHERE id = $1 AND learner_id = $2", [id, LEARNER_ID]) : null;
  return { title: r?.title ?? "Exam" };
}

export default async function ExamPage({ params }: Props) {
  const { examId } = await params;
  const id = Number(examId);
  if (!/^[1-9]\d{0,8}$/.test(examId)) notFound();
  const { view } = await getAttemptForTaking(id);
  if (!view) notFound();
  if (view.attempt.submittedAt) redirect(`/results/${id}`);
  const learner = await getLearner();
  return <ExamRunner view={JSON.parse(JSON.stringify(view))} askConfidence={learner.askConfidence} />;
}
