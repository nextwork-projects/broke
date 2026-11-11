// Charges and pay that repeat, found from your own transactions: works for imported statements, bank feeds and hand-added
// accounts, which Plaid's recurring detection never sees, and catches what Plaid misses. Pure, no "@/" imports:
// `node src/lib/recurring-find.test.ts` runs it.

export type FindRow = { name: string; date: string; amount: number; category: string | null }; // amount > 0 = money out
export type Found = {
  key: string; // direction + cleaned name: one stream per merchant and direction
  merchant: string;
  frequency: "WEEKLY" | "BIWEEKLY" | "MONTHLY" | "QUARTERLY" | "ANNUALLY";
  average: number;
  last_amount: number;
  last_date: string;
  next_date: string;
  is_income: boolean;
  status: "MATURE" | "EARLY_DETECTION" | "TOMBSTONED";
  category: string | null;
};

const EVERY = [
  { frequency: "WEEKLY", days: 7, slack: 2 },
  { frequency: "BIWEEKLY", days: 14, slack: 3 },
  { frequency: "MONTHLY", days: 30.4, slack: 4 },
  { frequency: "QUARTERLY", days: 91, slack: 10 },
  { frequency: "ANNUALLY", days: 365, slack: 15 },
] as const;
// Everyday spending repeats without being a bill (the same grocery store each Saturday). Those count only when the
// amount is the same every time, like a subscription billed through a store.
const EVERYDAY = new Set(["FOOD_AND_DRINK", "GROCERIES", "GENERAL_MERCHANDISE", "TRANSPORTATION", "TRAVEL", "PERSONAL_CARE"]);
const SKIP = new Set(["TRANSFER_IN", "TRANSFER_OUT"]);

const mid = (ns: number[]) => { const s = [...ns].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const day = (d: string) => Date.parse(`${d}T00:00:00Z`) / 864e5;
const ymd = (n: number) => new Date(Math.round(n) * 864e5).toISOString().slice(0, 10);
/** "SPOTIFY USA #1234 NY" and "Spotify" become the same merchant. */
export const cleanName = (s: string) => s.toLowerCase().replace(/[#*]\s*\w*\d\w*/g, " ").replace(/\d{3,}/g, " ").replace(/[^a-z&' ]+/g, " ").replace(/\s+/g, " ").trim();

const MONTHS: Record<string, number> = { MONTHLY: 1, QUARTERLY: 3, ANNUALLY: 12 };
/** Next date on or after today on this rhythm, from the last charge. Month-based ones keep their day of the month. */
export function nextAfter(last: string, frequency: Found["frequency"], today: string) {
  const months = MONTHS[frequency];
  const [y, m, d] = last.split("-").map(Number);
  for (let i = 1; ; i++) {
    let next: string;
    if (months) {
      const t = new Date(Date.UTC(y, m - 1 + i * months, 1));
      const dim = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
      next = ymd(day(t.toISOString().slice(0, 10)) + Math.min(d, dim) - 1); // the 31st becomes the 30th in a short month
    } else next = ymd(day(last) + i * (frequency === "WEEKLY" ? 7 : 14));
    if (next >= today) return next;
  }
}

export function findRecurring(rows: FindRow[], today: string): Found[] {
  const groups = new Map<string, FindRow[]>();
  for (const r of rows) {
    if (!r.amount || (r.category && SKIP.has(r.category))) continue;
    const name = cleanName(r.name);
    if (!name) continue;
    const key = `${r.amount < 0 ? "in" : "out"}:${name}`;
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  const out: Found[] = [];
  for (const [key, rs] of groups) {
    const sorted = [...rs].sort((a, b) => a.date.localeCompare(b.date));
    // Two charges on one day count once (a split payment), so the gaps stay true.
    const dates = [...new Set(sorted.map((r) => r.date))];
    if (dates.length < 2) continue;
    const gaps = dates.slice(1).map((d, i) => day(d) - day(dates[i]));
    const gap = mid(gaps);
    const every = EVERY.find((e) => Math.abs(gap - e.days) <= e.slack);
    if (!every) continue;
    // Enough of a pattern: 3 for weekly to quarterly, 2 for yearly. Most gaps on the rhythm, not just the middle one.
    if (dates.length < (every.frequency === "ANNUALLY" ? 2 : 3)) continue;
    if (gaps.filter((g) => Math.abs(g - every.days) <= every.slack).length < Math.ceil(gaps.length * 0.7)) continue;
    const amounts = sorted.map((r) => Math.abs(r.amount));
    const typical = mid(amounts);
    const near = (pct: number) => amounts.filter((a) => Math.abs(a - typical) <= typical * pct).length >= Math.ceil(amounts.length * 0.8);
    // The category most of its charges are filed under.
    const counts = new Map<string | null, number>();
    for (const r of sorted) counts.set(r.category, (counts.get(r.category) ?? 0) + 1);
    const category = [...counts].sort((a, b) => b[1] - a[1])[0][0];
    // A bill can vary (electricity); everyday spending has to be the same amount to count.
    if (!(category && EVERYDAY.has(category) ? near(0.03) : near(0.4))) continue;
    const last = sorted[sorted.length - 1];
    const overdue = day(today) - day(last.date);
    const status = overdue > every.days * 2 + every.slack ? "TOMBSTONED" : dates.length >= 3 ? "MATURE" : "EARLY_DETECTION";
    out.push({
      key,
      merchant: last.name.trim(),
      frequency: every.frequency,
      average: Math.round((amounts.reduce((s, a) => s + a, 0) / amounts.length) * 100) / 100,
      last_amount: Math.abs(last.amount),
      last_date: last.date,
      next_date: nextAfter(last.date, every.frequency, today),
      is_income: last.amount < 0,
      status,
      category,
    });
  }
  return out.sort((a, b) => a.next_date.localeCompare(b.next_date));
}
