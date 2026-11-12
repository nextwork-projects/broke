// Pure budget maths. No "@/" imports so `node src/lib/budget.test.ts` can run it.

// Nudge size and rounding step grow with the amount: $10 under $200, $25 under $1,000, then $50.
export const step = (n: number) => (n < 200 ? 10 : n < 1000 ? 25 : 50);

// A suggested budget: the average rounded up to the next step.
export const roundUp = (n: number) => (n > 0 ? Math.ceil(n / step(n)) * step(n) : 0);

// The middle value: one unusual month (a holiday, a big repair) doesn't set the budget. Averages the middle two when even.
export function median(ns: number[]) {
  if (!ns.length) return 0;
  const s = [...ns].sort((a, b) => a - b), mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

// "August, September and October" from ["2026-10", "2026-08", "2026-09"].
export function monthList(months: string[]) {
  const names = [...months].sort().map((m) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString("en-US", { month: "long", timeZone: "UTC" }));
  return names.length <= 1 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

// A suggested budget for a category: the 3-month average, but never below what is already spent this month, rounded up.
// "Use these" never puts the user over budget on day one.
export const suggest = (avg: number, spentThisMonth: number) => roundUp(Math.max(avg, spentThisMonth));

// A budget is "well off" when it is $25 and a fifth or more away from the suggested amount. Small gaps are noise.
export const wellOff = (budget: number, suggested: number) => suggested > 0 && Math.abs(budget - suggested) >= Math.max(25, budget * 0.2);

// What the Suggest sheet offers: budgets well off from real spending (biggest gap first), then main categories with no budget.
export function retune<C extends { id: string; suggested: number; main: boolean }>(cats: C[], budgets: Record<string, number>): C[] {
  const off = cats.filter((c) => c.id in budgets && wellOff(budgets[c.id], c.suggested)).sort((a, b) => Math.abs(b.suggested - budgets[b.id]) - Math.abs(a.suggested - budgets[a.id]));
  const fresh = cats.filter((c) => c.main && !(c.id in budgets)).sort((a, b) => b.suggested - a.suggested);
  return [...off, ...fresh];
}

// Where the month is: today counts as a day left.
export function month(now: Date) {
  const day = now.getUTCDate();
  const days = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate();
  return { day, days, left: days - day + 1, pace: day / days };
}

// Which month budgets show first: last month for the first 3 days of a new one, when there's anything to show,
// since this month's bars are still empty.
export const startPeriod = (day: number, lastMonthSpent: number): "this" | "last" => (day <= 3 && lastMonthSpent > 0 ? "last" : "this");

// What you can spend per day for the rest of the month without going over.
export const perDay = (budget: number, spent: number, daysLeft: number) => Math.max(0, budget - spent) / Math.max(1, daysLeft);

// Bar state: amber from 85% used, red once over.
export const tone = (spent: number, budget: number): "ok" | "near" | "over" =>
  spent - budget >= 1 ? "over" : budget > 0 && spent >= budget * 0.85 ? "near" : "ok"; // cents over isn't over: it reads "$0 over"

// Apply changes to a budget map; null removes a category.
export function merge(cur: Record<string, number>, changes: Record<string, number | null>) {
  const next = { ...cur };
  for (const [k, v] of Object.entries(changes)) if (v === null) delete next[k];
  else next[k] = v;
  return next;
}

// A budget change the AI proposed ({ "Category label": amount, or null to remove }), checked against the user's
// categories. Labels match without case. amount null on an unknown label, or anything not a sane number, is dropped.
// An unknown label with an amount is a new category (id null). Nothing here saves: the user presses Apply first.
export type BudgetChange = { id: string | null; label: string; from: number | null; to: number | null };
export function budgetChanges(proposed: Record<string, unknown>, cats: { id: string; label: string }[], current: Record<string, number>): BudgetChange[] {
  const out: BudgetChange[] = [];
  for (const [label, v] of Object.entries(proposed)) {
    const name = label.trim().slice(0, 40);
    const c = cats.find((x) => x.label.toLowerCase() === name.toLowerCase());
    const from = c && c.id in current ? current[c.id] : null;
    if (v === null) {
      if (c && from !== null) out.push({ id: c.id, label: c.label, from, to: null });
    } else if (name && typeof v === "number" && v >= 0 && v < 1e8) {
      const to = Math.round(v);
      if (to !== from) out.push({ id: c?.id ?? null, label: c?.label ?? name, from, to });
    }
  }
  return out;
}

// Goes with a budget request so the AI uses the exact names. The chat bubble hides it (BUDGET_CONTEXT).
export const budgetContext = (rows: [string, number][]) => `\n\nMy monthly budgets now: ${rows.map(([l, n]) => `${l} ${n}`).join(", ") || "none yet"}. Offer any change as a budget block.`;
export const BUDGET_CONTEXT = /\n\nMy monthly budgets now: [\s\S]*$/;

// Spend against budget for each month so far this year, for all budgets or one category. Budgets have no history, so every
// month is held against today's amount. Months before the first spending are left out.
export type MonthSpend = { month: string; cats: Record<string, number> }; // month: "YYYY-MM"
export function yearView(months: MonthSpend[], budgets: Record<string, number>, only: string | null) {
  const ids = only ? [only] : Object.keys(budgets);
  const budget = ids.reduce((s, id) => s + (budgets[id] ?? 0), 0);
  const rows = [...months].sort((a, b) => a.month.localeCompare(b.month)).map((m) => ({ month: m.month, budget, spent: ids.reduce((s, id) => s + (m.cats[id] ?? 0), 0) }));
  const first = rows.findIndex((r) => r.spent > 0);
  const shown = first < 0 ? [] : rows.slice(first);
  return { rows: shown, spent: shown.reduce((s, r) => s + r.spent, 0), budget: budget * shown.length };
}

// Days in a custom range, both ends counted, and a monthly budget scaled to them (an average month is 30.44 days).
export const daysBetween = (from: string, to: string) => Math.max(1, Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 864e5) + 1);
export const scaleBudget = (monthly: number, days: number) => (monthly * days) / 30.44;
