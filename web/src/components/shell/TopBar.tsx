"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Menu, Search, Flame, Repeat2 } from "lucide-react";
import { clsx } from "clsx";

const LABELS: Record<string, string> = {
  curriculum: "Learning World", lessons: "Lessons", practice: "Practice Arena", review: "Review", exams: "Mock Exams", results: "Results",
  mistakes: "Mistake Journal", knowledge: "Knowledge Vault", progress: "Progress & Readiness", settings: "Settings", onboarding: "Setup", exercises: "Coding Lab",
};

export function TopBar({ level, xpInto, xpFor, streak, todayActive, due }: { level: number; xpInto: number; xpFor: number; streak: number; todayActive: boolean; due: number }) {
  const path = usePathname();
  const parts = path.split("/").filter(Boolean);
  // Dynamic segments (lesson slugs, attempt ids) show the page's own title instead of the raw id.
  const [pageTitle, setPageTitle] = useState<string | null>(null);
  useEffect(() => {
    const read = () => { const t = document.title.replace(/\s+—\s+Java Mastery Quest$/, ""); setPageTitle(t && t !== "Java Mastery Quest" ? t : null); };
    read();
    const el = document.querySelector("title");
    const obs = el ? new MutationObserver(read) : null;
    if (el && obs) obs.observe(el, { childList: true, characterData: true, subtree: true });
    const t = setTimeout(read, 150);
    return () => { obs?.disconnect(); clearTimeout(t); };
  }, [path]);
  const crumbs = [{ href: "/", label: "Command Center" }, ...parts.map((p, i) => ({ href: "/" + parts.slice(0, i + 1).join("/"), label: LABELS[p] ?? decodeURIComponent(p) }))];
  // /lessons and /results have no index page; point those crumbs somewhere useful.
  for (const c of crumbs) { if (c.href === "/lessons") c.href = "/curriculum"; if (c.href === "/results") c.href = "/exams"; }
  const last = crumbs[crumbs.length - 1];
  if (parts.length >= 2 && pageTitle && !LABELS[parts[parts.length - 1]]) last.label = pageTitle;
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-line bg-bg/85 px-4 backdrop-blur md:px-6">
      <button type="button" className="grid h-9 w-9 place-items-center rounded-[8px] text-muted hover:bg-raised hover:text-ink lg:hidden" aria-label="Open navigation"
        onClick={() => window.dispatchEvent(new Event("jmq:open-nav"))}><Menu size={18} /></button>
      <nav aria-label="Breadcrumb" className="hidden min-w-0 flex-1 items-center text-[13.5px] text-muted sm:flex">
        <ol className="flex min-w-0 items-center gap-1.5">
          {crumbs.map((c, i) => (
            <li key={c.href + i} className="flex min-w-0 items-center gap-1.5">
              {i > 0 && <span aria-hidden className="text-faint">/</span>}
              {i === crumbs.length - 1 ? <span aria-current="page" className="truncate text-ink">{c.label}</span> : <Link href={c.href} className="truncate hover:text-ink">{c.label}</Link>}
            </li>
          ))}
        </ol>
      </nav>
      <div className="flex-1 sm:hidden" />
      <button type="button" onClick={() => window.dispatchEvent(new Event("jmq:open-palette"))}
        className="flex h-9 items-center gap-2 rounded-[8px] border border-line bg-surface px-3 text-[13px] text-faint hover:border-line-strong hover:text-muted md:w-64">
        <Search size={15} aria-hidden /><span className="hidden flex-1 text-left md:inline">Search or jump to…</span><span className="kbd hidden md:inline">Ctrl K</span>
      </button>
      {due > 0 && (
        <Link href="/review" className="hidden h-9 items-center gap-1.5 rounded-[8px] px-2.5 text-[13px] text-amber hover:bg-amber-soft sm:flex" title={`${due} review items due`}>
          <Repeat2 size={15} aria-hidden /><span className="tabular font-semibold">{due}</span><span className="hidden xl:inline">due</span>
        </Link>
      )}
      <div className={clsx("flex h-9 items-center gap-1.5 px-1.5 text-[13px]", todayActive ? "text-amber" : "text-faint")} title={todayActive ? `${streak}-day streak, today counted` : `${streak}-day streak — study today to extend it`}>
        <Flame size={15} aria-hidden /><span className="tabular font-semibold">{streak}</span><span className="sr-only">day streak</span>
      </div>
      <Link href="/progress" className="flex h-9 items-center gap-2 rounded-[8px] px-2 hover:bg-raised" title={`Level ${level}: ${xpInto} / ${xpFor} XP to level ${level + 1}`}>
        <span className="grid h-6 min-w-6 place-items-center rounded-full bg-arc-soft px-1.5 text-[12px] font-semibold text-arc">{level}</span>
        <span className="hidden w-20 md:block"><span className="block h-1.5 overflow-hidden rounded-full bg-raised"><span className="block h-full rounded-full bg-arc" style={{ width: `${Math.round((xpInto / Math.max(1, xpFor)) * 100)}%` }} /></span></span>
      </Link>
    </header>
  );
}
