// Home's numbers that aren't plain totals: the cash line, the forecast to payday, the usual week and the day words.
// Pure, so `node src/lib/home.test.ts` runs it. Dates are "YYYY-MM-DD"; amounts follow broke's sign rule (money out > 0).

export type Point = { date: string; value: number };

const DAY = 864e5;
export const addDays = (iso: string, n: number) => new Date(Date.parse(iso + "T00:00:00Z") + n * DAY).toISOString().slice(0, 10);
export const daysBetween = (a: string, b: string) => Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / DAY);

/** End-of-day balance for each of the last `days` days, walked back from today's balance through the rows that moved it. */
export function cashSeries(balance: number, rows: { date: string; amount: number }[], today: string, days: number): Point[] {
  const byDay = new Map<string, number>();
  for (const r of rows) {
    const d = r.date > today ? today : r.date;
    byDay.set(d, (byDay.get(d) ?? 0) + r.amount);
  }
  const out: Point[] = [];
  let v = balance;
  for (let i = 0; i < days; i++) {
    const d = addDays(today, -i);
    out.push({ date: d, value: v });
    v += byDay.get(d) ?? 0; // the day before: undo this day's money out (+) and money in (-)
  }
  return out.reverse();
}

/** Today's balance carried forward through the bills due before the next pay, then the pay itself. Null when nothing is due. */
export function forecast(balance: number, today: string, bills: { date: string; amount: number }[], pay: { date: string; amount: number } | null, horizon = 14): Point[] | null {
  const end = pay && daysBetween(today, pay.date) > 0 && daysBetween(today, pay.date) <= 31 ? pay.date : addDays(today, horizon);
  const due = bills.filter((b) => b.date > today && b.date <= end).sort((a, b) => a.date.localeCompare(b.date));
  if (!due.length && !(pay && pay.date === end)) return null;
  const pts: Point[] = [{ date: today, value: balance }];
  let v = balance;
  for (const b of due) {
    v -= b.amount;
    pts.push({ date: b.date, value: v });
  }
  if (pay && pay.date === end) pts.push({ date: end, value: v + pay.amount });
  else if (pts[pts.length - 1].date !== end) pts.push({ date: end, value: v });
  return pts;
}

/** Money in and out over the last `days` days, today included. Out leaves transfers to the caller (pass spend rows only). */
export function flows(rows: { date: string; amount: number }[], today: string, days: number) {
  const since = addDays(today, -(days - 1));
  let into = 0, out = 0;
  for (const r of rows) {
    if (r.date < since) continue;
    if (r.amount < 0) into -= r.amount;
    else out += r.amount;
  }
  return { into, out };
}

/** Spend over the last 7 days against the user's usual week: the weekly average of the 8 weeks before it. Null until there are 4 weeks of history. */
export function weekVsUsual(spend: { date: string; amount: number }[], today: string, firstDate: string | null) {
  const weekStart = addDays(today, -6), histStart = addDays(today, -62);
  const thisWeek = spend.filter((r) => r.date >= weekStart).reduce((s, r) => s + r.amount, 0);
  const from = firstDate && firstDate > histStart ? firstDate : histStart;
  const histDays = daysBetween(from, weekStart);
  if (histDays < 28) return null;
  const hist = spend.filter((r) => r.date >= from && r.date < weekStart).reduce((s, r) => s + r.amount, 0);
  const usual = (hist / histDays) * 7;
  return usual > 0 ? { thisWeek, usual } : null;
}

/** "Today", "Yesterday", "Tomorrow", "in 3 days", else null so the caller shows the date. */
export function relDay(date: string, today: string) {
  const n = daysBetween(today, date);
  if (n === 0) return "Today";
  if (n === -1) return "Yesterday";
  if (n === 1) return "Tomorrow";
  if (n > 1 && n < 14) return `in ${n} days`;
  return null;
}
