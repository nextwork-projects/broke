// The dashboard spend chart's time periods: each compared with the same-length period before it.
// Dates are UTC-midnight Dates of the user's calendar (see today() in data.ts). No "@/" imports: periods.test.ts runs in node.
export type Period = "week" | "month" | "3m" | "year";
export const PERIODS: { id: Period; label: string }[] = [
  { id: "week", label: "Week" },
  { id: "month", label: "Month" },
  { id: "3m", label: "3 months" },
  { id: "year", label: "Year" },
];
export const asPeriod = (v?: string | null): Period => (PERIODS.some((p) => p.id === v) ? (v as Period) : "month");

const DAY = 864e5;
const add = (d: Date, days: number) => new Date(d.getTime() + days * DAY);
const daysBetween = (a: Date, b: Date) => Math.round((b.getTime() - a.getTime()) / DAY);
const short = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const ord = (n: number) => `${n}${n % 10 === 1 && n !== 11 ? "st" : n % 10 === 2 && n !== 12 ? "nd" : n % 10 === 3 && n !== 13 ? "rd" : "th"}`;

export type Window = {
  start: Date; prevStart: Date; n: number; elapsed: number;
  end: number; // days from start that count. n, except "last 90 days": it ends today, so it takes a row dated tomorrow too

  ticks: [string, number][]; names: { cur: string; prev: string }; vs: string; point: (i: number) => string;
};

export function periodWindow(p: Period, today: Date): Window {
  if (p === "week") {
    const start = add(today, -((today.getUTCDay() + 6) % 7)); // Monday
    const names = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    return { start, prevStart: add(start, -7), n: 7, end: 7, elapsed: daysBetween(start, today) + 1, ticks: names.map((l, i) => [l, i] as [string, number]),
      names: { cur: "This week", prev: "Last week" }, vs: "last week", point: (i) => names[i] };
  }
  if (p === "3m") {
    const start = add(today, -89);
    return { start, prevStart: add(start, -90), n: 90, end: 91, elapsed: 90, ticks: [0, 30, 60, 89].map((i) => [short(add(start, i)), i] as [string, number]),
      names: { cur: "Last 90 days", prev: "90 days before" }, vs: "the 90 days before", point: (i) => short(add(start, i)) };
  }
  if (p === "year") {
    const start = new Date(Date.UTC(today.getUTCFullYear(), 0, 1));
    const months = [0, 3, 6, 9].map((m) => [new Date(Date.UTC(2000, m, 1)).toLocaleDateString("en-US", { month: "short", timeZone: "UTC" }), daysBetween(start, new Date(Date.UTC(today.getUTCFullYear(), m, 1)))] as [string, number]);
    return { start, prevStart: new Date(Date.UTC(today.getUTCFullYear() - 1, 0, 1)), n: 366, end: 366, elapsed: daysBetween(start, today) + 1, ticks: [...months, ["Dec 31", 365]],
      names: { cur: "This year", prev: "Last year" }, vs: "this time last year", point: (i) => short(add(start, i)) };
  }
  const start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  return { start, prevStart: new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1)), n: 31, end: 31, elapsed: today.getUTCDate(),
    ticks: [["1st", 0], ["8th", 7], ["15th", 14], ["22nd", 21], ["31st", 30]], names: { cur: "This month", prev: "Last month" }, vs: "last month", point: (i) => ord(i + 1) };
}

/** Running total of daily spend from `from`, n points long. Days outside the window are ignored.
 * upTo: points to return (days elapsed). A row dated after the user's today but inside the window counts in this
 * period, on today's point, the same way the Spending page (SQL, by date) counts it. Plaid can date rows "tomorrow". */
export function cumulative(daily: { day: string; spend: number }[], from: Date, n: number, upTo = n) {
  const out = Array<number>(upTo).fill(0);
  for (const r of daily) {
    const i = daysBetween(from, new Date(r.day + "T00:00:00Z"));
    if (i >= 0 && i < n) out[Math.min(i, upTo - 1)] += r.spend;
  }
  for (let i = 1; i < upTo; i++) out[i] += out[i - 1];
  return out;
}

/** Whether "You've spent $X more than last month" means anything. The previous period needs spending on at least
 * half as many days as this period has so far, and $50 or more in all. A user whose history starts mid-month
 * otherwise gets "$5,819 more than last month" against a month with almost no data. */
export function comparable(daily: { day: string; spend: number }[], w: Window, today: Date) {
  const days = (a: Date, b: Date) => daily.filter((r) => r.spend > 0 && new Date(r.day + "T00:00:00Z") >= a && new Date(r.day + "T00:00:00Z") < b);
  const prev = days(w.prevStart, w.start);
  const cur = days(w.start, add(today, 2)); // through tomorrow: rows dated ahead count in this period
  return new Set(prev.map((r) => r.day)).size >= new Set(cur.map((r) => r.day)).size / 2 && prev.reduce((s, r) => s + r.spend, 0) >= 50;
}
