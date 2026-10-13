"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { clsx } from "clsx";
import { toast } from "sonner";
import { Play, Timer, ArrowRight, Check, X, RotateCcw, Shuffle, Square } from "lucide-react";
import type { PublicQuestion } from "@/server/services/questions";
import { QuestionCard, type AnswerOutcome } from "../QuestionCard";
import { Bar, Button, Chip } from "../ui";
import { StartExamButton } from "../StartExamButton";
import { api } from "../rewards";
import { scrollToTop } from "@/components/motion";

type Source = "smart" | "unseen" | "missed" | "bookmarked" | "all";
const DIFFS = [["foundation", "Foundation"], ["intermediate", "Intermediate"], ["advanced", "Advanced"], ["expert", "Expert / trap"]] as const;
const SOURCES: { id: Source; label: string; hint: string }[] = [
  { id: "smart", label: "Smart mix", hint: "Unseen first, then open mistakes, then your weakest" },
  { id: "unseen", label: "Unseen only", hint: "Fresh questions — the best evidence of mastery" },
  { id: "missed", label: "My mistakes", hint: "Questions with an open Mistake Journal entry" },
  { id: "bookmarked", label: "Bookmarked", hint: "Questions you saved" },
  { id: "all", label: "Anything", hint: "Random across the filters" },
];

interface Props {
  domains: { id: string; short: string }[];
  objectives: { id: string; domainId: string; title: string }[];
  formats: { id: string; label: string; n: number }[];
  counts: { missed: number; bookmarked: number; unseen: number };
  initial: { domains: string[]; source: Source; autostart: boolean; questionId: string | null };
  askConfidence: boolean;
  defaultDifficulty: string;
}

function Toggle({ on, onClick, children, title }: { on: boolean; onClick: () => void; children: React.ReactNode; title?: string }) {
  return (
    <button type="button" aria-pressed={on} onClick={onClick} title={title}
      className={clsx("h-8 rounded-full border px-3 text-[13px] transition-colors", on ? "border-ion bg-ion-soft text-ink" : "border-line text-muted hover:border-line-strong hover:text-ink")}>{children}</button>
  );
}

export function PracticeArena({ domains, objectives, formats, counts, initial, askConfidence, defaultDifficulty }: Props) {
  const router = useRouter();
  const [sel, setSel] = useState({
    domains: initial.domains, objectives: [] as string[],
    difficulties: DIFFS.some(([d]) => d === defaultDifficulty) ? [defaultDifficulty] : ([] as string[]),
    formats: [] as string[], source: initial.source, count: 10, interleave: true,
  });
  const [phase, setPhase] = useState<"setup" | "running" | "done">("setup");
  const [busy, setBusy] = useState(false);
  const [session, setSession] = useState<{ id: number | null; questions: PublicQuestion[] }>({ id: null, questions: [] });
  const [idx, setIdx] = useState(0);
  const [outcomes, setOutcomes] = useState<Record<string, AnswerOutcome>>({});
  const autostarted = useRef(false);

  const toggle = (k: "domains" | "objectives" | "difficulties" | "formats", v: string) =>
    setSel((s) => ({ ...s, [k]: s[k].includes(v) ? s[k].filter((x) => x !== v) : [...s[k], v] }));
  const visibleObjectives = useMemo(() => objectives.filter((o) => !sel.domains.length || sel.domains.includes(o.domainId)), [objectives, sel.domains]);
  const filter = { domains: sel.domains, objectives: sel.objectives.filter((o) => visibleObjectives.some((v) => v.id === o)), difficulties: sel.difficulties, formats: sel.formats, source: sel.source, count: sel.count, interleave: sel.interleave };

  const start = useCallback(async (f = filter) => {
    setBusy(true);
    try {
      const r = await api<{ sessionId: number; questions: PublicQuestion[] }>("/api/practice", { json: f });
      if (!r.questions.length) {
        toast("No questions match these filters", { description: f.source === "unseen" ? "You have seen every question in this selection — try Smart mix." : "Loosen a filter and try again." });
        setBusy(false);
        return;
      }
      setSession({ id: r.sessionId, questions: r.questions });
      setIdx(0); setOutcomes({}); setPhase("running");
      window.scrollTo({ top: 0 });
    } catch (e) { toast.error((e as Error).message); }
    setBusy(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(filter)]);

  useEffect(() => {
    if (autostarted.current) return;
    autostarted.current = true;
    if (initial.questionId) {
      api<PublicQuestion>(`/api/questions/${encodeURIComponent(initial.questionId)}`)
        .then((q) => { setSession({ id: null, questions: [q] }); setPhase("running"); })
        .catch((e) => toast.error((e as Error).message));
    } else if (initial.autostart) start();
  }, [initial, start]);

  const current = session.questions[idx];
  const answered = current ? Boolean(outcomes[current.id]) : false;
  const next = useCallback(() => {
    if (idx + 1 >= session.questions.length) setPhase("done");
    else { setIdx((i) => i + 1); scrollToTop(); }
  }, [idx, session.questions.length]);

  useEffect(() => {
    if (phase !== "running") return;
    const onKey = (e: KeyboardEvent) => {
      if (/input|textarea/i.test((e.target as HTMLElement).tagName)) return;
      if ((e.key === "n" || e.key === "N" || e.key === "ArrowRight") && answered) { e.preventDefault(); next(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, answered, next]);

  const followUp = async (id: string) => {
    if (session.questions.some((q) => q.id === id)) { toast("That follow-up is already in this session"); return; }
    try {
      const q = await api<PublicQuestion>(`/api/questions/${encodeURIComponent(id)}`);
      setSession((s) => ({ ...s, questions: [...s.questions.slice(0, idx + 1), q, ...s.questions.slice(idx + 1)] }));
      setIdx((i) => i + 1);
      scrollToTop();
    } catch (e) { toast.error((e as Error).message); }
  };

  if (phase === "running" && current) {
    const done = Object.keys(outcomes).length;
    return (
      <div className="mx-auto max-w-[860px]">
        <div className="mb-4 flex items-center gap-3">
          <span className="tabular shrink-0 text-[13.5px] text-muted">Question {idx + 1} of {session.questions.length}</span>
          <Bar value={done / session.questions.length} label="Session progress" />
          <Button size="sm" variant="ghost" onClick={() => setPhase("done")}><Square size={13} />End session</Button>
        </div>
        <QuestionCard key={current.id} question={current} mode="practice" sessionId={session.id} askConfidence={askConfidence}
          onAnswered={(o) => setOutcomes((s) => ({ ...s, [current.id]: o }))} onFollowUp={followUp} />
        <div className="mt-4 flex items-center justify-end gap-3">
          {answered && <span className="hidden text-[12.5px] text-faint sm:inline">Press <span className="kbd">N</span> for next</span>}
          <Button variant={answered ? "primary" : "ghost"} onClick={next}>{idx + 1 >= session.questions.length ? "Finish session" : answered ? "Next question" : "Skip"}<ArrowRight size={15} /></Button>
        </div>
      </div>
    );
  }

  if (phase === "done") {
    const answeredQs = session.questions.filter((q) => outcomes[q.id]);
    const correct = answeredQs.filter((q) => outcomes[q.id].correct).length;
    const xp = Object.values(outcomes).reduce((s, o) => s + o.xpAwarded, 0);
    const fresh = answeredQs.filter((q) => !outcomes[q.id].seenBefore);
    const freshCorrect = fresh.filter((q) => outcomes[q.id].correct).length;
    const missed = answeredQs.filter((q) => !outcomes[q.id].correct);
    const missedObjectives = [...new Map(missed.map((q) => [q.objectiveId, q])).values()];
    return (
      <div className="mx-auto max-w-[860px] space-y-6">
        <section className="panel p-6" aria-labelledby="sum-h">
          <h2 id="sum-h" className="text-[20px] font-semibold text-ink">Session complete</h2>
          <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div><div className="text-[13px] text-muted">Correct</div><div className="tabular text-[22px] font-semibold text-ink">{correct}/{answeredQs.length}</div></div>
            <div><div className="text-[13px] text-muted">First-time accuracy</div><div className="tabular text-[22px] font-semibold text-signal">{fresh.length ? `${Math.round((freshCorrect / fresh.length) * 100)}%` : "—"}</div><div className="text-[12px] text-faint">{fresh.length} unseen</div></div>
            <div><div className="text-[13px] text-muted">XP earned</div><div className="tabular text-[22px] font-semibold text-arc">+{xp}</div></div>
            <div><div className="text-[13px] text-muted">Skipped</div><div className="tabular text-[22px] font-semibold text-ink">{session.questions.length - answeredQs.length}</div></div>
          </div>
          {missedObjectives.length > 0 ? (
            <div className="mt-5 border-t border-line pt-4">
              <div className="text-[13.5px] font-medium text-ink">Recommended next</div>
              <ul className="mt-2 space-y-1.5 text-[13.5px] text-muted">
                {missedObjectives.map((q) => (
                  <li key={q.objectiveId}>Missed <span className="text-ink">{q.objectiveId}</span>{q.lessonId ? <> — revisit <Link href={`/lessons/${q.lessonId}`} className="text-ion-strong hover:underline">{q.lessonTitle}</Link></> : null}. It is scheduled for review in 10 minutes and again tomorrow.</li>
                ))}
              </ul>
            </div>
          ) : answeredQs.length > 0 && <p className="mt-5 border-t border-line pt-4 text-[13.5px] text-muted">Clean session. These questions come back in spaced review at growing intervals — recall then is what proves mastery.</p>}
          <div className="mt-5 flex flex-wrap gap-2">
            <Button variant="primary" onClick={() => start()} disabled={busy}><Shuffle size={15} />Another session</Button>
            {missed.length > 0 && <Button onClick={() => start({ ...filter, source: "missed", count: Math.max(5, missed.length) })} disabled={busy}><RotateCcw size={15} />Practise my open mistakes</Button>}
            <Button variant="ghost" onClick={() => setPhase("setup")}>Change filters</Button>
            <Button variant="ghost" onClick={() => router.push("/")}>Command Center</Button>
          </div>
        </section>
        {answeredQs.length > 0 && (
          <ul className="panel divide-y divide-line">
            {answeredQs.map((q) => (
              <li key={q.id} className="flex items-center gap-3 px-4 py-2.5 text-[13.5px]">
                {outcomes[q.id].correct ? <Check size={16} className="text-signal" aria-label="Correct" /> : <X size={16} className="text-rose" aria-label="Incorrect" />}
                <span className="min-w-0 flex-1 truncate text-muted">{q.promptMd.replace(/[`*]/g, "")}</span>
                <Chip>{q.objectiveId}</Chip>
                {outcomes[q.id].xpAwarded > 0 && <span className="tabular text-arc">+{outcomes[q.id].xpAwarded}</span>}
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  const sourceCount = (s: Source) => (s === "missed" ? counts.missed : s === "bookmarked" ? counts.bookmarked : s === "unseen" ? counts.unseen : null);
  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
      <section className="panel space-y-6 p-5 md:p-6" aria-label="Session filters">
        <div>
          <div className="mb-2 text-[13.5px] font-medium text-ink">Question source</div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {SOURCES.map((s) => {
              const n = sourceCount(s.id);
              return (
                <button key={s.id} type="button" aria-pressed={sel.source === s.id} onClick={() => setSel((x) => ({ ...x, source: s.id }))}
                  className={clsx("rounded-[10px] border p-3 text-left transition-colors", sel.source === s.id ? "border-ion bg-ion-soft" : "border-line bg-sunken hover:border-line-strong")}>
                  <div className="flex items-center justify-between text-[14px] font-medium text-ink">{s.label}{n != null && <span className="tabular text-[12px] font-normal text-faint">{n}</span>}</div>
                  <div className="mt-0.5 text-[12.5px] text-muted">{s.hint}</div>
                </button>
              );
            })}
          </div>
        </div>
        <div>
          <div className="mb-2 flex items-baseline justify-between"><span className="text-[13.5px] font-medium text-ink">Domains</span><span className="text-[12px] text-faint">{sel.domains.length ? `${sel.domains.length} selected` : "all"}</span></div>
          <div className="flex flex-wrap gap-2">{domains.map((d) => <Toggle key={d.id} on={sel.domains.includes(d.id)} onClick={() => toggle("domains", d.id)}>{d.id} · {d.short}</Toggle>)}</div>
        </div>
        <div>
          <div className="mb-2 flex items-baseline justify-between"><span className="text-[13.5px] font-medium text-ink">Objectives</span><span className="text-[12px] text-faint">{sel.objectives.length ? `${sel.objectives.length} selected` : "all"}</span></div>
          <div className="flex flex-wrap gap-2">{visibleObjectives.map((o) => <Toggle key={o.id} on={sel.objectives.includes(o.id)} onClick={() => toggle("objectives", o.id)} title={o.title}>{o.id}</Toggle>)}</div>
        </div>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <div>
            <div className="mb-2 text-[13.5px] font-medium text-ink">Difficulty</div>
            <div className="flex flex-wrap gap-2">{DIFFS.map(([d, l]) => <Toggle key={d} on={sel.difficulties.includes(d)} onClick={() => toggle("difficulties", d)}>{l}</Toggle>)}</div>
          </div>
          <div>
            <div className="mb-2 text-[13.5px] font-medium text-ink">Session</div>
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-[13.5px] text-muted">Questions
                <select value={sel.count} onChange={(e) => setSel((s) => ({ ...s, count: Number(e.target.value) }))} className="h-8 rounded-[8px] border border-line bg-sunken px-2 text-ink">
                  {[5, 10, 15, 20, 30, 40].map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </label>
              <label className="flex items-center gap-2 text-[13.5px] text-muted"><input type="checkbox" checked={sel.interleave} onChange={(e) => setSel((s) => ({ ...s, interleave: e.target.checked }))} className="accent-[var(--ion)]" />Interleave objectives</label>
            </div>
          </div>
        </div>
        <div>
          <div className="mb-2 text-[13.5px] font-medium text-ink">Question format</div>
          <div className="flex flex-wrap gap-2">{formats.map((f) => <Toggle key={f.id} on={sel.formats.includes(f.id)} onClick={() => toggle("formats", f.id)}>{f.label} <span className="text-faint">{f.n}</span></Toggle>)}</div>
        </div>
      </section>
      <aside className="space-y-4">
        <div className="panel p-5">
          <div className="text-[15px] font-semibold text-ink">Learning mode</div>
          <p className="mt-1 text-[13.5px] text-muted">Untimed. Instant explanations for every option, hints (at half XP) and a follow-up question on the same concept.</p>
          <Button variant="primary" size="lg" className="mt-4 w-full" onClick={() => start()} disabled={busy}><Play size={16} />{busy ? "Preparing…" : `Start ${sel.count} questions`}</Button>
        </div>
        <div className="panel p-5">
          <div className="flex items-center gap-2 text-[15px] font-semibold text-ink"><Timer size={16} className="text-amber" />Timed challenge</div>
          <p className="mt-1 text-[13.5px] text-muted">Same filters, exam conditions: a clock, no hints, no feedback until you submit. Uses exam-format questions only.</p>
          <StartExamButton className="mt-4 w-full" config={{ kind: "custom", filter: { ...filter, source: filter.source }, title: `Timed challenge · ${sel.count} questions` }}
            confirm="The timer starts as soon as the challenge opens. Ready?"><Timer size={16} />Start timed challenge</StartExamButton>
        </div>
        <p className="px-1 text-[12.5px] text-faint">Keyboard: <span className="kbd">A</span>–<span className="kbd">D</span> choose · <span className="kbd">Enter</span> check · <span className="kbd">H</span> hint · <span className="kbd">N</span> next</p>
      </aside>
    </div>
  );
}
