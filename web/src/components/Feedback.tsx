// Read-only rendering of an answered question: the options with the learner's choice and the correct set,
// every option's explanation, the rule and the misconception. Used after mastery quizzes, exams and in the
// Mistake Journal. (Interactive answering lives in QuestionCard / OptionPicker.)
import Link from "next/link";
import { clsx } from "clsx";
import { Check, X } from "lucide-react";
import type { PublicQuestion, Feedback } from "@/server/services/questions";
import { Md } from "./Md";
import { QuestionBody, QuestionMeta } from "./QuestionCard";
import { chooseText } from "./format";

export function OptionsReview({ q, chosen, feedback }: { q: PublicQuestion; chosen: string[]; feedback: Feedback }) {
  return (
    <ul className="mt-4 flex flex-col gap-2">
      {feedback.options.map((o, i) => {
        const picked = chosen.includes(o.key);
        const st = o.isCorrect ? (picked ? "correct" : "missed") : picked ? "wrong" : "idle";
        return (
          <li key={o.key}>
            <div className={clsx("flex items-start gap-3 rounded-[10px] border px-3.5 py-3",
              st === "idle" && "border-line bg-sunken", st === "correct" && "border-signal bg-signal-soft",
              st === "missed" && "border-dashed border-signal/60 bg-sunken", st === "wrong" && "border-rose bg-rose-soft")}>
              <span className={clsx("mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full text-[12px] font-semibold",
                o.isCorrect ? "bg-signal text-[#04262a]" : picked ? "bg-rose text-white" : "border border-line-strong text-muted")}>
                {o.isCorrect ? <Check size={14} /> : picked ? <X size={14} /> : String.fromCharCode(65 + i)}
              </span>
              <div className="min-w-0 flex-1 text-[14.5px] text-ink">
                <Md>{o.textMd}</Md>
                <div className="mt-1 flex flex-wrap gap-2 text-[12px]">
                  {picked && <span className={o.isCorrect ? "text-signal" : "text-rose"}>Your choice</span>}
                  {st === "missed" && <span className="text-signal">Correct — you didn&apos;t pick it</span>}
                </div>
              </div>
            </div>
            {o.whyMd && <div className={clsx("ml-9 mt-1.5 text-[13.5px]", o.isCorrect ? "text-signal" : picked ? "text-rose" : "text-muted")}><Md>{o.whyMd}</Md></div>}
          </li>
        );
      })}
    </ul>
  );
}

export function Explanation({ feedback, showLessonLink = true }: { feedback: Feedback; showLessonLink?: boolean }) {
  return (
    <div className="mt-4 space-y-3 text-[14.5px]">
      <Md className="text-ink">{feedback.explanationMd}</Md>
      <div className="callout callout-rule"><div className="callout-title">The rule</div><Md>{feedback.ruleMd}</Md></div>
      {feedback.misconceptionMd && <div className="callout callout-trap"><div className="callout-title">Common misconception</div><Md>{feedback.misconceptionMd}</Md></div>}
      {showLessonLink && feedback.lessonId && <Link href={`/lessons/${feedback.lessonId}`} className="inline-block text-[13.5px] text-ion-strong hover:underline">Revisit lesson: {feedback.lessonTitle}</Link>}
    </div>
  );
}

/** A full answered question: meta, prompt, code, options with outcome, explanation. */
export function AnsweredQuestion({ q, chosen, textAnswer, feedback, header }: {
  q: PublicQuestion; chosen: string[]; textAnswer?: string | null; feedback: Feedback; header?: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <QuestionMeta q={q} />
        {header}
      </div>
      <QuestionBody q={q} />
      {q.type === "multi" && <p className="mt-3 text-[13px] text-muted">{chooseText(q.choose)}</p>}
      {q.type === "text" ? (
        <div className="mt-4 space-y-2 text-[14px]">
          <div><span className="text-muted">Your answer: </span><code className="font-mono text-ink">{textAnswer || "—"}</code></div>
          <div><span className="text-muted">Accepted: </span><code className="font-mono text-signal">{feedback.acceptedText?.join("  ·  ")}</code></div>
        </div>
      ) : <OptionsReview q={q} chosen={chosen} feedback={feedback} />}
      <Explanation feedback={feedback} />
    </div>
  );
}
