import { NextResponse } from "next/server";
import { allRows, getUser, moneyByMonth, today as userToday } from "@/lib/data";
import { firstFact } from "@/lib/first-fact";
import { dateLabel, FREQ_PER_MONTH, money0, monthStart, ymd } from "@/lib/format";
import { typicalMonth } from "@/lib/insights";

const BILL = new Set(["RENT_AND_UTILITIES", "LOAN_PAYMENTS"]); // the Recurring page's bills; the rest are subscriptions

type Stream = { merchant_name: string; frequency: string; average_amount: number; is_income: boolean; next_date: string | null; category: { key: string } | null };

// Everything onboarding needs in one parallel round: linked accounts and the first-result fact.
// status: "none" (nothing linked), "importing" (a connection hasn't sent rows yet), "thin" (too little history), "ready".
export async function GET() {
  const { supabase, user } = await getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const uid = user.id;
  const now = await userToday();
  const today = ymd(now);
  const since90 = ymd(new Date(now.getTime() - 90 * 864e5));
  const [{ data: items }, { data: accts }, { data: streams }, { data: cats }, { data: first }, rows, interest] = await Promise.all([
    supabase.from("plaid_items").select("id, last_synced_at").eq("user_id", uid),
    supabase.from("accounts").select("id, type, manual").eq("user_id", uid),
    supabase.from("recurring").select("merchant_name, frequency, average_amount:home_average, is_income, next_date, category:categories(key)").eq("user_id", uid).eq("active", true).neq("status", "TOMBSTONED"),
    supabase.from("categories").select("id, label"),
    supabase.from("transactions").select("date").eq("user_id", uid).order("date").limit(1),
    moneyByMonth(supabase, ymd(monthStart(now, -3))),
    // Card or loan interest, the For you page's rule.
    allRows<{ amount: number }>((a, b) => supabase.from("transactions").select("amount").eq("user_id", uid).eq("ignored", false).gt("amount", 0).gte("date", since90)
      .or("plaid_category.eq.BANK_FEES_INTEREST_CHARGE,name.ilike.*interest charge*").order("id").range(a, b)),
  ]);

  // Linked or imported from a statement (a manual depository account), not the debts typed in below.
  const own = (accts ?? []).filter((a) => a.type !== "investment" && (!a.manual || a.type === "depository"));
  const s = (streams ?? []) as unknown as Stream[];
  const base = { accounts: own.length };

  const oldest = (first?.[0]?.date as string | undefined) ?? null;
  if (!(items ?? []).length && !own.length) return NextResponse.json({ ...base, status: "none" });
  if ((items ?? []).some((i) => !i.last_synced_at) || !oldest) return NextResponse.json({ ...base, status: "importing" });

  // The biggest category in the last full month the history covers, against its average over the full months before it.
  const ym = (k: number) => ymd(monthStart(now, -k)).slice(0, 7);
  const covered = [1, 2, 3].map(ym).filter((m) => `${m}-01` >= oldest);
  const spentIn = (m: string) => {
    const by = new Map<string, number>();
    for (const r of rows) if (r.month.slice(0, 7) === m && r.spend > 0) by.set(r.category_id, (by.get(r.category_id) ?? 0) + r.spend);
    return by;
  };
  let top = null;
  if (covered.length) {
    const [last, ...before] = covered;
    const best = [...spentIn(last)].sort((a, b) => b[1] - a[1])[0];
    if (best) {
      const earlier = before.map(spentIn).filter((by) => by.size);
      top = {
        id: best[0], label: (cats ?? []).find((c) => c.id === best[0])?.label ?? "Other", month: dateLabel(`${last}-01`, { month: "long" }), spent: best[1],
        typical: earlier.length ? earlier.reduce((t, by) => t + (by.get(best[0]) ?? 0), 0) / earlier.length : null,
      };
    }
  }
  const typical = typicalMonth(rows, today, oldest);
  const subs = s.filter((x) => !x.is_income && !BILL.has(x.category?.key ?? "")).map((x) => ({ monthly: x.average_amount * (FREQ_PER_MONTH[x.frequency] ?? 0) }));
  const fact = firstFact({ typical, interest90: interest.reduce((t, r) => t + Number(r.amount), 0), subs, top }, (n) => money0(n));
  return NextResponse.json({ ...base, status: fact ? "ready" : "thin", fact });
}
