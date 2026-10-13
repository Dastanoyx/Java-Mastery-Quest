// Calendar helpers in the learner's time zone. Days are ISO strings "YYYY-MM-DD".
import { DAY_MS } from "./types.ts";

export function dayKey(d: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function addDays(day: string, n: number): string {
  const t = Date.UTC(+day.slice(0, 4), +day.slice(5, 7) - 1, +day.slice(8, 10)) + n * DAY_MS;
  return new Date(t).toISOString().slice(0, 10);
}

export function daysBetween(a: string, b: string): number {
  const ta = Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10));
  const tb = Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10));
  return Math.round((tb - ta) / DAY_MS);
}

/** Offset (ms) of `timeZone` at instant `d`: local wall time − UTC. */
function tzOffsetMs(d: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(d);
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return asUtc - Math.floor(d.getTime() / 1000) * 1000;
}

/** The UTC instant at which local day `day` starts in `timeZone`. */
export function startOfDay(day: string, timeZone: string): Date {
  const guess = Date.UTC(+day.slice(0, 4), +day.slice(5, 7) - 1, +day.slice(8, 10));
  let t = guess - tzOffsetMs(new Date(guess), timeZone);
  t = guess - tzOffsetMs(new Date(t), timeZone); // second pass handles DST changes near midnight
  return new Date(t);
}

/** Monday of the ISO week containing `day`. */
export function weekStart(day: string): string {
  const dow = new Date(day + "T00:00:00Z").getUTCDay(); // 0 = Sunday
  return addDays(day, -((dow + 6) % 7));
}
