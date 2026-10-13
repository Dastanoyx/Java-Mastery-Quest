"use client";
import { Command } from "cmdk";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { FileText, Scale, NotebookPen, HelpCircle, CornerDownLeft } from "lucide-react";

const PAGES = [
  ["Command Center", "/"], ["Learning World", "/curriculum"], ["Practice Arena", "/practice"], ["Coding Lab", "/exercises"], ["Review due items", "/review"],
  ["Mock Exams", "/exams"], ["Progress & Readiness", "/progress"], ["Mistake Journal", "/mistakes"], ["Knowledge Vault", "/knowledge"],
  ["New note", "/knowledge?new=1"], ["Settings", "/settings"],
] as const;
const ACTIONS = [
  ["Start a 10-question mixed practice", "/practice?mode=mixed&autostart=1"], ["Start a full mock exam", "/exams?preset=full"],
  ["Start a short timed exam", "/exams?preset=short"],
] as const;

interface Hit { type: string; id: string; title: string; snippet: string; href: string }
const ICON = { lesson: FileText, rule: Scale, note: NotebookPen, question: HelpCircle } as const;

function Snippet({ s }: { s: string }) {
  const parts = s.split(/(«[^»]*»)/g);
  return <>{parts.map((p, i) => (p.startsWith("«") ? <mark key={i} className="rounded bg-ion-soft px-0.5 text-ink">{p.slice(1, -1)}</mark> : <span key={i}>{p}</span>))}</>;
}

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) { e.preventDefault(); setOpen((o) => !o); }
      if (e.key === "/" && !/input|textarea|select/i.test((e.target as HTMLElement).tagName) && !(e.target as HTMLElement).isContentEditable) { e.preventDefault(); setOpen(true); }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("jmq:open-palette", onOpen);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("jmq:open-palette", onOpen); };
  }, []);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (q.trim().length < 2) { setHits([]); return; }
    timer.current = setTimeout(async () => {
      const r = await fetch(`/api/search?q=${encodeURIComponent(q)}`).then((x) => (x.ok ? x.json() : [])).catch(() => []);
      setHits(r);
    }, 160);
  }, [q]);

  const go = (href: string) => { setOpen(false); setQ(""); router.push(href); };
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center bg-black/50 px-4 pt-[12vh]" onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
      <Command label="Command palette" shouldFilter={false} className="panel w-full max-w-[640px] overflow-hidden" onKeyDown={(e) => { if (e.key === "Escape") setOpen(false); }}>
        <Command.Input autoFocus value={q} onValueChange={setQ} placeholder="Search lessons, rules, notes — or type a page name"
          className="h-12 w-full border-b border-line bg-transparent px-4 text-[15px] text-ink outline-none placeholder:text-faint" />
        <Command.List className="max-h-[60vh] overflow-y-auto p-2">
          <Command.Empty className="px-3 py-6 text-[14px] text-muted">No matches. Unseen questions are hidden from search so they stay fresh for practice.</Command.Empty>
          {hits.length > 0 && (
            <Command.Group heading="Results" className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[12px] [&_[cmdk-group-heading]]:text-faint">
              {hits.map((h) => {
                const I = ICON[h.type as keyof typeof ICON] ?? FileText;
                return (
                  <Command.Item key={h.type + h.id} value={h.type + h.id} onSelect={() => go(h.href)}
                    className="flex cursor-pointer items-start gap-3 rounded-[8px] px-2.5 py-2 aria-selected:bg-raised">
                    <I size={16} className="mt-0.5 shrink-0 text-faint" aria-hidden />
                    <div className="min-w-0">
                      <div className="truncate text-[14px] text-ink">{h.title}</div>
                      <div className="line-clamp-2 text-[12.5px] text-muted"><Snippet s={h.snippet} /></div>
                    </div>
                  </Command.Item>
                );
              })}
            </Command.Group>
          )}
          {[["Go to", PAGES], ["Actions", ACTIONS]].map(([heading, list]) => {
            const items = (list as readonly (readonly [string, string])[]).filter(([l]) => !q || l.toLowerCase().includes(q.toLowerCase()));
            if (!items.length) return null;
            return (
              <Command.Group key={heading as string} heading={heading as string} className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[12px] [&_[cmdk-group-heading]]:text-faint">
                {items.map(([label, href]) => (
                  <Command.Item key={href} value={label} onSelect={() => go(href)} className="flex cursor-pointer items-center justify-between rounded-[8px] px-2.5 py-2 text-[14px] text-ink aria-selected:bg-raised">
                    {label}<CornerDownLeft size={14} className="text-faint" aria-hidden />
                  </Command.Item>
                ))}
              </Command.Group>
            );
          })}
        </Command.List>
      </Command>
    </div>
  );
}
