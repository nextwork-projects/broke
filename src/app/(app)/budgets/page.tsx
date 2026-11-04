import { SlidersHorizontal } from "lucide-react";
import { AskButton } from "@/components/Assistant";
import { BudgetEditor, type BudgetCat } from "@/components/BudgetEditor";
import { EmptyBank } from "@/components/EmptyBank";
import { budgetContext, suggest, type MonthSpend } from "@/lib/budget";
import { categories, getUser, isSpend, moneyByMonth, sumOf, today, transactionsSince, typicalMonthly } from "@/lib/data";
import { monthStart, ymd } from "@/lib/format";

// Budgets: tracked against this month with a pace marker; suggestions come from the last 3 full months,
// never below this month's spending so far. Income is the typical month every page shows (typicalMonthly).
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const nextDay = (d: string) => new Date(Date.parse(`${d}T00:00:00Z`) + 864e5).toISOString().slice(0, 10);

export default async function Budgets({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const sp = await searchParams;
  const from = DAY.test(sp.from ?? "") ? sp.from! : "", to = DAY.test(sp.to ?? "") ? sp.to! : "";
  const { supabase, user } = await getUser();
  const now = await today();
  const thisMonth = ymd(monthStart(now)).slice(0, 7);
  const lastMonth = ymd(monthStart(now, -1)).slice(0, 7);
  const [txns, cats, saved, typical] = await Promise.all([
    moneyByMonth(supabase, ymd(monthStart(now, -Math.max(3, now.getUTCMonth())))), // own rows, totalled in SQL: 3 months, or back to January
    categories(),
    supabase.from("budgets").select("category_id, amount"),
    typicalMonthly(supabase, user!.id, ymd(now)),
  ]);

  const threeMonthsAgo = ymd(monthStart(now, -3)).slice(0, 7);
  const past = txns.filter((r) => !r.month.startsWith(thisMonth) && r.month.slice(0, 7) >= threeMonthsAgo);
  const monthsOfData = Math.max(1, new Set(past.map((r) => r.month.slice(0, 7))).size);
  const sum = (catId: string, month?: string) =>
    sumOf((month ? txns : past).filter((r) => r.category_id === catId && (!month || r.month.startsWith(month))), (r) => r.spend);
  const income = typical?.income ?? 0;

  const rows: BudgetCat[] = cats
    .filter((c) => c.kind === "spend")
    .map((c) => {
      const avg = sum(c.id) / monthsOfData;
      const spent = sum(c.id, thisMonth);
      return { id: c.id, label: c.label, icon: c.icon, color: c.color, spent, last: sum(c.id, lastMonth), avg, suggested: suggest(avg, spent), main: c.key !== "BANK_FEES" && Math.max(avg, spent) >= 10 };
    });
  // Each month of this year, spend by category, for the year view.
  const year = String(now.getUTCFullYear());
  const yearMonths: MonthSpend[] = Array.from({ length: now.getUTCMonth() + 1 }, (_, i) => {
    const month = `${year}-${String(i + 1).padStart(2, "0")}`;
    const cats: Record<string, number> = {};
    for (const r of txns) if (r.month.startsWith(month) && r.spend > 0) cats[r.category_id] = (cats[r.category_id] ?? 0) + r.spend;
    return { month, cats };
  });
  // Custom dates: spend per category in the range, added up from the transactions. An open start begins at the first one.
  const end = to || ymd(now);
  const rangeTxns = from || to ? (await transactionsSince(from || "2000-01-01", nextDay(end))).filter(isSpend) : [];
  const range = from || to ? {
    from, to, start: from || rangeTxns.map((t) => t.date).sort()[0] || end, end,
    spent: rangeTxns.reduce<Record<string, number>>((m, t) => (t.category_id ? { ...m, [t.category_id]: (m[t.category_id] ?? 0) + t.amount } : m), {}),
  } : null;
  const budgets = Object.fromEntries((saved.data ?? []).map((b) => [b.category_id, Number(b.amount)]));

  if (!txns.length && !Object.keys(budgets).length)
    return <EmptyBank title="A budget built from your real spending" body="Link a bank and broke suggests a monthly amount for each category from your last 3 months." />;

  return (
    // The key takes in saved changes from elsewhere (the AI's Apply) on refresh.
    <BudgetEditor key={JSON.stringify(budgets) + (range ? `${from}|${to}` : "")} cats={rows} initial={budgets} year={yearMonths} range={range} today={ymd(now)} income={Math.round(income)} now={now.toISOString()} tableMissing={!!saved.error} aside={
      <AskButton
        q={`Look at my budget, my income and my last 3 months of spending. Which categories should I lower, by how much, and what would that free up each month?${budgetContext(rows.filter((c) => c.id in budgets).map((c) => [c.label, budgets[c.id]]))}`}
        className="card-link w-full p-5 text-left flex items-center gap-4"
      >
        <span className="size-10 rounded-2xl border border-line text-muted grid place-items-center shrink-0"><SlidersHorizontal size={18} strokeWidth={1.6} /></span>
        <span>
          <span className="block font-medium">Ask AI to tune my budget</span>
          <span className="block text-sm text-muted">It compares your budget with what you really spend and suggests where to cut.</span>
        </span>
      </AskButton>
    } />
  );
}
