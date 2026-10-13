"use client";
// Strict exam simulation. The server never sends correctness for an open attempt; this component only
// collects answers. Every change is autosaved, so a refresh or crash resumes exactly where you were.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { clsx } from "clsx";
import { toast } from "sonner";
import { Flag, ChevronLeft, ChevronRight, Send, Clock, CloudCheck, CloudAlert, LoaderCircle, ListChecks } from "lucide-react";
import type { AttemptView } from "@/server/services/exams";
import { QuestionBody } from "../QuestionCard";
import { OptionPicker, isAnswered, type Picked } from "../OptionPicker";
import { Button } from "../ui";
import { api, showRewards, type Rewards } from "../rewards";
import { clock } from "../format";

type Q = AttemptView["questions"][number];
type SaveState = "saved" | "saving" | "error";

export function ExamRunner({ view, askConfidence }: { view: AttemptView; askConfidence: boolean }) {
  const router = useRouter();
  const { attempt } = view;
  const [qs, setQs] = useState<Q[]>(view.questions);
  const [pos, setPos] = useState(() => {
    const firstOpen = view.questions.find((q) => !q.response);
    return firstOpen?.position ?? 1;
  });
  const [save, setSave] = useState<SaveState>("saved");
  const [reviewing, setReviewing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [filter, setFilter] = useState<"all" | "open" | "flagged">("all");
  const offset = useRef(new Date(view.serverNow).getTime() - Date.now());
  const deadline = attempt.deadlineAt ? new Date(attempt.deadlineAt).getTime() : null;
  const [remaining, setRemaining] = useState(() => (deadline ? (deadline - (Date.now() + offset.current)) / 1000 : null));
  const enteredAt = useRef(Date.now());
  const pending = useRef(new Set<Promise<unknown>>());
  const warned = useRef(new Set<number>());
  const submittedRef = useRef(false);

  const q = qs[pos - 1];
  const answeredCount = qs.filter((x) => isAnswered(x, x.response as Picked | null)).length;
  const flaggedCount = qs.filter((x) => x.flagged).length;

  const persist = useCallback((position: number, body: Record<string, unknown>) => {
    setSave("saving");
    const p = api(`/api/exams/${attempt.id}/answers/${position}`, { method: "PUT", json: body })
      .then(() => { pending.current.delete(p); if (!pending.current.size) setSave("saved"); })
      .catch((e: Error) => {
        pending.current.delete(p);
        setSave("error");
        if (/time is up|already been submitted/i.test(e.message)) doSubmit("timeout");
        else toast.error(`Not saved: ${e.message}`, { description: "Your answer is kept on this page — it will be retried with the next change." });
      });
    pending.current.add(p);
    return p;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt.id]);

  /** Sends the time spent on the current question before leaving it. */
  const flushTime = useCallback(() => {
    const delta = Date.now() - enteredAt.current;
    enteredAt.current = Date.now();
    if (delta > 500 && !submittedRef.current) persist(pos, { timeMsDelta: Math.min(delta, 3_600_000) });
  }, [persist, pos]);

  const goto = useCallback((p: number) => {
    if (p < 1 || p > qs.length || p === pos) return;
    flushTime();
    setPos(p);
    setReviewing(false);
    window.scrollTo({ top: 0 });
  }, [qs.length, pos, flushTime]);

  const doSubmit = useCallback(async (reason: "learner" | "timeout") => {
    if (submittedRef.current) return;
    submittedRef.current = true;
    setSubmitting(true);
    try {
      if (reason === "learner") {
        const delta = Date.now() - enteredAt.current;
        if (delta > 500) await persist(pos, { timeMsDelta: Math.min(delta, 3_600_000) }).catch(() => {});
      }
      await Promise.allSettled([...pending.current]);
      const r = await api<{ rewards: Rewards | null }>(`/api/exams/${attempt.id}/submit`, { json: {} });
      showRewards(r.rewards);
      if (reason === "timeout") toast("Time is up — your attempt was submitted.");
      router.replace(`/results/${attempt.id}`);
    } catch (e) {
      // The server auto-submits expired attempts on next load, so the results page still works.
      if (reason === "timeout") router.replace(`/results/${attempt.id}`);
      else { toast.error((e as Error).message); submittedRef.current = false; setSubmitting(false); }
    }
  }, [attempt.id, persist, pos, router]);

  // Countdown, synchronised to the server clock.
  useEffect(() => {
    if (!deadline) return;
    const t = setInterval(() => {
      const left = (deadline - (Date.now() + offset.current)) / 1000;
      setRemaining(left);
      for (const mark of [600, 300, 60]) {
        if (left <= mark && left > 0 && !warned.current.has(mark)) {
          warned.current.add(mark);
          toast.warning(`${mark / 60} minute${mark > 60 ? "s" : ""} left`, { description: `${qs.length - answeredCount} unanswered, ${flaggedCount} flagged.` });
        }
      }
      if (left <= 0) { clearInterval(t); doSubmit("timeout"); }
    }, 1000);
    return () => clearInterval(t);
  }, [deadline, doSubmit, qs.length, answeredCount, flaggedCount]);

  const setAnswer = (v: Picked) => {
    const response = q.type === "text" ? { text: v.text ?? "" } : { options: v.options ?? [] };
    setQs((all) => all.map((x) => (x.position === q.position ? { ...x, response: response as Q["response"] } : x)));
    persist(q.position, { response });
  };
  const toggleFlag = useCallback(() => {
    const flagged = !q.flagged;
    setQs((all) => all.map((x) => (x.position === q.position ? { ...x, flagged } : x)));
    persist(q.position, { flagged });
  }, [q, persist]);
  const setConf = (c: 1 | 2 | 3 | null) => {
    setQs((all) => all.map((x) => (x.position === q.position ? { ...x, confidence: c } : x)));
    persist(q.position, { confidence: c });
  };

  // Keyboard: ←/→ navigate, F flags, A–H select (outside text fields).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (/input|textarea|select/i.test(t.tagName) || e.metaKey || e.ctrlKey || e.altKey || submitting) return;
      if (e.key === "ArrowRight") { e.preventDefault(); goto(pos + 1); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); goto(pos - 1); }
      else if (e.key === "f" || e.key === "F") { e.preventDefault(); toggleFlag(); }
      else if (/^[a-h]$/i.test(e.key) && q.type !== "text") {
        const i = e.key.toLowerCase().charCodeAt(0) - 97;
        const opt = q.options[i];
        if (!opt) return;
        e.preventDefault();
        const cur = (q.response && "options" in q.response ? q.response.options : []) as string[];
        setAnswer({ options: q.type === "multi" ? (cur.includes(opt.key) ? cur.filter((k) => k !== opt.key) : [...cur, opt.key]) : [opt.key] });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const visible = useMemo(() => qs.filter((x) => filter === "all" || (filter === "flagged" ? x.flagged : !isAnswered(x, x.response as Picked | null))), [qs, filter]);
  const low = remaining != null && remaining <= 300;
  const veryLow = remaining != null && remaining <= 60;

  const nav = (
    <div>
      <div className="mb-2 flex gap-1 text-[12px]" role="group" aria-label="Filter questions">
        {(["all", "open", "flagged"] as const).map((f) => (
          <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)}
            className={clsx("h-7 flex-1 rounded-[6px] border", filter === f ? "border-ion bg-ion-soft text-ink" : "border-line text-muted")}>
            {f === "all" ? `All ${qs.length}` : f === "open" ? `Open ${qs.length - answeredCount}` : `Flagged ${flaggedCount}`}
          </button>
        ))}
      </div>
      <ol className="grid grid-cols-8 gap-1.5 sm:grid-cols-10 lg:grid-cols-5" aria-label="Questions">
        {visible.map((x) => {
          const done = isAnswered(x, x.response as Picked | null);
          return (
            <li key={x.position}>
              <button type="button" onClick={() => goto(x.position)} aria-current={x.position === pos ? "step" : undefined}
                aria-label={`Question ${x.position}${done ? ", answered" : ", unanswered"}${x.flagged ? ", flagged" : ""}`}
                className={clsx("relative grid h-9 w-full place-items-center rounded-[7px] border text-[12.5px] font-medium tabular",
                  x.position === pos ? "border-ion ring-1 ring-ion" : "border-line",
                  done ? "bg-ion-soft text-ink" : "bg-sunken text-muted hover:border-line-strong")}>
                {x.position}
                {x.flagged && <span className="absolute right-0.5 top-0.5 h-1.5 w-1.5 rounded-full bg-amber" aria-hidden />}
              </button>
            </li>
          );
        })}
      </ol>
      {visible.length === 0 && <p className="text-[12.5px] text-faint">None.</p>}
    </div>
  );

  return (
    <div className="mx-auto max-w-[1180px]">
      <div className="sticky top-14 z-20 -mx-4 mb-5 flex flex-wrap items-center gap-3 border-b border-line bg-bg/90 px-4 py-2.5 backdrop-blur md:-mx-8 md:px-8">
        <div className="min-w-0 flex-1">
          <div className="truncate text-[14px] font-medium text-ink">{attempt.title}</div>
          <div className="text-[12px] text-faint">Strict mode · answers and explanations after you submit</div>
        </div>
        <span className="flex items-center gap-1.5 text-[12.5px] text-faint" aria-live="polite">
          {save === "saving" ? <><LoaderCircle size={14} className="animate-spin" />Saving</> : save === "error" ? <><CloudAlert size={14} className="text-rose" /><span className="text-rose">Not saved</span></> : <><CloudCheck size={14} />Saved</>}
        </span>
        <span className="tabular text-[13px] text-muted">{answeredCount}/{qs.length} answered</span>
        {remaining != null && (
          <span className={clsx("tabular flex items-center gap-1.5 rounded-[8px] border px-2.5 py-1 text-[15px] font-semibold",
            veryLow ? "border-rose bg-rose-soft text-rose" : low ? "border-amber bg-amber-soft text-amber" : "border-line text-ink")} role="timer" aria-label={`Time remaining ${clock(remaining)}`}>
            <Clock size={15} aria-hidden />{clock(remaining)}
          </span>
        )}
        <Button variant="primary" size="sm" onClick={() => { flushTime(); setReviewing(true); }} disabled={submitting}><ListChecks size={15} />Review &amp; submit</Button>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_260px]">
        <div className="min-w-0">
          {reviewing ? (
            <section className="panel p-6" aria-labelledby="sub-h">
              <h2 id="sub-h" className="text-[20px] font-semibold text-ink">Submit this attempt?</h2>
              <ul className="mt-3 space-y-1 text-[14px] text-muted">
                <li><span className="tabular text-ink">{answeredCount}</span> of {qs.length} answered</li>
                {qs.length - answeredCount > 0 && <li className="text-amber"><span className="tabular">{qs.length - answeredCount}</span> unanswered — they count as wrong. There is no penalty for guessing.</li>}
                {flaggedCount > 0 && <li><span className="tabular text-ink">{flaggedCount}</span> flagged for review</li>}
                {remaining != null && <li><span className="tabular text-ink">{clock(remaining)}</span> still on the clock</li>}
              </ul>
              <p className="mt-3 text-[13.5px] text-faint">After submitting you&apos;ll see your score, every explanation and a remediation plan. Answers can&apos;t be changed afterwards.</p>
              <div className="mt-5 flex flex-wrap gap-2">
                <Button onClick={() => setReviewing(false)} disabled={submitting}><ChevronLeft size={15} />Back to questions</Button>
                {qs.length - answeredCount > 0 && <Button variant="ghost" onClick={() => { setFilter("open"); goto(qs.find((x) => !isAnswered(x, x.response as Picked | null))!.position); }}>Go to first unanswered</Button>}
                <Button variant="primary" onClick={() => doSubmit("learner")} disabled={submitting}><Send size={15} />{submitting ? "Submitting…" : "Submit for scoring"}</Button>
              </div>
            </section>
          ) : (
            <section className="panel p-5 md:p-6" aria-labelledby="q-h" data-position={q.position}>
              <div className="mb-3 flex items-center justify-between gap-2">
                <h2 id="q-h" className="text-[14px] font-semibold text-faint">Question {pos} of {qs.length}</h2>
                <Button size="sm" variant="ghost" onClick={toggleFlag} aria-pressed={q.flagged} className={q.flagged ? "text-amber" : ""}><Flag size={15} />{q.flagged ? "Flagged" : "Flag for review"}</Button>
              </div>
              <QuestionBody q={q} />
              <OptionPicker key={q.position} q={q} name={`ex-${q.position}`} value={(q.response as Picked | null) ?? null} onChange={setAnswer} disabled={submitting} />
              {askConfidence && (
                <div className="mt-4 flex items-center gap-1" role="group" aria-label="How sure are you? (optional)">
                  <span className="mr-1 text-[12.5px] text-faint">How sure?</span>
                  {([1, 2, 3] as const).map((c) => (
                    <button key={c} type="button" aria-pressed={q.confidence === c} onClick={() => setConf(q.confidence === c ? null : c)}
                      className={clsx("h-7 rounded-full border px-2.5 text-[12.5px]", q.confidence === c ? "border-ion bg-ion-soft text-ink" : "border-line text-muted hover:border-line-strong")}>
                      {c === 1 ? "Guessing" : c === 2 ? "Unsure" : "Sure"}
                    </button>
                  ))}
                </div>
              )}
              <div className="mt-6 flex items-center justify-between gap-2 border-t border-line pt-4">
                <Button onClick={() => goto(pos - 1)} disabled={pos === 1}><ChevronLeft size={15} />Previous</Button>
                <span className="hidden text-[12px] text-faint sm:inline"><span className="kbd">←</span> <span className="kbd">→</span> move · <span className="kbd">A</span>–<span className="kbd">E</span> answer · <span className="kbd">F</span> flag</span>
                {pos < qs.length ? <Button variant="primary" onClick={() => goto(pos + 1)}>Next<ChevronRight size={15} /></Button>
                  : <Button variant="primary" onClick={() => { flushTime(); setReviewing(true); }}>Review &amp; submit</Button>}
              </div>
            </section>
          )}
        </div>
        <aside className="panel h-fit p-4 lg:sticky lg:top-32" aria-label="Question navigator">{nav}</aside>
      </div>
    </div>
  );
}
