"use client";
// Small interactive islands of the lesson player: progress tracking, resume, bookmark, reflection and notes.
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Bookmark, BookmarkCheck, CornerDownRight, Save } from "lucide-react";
import { Button } from "../ui";
import { Md } from "../Md";
import { api } from "../rewards";
import { scrollIntoViewRespectingMotion } from "@/components/motion";

/** Records "opened" once and the section currently being read (debounced), so the lesson can be resumed. */
export function LessonTracker({ lessonId, lastSection }: { lessonId: string; lastSection: string | null }) {
  const [resume, setResume] = useState<string | null>(null);
  const sent = useRef<string | null>(lastSection);
  useEffect(() => {
    api(`/api/lessons/${lessonId}/events`, { json: { kind: "opened" } }).catch(() => {});
    if (lastSection && document.getElementById(lastSection) && window.scrollY < 200 && !window.location.hash) setResume(lastSection);
    const heads = Array.from(document.querySelectorAll<HTMLElement>(".prose-lesson h2[id]"));
    let timer: ReturnType<typeof setTimeout> | null = null;
    const io = new IntersectionObserver((entries) => {
      const visible = entries.filter((e) => e.isIntersecting).map((e) => e.target.id);
      if (!visible.length) return;
      const id = visible[0];
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        if (sent.current === id) return;
        sent.current = id;
        api(`/api/lessons/${lessonId}/events`, { json: { kind: "section", ref: id } }).catch(() => {});
      }, 1500);
    }, { rootMargin: "0px 0px -70% 0px" });
    heads.forEach((h) => io.observe(h));
    return () => { io.disconnect(); if (timer) clearTimeout(timer); };
  }, [lessonId, lastSection]);
  if (!resume) return null;
  const title = document.getElementById(resume)?.textContent ?? "where you left off";
  return (
    <div className="panel mb-6 flex flex-wrap items-center justify-between gap-3 border-ion/40 px-4 py-3 text-[14px]">
      <span className="text-muted">You were reading <span className="text-ink">{title}</span>.</span>
      <div className="flex gap-2">
        <Button size="sm" variant="ghost" onClick={() => setResume(null)}>Start from the top</Button>
        <Button size="sm" variant="primary" onClick={() => { scrollIntoViewRespectingMotion(document.getElementById(resume)); setResume(null); }}>
          <CornerDownRight size={14} />Resume
        </Button>
      </div>
    </div>
  );
}

export function BookmarkButton({ targetType, targetId, initial }: { targetType: "lesson" | "question" | "exercise"; targetId: string; initial: boolean }) {
  const [on, setOn] = useState(initial);
  const toggle = async () => {
    try {
      const r = await api<{ bookmarked: boolean }>("/api/bookmarks", { json: { targetType, targetId } });
      setOn(r.bookmarked);
      toast(r.bookmarked ? "Saved to your Knowledge Vault" : "Bookmark removed", { duration: 1500 });
    } catch (e) { toast.error((e as Error).message); }
  };
  return (
    <Button size="sm" variant="ghost" onClick={toggle} aria-pressed={on}>
      {on ? <BookmarkCheck size={15} className="text-ion-strong" /> : <Bookmark size={15} />}{on ? "Bookmarked" : "Bookmark"}
    </Button>
  );
}

/** Retrieval practice (Part I): recall without looking, in your own words. Autosaves. */
export function ReflectionBox({ lessonId, initial, prompts }: { lessonId: string; initial: string | null; prompts: string[] }) {
  const [text, setText] = useState(initial ?? "");
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">(initial ? "saved" : "idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const save = async (value: string) => {
    setState("saving");
    try { await api(`/api/lessons/${lessonId}/reflection`, { method: "PUT", json: { text: value } }); setState("saved"); }
    catch { setState("error"); }
  };
  const onChange = (v: string) => {
    setText(v);
    setState("idle");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => save(v), 1200);
  };
  return (
    <div>
      <ol className="list-decimal space-y-2 pl-5 text-[14.5px] text-ink marker:text-faint">
        {prompts.map((p, i) => <li key={i}><Md>{p}</Md></li>)}
      </ol>
      <label htmlFor="reflection" className="mt-4 block text-[13px] text-muted">Answer from memory first — then scroll up to check yourself.</label>
      <textarea id="reflection" value={text} onChange={(e) => onChange(e.target.value)} rows={7}
        className="mt-1.5 w-full resize-y rounded-[10px] border border-line bg-sunken p-3 text-[14px] leading-6 text-ink outline-none focus:border-ion"
        placeholder="Write the rules in your own words, or a minimal code example…" />
      <div className="mt-1 text-right text-[12px] text-faint" aria-live="polite">
        {state === "saving" ? "Saving…" : state === "saved" ? "Saved" : state === "error" ? <span className="text-rose">Could not save — check the server</span> : text ? "Unsaved" : ""}
      </div>
    </div>
  );
}

export function QuickNote({ lessonId, domainId }: { lessonId: string; domainId: string }) {
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<{ id: number; title: string; bodyMd: string }[]>([]);
  const save = async () => {
    setBusy(true);
    try {
      const n = await api<{ id: number; title: string; bodyMd: string }>("/api/notes", { json: { title: body.split("\n")[0].slice(0, 80), bodyMd: body, lessonId, domainId } });
      setSaved((s) => [n, ...s]);
      setBody("");
      toast("Note saved to the Knowledge Vault", { duration: 1500 });
    } catch (e) { toast.error((e as Error).message); }
    setBusy(false);
  };
  return (
    <div>
      <label htmlFor="quicknote" className="sr-only">New note</label>
      <textarea id="quicknote" value={body} onChange={(e) => setBody(e.target.value)} rows={3} placeholder="Jot something down — it lands in your Knowledge Vault"
        onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && body.trim()) { e.preventDefault(); save(); } }}
        className="w-full resize-y rounded-[8px] border border-line bg-sunken p-2.5 text-[13.5px] text-ink outline-none focus:border-ion" />
      <div className="mt-1.5 flex justify-end"><Button size="sm" onClick={save} disabled={!body.trim() || busy}><Save size={14} />Save note</Button></div>
      {saved.map((n) => <div key={n.id} className="mt-2 rounded-[8px] border border-line p-2 text-[13px] text-muted"><Md>{n.bodyMd}</Md></div>)}
    </div>
  );
}
