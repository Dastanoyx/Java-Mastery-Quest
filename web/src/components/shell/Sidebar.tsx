"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { clsx } from "clsx";
import { Home, Map, Dumbbell, Repeat2, Timer, LineChart, NotebookPen, BookMarked, Settings, PanelLeftClose, PanelLeftOpen, Code2 } from "lucide-react";

const GROUPS = [
  { label: "Today", items: [{ href: "/", label: "Command Center", icon: Home }] },
  { label: "Learn", items: [
    { href: "/curriculum", label: "Learning World", icon: Map },
    { href: "/practice", label: "Practice Arena", icon: Dumbbell },
    { href: "/exercises", label: "Coding Lab", icon: Code2 },
    { href: "/review", label: "Review", icon: Repeat2, badge: "due" as const },
  ] },
  { label: "Prove", items: [
    { href: "/exams", label: "Mock Exams", icon: Timer },
    { href: "/progress", label: "Progress & Readiness", icon: LineChart },
  ] },
  { label: "Keep", items: [
    { href: "/mistakes", label: "Mistake Journal", icon: NotebookPen, badge: "mistakes" as const },
    { href: "/knowledge", label: "Knowledge Vault", icon: BookMarked },
  ] },
];

export function Sidebar({ initialCollapsed, due, mistakes }: { initialCollapsed: boolean; due: number; mistakes: number }) {
  const path = usePathname();
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const [mobileOpen, setMobileOpen] = useState(false);
  useEffect(() => setMobileOpen(false), [path]);
  useEffect(() => {
    const open = () => setMobileOpen(true);
    window.addEventListener("jmq:open-nav", open);
    return () => window.removeEventListener("jmq:open-nav", open);
  }, []);
  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    fetch("/api/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sidebarCollapsed: next }) }).catch(() => {});
  };
  const isActive = (href: string) => (href === "/" ? path === "/" : path.startsWith(href) || (href === "/curriculum" && path.startsWith("/lessons")) || (href === "/exams" && path.startsWith("/results")));
  const nav = (compact: boolean) => (
    <nav aria-label="Main" className="flex flex-1 flex-col gap-5 overflow-y-auto px-2.5 py-4">
      {GROUPS.map((g) => (
        <div key={g.label}>
          {!compact && <div className="px-2.5 pb-1.5 text-[12px] font-medium text-faint">{g.label}</div>}
          <ul className="flex flex-col gap-0.5">
            {g.items.map((it) => {
              const active = isActive(it.href);
              const count = "badge" in it ? (it.badge === "due" ? due : mistakes) : 0;
              return (
                <li key={it.href}>
                  <Link href={it.href} aria-current={active ? "page" : undefined} title={compact ? it.label : undefined}
                    className={clsx("group flex h-9 items-center gap-3 rounded-[8px] px-2.5 text-[14px] transition-colors",
                      active ? "bg-ion-soft text-ink" : "text-muted hover:bg-raised hover:text-ink", compact && "justify-center px-0")}>
                    <it.icon size={17} strokeWidth={1.75} className={active ? "text-ion-strong" : ""} aria-hidden />
                    {!compact && <span className="flex-1 truncate">{it.label}</span>}
                    {!compact && count > 0 && (
                      <span className={clsx("tabular rounded-full px-1.5 text-[11.5px] font-semibold leading-5", it.badge === "due" ? "bg-amber-soft text-amber" : "bg-rose-soft text-rose")}
                        aria-label={`${count} ${it.badge === "due" ? "due" : "open"}`}>{count}</span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
  const brand = (compact: boolean) => (
    <Link href="/" className={clsx("flex h-14 items-center gap-2.5 border-b border-line px-4", compact && "justify-center px-0")} aria-label="Java Mastery Quest home">
      <svg width="26" height="26" viewBox="0 0 32 32" aria-hidden>
        <rect x="1" y="1" width="30" height="30" rx="8" fill="var(--raised)" stroke="var(--border-strong)" />
        <path d="M9 21 L16 8 L23 21" fill="none" stroke="var(--ion)" strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round" />
        <path d="M12 17 H20" stroke="var(--arc)" strokeWidth="2.4" strokeLinecap="round" />
        <circle cx="16" cy="25" r="1.8" fill="var(--signal)" />
      </svg>
      {!compact && <span className="leading-tight"><span className="block text-[14.5px] font-semibold text-ink">Java Mastery Quest</span><span className="block text-[11.5px] text-faint">OCP Java SE 25 (1Z0-831)</span></span>}
    </Link>
  );
  const footer = (compact: boolean) => (
    <div className="border-t border-line p-2.5">
      <Link href="/settings" className={clsx("flex h-9 items-center gap-3 rounded-[8px] px-2.5 text-[14px] text-muted hover:bg-raised hover:text-ink", path.startsWith("/settings") && "bg-ion-soft text-ink", compact && "justify-center px-0")} title={compact ? "Settings" : undefined}>
        <Settings size={17} strokeWidth={1.75} aria-hidden />{!compact && "Settings"}
      </Link>
      <button type="button" onClick={toggle} className={clsx("mt-1 hidden h-9 w-full items-center gap-3 rounded-[8px] px-2.5 text-[13px] text-faint hover:bg-raised hover:text-ink lg:flex", compact && "justify-center px-0")}
        aria-label={compact ? "Expand sidebar" : "Collapse sidebar"} aria-expanded={!compact}>
        {compact ? <PanelLeftOpen size={17} aria-hidden /> : <><PanelLeftClose size={17} aria-hidden />Collapse</>}
      </button>
    </div>
  );
  return (
    <>
      <aside className={clsx("sticky top-0 hidden h-dvh shrink-0 flex-col border-r border-line bg-surface lg:flex", collapsed ? "w-[64px]" : "w-[248px]")}>
        {brand(collapsed)}{nav(collapsed)}{footer(collapsed)}
      </aside>
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <button type="button" className="absolute inset-0 bg-black/50" aria-label="Close navigation" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-[264px] flex-col border-r border-line bg-surface">{brand(false)}{nav(false)}{footer(false)}</aside>
        </div>
      )}
    </>
  );
}
