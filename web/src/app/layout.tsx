import type { Metadata, Viewport } from "next";
import { Toaster } from "sonner";
import "./globals.css";
import { shellStats } from "@/server/services/shell";
import { Sidebar } from "@/components/shell/Sidebar";
import { TopBar } from "@/components/shell/TopBar";
import { CommandPalette } from "@/components/shell/CommandPalette";

// Every page reads live learner data; nothing is prerendered at build time.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { default: "Java Mastery Quest", template: "%s — Java Mastery Quest" },
  description: "Personal OCP Java SE 25 (1Z0-831) training academy by Yassin Ghariani.",
  icons: { icon: "/icon.svg" },
};
export const viewport: Viewport = { themeColor: "#0a0f1e", colorScheme: "dark light" };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  let s: Awaited<ReturnType<typeof shellStats>> | null = null;
  let dbError: string | null = null;
  try { s = await shellStats(); } catch (e) { dbError = (e as Error).message; }
  return (
    <html lang="en" data-theme={s?.learner.theme ?? "dark"} data-motion={s?.learner.reducedMotion ? "reduced" : undefined}>
      <body>
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[100] focus:rounded-[8px] focus:bg-ion focus:px-3 focus:py-2 focus:text-white">Skip to content</a>
        {s ? (
          <div className="flex min-h-dvh">
            <Sidebar initialCollapsed={s.learner.sidebarCollapsed} due={s.due} mistakes={s.openMistakes} />
            <div className="flex min-w-0 flex-1 flex-col">
              <TopBar level={s.level.level} xpInto={s.level.xpIntoLevel} xpFor={s.level.xpForNext} streak={s.streak.current} todayActive={s.streak.todayActive} due={s.due} />
              <main id="main" className="mx-auto w-full max-w-[1320px] flex-1 px-4 py-6 md:px-8 md:py-8">{children}</main>
            </div>
          </div>
        ) : (
          <main id="main" className="mx-auto max-w-xl px-6 py-24">
            <h1 className="text-2xl font-semibold">The database is not reachable</h1>
            <p className="mt-3 text-muted">Java Mastery Quest stores all progress in PostgreSQL. Start it with <code className="kbd">docker compose up -d</code>, then reload this page.</p>
            <pre className="relative well mt-6 overflow-x-auto p-4 text-[13px] text-rose">{dbError}</pre>
          </main>
        )}
        <CommandPalette />
        <Toaster theme={s?.learner.theme === "light" ? "light" : "dark"} position="bottom-right" toastOptions={{ style: { background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text)" } }} />
      </body>
    </html>
  );
}
