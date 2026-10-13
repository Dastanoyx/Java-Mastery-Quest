"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { clsx } from "clsx";
import { toast } from "sonner";
import { Scale, ShieldAlert, Split, NotebookPen, Bookmark, Search, Plus, Pencil, Trash2, FileText, HelpCircle, Code2 } from "lucide-react";
import type { LessonRules } from "@/server/services/knowledge";
import type { Note } from "@/server/services/journal";
import type { Confusable } from "@/content/confusables";
import { Md } from "../Md";
import { Button, Chip, Empty } from "../ui";
import { api } from "../rewards";
import { timeAgo } from "../format";

type Tab = "rules" | "pairs" | "notes" | "bookmarks" | "search";
interface Data { lessons: LessonRules[]; confusables: Confusable[]; notes: Note[]; bookmarks: { targetType: string; targetId: string; title: string | null; domainId: string | null; createdAt: string }[] }
interface Hit { type: string; id: string; title: string; snippet: string; href: string; domainId: string | null }

const TABS: { id: Tab; label: string; Icon: typeof Scale }[] = [
  { id: "rules", label: "Rules & traps", Icon: Scale }, { id: "pairs", label: "Confusable pairs", Icon: Split },
  { id: "notes", label: "My notes", Icon: NotebookPen }, { id: "bookmarks", label: "Bookmarks", Icon: Bookmark }, { id: "search", label: "Search", Icon: Search },
];

const has = (hay: string, needle: string) => hay.toLowerCase().includes(needle.toLowerCase());

function Snippet({ s }: { s: string }) {
  return <>{s.split(/(«[^»]*»)/g).map((p, i) => (p.startsWith("«") ? <mark key={i} className="rounded bg-ion-soft px-0.5 text-ink">{p.slice(1, -1)}</mark> : <span key={i}>{p}</span>))}</>;
}

function NoteEditor({ initial, domains, onSaved, onCancel }: { initial?: Note; domains: { id: string; short: string }[]; onSaved: (n: Note) => void; onCancel: () => void }) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [body, setBody] = useState(initial?.bodyMd ?? "");
  const [domainId, setDomainId] = useState(initial?.domainId ?? "");
  const [tags, setTags] = useState((initial?.tags ?? []).join(", "));
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    const payload = { title, bodyMd: body, domainId: domainId || null, tags: tags.split(",").map((t) => t.trim()).filter(Boolean).slice(0, 20) };
    try {
      const n = initial ? await api<Note>(`/api/notes/${initial.id}`, { method: "PATCH", json: payload }) : await api<Note>("/api/notes", { json: payload });
      onSaved(n);
      toast(initial ? "Note updated" : "Note saved", { duration: 1200 });
    } catch (e) { toast.error((e as Error).message); }
    setBusy(false);
  };
  return (
    <div className="panel space-y-3 p-4">
      <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" aria-label="Note title" autoFocus
        className="h-10 w-full rounded-[8px] border border-line bg-sunken px-3 text-[15px] font-medium text-ink outline-none focus:border-ion" />
      <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={8} placeholder="Markdown supported — `code`, **bold**, lists, ```java fences```" aria-label="Note body"
        onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && body.trim()) { e.preventDefault(); save(); } }}
        className="w-full resize-y rounded-[8px] border border-line bg-sunken p-3 font-mono text-[13.5px] leading-6 text-ink outline-none focus:border-ion" />
      <div className="flex flex-wrap items-center gap-2">
        <select value={domainId} onChange={(e) => setDomainId(e.target.value)} aria-label="Domain" className="h-9 rounded-[8px] border border-line bg-sunken px-2 text-[13.5px] text-ink">
          <option value="">No domain</option>{domains.map((d) => <option key={d.id} value={d.id}>{d.id} · {d.short}</option>)}
        </select>
        <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="tags, comma separated" aria-label="Tags" className="h-9 min-w-0 flex-1 rounded-[8px] border border-line bg-sunken px-3 text-[13.5px] text-ink outline-none focus:border-ion" />
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button variant="primary" onClick={save} disabled={busy || !body.trim()}>{busy ? "Saving…" : "Save"}</Button>
      </div>
    </div>
  );
}

export function KnowledgeVault({ data, domains, initialTab, openNew, focusNote, initialQuery }: {
  data: Data; domains: { id: string; short: string }[]; initialTab: Tab; openNew: boolean; focusNote: number | null; initialQuery: string;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>(initialTab);
  const [filter, setFilter] = useState("");
  const [domain, setDomain] = useState("");
  const [notes, setNotes] = useState<Note[]>(data.notes);
  const [editing, setEditing] = useState<number | "new" | null>(openNew ? "new" : null);
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);
  const [q, setQ] = useState(initialQuery);
  const [hits, setHits] = useState<Hit[] | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (focusNote) requestAnimationFrame(() => document.getElementById(`note-${focusNote}`)?.scrollIntoView({ block: "center" }));
  }, [focusNote]);
  useEffect(() => {
    if (tab !== "search") return;
    if (timer.current) clearTimeout(timer.current);
    if (q.trim().length < 2) { setHits(null); return; }
    timer.current = setTimeout(() => { api<Hit[]>(`/api/search?q=${encodeURIComponent(q)}`).then(setHits).catch(() => setHits([])); }, 180);
  }, [q, tab]);
  const switchTab = (t: Tab) => { setTab(t); const u = new URL(window.location.href); u.searchParams.set("tab", t); u.searchParams.delete("new"); u.searchParams.delete("note"); window.history.replaceState(null, "", u); };

  const lessons = useMemo(() => data.lessons
    .filter((l) => !domain || l.domainId === domain)
    .map((l) => ({ ...l, rules: l.rules.filter((r) => !filter || has(r, filter) || has(l.title, filter)), traps: l.traps.filter((t) => !filter || has(t.md, filter) || has(t.title ?? "", filter) || has(l.title, filter)) }))
    .filter((l) => l.rules.length || l.traps.length), [data.lessons, domain, filter]);
  const pairs = data.confusables.filter((p) => (!domain || p.domains.includes(domain)) && (!filter || has(JSON.stringify(p), filter)));
  const shownNotes = notes.filter((n) => (!domain || n.domainId === domain) && (!filter || has(n.title + " " + n.bodyMd + " " + n.tags.join(" "), filter)));
  const lessonTitle = new Map(data.lessons.map((l) => [l.lessonId, l.title]));

  const del = async (id: number) => {
    try { await api(`/api/notes/${id}`, { method: "DELETE" }); setNotes((n) => n.filter((x) => x.id !== id)); toast("Note deleted", { duration: 1200 }); router.refresh(); }
    catch (e) { toast.error((e as Error).message); }
    setConfirmDelete(null);
  };

  const ruleCount = data.lessons.reduce((s, l) => s + l.rules.length, 0);
  const trapCount = data.lessons.reduce((s, l) => s + l.traps.length, 0);
  const counts: Record<Tab, number | null> = { rules: ruleCount + trapCount, pairs: data.confusables.length, notes: notes.length, bookmarks: data.bookmarks.length, search: null };

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center gap-1 border-b border-line" role="tablist" aria-label="Vault sections">
        {TABS.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => switchTab(t.id)}
            className={clsx("-mb-px flex h-10 items-center gap-2 border-b-2 px-3 text-[14px]", tab === t.id ? "border-ion text-ink" : "border-transparent text-muted hover:text-ink")}>
            <t.Icon size={15} aria-hidden />{t.label}{counts[t.id] != null && <span className="tabular text-[12px] text-faint">{counts[t.id]}</span>}
          </button>
        ))}
      </div>

      {tab !== "search" && tab !== "bookmarks" && (
        <div className="mb-5 flex flex-wrap items-center gap-2">
          <div className="relative min-w-[220px] flex-1">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" aria-hidden />
            <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder={tab === "notes" ? "Filter notes" : "Filter, e.g. “varargs”, “DST”, “opens”"} aria-label="Filter"
              className="h-9 w-full rounded-[8px] border border-line bg-surface pl-9 pr-3 text-[14px] text-ink outline-none focus:border-ion" />
          </div>
          <select value={domain} onChange={(e) => setDomain(e.target.value)} aria-label="Domain" className="h-9 rounded-[8px] border border-line bg-surface px-2 text-[13.5px] text-ink">
            <option value="">All domains</option>{domains.map((d) => <option key={d.id} value={d.id}>{d.id} · {d.short}</option>)}
          </select>
          {tab === "notes" && <Button variant="primary" onClick={() => setEditing("new")}><Plus size={15} />New note</Button>}
        </div>
      )}

      {tab === "rules" && (lessons.length === 0 ? <Empty title="Nothing matches">Try a broader word.</Empty> : (
        <div className="space-y-6">
          {lessons.map((l) => (
            <section key={l.lessonId} className="panel p-5" aria-labelledby={`r-${l.lessonId}`}>
              <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                <h2 id={`r-${l.lessonId}`} className="text-[15px] font-semibold text-ink"><span className="mr-2 text-faint">{l.domainId}</span>{l.title}</h2>
                <Link href={`/lessons/${l.lessonId}`} className="text-[13px] text-ion-strong hover:underline">Open lesson</Link>
              </div>
              <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
                {l.rules.length > 0 && (
                  <ul className="space-y-2 text-[14px] text-ink">
                    {l.rules.map((r, i) => <li key={i} className="flex gap-2.5"><Scale size={14} className="mt-1 shrink-0 text-ion-strong" aria-hidden /><Md>{r}</Md></li>)}
                  </ul>
                )}
                {l.traps.length > 0 && (
                  <div className="space-y-2">
                    {l.traps.map((t, i) => (
                      <div key={i} className="callout callout-trap text-[13.5px]"><div className="callout-title"><ShieldAlert size={14} aria-hidden />{t.title ? `Exam trap: ${t.title}` : "Exam trap"}</div><Md>{t.md}</Md></div>
                    ))}
                  </div>
                )}
              </div>
            </section>
          ))}
        </div>
      ))}

      {tab === "pairs" && (pairs.length === 0 ? <Empty title="Nothing matches" /> : (
        <div className="space-y-5">
          {pairs.map((p) => (
            <section key={p.id} className="panel p-5" aria-labelledby={`p-${p.id}`}>
              <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                <h2 id={`p-${p.id}`} className="text-[16px] font-semibold text-ink">{p.title}</h2>
                <div className="flex gap-1.5">{p.domains.map((d) => <Chip key={d}>{d}</Chip>)}</div>
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {[p.a, p.b].map((s, i) => (
                  <div key={i} className={clsx("rounded-[10px] border p-4", i === 0 ? "border-ion/40 bg-ion-soft/40" : "border-arc/40 bg-arc-soft/40")}>
                    <div className={clsx("mb-2 font-mono text-[14px] font-semibold", i === 0 ? "text-ion-strong" : "text-arc")}>{s.name}</div>
                    <ul className="list-disc space-y-1.5 pl-4 text-[13.5px] text-ink marker:text-faint">{s.points.map((pt, k) => <li key={k}><Md>{pt}</Md></li>)}</ul>
                  </div>
                ))}
              </div>
              <div className="callout callout-rule mt-4 text-[14px]"><div className="callout-title">Rule of thumb</div><Md>{p.rule}</Md></div>
              <div className="mt-3 flex flex-wrap gap-3 text-[13px]">
                {p.lessons.map((id) => <Link key={id} href={`/lessons/${id}`} className="text-ion-strong hover:underline">{lessonTitle.get(id) ?? id}</Link>)}
                <Link href={`/practice?${p.domains.map((d) => `domain=${d}`)[0]}&autostart=1`} className="text-muted hover:text-ink">Practise {p.domains[0]} mixed</Link>
              </div>
            </section>
          ))}
        </div>
      ))}

      {tab === "notes" && (
        <div className="space-y-3">
          {editing === "new" && <NoteEditor domains={domains} onCancel={() => setEditing(null)} onSaved={(n) => { setNotes((x) => [n, ...x]); setEditing(null); }} />}
          {shownNotes.length === 0 && editing !== "new" ? (
            <Empty icon={<NotebookPen size={18} />} title={notes.length ? "No notes match" : "No notes yet"} action={<Button onClick={() => setEditing("new")}><Plus size={15} />Write one</Button>}>
              Notes you take on lessons and questions land here. Writing a rule in your own words is one of the strongest ways to remember it.
            </Empty>
          ) : shownNotes.map((n) => editing === n.id ? (
            <NoteEditor key={n.id} initial={n} domains={domains} onCancel={() => setEditing(null)} onSaved={(u) => { setNotes((x) => x.map((y) => (y.id === u.id ? u : y))); setEditing(null); }} />
          ) : (
            <article key={n.id} id={`note-${n.id}`} className={clsx("panel scroll-mt-24 p-5", focusNote === n.id && "ring-2 ring-ion")}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <h2 className="text-[15px] font-semibold text-ink">{n.title || "Untitled note"}</h2>
                <div className="flex items-center gap-1">
                  <Button size="sm" variant="ghost" onClick={() => setEditing(n.id)} aria-label="Edit note"><Pencil size={14} /></Button>
                  {confirmDelete === n.id ? (
                    <span className="flex items-center gap-1 text-[12.5px]"><span className="text-muted">Delete?</span><Button size="sm" variant="danger" onClick={() => del(n.id)}>Delete</Button><Button size="sm" variant="ghost" onClick={() => setConfirmDelete(null)}>Keep</Button></span>
                  ) : <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(n.id)} aria-label="Delete note"><Trash2 size={14} /></Button>}
                </div>
              </div>
              <div className="mt-2 text-[14px] text-ink"><Md>{n.bodyMd}</Md></div>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-[12.5px] text-faint">
                {n.domainId && <Chip>{n.domainId}</Chip>}
                {n.tags.map((t) => <Chip key={t} tone="ion">#{t}</Chip>)}
                {n.lessonId && <Link href={`/lessons/${n.lessonId}`} className="text-ion-strong hover:underline">{n.lessonTitle}</Link>}
                {n.questionId && <Link href={`/practice?question=${encodeURIComponent(n.questionId)}`} className="hover:text-ink">Question {n.questionId}</Link>}
                <span>edited {timeAgo(n.updatedAt)}</span>
              </div>
            </article>
          ))}
        </div>
      )}

      {tab === "bookmarks" && (data.bookmarks.length === 0 ? (
        <Empty icon={<Bookmark size={18} />} title="No bookmarks yet">Bookmark lessons and questions with the bookmark icon. Bookmarked questions can be practised as their own session.</Empty>
      ) : (
        <div className="space-y-3">
          {data.bookmarks.some((b) => b.targetType === "question") && <div className="flex justify-end"><Link href="/practice?source=bookmarked&autostart=1" className="text-[13.5px] text-ion-strong hover:underline">Practise bookmarked questions</Link></div>}
          <ul className="panel divide-y divide-line">
            {data.bookmarks.map((b) => {
              const Icon = b.targetType === "lesson" ? FileText : b.targetType === "question" ? HelpCircle : Code2;
              const href = b.targetType === "lesson" ? `/lessons/${b.targetId}` : b.targetType === "question" ? `/practice?question=${encodeURIComponent(b.targetId)}` : `/exercises/${b.targetId}`;
              return (
                <li key={b.targetType + b.targetId}>
                  <Link href={href} className="flex items-center gap-3 px-4 py-3 hover:bg-raised/50">
                    <Icon size={16} className="shrink-0 text-faint" aria-hidden />
                    <span className="min-w-0 flex-1 truncate text-[14px] text-ink">{(b.title ?? b.targetId).replace(/[`*]/g, "")}</span>
                    {b.domainId && <Chip>{b.domainId}</Chip>}
                    <span className="shrink-0 text-[12px] text-faint">{timeAgo(b.createdAt)}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}

      {tab === "search" && (
        <div>
          <div className="relative">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-faint" aria-hidden />
            <input value={q} onChange={(e) => setQ(e.target.value)} autoFocus placeholder="Search lessons, rules, notes and questions you have answered" aria-label="Search the vault"
              className="h-11 w-full rounded-[10px] border border-line bg-surface pl-10 pr-3 text-[15px] text-ink outline-none focus:border-ion" />
          </div>
          <p className="mt-2 text-[12.5px] text-faint">Full-text search. Questions you haven&apos;t answered yet are left out so they stay fresh for practice and exams.</p>
          <ul className="mt-4 space-y-2">
            {hits?.length === 0 && <li className="text-muted">No matches.</li>}
            {hits?.map((h) => (
              <li key={h.type + h.id}>
                <Link href={h.href} className="panel-flat block p-3 hover:border-line-strong">
                  <div className="flex items-center gap-2 text-[12px] text-faint"><Chip>{h.type}</Chip>{h.domainId}</div>
                  <div className="mt-1 text-[14px] font-medium text-ink">{h.title.replace(/[`*]/g, "")}</div>
                  <div className="mt-0.5 line-clamp-2 text-[13px] text-muted"><Snippet s={h.snippet} /></div>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
