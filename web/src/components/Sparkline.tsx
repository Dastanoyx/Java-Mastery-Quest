// Single-series trend line (no legend needed; the surrounding title names it). Values 0–100.
export function Sparkline({ values, labels, width = 240, height = 48, label }: { values: number[]; labels: string[]; width?: number; height?: number; label: string }) {
  if (values.length < 2) return null;
  const pad = 4;
  const max = 100, min = 0;
  const x = (i: number) => pad + (i * (width - pad * 2)) / (values.length - 1);
  const y = (v: number) => height - pad - ((v - min) / (max - min)) * (height - pad * 2);
  const d = values.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const last = values[values.length - 1];
  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${label}: from ${values[0].toFixed(0)} on ${labels[0]} to ${last.toFixed(0)} on ${labels[labels.length - 1]}`} className="overflow-visible">
      <line x1={pad} x2={width - pad} y1={y(50)} y2={y(50)} stroke="var(--grid)" strokeWidth={1} />
      <path d={d} fill="none" stroke="var(--series-1)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(values.length - 1)} cy={y(last)} r={4} fill="var(--series-1)" stroke="var(--surface)" strokeWidth={2} />
      {values.map((v, i) => <title key={i}>{`${labels[i]}: ${v.toFixed(1)}`}</title>)}
    </svg>
  );
}
