// The Learning World: ten regions on one route. HTML nodes over an SVG route so every region is a real,
// focusable link. Purely presentational — all numbers come from the server (worldData()).
import Link from "next/link";
import { clsx } from "clsx";
import { Crown } from "lucide-react";
import type { RegionView } from "@/server/services/curriculum";
import type { LessonCard } from "@/server/services/lessons";
import { NamedIcon } from "./icons";
import { Ring } from "./ui";

// Serpentine route in a 1000×560 frame: D1→D5 along the top, D6→D10 back along the bottom.
const POINTS: [number, number][] = [
  [90, 128], [290, 84], [500, 138], [705, 80], [905, 136],
  [885, 418], [685, 472], [490, 404], [290, 470], [92, 410],
];
const W = 1000, H = 560;

/** Catmull-Rom → cubic Bézier, so the route passes smoothly through every region. */
function segment(i: number): string {
  const p = (k: number) => POINTS[Math.max(0, Math.min(POINTS.length - 1, k))];
  const [p0, p1, p2, p3] = [p(i - 1), p(i), p(i + 1), p(i + 2)];
  const t = 0.5 / 3 * 2; // tension
  const c1 = [p1[0] + (p2[0] - p0[0]) * t / 2, p1[1] + (p2[1] - p0[1]) * t / 2];
  const c2 = [p2[0] - (p3[0] - p1[0]) * t / 2, p2[1] - (p3[1] - p1[1]) * t / 2];
  // The turn on the right edge (D5→D6) bulges outward instead of cutting across.
  if (i === 4) return `M${p1[0]},${p1[1]} C${p1[0] + 110},${p1[1] + 40} ${p2[0] + 120},${p2[1] - 60} ${p2[0]},${p2[1]}`;
  return `M${p1[0]},${p1[1]} C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0]},${p2[1]}`;
}

const STATE_LABEL = { untouched: "Not started", exploring: "Exploring", needs_review: "Needs review", mastered: "Mastered" } as const;

export function WorldMap({ regions, next }: { regions: RegionView[]; next: LessonCard | null }) {
  return (
    <div className="panel relative hidden overflow-hidden md:block" style={{ aspectRatio: `${W} / ${H}` }}>
      <div aria-hidden className="pointer-events-none absolute inset-0 opacity-60"
        style={{ backgroundImage: "radial-gradient(circle at 1px 1px, var(--grid) 1px, transparent 0)", backgroundSize: "28px 28px" }} />
      <svg viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 h-full w-full" aria-hidden preserveAspectRatio="xMidYMid meet">
        {POINTS.slice(0, -1).map((_, i) => (
          <path key={`base${i}`} d={segment(i)} fill="none" stroke="var(--border-strong)" strokeWidth={2} strokeDasharray="2 7" strokeLinecap="round" />
        ))}
        {POINTS.slice(0, -1).map((_, i) => {
          const lit = regions[i]?.state !== "untouched" && regions[i + 1]?.state !== "untouched";
          if (!lit) return null;
          return <path key={`lit${i}`} d={segment(i)} fill="none" stroke="var(--ion)" strokeWidth={2.5} strokeLinecap="round"
            className="path-draw" style={{ ["--len" as string]: 420, animationDelay: `${120 + i * 90}ms` }} />;
        })}
      </svg>
      {next && (
        <div className="region-in absolute left-1/2 top-1/2 w-[min(360px,40%)] -translate-x-1/2 -translate-y-1/2 rounded-[12px] border border-line bg-surface/90 p-4 shadow-[var(--shadow)] backdrop-blur" style={{ animationDelay: "600ms" }}>
          <div className="text-[12px] text-faint">{next.status === "in_progress" ? "Continue your mission" : "Next mission"} · {next.domainId}</div>
          <Link href={`/lessons/${next.id}`} className="mt-0.5 block font-semibold leading-snug text-ink hover:text-ion-strong">{next.title}</Link>
          <div className="mt-1 text-[12.5px] text-muted">{next.minutes} min · {next.checks} checks · {next.masteryQuestions}-question mastery quiz</div>
          <Link href={`/lessons/${next.id}`} className="mt-3 inline-flex h-8 items-center rounded-[8px] bg-ion px-3 text-[13px] font-medium text-white hover:bg-ion-strong">{next.status === "in_progress" ? "Resume" : "Start mission"}</Link>
        </div>
      )}
      <ol className="absolute inset-0" aria-label="Regions of the Learning World">
        {regions.map((r, i) => {
          const [x, y] = POINTS[i];
          const done = r.lessons.filter((l) => ["completed", "needs_review", "mastered"].includes(l.status)).length;
          return (
            <li key={r.id} className="region-in absolute w-[150px] -translate-x-1/2 -translate-y-[34px]" style={{ left: `${(x / W) * 100}%`, top: `${(y / H) * 100}%`, animationDelay: `${i * 55}ms` }}>
              <Link href={`/curriculum/${r.id}`} className="group flex flex-col items-center rounded-[12px] p-1.5 text-center outline-offset-4"
                aria-label={`${r.region}: ${r.short}. ${STATE_LABEL[r.state]}. ${done} of ${r.lessons.length} lessons, ${Math.round(r.score * 100)}% mastery.`}>
                <span className={clsx("relative grid place-items-center rounded-full bg-surface transition-transform group-hover:scale-105",
                  r.state === "untouched" ? "shadow-none" : "shadow-[0_0_0_6px_var(--ion-soft)]")}>
                  <Ring value={r.score} size={60} stroke={4} tone="signal">
                    <NamedIcon name={r.icon} size={22} className={clsx(r.state === "untouched" ? "text-faint" : r.state === "mastered" ? "text-signal" : "text-ion-strong")} />
                  </Ring>
                  {r.boss.defeated && <Crown size={15} className="absolute -right-1 -top-1 text-arc" aria-hidden />}
                  {r.dueReviews > 0 && <span className="tabular absolute -bottom-1 -right-2 rounded-full bg-amber px-1.5 text-[10.5px] font-semibold leading-4 text-[#2a1a00]">{r.dueReviews}</span>}
                </span>
                <span className="mt-1.5 text-[11px] font-medium text-faint">{r.id} · {r.region.replace(/^The /, "")}</span>
                <span className="text-[13px] font-semibold leading-tight text-ink group-hover:text-ion-strong">{r.short}</span>
                <span className="tabular mt-0.5 text-[11.5px] text-muted">{done}/{r.lessons.length} missions · {Math.round(r.score * 100)}%</span>
              </Link>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
