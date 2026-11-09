// Pay that landed in the wrong category: money coming in from the same name, regularly, at about the same amount,
// filed as anything but income. Pure, no "@/" imports: `node src/lib/pay.test.ts` runs it.

export type PayRow = { name: string; date: string; amount: number; kind: string | null }; // amount < 0 is money in
export type PayGuess = { name: string; typical: number; every: "week" | "2 weeks" | "month"; count: number };

const mid = (ns: number[]) => [...ns].sort((a, b) => a - b)[Math.floor(ns.length / 2)];

export function payGuess(rows: PayRow[], skip: string[] = []): PayGuess | null {
  const by = new Map<string, PayRow[]>();
  for (const r of rows) {
    if (r.amount >= -200 || r.kind === "income" || r.kind === "transfer" || skip.includes(r.name)) continue;
    by.set(r.name, [...(by.get(r.name) ?? []), r]);
  }
  const found: PayGuess[] = [];
  for (const [name, rs] of by) {
    if (rs.length < 2) continue;
    const amounts = rs.map((r) => -r.amount), typical = mid(amounts);
    if (amounts.some((a) => Math.abs(a - typical) > typical * 0.25)) continue; // pay is about the same each time
    const days = [...rs].sort((a, b) => a.date.localeCompare(b.date)).map((r) => Date.parse(r.date) / 864e5);
    const gap = mid(days.slice(1).map((d, i) => d - days[i]));
    const every = gap >= 5 && gap <= 9 ? "week" : gap >= 12 && gap <= 17 ? "2 weeks" : gap >= 26 && gap <= 35 ? "month" : null;
    if (every) found.push({ name, typical: Math.round(typical), every, count: rs.length });
  }
  // The biggest by month: that's the main pay.
  const monthly = (p: PayGuess) => p.typical * (p.every === "week" ? 52 : p.every === "2 weeks" ? 26 : 12);
  return found.sort((a, b) => monthly(b) - monthly(a))[0] ?? null;
}
