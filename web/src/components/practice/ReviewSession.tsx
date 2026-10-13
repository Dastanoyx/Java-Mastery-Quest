"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Repeat2, ArrowRight, Check, X, Sparkles, CalendarClock } from "lucide-react";
import type { PublicQuestion } from "@/server/services/questions";
import { QuestionCard, type AnswerOutcome } from "../QuestionCard";
import { Bar, Button, Chip, Empty, LinkButton } from "../ui";
import { api } from "../rewards";
import { relativeDay, weekdayDayMonth } from "../format";
import { scrollToTop } from "@/components/motion";

type Item = PublicQuestion & { variation: boolean; dueAt: string | null; lapses: number };

export function ReviewSession({ due, batchSize, askConfidence, nextDueAt, upcoming, recent }: {
  due: { due: number; overdue: number; dueTomorrow: number; scheduled: number }; batchSize: number; askConfidence: boolean;
  nextDueAt: string | null; upcoming: { day: string; n: number }[]; recent: { reviews: number; recalled: number };
}) {
  const router = useRouter();
  const [phase, setPhase] = useState<"idle" | "running" | "done">("idle");
  const [items, setItems] = useState<Item[]>([]);
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [idx, setIdx] = useState(0);
  const [outcomes, setOutcomes] = useState<Record<string, AnswerOutcome>>({});
  const [busy, setBusy] = useState(false);

  const start = async () => {
    setBusy(true);
    try {
      const r = await api<{ sessionId: number; items: Item[] }>("/api/review", { json: { limit: batchSize } });
      if (!r.items.length) { toast("Nothing is due right now"); setBusy(false); return; }
      setItems(r.items); setSessionId(r.sessionId); setIdx(0); setOutcomes({}); setPhase("running");
    } catch (e) { toast.error((e as Error).message); }
    setBusy(false);
  };
  const current = items[idx];
  const answered = current ? Boolean(outcomes[current.id]) : false;
  const next = () => { if (idx + 1 >= items.length) { setPhase("done"); router.refresh(); } else { setIdx(idx + 1); scrollToTop(); } };

  useEffect(() => {
    if (phase !== "running") return;
    const onKey = (e: KeyboardEvent) => {
      if (/input|textarea/i.test((e.target as HTMLElement).tagName)) return;
      if ((e.key === "n" || e.key === "N") && answered) { e.preventDefault(); next(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (phase === "running" && current) {
    return (
      <div className="mx-auto max-w-[860px]">
        <div className="mb-4 flex items-center gap-3">
          <span className="tabular shrink-0 text-[13.5px] text-muted">{idx + 1} / {items.length}</span>
          <Bar value={Object.keys(outcomes).length / items.length} tone="amber" label="Review progress" />
          {current.variation ? <Chip tone="arc" title="An unseen question on a concept you got wrong recently"><Sparkles size={12} />New variation</Chip>
            : current.lapses > 0 ? <Chip tone="rose">Lapsed {current.lapses}×</Chip> : <Chip tone="amber">Due</Chip>}
        </div>
        <QuestionCard key={current.id} question={current} mode="review" sessionId={sessionId} askConfidence={askConfidence}
          onAnswered={(o) => setOutcomes((s) => ({ ...s, [current.id]: o }))} />
        <div className="mt-4 flex justify-end">
          <Button variant={answered ? "primary" : "ghost"} onClick={next}>{idx + 1 >= items.length ? "Finish review" : answered ? "Next" : "Skip for now"}<ArrowRight size={15} /></Button>
        </div>
      </div>
    );
  }

  if (phase === "done") {
    const done = items.filter((i) => outcomes[i.id]);
    const ok = done.filter((i) => outcomes[i.id].correct).length;
    return (
      <div className="mx-auto max-w-[860px] space-y-4">
        <section className="panel p-6">
          <h2 className="text-[20px] font-semibold text-ink">Review done</h2>
          <p className="mt-1 text-muted">Recalled <span className="tabular font-semibold text-ink">{ok}/{done.length}</span>. Correct items moved further out; misses come back in ten minutes and tomorrow.</p>
          <ul className="mt-4 divide-y divide-line">
            {done.map((i) => (
              <li key={i.id} className="flex items-center gap-3 py-2 text-[13.5px]">
                {outcomes[i.id].correct ? <Check size={16} className="text-signal" aria-label="Recalled" /> : <X size={16} className="text-rose" aria-label="Missed" />}
                <span className="min-w-0 flex-1 truncate text-muted">{i.promptMd.replace(/[`*]/g, "")}</span>
                <span className="shrink-0 text-[12.5px] text-faint">next {relativeDay(outcomes[i.id].nextReviewAt)}</span>
              </li>
            ))}
          </ul>
          <div className="mt-5 flex flex-wrap gap-2">
            <Button variant="primary" onClick={start} disabled={busy}><Repeat2 size={15} />Review more</Button>
            <LinkButton href="/" variant="ghost">Command Center</LinkButton>
          </div>
        </section>
      </div>
    );
  }

  const maxN = Math.max(1, ...upcoming.map((u) => u.n));
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
      <section className="panel p-6" aria-labelledby="due-h">
        {due.due > 0 ? (
          <>
            <h2 id="due-h" className="text-[20px] font-semibold text-ink"><span className="tabular text-amber">{due.due}</span> item{due.due === 1 ? "" : "s"} ready for review</h2>
            {due.overdue > 0 && <p className="mt-2 text-[14px] text-muted">{due.overdue} have waited more than a day. That&apos;s normal after time away — the overdue ones come first, and they still count.</p>}
            <p className="mt-2 text-[14px] text-muted">One session reviews up to {batchSize} (change it in Settings). Expect a few unseen variations of concepts you missed recently.</p>
            <Button variant="primary" size="lg" className="mt-5" onClick={start} disabled={busy}><Repeat2 size={17} />{busy ? "Preparing…" : `Start review (${Math.min(due.due, batchSize)})`}</Button>
          </>
        ) : due.scheduled === 0 ? (
          <Empty icon={<Repeat2 size={18} />} title="Your review queue is empty"
            action={<div className="flex flex-wrap gap-2"><LinkButton href="/curriculum" variant="primary">Start a lesson</LinkButton><LinkButton href="/practice?autostart=1">Quick practice</LinkButton></div>}>
            Every question you answer enters spaced review automatically: a miss returns in ten minutes, a correct answer in a day, then at growing intervals.
          </Empty>
        ) : (
          <Empty icon={<CalendarClock size={18} />} title="All caught up"
            action={<div className="flex flex-wrap gap-2"><LinkButton href="/practice?source=unseen&autostart=1" variant="primary">Practise unseen questions</LinkButton><LinkButton href="/curriculum">Continue a lesson</LinkButton></div>}>
            Nothing is due {nextDueAt ? <>— the next item comes back <span className="text-ink">{relativeDay(nextDueAt)}</span></> : null}. Reviewing early would make the interval meaningless, so spend the time on new material.
          </Empty>
        )}
      </section>
      <aside className="panel p-5" aria-labelledby="up-h">
        <h2 id="up-h" className="text-[15px] font-semibold text-ink">Next 14 days</h2>
        {upcoming.length === 0 ? <p className="mt-2 text-[13.5px] text-muted">No reviews scheduled yet.</p> : (
          <ul className="mt-3 space-y-1.5" aria-label="Reviews due per day">
            {upcoming.map((u) => (
              <li key={u.day} className="grid grid-cols-[5.5rem_1fr_2rem] items-center gap-2 text-[12.5px]">
                <span className="text-muted">{weekdayDayMonth(u.day)}</span>
                <span className="h-2 rounded-full bg-amber/80" style={{ width: `${(u.n / maxN) * 100}%` }} />
                <span className="tabular text-right text-faint">{u.n}</span>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-5 border-t border-line pt-4 text-[13px] text-muted">
          Last 30 days: <span className="tabular text-ink">{recent.recalled}/{recent.reviews}</span> due reviews recalled
          {recent.reviews > 0 && <> (<span className="tabular">{Math.round((recent.recalled / recent.reviews) * 100)}%</span>)</>}.
          <Link href="/progress#retention" className="ml-1 text-ion-strong hover:underline">Retention details</Link>
        </div>
      </aside>
    </div>
  );
}
