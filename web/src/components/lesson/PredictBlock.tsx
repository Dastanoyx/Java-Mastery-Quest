"use client";
// "Predict the output" — the learner commits to a prediction before the real output is revealed.
// The reveal is compared automatically (whitespace-normalised) so the feedback is objective.
import { useState } from "react";
import { clsx } from "clsx";
import { toast } from "sonner";
import { Eye, Check, X } from "lucide-react";
import { Button } from "../ui";
import { api, showRewards, type Rewards } from "../rewards";

const norm = (s: string) => s.replace(/\r/g, "").split("\n").map((l) => l.trimEnd()).join("\n").trim();

export function PredictBlock({ lessonId, index, codeHtml, output, alreadyPredicted, verified }: {
  lessonId: string; index: number; codeHtml: string; output: string; alreadyPredicted: boolean; verified: boolean;
}) {
  const [prediction, setPrediction] = useState("");
  const [revealed, setRevealed] = useState(false);
  const [busy, setBusy] = useState(false);
  const match = revealed && prediction.trim() ? norm(prediction) === norm(output) : null;

  const reveal = async () => {
    if (prediction.trim()) {
      setBusy(true);
      try {
        const r = await api<{ xp: number; rewards: Rewards | null }>(`/api/lessons/${lessonId}/events`, { json: { kind: "prediction", ref: String(index), payload: { prediction: prediction.slice(0, 5000) } } });
        if (r.xp > 0) toast(`+${r.xp} XP`, { description: "Prediction written before the reveal", duration: 1500 });
        showRewards(r.rewards);
      } catch (e) { toast.error((e as Error).message); }
      setBusy(false);
    }
    setRevealed(true);
  };

  return (
    <figure className="not-prose my-6 overflow-hidden rounded-[12px] border border-line bg-surface" data-predict={index}>
      <figcaption className="flex items-center justify-between gap-2 border-b border-line px-4 py-2 text-[13px]">
        <span className="flex items-center gap-2 font-medium text-ink"><Eye size={15} className="text-ion-strong" aria-hidden />Predict the output</span>
        <span className="text-faint">{verified ? "Output produced by JDK 25" : "Output from the lesson author"}{alreadyPredicted && " · you predicted this before"}</span>
      </figcaption>
      <div className="code-frame rounded-none border-0" dangerouslySetInnerHTML={{ __html: codeHtml }} />
      <div className="grid grid-cols-1 gap-3 border-t border-line p-4 md:grid-cols-2">
        <div>
          <label htmlFor={`pred-${index}`} className="text-[12.5px] text-muted">Your prediction (exact output, or what goes wrong)</label>
          <textarea id={`pred-${index}`} value={prediction} onChange={(e) => setPrediction(e.target.value)} readOnly={revealed} rows={4} spellCheck={false}
            placeholder={'e.g.\nA\nB\n— or —\ndoes not compile: …'}
            className="mt-1 w-full resize-y rounded-[8px] border border-line bg-sunken p-2.5 font-mono text-[13px] leading-6 text-ink outline-none focus:border-ion read-only:opacity-80" />
        </div>
        <div>
          <div className="text-[12.5px] text-muted">Actual output</div>
          {revealed ? (
            <pre className={clsx("mt-1 min-h-[106px] overflow-x-auto whitespace-pre rounded-[8px] border p-2.5 font-mono text-[13px] leading-6",
              match === true ? "border-signal bg-signal-soft text-ink" : match === false ? "border-rose/60 bg-sunken text-ink" : "border-line bg-sunken text-ink")}>{output}</pre>
          ) : (
            <div className="mt-1 grid min-h-[106px] place-items-center rounded-[8px] border border-dashed border-line-strong bg-sunken p-3 text-center text-[13px] text-faint">
              Hidden until you commit to a prediction
            </div>
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-4 py-2.5">
        <div className="text-[13px]" aria-live="polite">
          {match === true && <span className="flex items-center gap-1.5 text-signal"><Check size={15} />Exact match.</span>}
          {match === false && <span className="flex items-center gap-1.5 text-rose"><X size={15} />Not the same — find the line where your model and the JVM disagree.</span>}
          {revealed && match === null && <span className="text-muted">Revealed without a prediction — no XP, and try predicting the next one.</span>}
        </div>
        {!revealed && (
          <div className="flex gap-2">
            {!prediction.trim() && <Button size="sm" variant="ghost" onClick={reveal}>Reveal without predicting</Button>}
            <Button size="sm" variant="primary" onClick={reveal} disabled={!prediction.trim() || busy}>{busy ? "Saving…" : "Commit & reveal"}</Button>
          </div>
        )}
      </div>
    </figure>
  );
}
