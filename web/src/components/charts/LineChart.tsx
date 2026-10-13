"use client";
// Minimal SVG line chart for percentages (0–100). One y-axis, recessive grid, 2px lines, end-of-line direct
// labels, hover crosshair + tooltip, and an always-available data table. Series colours come from the
// validated --series-* tokens (see globals.css); text never takes a series colour.
import { useMemo, useRef, useState } from "react";
import { dayMonth } from "../format";

export interface Series { name: string; color: string; values: (number | null)[]; counts?: (number | null)[] }

export function LineChart({ labels, series, height = 220, refLines = [], label, xFormat = "raw" }: {
  labels: string[]; series: Series[]; height?: number; refLines?: { value: number; label: string }[]; label: string; xFormat?: "raw" | "day";
}) {
  const formatX = (s: string) => (xFormat === "day" ? dayMonth(s) : s);
  const W = 640, H = height, P = { l: 34, r: 92, t: 12, b: 26 };
  const [hover, setHover] = useState<number | null>(null);
  const [table, setTable] = useState(false);
  const svg = useRef<SVGSVGElement>(null);
  const n = labels.length;
  const x = (i: number) => P.l + (n <= 1 ? (W - P.l - P.r) / 2 : (i * (W - P.l - P.r)) / (n - 1));
  const y = (v: number) => P.t + (1 - v / 100) * (H - P.t - P.b);
  const paths = useMemo(() => series.map((s) => {
    let d = "", pen = false;
    s.values.forEach((v, i) => { if (v == null) { pen = false; return; } d += `${pen ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)} `; pen = true; });
    return d;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [series, n]);
  const lastIdx = (s: Series) => { for (let i = s.values.length - 1; i >= 0; i--) if (s.values[i] != null) return i; return -1; };
  const onMove = (e: React.PointerEvent) => {
    const r = svg.current!.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    let best = 0, dist = Infinity;
    for (let i = 0; i < n; i++) { const d = Math.abs(x(i) - px); if (d < dist) { dist = d; best = i; } }
    setHover(best);
  };
  const ticks = labels.length <= 8 ? labels.map((_, i) => i) : [0, Math.floor((n - 1) / 2), n - 1];

  return (
    <figure>
      <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px] text-muted">
        {series.length > 1 && series.map((s) => <span key={s.name} className="inline-flex items-center gap-1.5"><span className="h-0.5 w-4 rounded-full" style={{ background: s.color }} aria-hidden />{s.name}</span>)}
        <button type="button" onClick={() => setTable((t) => !t)} className="ml-auto text-faint underline-offset-2 hover:text-ink hover:underline" aria-pressed={table}>{table ? "Show chart" : "Show data"}</button>
      </div>
      {table ? (
        <div className="relative overflow-x-auto">
          <table className="w-full text-[13px]">
            <caption className="sr-only">{label}</caption>
            <thead><tr className="text-left text-faint"><th className="py-1 pr-3 font-medium">Period</th>{series.map((s) => <th key={s.name} className="py-1 pr-3 text-right font-medium">{s.name}</th>)}</tr></thead>
            <tbody>{labels.map((l, i) => (
              <tr key={l} className="border-t border-line"><td className="py-1 pr-3 text-muted">{formatX(l)}</td>
                {series.map((s) => <td key={s.name} className="tabular py-1 pr-3 text-right text-ink">{s.values[i] == null ? "—" : `${s.values[i]!.toFixed(0)}%`}{s.counts?.[i] ? <span className="text-faint"> (n={s.counts[i]})</span> : null}</td>)}
              </tr>
            ))}</tbody>
          </table>
        </div>
      ) : (
        <div className="relative">
          <svg ref={svg} viewBox={`0 0 ${W} ${H}`} className="w-full touch-none" role="img" aria-label={label} onPointerMove={onMove} onPointerLeave={() => setHover(null)}>
            {[0, 50, 100].map((v) => (
              <g key={v}><line x1={P.l} x2={W - P.r} y1={y(v)} y2={y(v)} stroke="var(--grid)" strokeWidth={1} />
                <text x={P.l - 6} y={y(v) + 3.5} textAnchor="end" fontSize="10.5" fill="var(--faint)">{v}%</text></g>
            ))}
            {refLines.map((r) => (
              <g key={r.label}><line x1={P.l} x2={W - P.r} y1={y(r.value)} y2={y(r.value)} stroke="var(--border-strong)" strokeDasharray="4 4" strokeWidth={1} />
                <text x={W - P.r + 4} y={y(r.value) + 3.5} fontSize="10.5" fill="var(--faint)">{r.label}</text></g>
            ))}
            {ticks.map((i) => <text key={i} x={x(i)} y={H - 8} textAnchor="middle" fontSize="10.5" fill="var(--faint)">{formatX(labels[i])}</text>)}
            {series.map((s, si) => (
              <g key={s.name}>
                <path d={paths[si]} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
                {s.values.map((v, i) => v == null ? null : (s.values[i - 1] == null && s.values[i + 1] == null) || hover === i ? (
                  <circle key={i} cx={x(i)} cy={y(v)} r={4} fill={s.color} stroke="var(--surface)" strokeWidth={2} />) : null)}
                {lastIdx(s) >= 0 && <text x={x(lastIdx(s)) + 8} y={y(s.values[lastIdx(s)]!) + 4} fontSize="11" fill="var(--muted)">{s.values[lastIdx(s)]!.toFixed(0)}% {series.length > 1 ? s.name.split(" ")[0].toLowerCase() : ""}</text>}
              </g>
            ))}
            {hover != null && <line x1={x(hover)} x2={x(hover)} y1={P.t} y2={H - P.b} stroke="var(--border-strong)" strokeWidth={1} />}
          </svg>
          {hover != null && (
            <div className="pointer-events-none absolute top-1 z-10 min-w-[150px] rounded-[8px] border border-line bg-surface px-3 py-2 text-[12px] shadow-[var(--shadow)]"
              style={{ left: `${(x(hover) / W) * 100}%`, transform: x(hover) > W / 2 ? "translateX(calc(-100% - 10px))" : "translateX(10px)" }}>
              <div className="mb-1 font-medium text-ink">{formatX(labels[hover])}</div>
              {series.map((s) => (
                <div key={s.name} className="flex items-center justify-between gap-3">
                  <span className="inline-flex items-center gap-1.5 text-muted"><span className="h-2 w-2 rounded-full" style={{ background: s.color }} aria-hidden />{s.name}</span>
                  <span className="tabular text-ink">{s.values[hover] == null ? "—" : `${s.values[hover]!.toFixed(0)}%`}{s.counts?.[hover] ? <span className="text-faint"> n={s.counts[hover]}</span> : null}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </figure>
  );
}
