"use client";
import { useEffect, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { clsx } from "clsx";
import { toast } from "sonner";
import { Play, Send, RotateCcw, Lightbulb, Eye, CircleCheck, CircleX, Clock, AlertTriangle, LoaderCircle } from "lucide-react";
import type { ExerciseView, ExerciseRunResult } from "@/server/services/exercises";
import { Button } from "../ui";
import { Md } from "../Md";
import { api, showRewards, type Rewards } from "../rewards";

const CodeEditor = dynamic(() => import("./CodeEditor").then((m) => m.CodeEditor), {
  ssr: false,
  loading: () => <div className="grid h-[420px] place-items-center rounded-[10px] border border-line bg-code text-[13px] text-faint">Loading editor…</div>,
});

export function ExerciseWorkbench({ exercise: e, prompt }: { exercise: ExerciseView; prompt: ReactNode }) {
  const draftKey = `jmq:draft:${e.id}`;
  const [code, setCode] = useState(e.lastCode ?? e.starterCode);
  const [busy, setBusy] = useState<"run" | "submit" | null>(null);
  const [res, setRes] = useState<(ExerciseRunResult & { rewards?: Rewards | null }) | null>(null);
  const [hints, setHints] = useState(0);
  const [submitted, setSubmitted] = useState(e.submissions > 0);
  const [solution, setSolution] = useState<{ solution: string; explanationMd: string } | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  // Unsent drafts survive a reload (per-browser convenience only; submissions are stored on the server).
  useEffect(() => { try { const d = localStorage.getItem(draftKey); if (d && d !== code) setCode(d); } catch { /* storage unavailable */ } // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftKey]);
  useEffect(() => { try { localStorage.setItem(draftKey, code); } catch { /* storage unavailable */ } }, [code, draftKey]);

  const run = async (submit: boolean) => {
    setBusy(submit ? "submit" : "run");
    try {
      const r = await api<ExerciseRunResult & { rewards: Rewards | null }>(`/api/exercises/${e.id}/run`, { json: { code, submit } });
      setRes(r);
      if (submit) {
        setSubmitted(true);
        if (r.passed) toast.success(r.xp > 0 ? `All tests pass · +${r.xp} XP` : "All tests pass");
        showRewards(r.rewards);
      }
    } catch (err) { toast.error((err as Error).message); }
    setBusy(null);
  };
  const reveal = async () => {
    try { setSolution(await api<{ solution: string; explanationMd: string }>(`/api/exercises/${e.id}/solution`)); }
    catch (err) { toast.error((err as Error).message); }
  };
  const diag = res?.result.compile.diagnostics ?? [];
  const runInfo = res?.result.run;

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
      <div className="space-y-5">
        <section className="panel p-5">{prompt}</section>
        {e.hints.length > 0 && (
          <section className="panel p-5" aria-labelledby="hints-h">
            <h2 id="hints-h" className="flex items-center gap-2 text-[14px] font-semibold text-ink"><Lightbulb size={15} className="text-signal" aria-hidden />Hints <span className="text-[12px] font-normal text-faint">{hints}/{e.hints.length} shown</span></h2>
            <ol className="mt-3 space-y-2 text-[14px]">{e.hints.slice(0, hints).map((h, i) => <li key={i} className="callout callout-tip"><Md>{h}</Md></li>)}</ol>
            {hints < e.hints.length && <Button size="sm" variant="ghost" className="mt-2" onClick={() => setHints((h) => h + 1)}>Show {hints ? "next" : "a"} hint</Button>}
          </section>
        )}
        {submitted && (
          <section className="panel p-5" aria-labelledby="sol-h">
            <h2 id="sol-h" className="text-[14px] font-semibold text-ink">Reference solution</h2>
            {solution ? (
              <div className="mt-3 space-y-3">
                <pre className="code-frame code-plain max-h-[360px] overflow-auto">{solution.solution}</pre>
                <div className="text-[14px] text-ink"><Md>{solution.explanationMd}</Md></div>
              </div>
            ) : <><p className="mt-1 text-[13.5px] text-muted">Compare after you have made a real attempt — the comparison is where the learning is.</p><Button size="sm" className="mt-3" onClick={reveal}><Eye size={14} />Reveal solution</Button></>}
          </section>
        )}
      </div>

      <div className="space-y-4">
        <div className="panel overflow-hidden">
          <div className="flex items-center justify-between border-b border-line px-4 py-2 text-[13px]">
            <span className="font-mono text-muted">{e.fileName}</span>
            {confirmReset ? (
              <span className="flex items-center gap-2"><span className="text-muted">Discard your code?</span><Button size="sm" variant="danger" onClick={() => { setCode(e.starterCode); setConfirmReset(false); }}>Reset</Button><Button size="sm" variant="ghost" onClick={() => setConfirmReset(false)}>Keep</Button></span>
            ) : <Button size="sm" variant="ghost" onClick={() => setConfirmReset(true)}><RotateCcw size={14} />Starter code</Button>}
          </div>
          <CodeEditor value={code} onChange={setCode} onRun={() => run(false)} />
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-4 py-2.5">
            <span className="text-[12px] text-faint"><span className="kbd">Ctrl</span> + <span className="kbd">Enter</span> runs the tests · limit {Math.round(e.timeLimitMs / 1000)} s</span>
            <div className="flex gap-2">
              <Button onClick={() => run(false)} disabled={!!busy}>{busy === "run" ? <LoaderCircle size={15} className="animate-spin" /> : <Play size={15} />}Run tests</Button>
              <Button variant="primary" onClick={() => run(true)} disabled={!!busy}>{busy === "submit" ? <LoaderCircle size={15} className="animate-spin" /> : <Send size={15} />}Submit</Button>
            </div>
          </div>
        </div>

        {res && (
          <section className="panel p-5" aria-live="polite" aria-labelledby="res-h">
            <h2 id="res-h" className={clsx("flex items-center gap-2 text-[15px] font-semibold", res.passed ? "text-signal" : "text-rose")}>
              {res.passed ? <CircleCheck size={17} /> : <CircleX size={17} />}
              {!res.result.compile.ok ? "Does not compile" : runInfo?.timedOut ? "Timed out" : runInfo?.outOfMemory ? "Out of memory" : res.passed ? "All tests pass" : `${res.tests.filter((t) => t.passed).length}/${res.tests.length} tests pass`}
              {res.submissionId == null && <span className="text-[12px] font-normal text-faint">(practice run — not recorded)</span>}
            </h2>
            {diag.length > 0 && (
              <ul className="mt-3 space-y-1.5 font-mono text-[12.5px]">
                {diag.map((d, i) => <li key={i} className={d.kind === "ERROR" ? "text-rose" : "text-amber"}>{d.file ?? e.fileName}:{d.line}:{d.column} — {d.message}</li>)}
              </ul>
            )}
            {res.tests.length > 0 && (
              <ul className="mt-3 space-y-1.5 text-[13.5px]">
                {res.tests.map((t, i) => (
                  <li key={i} className="flex items-start gap-2">
                    {t.passed ? <CircleCheck size={15} className="mt-0.5 shrink-0 text-signal" aria-label="Passed" /> : <CircleX size={15} className="mt-0.5 shrink-0 text-rose" aria-label="Failed" />}
                    <span><span className="text-ink">{t.name}</span>{t.detail && <span className="ml-1 font-mono text-[12.5px] text-muted">{t.detail}</span>}</span>
                  </li>
                ))}
              </ul>
            )}
            {runInfo?.timedOut && <p className="mt-3 flex items-center gap-2 text-[13.5px] text-amber"><Clock size={14} />Stopped after {Math.round(runInfo.durationMs / 1000)} s — look for an infinite loop or a blocked thread.</p>}
            {runInfo?.exception && <p className="mt-3 flex items-center gap-2 text-[13.5px] text-rose"><AlertTriangle size={14} />Uncaught <span className="font-mono">{runInfo.exception.type}</span>{runInfo.exception.message ? `: ${runInfo.exception.message}` : ""}</p>}
            {(res.harnessOutput || runInfo?.stderr) && (
              <details className="mt-3" open={!res.passed}>
                <summary className="cursor-pointer text-[13px] text-muted">Program output{runInfo?.outputTruncated ? " (truncated)" : ""}</summary>
                {res.harnessOutput && <pre className="code-frame code-plain mt-2 max-h-[220px] overflow-auto">{res.harnessOutput}</pre>}
                {runInfo?.stderr && <pre className="code-frame code-plain mt-2 max-h-[220px] overflow-auto text-rose">{runInfo.stderr}</pre>}
              </details>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
