"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { clsx } from "clsx";
import { toast } from "sonner";
import { Check, X, Lightbulb, Bookmark, BookmarkCheck, NotebookPen, BadgeCheck, ShieldQuestion, ArrowRight } from "lucide-react";
import type { PublicQuestion, Feedback } from "@/server/services/questions";
import { Md } from "./Md";
import { Button, Chip, DIFFICULTY_LABEL, DIFFICULTY_TONE } from "./ui";
import { api, showRewards, type Rewards } from "./rewards";
import { chooseText, relativeDay } from "./format";

export interface AnswerOutcome {
  attemptId: number; correct: boolean; seenBefore: boolean; spacedSuccess: boolean; wasDue: boolean; xpAwarded: number;
  mistakeResolved: boolean; nextReviewAt: string; feedback: Feedback; followUpId: string | null; rewards: Rewards;
}

type Mode = "practice" | "review" | "lesson_check" | "timed";
const CONFIDENCE = [{ v: 1, label: "Guessing" }, { v: 2, label: "Unsure" }, { v: 3, label: "Sure" }] as const;

export function QuestionMeta({ q }: { q: PublicQuestion }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-[12.5px]">
      <Chip tone={DIFFICULTY_TONE[q.difficulty]}>{DIFFICULTY_LABEL[q.difficulty]}</Chip>
      <Chip title={q.objectiveTitle}>{q.objectiveId}</Chip>
      <span className="text-faint">{q.domainShort}</span>
      {q.verification === "jdk-verified"
        ? <span className="inline-flex items-center gap-1 text-signal" title={`Compiled and run on JDK ${q.verifiedWith}`}><BadgeCheck size={13} aria-hidden />JDK {q.verifiedWith?.split("+")[0]} verified</span>
        : q.verification === "reviewed" ? <span className="inline-flex items-center gap-1 text-faint" title="Concept question without code — reviewed, not machine-verified"><ShieldQuestion size={13} aria-hidden />Concept, reviewed</span>
          : <span className="text-amber">Needs review</span>}
    </div>
  );
}

export function QuestionBody({ q }: { q: PublicQuestion }) {
  return (
    <>
      <Md className="text-[15.5px] leading-relaxed text-ink">{q.promptMd}</Md>
      {q.codeHtml && <div className="code-frame code-numbered mt-3" dangerouslySetInnerHTML={{ __html: q.codeHtml }} />}
    </>
  );
}

export function QuestionCard({ question: q, mode, sessionId, askConfidence = true, onAnswered, onFollowUp, initial, compact }: {
  question: PublicQuestion; mode: Mode; sessionId?: number | null; askConfidence?: boolean;
  onAnswered?: (o: AnswerOutcome) => void; onFollowUp?: (questionId: string) => void;
  initial?: { correct: boolean; response: { options?: string[]; text?: string } } | null; compact?: boolean;
}) {
  const [selected, setSelected] = useState<string[]>(initial?.response.options ?? []);
  const [text, setText] = useState(initial?.response.text ?? "");
  const [confidence, setConfidence] = useState<1 | 2 | 3 | null>(null);
  const [hint, setHint] = useState(false);
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<AnswerOutcome | null>(null);
  const [bookmarked, setBookmarked] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState("");
  const started = useRef(Date.now());
  const root = useRef<HTMLDivElement>(null);
  const answered = Boolean(outcome);
  const multi = q.type === "multi";

  useEffect(() => { started.current = Date.now(); }, [q.id]);

  const toggle = useCallback((key: string) => {
    if (answered) return;
    setSelected((s) => (multi ? (s.includes(key) ? s.filter((k) => k !== key) : [...s, key]) : [key]));
  }, [answered, multi]);

  const canSubmit = !busy && !answered && (q.type === "text" ? text.trim().length > 0 : selected.length > 0);

  const submit = useCallback(async () => {
    if (!canSubmit) return;
    setBusy(true);
    try {
      const o = await api<AnswerOutcome>("/api/answers", { json: {
        questionId: q.id, response: q.type === "text" ? { text } : { options: selected }, mode,
        confidence: askConfidence ? confidence : null, timeMs: Date.now() - started.current, hintUsed: hint, sessionId: sessionId ?? null,
      } });
      setOutcome(o);
      onAnswered?.(o);
      if (o.xpAwarded > 0) toast(`+${o.xpAwarded} XP`, { description: o.seenBefore ? "Spaced recall succeeded" : "New question answered correctly", duration: 1800 });
      showRewards(o.rewards);
      requestAnimationFrame(() => root.current?.querySelector<HTMLElement>("[data-feedback]")?.focus());
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, [canSubmit, q.id, q.type, text, selected, mode, askConfidence, confidence, hint, sessionId, onAnswered]);

  // Keyboard: A–H / 1–8 choose, Enter submits, H shows the hint. Only when focus is inside this card.
  const onKeyDown = (e: React.KeyboardEvent) => {
    const t = e.target as HTMLElement;
    if (/textarea|input/i.test(t.tagName)) { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); submit(); } return; }
    if (answered) return;
    const keys = q.options.map((o) => o.key);
    const k = e.key.toLowerCase();
    const idx = /^[1-8]$/.test(k) ? Number(k) - 1 : keys.indexOf(k);
    if (idx >= 0 && idx < keys.length && !e.metaKey && !e.ctrlKey) { e.preventDefault(); toggle(keys[idx]); }
    else if (e.key === "Enter") { e.preventDefault(); submit(); }
    else if (k === "h" && q.hintMd && mode !== "timed") setHint(true);
  };

  const toggleBookmark = async () => {
    try {
      const r = await api<{ bookmarked: boolean }>("/api/bookmarks", { json: { targetType: "question", targetId: q.id } });
      setBookmarked(r.bookmarked);
      toast(r.bookmarked ? "Question bookmarked" : "Bookmark removed", { duration: 1500 });
    } catch (e) { toast.error((e as Error).message); }
  };
  const saveNote = async () => {
    if (!note.trim()) return;
    try {
      await api("/api/notes", { json: { title: `Note on ${q.id}`, bodyMd: note, questionId: q.id, domainId: q.domainId, lessonId: q.lessonId } });
      toast("Note saved to the Knowledge Vault", { duration: 1500 });
      setNote(""); setNoteOpen(false);
    } catch (e) { toast.error((e as Error).message); }
  };

  const fb = outcome?.feedback;
  const optionState = (key: string) => {
    if (!fb) return selected.includes(key) ? "selected" : "idle";
    const isCorrect = fb.correctKeys.includes(key);
    const chosen = selected.includes(key);
    if (isCorrect && chosen) return "correct";
    if (isCorrect) return "missed";
    if (chosen) return "wrong";
    return "idle";
  };

  return (
    <div ref={root} onKeyDown={onKeyDown} className={clsx("panel", compact ? "p-4" : "p-5 md:p-6")} data-question={q.id}>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <QuestionMeta q={q} />
        <div className="flex items-center gap-1">
          <button type="button" onClick={toggleBookmark} className="grid h-8 w-8 place-items-center rounded-[8px] text-faint hover:bg-raised hover:text-ink" aria-pressed={bookmarked} aria-label={bookmarked ? "Remove bookmark" : "Bookmark question"}>
            {bookmarked ? <BookmarkCheck size={16} className="text-ion-strong" /> : <Bookmark size={16} />}
          </button>
          <button type="button" onClick={() => setNoteOpen((v) => !v)} className="grid h-8 w-8 place-items-center rounded-[8px] text-faint hover:bg-raised hover:text-ink" aria-expanded={noteOpen} aria-label="Add a note">
            <NotebookPen size={16} />
          </button>
        </div>
      </div>
      {noteOpen && (
        <div className="well mb-4 p-3">
          <label className="text-[13px] text-muted" htmlFor={`note-${q.id}`}>Note for your Knowledge Vault</label>
          <textarea id={`note-${q.id}`} value={note} onChange={(e) => setNote(e.target.value)} rows={3} className="mt-1.5 w-full rounded-[8px] border border-line bg-surface p-2 text-[14px] outline-none focus:border-ion" placeholder="What do you want to remember about this?" />
          <div className="mt-2 flex justify-end gap-2"><Button size="sm" variant="ghost" onClick={() => setNoteOpen(false)}>Cancel</Button><Button size="sm" variant="primary" onClick={saveNote} disabled={!note.trim()}>Save note</Button></div>
        </div>
      )}

      <QuestionBody q={q} />

      {q.type === "text" ? (
        <div className="mt-4">
          <label htmlFor={`ans-${q.id}`} className="text-[13px] text-muted">Your answer</label>
          <textarea id={`ans-${q.id}`} value={text} onChange={(e) => setText(e.target.value)} disabled={answered} rows={3}
            className="mt-1.5 w-full rounded-[8px] border border-line bg-sunken p-3 font-mono text-[14px] outline-none focus:border-ion" />
        </div>
      ) : (
        <fieldset className="mt-4">
          <legend className="mb-2 text-[13px] text-muted">{multi ? <span className="font-medium text-ink">{chooseText(q.choose)}</span> : "Select one answer"}</legend>
          <div className="flex flex-col gap-2" role={multi ? "group" : "radiogroup"}>
            {q.options.map((o, i) => {
              const st = optionState(o.key);
              const why = fb?.options.find((x) => x.key === o.key)?.whyMd;
              return (
                <div key={o.key}>
                  <button type="button" role={multi ? "checkbox" : "radio"} aria-checked={selected.includes(o.key)}
                    onClick={() => toggle(o.key)}
                    className={clsx("flex w-full items-start gap-3 rounded-[10px] border px-3.5 py-3 text-left transition-colors",
                      st === "idle" && "border-line bg-sunken hover:border-line-strong",
                      st === "selected" && "border-ion bg-ion-soft",
                      st === "correct" && "border-signal bg-signal-soft",
                      st === "missed" && "border-signal/60 border-dashed bg-sunken",
                      st === "wrong" && "border-rose bg-rose-soft",
                      answered && "cursor-default")}>
                    <span className={clsx("mt-0.5 grid h-6 w-6 shrink-0 place-items-center text-[12px] font-semibold", multi ? "rounded-[6px]" : "rounded-full",
                      st === "selected" ? "bg-ion text-white" : st === "correct" || st === "missed" ? "bg-signal text-[#04262a]" : st === "wrong" ? "bg-rose text-white" : "border border-line-strong text-muted")}>
                      {st === "correct" || st === "missed" ? <Check size={14} /> : st === "wrong" ? <X size={14} /> : String.fromCharCode(65 + i)}
                    </span>
                    <span className="min-w-0 flex-1 text-[14.5px] text-ink"><Md>{o.textMd}</Md></span>
                  </button>
                  {why && (
                    <div className={clsx("ml-9 mt-1.5 text-[13.5px]", st === "wrong" ? "text-rose" : st === "correct" || st === "missed" ? "text-signal" : "text-muted")}>
                      <Md>{why}</Md>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </fieldset>
      )}

      {!answered && (
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {askConfidence && (
              <div className="flex items-center gap-1" role="group" aria-label="How sure are you? (optional)">
                <span className="mr-1 text-[12.5px] text-faint">How sure?</span>
                {CONFIDENCE.map((c) => (
                  <button key={c.v} type="button" aria-pressed={confidence === c.v} onClick={() => setConfidence(confidence === c.v ? null : c.v)}
                    className={clsx("h-7 rounded-full border px-2.5 text-[12.5px]", confidence === c.v ? "border-ion bg-ion-soft text-ink" : "border-line text-muted hover:border-line-strong")}>{c.label}</button>
                ))}
              </div>
            )}
            {q.hintMd && mode !== "timed" && !hint && (
              <Button size="sm" variant="ghost" onClick={() => setHint(true)} title="Hints halve the XP for this question"><Lightbulb size={15} />Hint</Button>
            )}
          </div>
          <Button variant="primary" onClick={submit} disabled={!canSubmit}>{busy ? "Checking…" : "Check answer"}</Button>
        </div>
      )}
      {hint && q.hintMd && !answered && <div className="callout callout-tip mt-3"><div className="callout-title"><Lightbulb size={15} />Hint</div><Md>{q.hintMd}</Md></div>}

      {fb && outcome && (
        <div data-feedback tabIndex={-1} className="mt-5 outline-none" aria-live="polite">
          <div className={clsx("flex flex-wrap items-center justify-between gap-2 rounded-[10px] px-4 py-3", fb.correct ? "bg-signal-soft" : "bg-rose-soft")}>
            <div className={clsx("flex items-center gap-2 font-semibold", fb.correct ? "text-signal" : "text-rose")}>
              {fb.correct ? <Check size={18} /> : <X size={18} />}
              {fb.correct ? "Correct" : "Not quite"}
              {!fb.correct && fb.correctKeys.length > 0 && <span className="font-normal text-muted">— correct: {fb.correctKeys.map((k) => String.fromCharCode(65 + q.options.findIndex((o) => o.key === k))).join(", ")}</span>}
              {fb.acceptedText && !fb.correct && <span className="font-normal text-muted">— accepted: <code className="font-mono">{fb.acceptedText[0]}</code></span>}
            </div>
            <div className="flex items-center gap-2 text-[12.5px] text-muted">
              {outcome.xpAwarded > 0 && <Chip tone="arc">+{outcome.xpAwarded} XP</Chip>}
              {outcome.mistakeResolved && <Chip tone="signal">Mistake resolved</Chip>}
              <span title={new Date(outcome.nextReviewAt).toLocaleString()}>Next review {relativeDay(outcome.nextReviewAt)}</span>
            </div>
          </div>
          <div className="mt-4 space-y-3 text-[14.5px]">
            <Md className="text-ink">{fb.explanationMd}</Md>
            <div className="callout callout-rule"><div className="callout-title">The rule</div><Md>{fb.ruleMd}</Md></div>
            {fb.misconceptionMd && <div className="callout callout-trap"><div className="callout-title">Common misconception</div><Md>{fb.misconceptionMd}</Md></div>}
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {fb.lessonId && mode !== "lesson_check" && <Link href={`/lessons/${fb.lessonId}`} className="text-[13.5px] text-ion-strong underline-offset-2 hover:underline">Revisit lesson: {fb.lessonTitle}</Link>}
            <div className="flex-1" />
            {onFollowUp && outcome.followUpId && (
              <Button size="sm" onClick={() => onFollowUp(outcome.followUpId!)}>Same concept, different angle <ArrowRight size={14} /></Button>
            )}
          </div>
        </div>
      )}
      {initial && !outcome && <p className="mt-3 text-[12.5px] text-faint">You answered this before ({initial.correct ? "correct" : "incorrect"}). Answer again to practise.</p>}
    </div>
  );
}

export { relativeDay, chooseText };
