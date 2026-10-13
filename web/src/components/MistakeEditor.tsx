"use client";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "./ui";
import { api } from "./rewards";

export function MistakeEditor({ questionId, category, categorySource, note, categories }: {
  questionId: string; category: string | null; categorySource: string; note: string | null; categories: Record<string, string>;
}) {
  const [cat, setCat] = useState(category ?? "");
  const [text, setText] = useState(note ?? "");
  const [saved, setSaved] = useState(note ?? "");
  const [busy, setBusy] = useState(false);
  const patch = async (body: Record<string, unknown>) => {
    setBusy(true);
    try { await api(`/api/mistakes/${encodeURIComponent(questionId)}`, { method: "PATCH", json: body }); return true; }
    catch (e) { toast.error((e as Error).message); return false; }
    finally { setBusy(false); }
  };
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-[240px_minmax(0,1fr)]">
      <div>
        <label htmlFor={`cat-${questionId}`} className="text-[12.5px] text-muted">Why it happened {categorySource === "auto" && <span className="text-faint">(auto-classified)</span>}</label>
        <select id={`cat-${questionId}`} value={cat} disabled={busy}
          onChange={async (e) => { const v = e.target.value; setCat(v); if (await patch({ category: v })) toast("Category updated", { duration: 1200 }); }}
          className="mt-1 h-9 w-full rounded-[8px] border border-line bg-sunken px-2 text-[13.5px] text-ink">
          {!cat && <option value="">—</option>}
          {Object.entries(categories).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
      </div>
      <div>
        <label htmlFor={`note-${questionId}`} className="text-[12.5px] text-muted">In your own words: what did you believe, and what is actually true?</label>
        <textarea id={`note-${questionId}`} value={text} onChange={(e) => setText(e.target.value)} rows={3}
          className="mt-1 w-full resize-y rounded-[8px] border border-line bg-sunken p-2.5 text-[13.5px] text-ink outline-none focus:border-ion" />
        <div className="mt-1.5 flex justify-end">
          <Button size="sm" disabled={busy || text === saved} onClick={async () => { if (await patch({ personalNote: text.trim() ? text : null })) { setSaved(text); toast("Saved", { duration: 1200 }); } }}>Save explanation</Button>
        </div>
      </div>
    </div>
  );
}
