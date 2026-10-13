// Study-consistency calendar: one column per week, one cell per day. Sequential single hue (signal) by
// activity level; level 0 is the empty surface. Every cell has a tooltip; a text summary sits next to it.
export function Heatmap({ days, today }: { days: { day: string; questions: number; lessons: number; reviews: number }[]; today: string }) {
  const by = new Map(days.map((d) => [d.day, d]));
  const end = new Date(today + "T12:00:00Z");
  const start = new Date(end); start.setUTCDate(start.getUTCDate() - 7 * 15 - ((end.getUTCDay() + 6) % 7));
  const cols: { day: string; score: number; d?: (typeof days)[number] }[][] = [];
  for (let c = 0; c < 16; c++) {
    const col = [];
    for (let r = 0; r < 7; r++) {
      const dt = new Date(start); dt.setUTCDate(start.getUTCDate() + c * 7 + r);
      const key = dt.toISOString().slice(0, 10);
      const d = by.get(key);
      col.push({ day: key, d, score: d ? d.questions + d.reviews + d.lessons * 10 : -1 });
    }
    cols.push(col);
  }
  const level = (s: number) => (s <= 0 ? 0 : s < 10 ? 1 : s < 25 ? 2 : s < 50 ? 3 : 4);
  const fill = ["var(--raised)", "color-mix(in srgb, var(--signal) 28%, var(--raised))", "color-mix(in srgb, var(--signal) 50%, var(--raised))", "color-mix(in srgb, var(--signal) 75%, var(--raised))", "var(--signal)"];
  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="grid grid-flow-col grid-rows-7 gap-[3px]" role="img" aria-label={`Study activity over the last 16 weeks: ${days.length} active days`}>
        {cols.flat().map((c) => (
          <span key={c.day} className="h-3 w-3 rounded-[3px]" style={{ background: c.day > today ? "transparent" : fill[level(c.score)] }}
            title={c.day > today ? "" : `${c.day}: ${c.d ? `${c.d.questions} questions, ${c.d.reviews} reviews, ${c.d.lessons} lessons` : "no study"}`} />
        ))}
      </div>
      <div className="flex items-center gap-1 text-[11px] text-faint" aria-hidden>less{fill.map((f, i) => <span key={i} className="h-2.5 w-2.5 rounded-[2px]" style={{ background: f }} />)}more</div>
    </div>
  );
}
