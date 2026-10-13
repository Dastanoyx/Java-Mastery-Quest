"use client";
// Part H — independent assessment. No hints, no feedback until every question is answered and submitted.
import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { clsx } from "clsx";
import { Check, X, Trophy, RotateCcw, ArrowRight } from "lucide-react";
import type { PublicQuestion, Feedback } from "@/server/services/questions";
import { QuestionBody, QuestionMeta } from "../QuestionCard";
import { OptionPicker, isAnswered, type Picked } from "../OptionPicker";
import { AnsweredQuestion } from "../Feedback";
import { Button, Chip } from "../ui";
import { api, showRewards, type Rewards } from "../rewards";

interface Result { score: number; passed: boolean; correct: number; total: number; firstCompletion: boolean; xp: number; feedback: Feedback[]; rewards: Rewards }

export function MasteryQuiz({ lessonId, questions, passPercent, bestScore, completed, next, askConfidence }: {
  lessonId: string; questions: PublicQuestion[]; passPercent: number; bestScore: number | null; completed: boolean;
  next: { id: string; title: string } | null; askConfidence: boolean;
}) {
  const router = useRouter();
  const [answers, setAnswers] = useState<Record<string, Picked>>({});
  const [confidence, setConfidence] = useState<Record<string, 1 | 2 | 3>>({});
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [round, setRound] = useState(0);
  const started = useRef<Record<string, number>>({});
  const answered = useMemo(() => questions.filter((q) => isAnswered(q, answers[q.id])).length, [questions, answers]);

  const submit = async () => {
    setBusy(true);
    try {
      const now = Date.now();
      const r = await api<Result>(`/api/lessons/${lessonId}/mastery`, { json: { answers: questions.map((q) => ({
        questionId: q.id,
        response: q.type === "text" ? { text: answers[q.id]?.text ?? "" } : { options: answers[q.id]?.options ?? [] },
        confidence: askConfidence ? confidence[q.id] ?? null : null,
        timeMs: started.current[q.id] ? Math.min(3_600_000, now - started.current[q.id]) : null,
      })) } });
      setResult(r);
      showRewards(r.rewards);
      if (r.xp > 0) toast(`+${r.xp} XP`, { description: r.passed ? "Mastery quiz passed" : "New questions answered correctly", duration: 2000 });
      router.refresh();
      requestAnimationFrame(() => document.getElementById("mastery-result")?.focus());
    } catch (e) { toast.error((e as Error).message); }
    setBusy(false);
  };

  if (result) {
    const pct = Math.round(result.score * 100);
    return (
      <div>
        <div id="mastery-result" tabIndex={-1} className={clsx("rounded-[12px] border p-5 outline-none", result.passed ? "border-signal/50 bg-signal-soft" : "border-amber/50 bg-amber-soft")} aria-live="polite">
          <div className="flex flex-wrap items-center gap-3">
            {result.passed ? <Trophy size={22} className="text-signal" /> : <RotateCcw size={22} className="text-amber" />}
            <div className="flex-1">
              <div className="text-[18px] font-semibold text-ink">{result.passed ? (result.firstCompletion ? "Mission complete" : "Passed again") : "Not passed yet"}</div>
              <div className="text-[14px] text-muted"><span className="tabular font-semibold text-ink">{result.correct}/{result.total}</span> correct ({pct} %) · pass mark {passPercent} %{result.xp > 0 && <> · <span className="text-arc">+{result.xp} XP</span></>}</div>
            </div>
          </div>
          <p className="mt-3 text-[13.5px] text-muted">
            {result.passed
              ? "Every question you missed is now in your Mistake Journal and spaced review. The concepts come back for review in a few days — that is when it counts."
              : "Read the explanations below, revisit the sections they point to, then retake. Retakes right away are immediate repeats, so they count less towards mastery than recalling it tomorrow."}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {!result.passed && <Button variant="primary" onClick={() => { setResult(null); setAnswers({}); setConfidence({}); setRound((r) => r + 1); }}><RotateCcw size={15} />Retake</Button>}
            {result.passed && next && <Link href={`/lessons/${next.id}`} className="inline-flex h-9 items-center gap-2 rounded-[8px] bg-ion px-4 text-sm font-medium text-white hover:bg-ion-strong">Next: {next.title}<ArrowRight size={15} /></Link>}
            <Link href="/review" className="inline-flex h-9 items-center rounded-[8px] border border-line bg-raised px-4 text-sm text-ink hover:border-line-strong">Open review queue</Link>
          </div>
        </div>
        <ol className="mt-6 space-y-6">
          {questions.map((q, i) => {
            const fb = result.feedback[i];
            return (
              <li key={q.id} className="panel p-5">
                <AnsweredQuestion q={q} chosen={answers[q.id]?.options ?? []} textAnswer={answers[q.id]?.text} feedback={fb}
                  header={<Chip tone={fb.correct ? "signal" : "rose"}>{fb.correct ? <><Check size={12} />Correct</> : <><X size={12} />Incorrect</>}</Chip>} />
              </li>
            );
          })}
        </ol>
      </div>
    );
  }

  return (
    <div key={round}>
      <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13.5px] text-muted">
        <span>{questions.length} questions · no hints · feedback after you submit · pass at {passPercent} %</span>
        {bestScore != null && <span>Best so far: <span className="tabular text-ink">{Math.round(bestScore * 100)} %</span>{completed && " (completed)"}</span>}
      </div>
      <ol className="space-y-5">
        {questions.map((q, i) => (
          <li key={q.id} data-question={q.id} className="panel p-5" onFocusCapture={() => { started.current[q.id] ??= Date.now(); }} onPointerDownCapture={() => { started.current[q.id] ??= Date.now(); }}>
            <div className="mb-3 flex items-center justify-between gap-2"><span className="text-[13px] font-semibold text-faint">Question {i + 1} of {questions.length}</span><QuestionMeta q={q} /></div>
            <QuestionBody q={q} />
            <OptionPicker q={q} name={`mq-${q.id}`} value={answers[q.id] ?? null} onChange={(v) => setAnswers((a) => ({ ...a, [q.id]: v }))} />
            {askConfidence && (
              <div className="mt-3 flex items-center gap-1" role="group" aria-label="How sure are you? (optional)">
                <span className="mr-1 text-[12.5px] text-faint">How sure?</span>
                {([1, 2, 3] as const).map((c) => (
                  <button key={c} type="button" aria-pressed={confidence[q.id] === c} onClick={() => setConfidence((s) => ({ ...s, [q.id]: c }))}
                    className={clsx("h-7 rounded-full border px-2.5 text-[12.5px]", confidence[q.id] === c ? "border-ion bg-ion-soft text-ink" : "border-line text-muted hover:border-line-strong")}>
                    {c === 1 ? "Guessing" : c === 2 ? "Unsure" : "Sure"}
                  </button>
                ))}
              </div>
            )}
          </li>
        ))}
      </ol>
      <div className="sticky bottom-3 z-10 mt-5 flex items-center justify-between gap-3 rounded-[12px] border border-line bg-surface/95 px-4 py-3 shadow-[var(--shadow)] backdrop-blur">
        <span className="tabular text-[13.5px] text-muted">{answered} / {questions.length} answered</span>
        <Button variant="primary" onClick={submit} disabled={busy || answered < questions.length}>{busy ? "Scoring…" : "Submit mastery quiz"}</Button>
      </div>
    </div>
  );
}
