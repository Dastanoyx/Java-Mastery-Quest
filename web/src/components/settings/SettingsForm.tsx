"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { clsx } from "clsx";
import { toast } from "sonner";
import { Download, RotateCcw, Save } from "lucide-react";
import type { Learner } from "@/server/services/learner";
import { Button } from "../ui";
import { api } from "../rewards";

const DAYS = [[1, "Mon"], [2, "Tue"], [3, "Wed"], [4, "Thu"], [5, "Fri"], [6, "Sat"], [7, "Sun"]] as const;
const field = "h-9 rounded-[8px] border border-line bg-sunken px-2.5 text-[14px] text-ink outline-none focus:border-ion";

function Row({ label, hint, children, htmlFor }: { label: string; hint?: string; children: React.ReactNode; htmlFor?: string }) {
  return (
    <div className="grid grid-cols-1 gap-2 border-t border-line py-4 first:border-t-0 first:pt-0 md:grid-cols-[240px_minmax(0,1fr)] md:gap-6">
      <div><label htmlFor={htmlFor} className="text-[14px] font-medium text-ink">{label}</label>{hint && <p className="mt-0.5 text-[12.5px] text-faint">{hint}</p>}</div>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

export function SettingsForm({ learner, domains, resetPhrase }: { learner: Learner; domains: { id: string; short: string }[]; resetPhrase: string }) {
  const router = useRouter();
  const [s, setS] = useState({ ...learner });
  const [busy, setBusy] = useState(false);
  const [phrase, setPhrase] = useState("");
  const [includeProfile, setIncludeProfile] = useState(false);
  const dirty = JSON.stringify(s) !== JSON.stringify(learner);

  const save = async (patch?: Partial<Learner>) => {
    setBusy(true);
    const body = patch ?? {
      displayName: s.displayName, dailyMinutes: s.dailyMinutes, studyDays: s.studyDays, targetExamDate: s.targetExamDate || null,
      modePreference: s.modePreference, difficultyPreference: s.difficultyPreference, reviewBatchSize: s.reviewBatchSize, askConfidence: s.askConfidence,
      timezone: s.timezone, remindersEnabled: s.remindersEnabled, reminderTime: s.reminderTime || null, weakDomains: s.weakDomains, strongDomains: s.strongDomains,
    };
    try { await api("/api/settings", { method: "PATCH", json: body }); toast("Settings saved", { duration: 1200 }); router.refresh(); }
    catch (e) { toast.error((e as Error).message); }
    setBusy(false);
  };
  const setTheme = (theme: Learner["theme"]) => { setS((x) => ({ ...x, theme })); document.documentElement.dataset.theme = theme; save({ theme }); };
  const setMotion = (reducedMotion: boolean) => {
    setS((x) => ({ ...x, reducedMotion }));
    if (reducedMotion) document.documentElement.dataset.motion = "reduced"; else delete document.documentElement.dataset.motion;
    save({ reducedMotion });
  };
  const toggleDomain = (k: "weakDomains" | "strongDomains", id: string) => setS((x) => ({ ...x, [k]: x[k].includes(id) ? x[k].filter((d) => d !== id) : [...x[k], id] }));
  const reset = async () => {
    setBusy(true);
    try { await api("/api/reset", { json: { phrase, includeProfile } }); toast("Progress reset"); setPhrase(""); router.push("/"); router.refresh(); }
    catch (e) { toast.error((e as Error).message); }
    setBusy(false);
  };

  return (
    <div className="space-y-6">
      <section className="panel p-5 md:p-6" aria-labelledby="study-h">
        <h2 id="study-h" className="mb-4 text-[16px] font-semibold text-ink">Study plan</h2>
        <Row label="Name" htmlFor="name"><input id="name" className={clsx(field, "w-60")} value={s.displayName} onChange={(e) => setS({ ...s, displayName: e.target.value })} maxLength={60} /></Row>
        <Row label="Daily study target" hint="The Command Center plans a session of this length." htmlFor="mins">
          <input id="mins" type="range" min={15} max={180} step={15} value={s.dailyMinutes} onChange={(e) => setS({ ...s, dailyMinutes: Number(e.target.value) })} className="w-56 accent-[var(--ion)]" />
          <span className="tabular w-20 text-[14px] text-ink">{s.dailyMinutes} min</span>
        </Row>
        <Row label="Study days">
          {DAYS.map(([d, l]) => (
            <button key={d} type="button" aria-pressed={s.studyDays.includes(d)} onClick={() => setS({ ...s, studyDays: s.studyDays.includes(d) ? s.studyDays.filter((x) => x !== d) : [...s.studyDays, d].sort() })}
              className={clsx("h-8 w-12 rounded-full border text-[13px]", s.studyDays.includes(d) ? "border-ion bg-ion-soft text-ink" : "border-line text-muted")}>{l}</button>
          ))}
        </Row>
        <Row label="Target exam date" hint="Optional. Used to pace the plan." htmlFor="exam-date">
          <input id="exam-date" type="date" className={field} value={s.targetExamDate ?? ""} onChange={(e) => setS({ ...s, targetExamDate: e.target.value || null })} />
          {s.targetExamDate && <Button size="sm" variant="ghost" onClick={() => setS({ ...s, targetExamDate: null })}>Clear</Button>}
        </Row>
        <Row label="Learning style" hint="Shifts the daily plan toward lessons or toward exam-style practice.">
          {(["learning", "balanced", "exam"] as const).map((m) => (
            <button key={m} type="button" aria-pressed={s.modePreference === m} onClick={() => setS({ ...s, modePreference: m })}
              className={clsx("h-8 rounded-full border px-3 text-[13px]", s.modePreference === m ? "border-ion bg-ion-soft text-ink" : "border-line text-muted")}>{m === "learning" ? "Learn first" : m === "balanced" ? "Balanced" : "Exam focus"}</button>
          ))}
        </Row>
        <Row label="Practice difficulty" hint="Pre-selects the difficulty filter in the Practice Arena. Adaptive = no filter; the smart mix favours your weak spots." htmlFor="diff">
          <select id="diff" className={field} value={s.difficultyPreference} onChange={(e) => setS({ ...s, difficultyPreference: e.target.value })}>
            {["adaptive", "foundation", "intermediate", "advanced", "expert"].map((d) => <option key={d} value={d}>{d[0].toUpperCase() + d.slice(1)}</option>)}
          </select>
        </Row>
        <Row label="Review session size" htmlFor="batch">
          <input id="batch" type="number" min={5} max={100} className={clsx(field, "w-24")} value={s.reviewBatchSize} onChange={(e) => setS({ ...s, reviewBatchSize: Math.max(5, Math.min(100, Number(e.target.value) || 5)) })} />
          <span className="text-[13px] text-muted">items per review session</span>
        </Row>
        <Row label="Ask how sure I am" hint="Optional confidence buttons. Confident mistakes get extra review; calibration appears in results.">
          <label className="flex items-center gap-2 text-[14px] text-muted"><input type="checkbox" checked={s.askConfidence} onChange={(e) => setS({ ...s, askConfidence: e.target.checked })} className="accent-[var(--ion)]" />Show confidence buttons</label>
        </Row>
        <Row label="Weak and strong domains" hint="Weak domains are scheduled first.">
          <div className="w-full space-y-2">
            {(["weakDomains", "strongDomains"] as const).map((k) => (
              <div key={k} className="flex flex-wrap items-center gap-1.5"><span className="w-14 text-[12.5px] text-faint">{k === "weakDomains" ? "Weak" : "Strong"}</span>
                {domains.map((d) => <button key={d.id} type="button" title={d.short} aria-pressed={s[k].includes(d.id)} onClick={() => toggleDomain(k, d.id)}
                  className={clsx("h-7 rounded-full border px-2.5 text-[12.5px]", s[k].includes(d.id) ? (k === "weakDomains" ? "border-amber bg-amber-soft text-ink" : "border-signal bg-signal-soft text-ink") : "border-line text-muted")}>{d.id}</button>)}
              </div>
            ))}
          </div>
        </Row>
        <Row label="Time zone" hint="Decides when a study day starts and ends." htmlFor="tz">
          <input id="tz" className={clsx(field, "w-60")} value={s.timezone} onChange={(e) => setS({ ...s, timezone: e.target.value })} />
          <Button size="sm" variant="ghost" onClick={() => setS({ ...s, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone })}>Use this device&apos;s</Button>
        </Row>
        <Row label="Study reminder" hint="Shown in the Command Center once your reminder time has passed and you haven't studied that day. The app sends no emails or system notifications.">
          <label className="flex items-center gap-2 text-[14px] text-muted"><input type="checkbox" checked={s.remindersEnabled} onChange={(e) => setS({ ...s, remindersEnabled: e.target.checked })} className="accent-[var(--ion)]" />Remind me at</label>
          <input type="time" aria-label="Reminder time" className={field} disabled={!s.remindersEnabled} value={s.reminderTime ?? "19:00"} onChange={(e) => setS({ ...s, reminderTime: e.target.value })} />
        </Row>
        <div className="mt-4 flex justify-end gap-2 border-t border-line pt-4">
          <Button variant="ghost" disabled={!dirty || busy} onClick={() => setS({ ...learner })}>Discard</Button>
          <Button variant="primary" disabled={!dirty || busy} onClick={() => save()}><Save size={15} />Save changes</Button>
        </div>
      </section>

      <section className="panel p-5 md:p-6" aria-labelledby="look-h">
        <h2 id="look-h" className="mb-4 text-[16px] font-semibold text-ink">Appearance</h2>
        <Row label="Theme">
          {(["dark", "light", "system"] as const).map((t) => (
            <button key={t} type="button" aria-pressed={s.theme === t} onClick={() => setTheme(t)}
              className={clsx("h-8 rounded-full border px-3 text-[13px]", s.theme === t ? "border-ion bg-ion-soft text-ink" : "border-line text-muted")}>{t[0].toUpperCase() + t.slice(1)}</button>
          ))}
        </Row>
        <Row label="Reduce motion" hint="Also follows your operating-system setting automatically.">
          <label className="flex items-center gap-2 text-[14px] text-muted"><input type="checkbox" checked={s.reducedMotion} onChange={(e) => setMotion(e.target.checked)} className="accent-[var(--ion)]" />Turn off animations</label>
        </Row>
      </section>

      <section className="panel p-5 md:p-6" aria-labelledby="data-h">
        <h2 id="data-h" className="mb-4 text-[16px] font-semibold text-ink">Your data</h2>
        <Row label="Export" hint="Everything you produced — answers, reviews, mistakes, notes, exams, XP — as JSON.">
          <a href="/api/export" className="inline-flex h-9 items-center gap-2 rounded-[8px] border border-line bg-raised px-4 text-sm text-ink hover:border-line-strong"><Download size={15} />Download export</a>
        </Row>
        <Row label="Back up & restore" hint="Full database backups are made from the command line.">
          <pre className="relative well w-full overflow-x-auto p-3 font-mono text-[12.5px] leading-6 text-muted">{`./scripts/backup.sh                 # → backups/jmq-YYYYmmdd-HHMMSS.dump
./scripts/restore.sh backups/<file> # asks for confirmation, keeps a safety backup`}</pre>
        </Row>
        <Row label="Reset progress" hint="Deletes all learning history: answers, reviews, mistakes, notes, bookmarks, exams, XP and achievements. Lessons and questions are kept.">
          <div className="w-full space-y-2">
            <label htmlFor="phrase" className="text-[13px] text-muted">Type <span className="font-mono text-ink">{resetPhrase}</span> to confirm</label>
            <div className="flex flex-wrap items-center gap-2">
              <input id="phrase" className={clsx(field, "w-64 font-mono")} value={phrase} onChange={(e) => setPhrase(e.target.value)} autoComplete="off" />
              <label className="flex items-center gap-2 text-[13px] text-muted"><input type="checkbox" checked={includeProfile} onChange={(e) => setIncludeProfile(e.target.checked)} className="accent-[var(--rose)]" />Also reset preferences</label>
              <Button variant="danger" disabled={phrase !== resetPhrase || busy} onClick={reset}><RotateCcw size={15} />Reset everything</Button>
            </div>
            <p className="text-[12.5px] text-faint">This cannot be undone from the app. Download an export or run a backup first.</p>
          </div>
        </Row>
      </section>
    </div>
  );
}
