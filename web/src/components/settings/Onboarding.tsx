"use client";
// Five short, skippable steps. Nothing here gates the app — every answer only tunes the daily planner.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { clsx } from "clsx";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import type { Learner } from "@/server/services/learner";
import { Button } from "../ui";
import { api } from "../rewards";

const EXPERIENCE = [
  { id: "new", label: "New to Java", hint: "I'm learning the language itself." },
  { id: "some", label: "Some Java", hint: "I can write small programs; the details are fuzzy." },
  { id: "professional", label: "Professional", hint: "I write Java at work — I want the exam-level precision." },
  { id: "expert", label: "Expert", hint: "I know Java deeply; I want to find my blind spots fast." },
] as const;
const DAYS = [[1, "Mon"], [2, "Tue"], [3, "Wed"], [4, "Thu"], [5, "Fri"], [6, "Sat"], [7, "Sun"]] as const;
const STEPS = ["Experience", "Time", "Exam date", "Strengths", "Style"];

function Choice({ on, onClick, children, className }: { on: boolean; onClick: () => void; children: React.ReactNode; className?: string }) {
  return <button type="button" aria-pressed={on} onClick={onClick} className={clsx("rounded-[10px] border p-3 text-left transition-colors", on ? "border-ion bg-ion-soft" : "border-line bg-sunken hover:border-line-strong", className)}>{children}</button>;
}

export function Onboarding({ learner, domains }: { learner: Learner; domains: { id: string; short: string; title: string }[] }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [v, setV] = useState({
    experienceLevel: learner.experienceLevel, priorCertification: learner.priorCertification ?? "", dailyMinutes: learner.dailyMinutes,
    studyDays: learner.studyDays, targetExamDate: learner.targetExamDate ?? "", strongDomains: learner.strongDomains, weakDomains: learner.weakDomains,
    modePreference: learner.modePreference,
  });
  const finish = async () => {
    setBusy(true);
    try {
      await api("/api/onboarding", { json: { ...v, priorCertification: v.priorCertification.trim() || null, targetExamDate: v.targetExamDate || null } });
      toast("Your plan is ready");
      router.push("/"); router.refresh();
    } catch (e) { toast.error((e as Error).message); setBusy(false); }
  };
  const cycle = (id: string) => setV((x) => {
    const weak = x.weakDomains.includes(id), strong = x.strongDomains.includes(id);
    if (!weak && !strong) return { ...x, weakDomains: [...x.weakDomains, id] };
    if (weak) return { ...x, weakDomains: x.weakDomains.filter((d) => d !== id), strongDomains: [...x.strongDomains, id] };
    return { ...x, strongDomains: x.strongDomains.filter((d) => d !== id) };
  });
  const weeks = v.targetExamDate ? Math.max(0, Math.round((new Date(v.targetExamDate).getTime() - Date.now()) / (7 * 86_400_000))) : null;

  return (
    <div className="mx-auto max-w-[760px] py-4">
      <div className="mb-6">
        <h1 className="text-[28px] font-semibold tracking-[-0.02em] text-ink">Welcome, {learner.displayName}.</h1>
        <p className="mt-1 text-muted">Five quick questions to shape your daily plan. Skip any of them — you can change everything later in Settings.</p>
      </div>
      <ol className="mb-5 flex gap-2" aria-label="Steps">
        {STEPS.map((s, i) => (
          <li key={s} className="flex-1">
            <button type="button" onClick={() => setStep(i)} aria-current={i === step ? "step" : undefined} className="w-full text-left">
              <span className={clsx("block h-1 rounded-full", i <= step ? "bg-ion" : "bg-raised")} />
              <span className={clsx("mt-1.5 block text-[12px]", i === step ? "text-ink" : "text-faint")}>{s}</span>
            </button>
          </li>
        ))}
      </ol>

      <section className="panel p-5 md:p-6">
        {step === 0 && (
          <div>
            <h2 className="text-[17px] font-semibold text-ink">How much Java do you already know?</h2>
            <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {EXPERIENCE.map((e) => <Choice key={e.id} on={v.experienceLevel === e.id} onClick={() => setV({ ...v, experienceLevel: e.id })}><div className="font-medium text-ink">{e.label}</div><div className="text-[13px] text-muted">{e.hint}</div></Choice>)}
            </div>
            <label htmlFor="prior" className="mt-5 block text-[13.5px] text-muted">Previous certifications (optional)</label>
            <input id="prior" value={v.priorCertification} onChange={(e) => setV({ ...v, priorCertification: e.target.value })} placeholder="e.g. OCP Java 17 (1Z0-829)" maxLength={200}
              className="mt-1.5 h-10 w-full rounded-[8px] border border-line bg-sunken px-3 text-[14px] text-ink outline-none focus:border-ion" />
          </div>
        )}
        {step === 1 && (
          <div>
            <h2 className="text-[17px] font-semibold text-ink">How much time can you give it?</h2>
            <p className="mt-1 text-[13.5px] text-muted">Thirty focused minutes beat two distracted hours. The plan scales to whatever you pick.</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {[30, 45, 60, 90, 120].map((m) => <Choice key={m} on={v.dailyMinutes === m} onClick={() => setV({ ...v, dailyMinutes: m })} className="w-24 text-center"><div className="tabular text-[18px] font-semibold text-ink">{m}</div><div className="text-[12px] text-muted">min / day</div></Choice>)}
            </div>
            <div className="mt-5 text-[13.5px] text-muted">On which days?</div>
            <div className="mt-2 flex flex-wrap gap-2">
              {DAYS.map(([d, l]) => <button key={d} type="button" aria-pressed={v.studyDays.includes(d)} onClick={() => setV({ ...v, studyDays: v.studyDays.includes(d) ? v.studyDays.filter((x) => x !== d) : [...v.studyDays, d].sort() })}
                className={clsx("h-9 w-14 rounded-full border text-[13px]", v.studyDays.includes(d) ? "border-ion bg-ion-soft text-ink" : "border-line text-muted")}>{l}</button>)}
            </div>
          </div>
        )}
        {step === 2 && (
          <div>
            <h2 className="text-[17px] font-semibold text-ink">Do you have an exam date?</h2>
            <p className="mt-1 text-[13.5px] text-muted">Optional. The app recommends booking only once the evidence says you&apos;re consistently ready — a date helps pace the plan, it doesn&apos;t change that bar.</p>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <input type="date" aria-label="Target exam date" value={v.targetExamDate} onChange={(e) => setV({ ...v, targetExamDate: e.target.value })}
                className="h-10 rounded-[8px] border border-line bg-sunken px-3 text-[14px] text-ink outline-none focus:border-ion" />
              {v.targetExamDate && <Button size="sm" variant="ghost" onClick={() => setV({ ...v, targetExamDate: "" })}>No date yet</Button>}
              {weeks != null && <span className="tabular text-[13.5px] text-muted">≈ {weeks} week{weeks === 1 ? "" : "s"} away</span>}
            </div>
          </div>
        )}
        {step === 3 && (
          <div>
            <h2 className="text-[17px] font-semibold text-ink">Where do you feel strong or weak?</h2>
            <p className="mt-1 text-[13.5px] text-muted">Tap once for <span className="text-amber">weak</span>, twice for <span className="text-signal">strong</span>, three times to clear. Your answers will soon override these guesses.</p>
            <ul className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {domains.map((d) => {
                const weak = v.weakDomains.includes(d.id), strong = v.strongDomains.includes(d.id);
                return (
                  <li key={d.id}>
                    <button type="button" onClick={() => cycle(d.id)} aria-label={`${d.short}: ${weak ? "weak" : strong ? "strong" : "not set"}`}
                      className={clsx("flex w-full items-center gap-3 rounded-[10px] border p-3 text-left", weak ? "border-amber bg-amber-soft" : strong ? "border-signal bg-signal-soft" : "border-line bg-sunken hover:border-line-strong")}>
                      <span className="w-8 text-[12.5px] font-semibold text-faint">{d.id}</span>
                      <span className="flex-1 text-[14px] text-ink">{d.short}</span>
                      <span className={clsx("text-[12px]", weak ? "text-amber" : strong ? "text-signal" : "text-faint")}>{weak ? "weak" : strong ? "strong" : "—"}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
        {step === 4 && (
          <div>
            <h2 className="text-[17px] font-semibold text-ink">How do you like to study?</h2>
            <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
              {([["learning", "Learn first", "More lesson time; exam practice once concepts are in place."], ["balanced", "Balanced", "Review, learn, practise and test every day."], ["exam", "Exam focus", "More exam-style questions and timed challenges."]] as const).map(([id, l, h]) => (
                <Choice key={id} on={v.modePreference === id} onClick={() => setV({ ...v, modePreference: id })}><div className="font-medium text-ink">{l}</div><div className="text-[13px] text-muted">{h}</div></Choice>
              ))}
            </div>
          </div>
        )}
        <div className="mt-6 flex items-center justify-between gap-2 border-t border-line pt-4">
          <Button variant="ghost" onClick={() => setStep((s) => s - 1)} disabled={step === 0}><ArrowLeft size={15} />Back</Button>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={finish} disabled={busy}>Skip the rest</Button>
            {step < STEPS.length - 1 ? <Button variant="primary" onClick={() => setStep((s) => s + 1)}>Next<ArrowRight size={15} /></Button>
              : <Button variant="primary" onClick={finish} disabled={busy}><Check size={15} />{busy ? "Saving…" : "Build my plan"}</Button>}
          </div>
        </div>
      </section>
    </div>
  );
}
