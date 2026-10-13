// Formatting helpers shared by server and client components (no "use client": safe to call anywhere).
const NUMBER_WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight"];

/** The real exam states how many options to pick ("Choose two."). */
export function chooseText(n: number | null | undefined): string {
  return n ? `Choose ${NUMBER_WORDS[n] ?? n}.` : "Select all that apply.";
}

export function relativeDay(iso: string | Date): string {
  const ms = new Date(iso).getTime() - Date.now();
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `in ${Math.max(1, mins)} min`;
  const hours = Math.round(mins / 60);
  if (hours < 30) return `in ${hours} h`;
  return `in ${Math.round(hours / 24)} days`;
}

export function timeAgo(d: Date | string): string {
  const m = Math.round((Date.now() - new Date(d).getTime()) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const days = Math.round(h / 24);
  return days < 45 ? `${days} d ago` : new Date(d).toISOString().slice(0, 10);
}

export function clock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}` : `${m}:${String(sec).padStart(2, "0")}`;
}

export function minutesText(totalSeconds: number): string {
  const m = Math.round(totalSeconds / 60);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`;
}

export function shortDate(d: Date | string): string {
  const iso = new Date(d).toISOString().slice(0, 10);
  return `${dayMonth(iso)} ${iso.slice(0, 4)}`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
/** "13 Oct" from "YYYY-MM-DD" — locale-independent, so server and browser render identical text (no hydration drift). */
export function dayMonth(isoDay: string): string {
  const [, m, d] = isoDay.slice(0, 10).split("-").map(Number);
  return `${d} ${MONTHS[m - 1]}`;
}
/** "Tue 13 Oct" from "YYYY-MM-DD". */
export function weekdayDayMonth(isoDay: string): string {
  const dt = new Date(isoDay.slice(0, 10) + "T12:00:00Z");
  return `${WEEKDAYS[dt.getUTCDay()]} ${dayMonth(isoDay)}`;
}
