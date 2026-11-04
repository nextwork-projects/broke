import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cache } from "react";
import { getUser, moneyByMonth, sumOf, typicalMonthly, today as userToday } from "@/lib/data";
import { todayIn, ymd } from "@/lib/format";
import { isContribution } from "@/lib/invest";
import { addDays, idleCash, matchCheck, safeToSpend, type Acct, type Stream } from "@/lib/insights";

// Loads what the cash insights need and runs the math. Shared by the pages and the AI tools.
// Own accounts, streams and transactions only: a partner's shared accounts are not the viewer's cash.
// The AI tools may leave out userId (looked up) and today (New York date when there is no request cookie).
export async function cashInsights(supabase: SupabaseClient, profile?: { match?: string; income?: string }, opts: { userId?: string; today?: string } = {}) {
  const today = opts.today ?? todayIn();
  const uid = opts.userId ?? (await supabase.auth.getUser()).data.user?.id;
  if (!uid) throw new Error("Not signed in");
  const start = addDays(today, -90);
  const [{ data: accts }, { data: streams }, rows, { data: first }, typical] = await Promise.all([
    supabase.from("accounts").select(ACCT_COLS).eq("user_id", uid),
    supabase.from("recurring").select("merchant_name, frequency, average_amount:home_average, next_date, is_income").eq("active", true).eq("user_id", uid),
    moneyByMonth(supabase, start),
    supabase.from("transactions").select("date").eq("user_id", uid).gte("date", start).order("date").limit(1),
    typicalMonthly(supabase, uid, today),
  ]);
  const a = toHome((accts ?? []) as (Acct & { id: string; bank_balance: number | null })[]);
  const s = (streams ?? []) as Stream[];

  // Average monthly spend over the history we have, up to 90 days.
  const oldest = first?.[0]?.date ?? today;
  const months = Math.min(3, Math.max(1, (Date.parse(today) - Date.parse(oldest)) / 864e5 / 30));
  const monthlySpend = sumOf(rows, (r) => r.spend) / months;

  // 401(k) contributions in the last year, if investment transactions are synced (migration 0007). Missing table or no rows = unknown.
  // ponytail: counts every "contribution" row, so an employer match synced the same way inflates it; split by name if Plaid data shows both.
  let contributed: number | null = null;
  const plan = a.filter((x) => x.included && /401k|403b|457b/.test(x.subtype ?? "")).map((x) => x.id);
  if (plan.length) {
    const { data, error } = await supabase.from("investment_transactions").select("type, subtype, amount").in("account_id", plan).gte("date", addDays(today, -365));
    const rows = (data ?? []).map((x) => ({ ...x, amount: Number(x.amount) })).filter(isContribution); // same rule as the contribution tracker
    if (!error && rows.length) contributed = rows.reduce((n, x) => n + Math.abs(x.amount), 0);
  }

  return {
    today,
    monthlySpend,
    safe: safeToSpend(a, s, today),
    idle: idleCash(a, monthlySpend),
    typicalIncome: typical?.income ?? null,
    typical, // income and spend of a typical month (typicalMonth), null until there's enough history
    streams: s,
    match: matchCheck(profile, s, typical?.income ?? null, contributed),
  };
}

// Balances in the home currency (migration 0015): available_balance gets the same rate as the account's balance.
// Rows selected as "current_balance:home_balance, bank_balance:balance, available_balance".
export const ACCT_COLS = "id, type, subtype, current_balance:home_balance, bank_balance:balance, available_balance, included";
export const toHome = <T extends Acct & { bank_balance: number | null }>(accts: T[]) => accts.map((x) => ({
  ...x,
  available_balance: x.available_balance != null && x.current_balance != null && x.bank_balance ? (x.available_balance * x.current_balance) / x.bank_balance : null,
}));

// The signed-in user's insights, loaded once per request however many components ask.
export const myCashInsights = cache(async () => {
  const { supabase, user } = await getUser();
  return cashInsights(supabase, user?.user_metadata?.profile, { userId: user?.id, today: ymd(await userToday()) });
});
