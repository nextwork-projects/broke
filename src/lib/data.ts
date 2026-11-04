import "server-only";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { cache } from "react";
import { dayIn, fmtFor, setFmtScope, US_FMT, type Fmt } from "@/lib/format";
import { ensureRates } from "@/lib/fx";
import { typicalMonth } from "@/lib/insights";
import { createAdminClient } from "@/utils/supabase/admin";
import { createClient } from "@/utils/supabase/server";

export type Category = { id: string; key: string; label: string; icon: string; color: string; kind: "spend" | "income" | "transfer" };
export type Txn = {
  id: string;
  date: string;
  amount: number;
  name: string;
  merchant_name: string | null;
  custom_name: string | null;
  logo_url: string | null;
  pending: boolean;
  note: string | null;
  ignored: boolean;
  tags: string[];
  manual: boolean;
  currency: string | null; // null = the home currency
  category_id: string | null;
  plaid_category?: string | null;
  category: Category | null;
  account: { id: string; name: string; custom_name?: string | null; mask: string | null; included: boolean; owner_label?: string | null } | null;
};

export const TXN_SELECT =
  "id, date, amount, name, merchant_name, custom_name, logo_url, pending, note, ignored, tags, manual, currency, category_id, plaid_category, category:categories(id, key, label, icon, color, kind), account:accounts(id, name, custom_name, mask, included, owner_label)";

// Account names: the user's rename (custom_name, migration 0013) wins over the bank's name.
export const accountName = (a: { name: string; custom_name?: string | null }) => a.custom_name || a.name;
export const withAccountNames = (txns: Txn[]) => txns.map((t) => (t.account ? { ...t, account: { ...t.account, name: accountName(t.account) } } : t));

export { displayName } from "@/lib/format";

// What counts as spending: a spend category, not ignored, from an included account. No category: money out is
// spend ("Other"), money in is income. Transfers, card payments and loan payments (kind "transfer", migration 0022)
// are neither. money_rows and txn_totals (migrations 0014, 0015) are the same rule in SQL; change both together.
// A row dated after the user's today counts in the period of its own date, here and in SQL (Plaid dates in UTC).
// ponytail: money in on a spend category (refunds, loan credits) is skipped, not netted; net refunds when a refund flag exists.
const kindOf = (t: Txn) => t.category?.kind ?? (t.amount > 0 ? "spend" : "income");
export const isSpend = (t: Txn) => !t.ignored && t.account?.included !== false && kindOf(t) === "spend" && t.amount > 0;
export const isIncome = (t: Txn) => !t.ignored && t.account?.included !== false && kindOf(t) === "income";

// money() and friends on the server read the signed-in user's currency and locale from this per-request box.
const fmtBox = cache((): { f: Fmt } => ({ f: US_FMT }));
setFmtScope(() => fmtBox().f);

// Once per request. Pages read the user from the signed token: getClaims verifies it against the project's keys
// locally (~1 ms) instead of asking Supabase Auth (~100 ms per page). The token carries id, email and user_metadata
// only (created_at is left empty); every client updateUser call refreshes the session so the token never holds old
// settings. API routes that act on settings (AI, plan) still call auth.getUser() for the live record.
// Also sets this request's money format and keeps the exchange rates current (once a day).
export const getUser = cache(async () => {
  const supabase = await createClient();
  const [{ data }, , tz] = await Promise.all([supabase.auth.getClaims(), ensureRates(createAdminClient()), userTz()]);
  const c = data?.claims;
  const user = c?.sub ? ({ id: c.sub, email: c.email, user_metadata: c.user_metadata ?? {}, app_metadata: {}, aud: "authenticated", created_at: "" } as User) : null;
  fmtBox().f = { ...fmtFor(user?.user_metadata?.profile), tz };
  return { supabase, user };
});

// The browser's time zone (tz cookie, set by TimeZoneCookie in Nav.tsx). "Today" on the server is the user's today.
export const userTz = cache(async () => (await cookies()).get("tz")?.value);
export const today = cache(async () => dayIn(await userTz()));

type Page = PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>;
// PostgREST returns at most 1000 rows per request; this asks page by page until a short one. The query needs a stable order.
export async function allRows<T>(page: (from: number, to: number) => Page) {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await page(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...((data ?? []) as T[]));
    if ((data?.length ?? 0) < 1000) return out;
  }
}

// The signed-in user's own transactions from gte (and before lt). Partner-shared rows are left out: they are not your money.
export async function transactionsSince(gte: string, lt?: string) {
  const { supabase, user } = await getUser();
  return allRows<Txn>((from, to) => {
    let q = supabase.from("transactions").select(TXN_SELECT).eq("user_id", user!.id).gte("date", gte);
    if (lt) q = q.lt("date", lt);
    return q.order("date", { ascending: false }).order("id").range(from, to);
  });
}

// Totals from SQL (migration 0014), own rows only, same rules as isSpend / isIncome. income is money in, positive.
// Take the client so the AI tools can call them with theirs.
export type MonthRow = { month: string; category_id: string; spend: number; income: number; n: number };
export async function moneyByMonth(supabase: SupabaseClient, start: string, end?: string) {
  const { data, error } = await supabase.rpc("money_by_month", { start_date: start, end_date: end ?? null });
  if (error) throw new Error(error.message);
  return ((data ?? []) as MonthRow[]).map((r) => ({ ...r, spend: Number(r.spend), income: Number(r.income), n: Number(r.n) }));
}
export async function spendByDay(supabase: SupabaseClient, start: string, end?: string) {
  const { data, error } = await supabase.rpc("spend_by_day", { start_date: start, end_date: end ?? null });
  if (error) throw new Error(error.message);
  return ((data ?? []) as { day: string; spend: number }[]).map((r) => ({ day: r.day, spend: Number(r.spend) }));
}
// The user's typical month: income and spend averaged over the last 3 full months (typicalMonth in insights.ts has
// the rule). The one source for "about $X a month" income on every page. Null until there is a full month.
export async function typicalMonthly(supabase: SupabaseClient, userId: string, today: string) {
  const [y, m] = today.split("-").map(Number);
  const [rows, { data }] = await Promise.all([
    moneyByMonth(supabase, new Date(Date.UTC(y, m - 4, 1)).toISOString().slice(0, 10)),
    supabase.from("transactions").select("date").eq("user_id", userId).order("date").limit(1),
  ]);
  return typicalMonth(rows, today, (data?.[0]?.date as string | undefined) ?? null);
}
// Loan payments per "YYYY-MM": car, student, mortgage and so on. They're transfers in the spending totals (migration 0022),
// but the money still leaves, so anything saying what's left over must count them. Only the row leaving a bank account:
// the same payment arriving on a linked loan is negative, and a loan account's own rows don't count. Card payments have their own category.
export async function loanPayments(supabase: SupabaseClient, userId: string, start: string, end = "9999-12-31") {
  const rows = await allRows<{ date: string; amount: number }>((a, b) =>
    supabase.from("transactions").select("date, amount, category:categories!inner(key), account:accounts!inner(type)")
      .eq("user_id", userId).eq("ignored", false).gt("amount", 0).gte("date", start).lte("date", end)
      .eq("category.key", "LOAN_PAYMENTS").neq("account.type", "loan").order("id").range(a, b));
  const by = new Map<string, number>();
  for (const r of rows) by.set(r.date.slice(0, 7), (by.get(r.date.slice(0, 7)) ?? 0) + Number(r.amount));
  return by;
}
// Money going into savings and investment accounts per "YYYY-MM": what arrives on a savings account (net of what leaves it)
// and contributions to investment accounts. Only accounts broke can see.
export async function savedByMonth(supabase: SupabaseClient, userId: string, start: string, end = "9999-12-31") {
  const { data: accts } = await supabase.from("accounts").select("id, type, subtype").eq("user_id", userId).or("type.eq.investment,subtype.eq.savings");
  const by = new Map<string, number>();
  const savings = (accts ?? []).filter((a) => a.type !== "investment").map((a) => a.id), invest = (accts ?? []).filter((a) => a.type === "investment").map((a) => a.id);
  const add = (date: string, n: number) => by.set(date.slice(0, 7), (by.get(date.slice(0, 7)) ?? 0) + n);
  if (savings.length)
    for (const t of await allRows<{ date: string; amount: number }>((a, b) => supabase.from("transactions").select("date, amount").eq("ignored", false).gte("date", start).lte("date", end).in("account_id", savings).order("id").range(a, b))) add(t.date, -Number(t.amount));
  if (invest.length) {
    const { data } = await supabase.from("investment_transactions").select("date, amount, subtype").gte("date", start).lte("date", end).in("account_id", invest);
    for (const t of data ?? []) if (t.subtype === "contribution") add(t.date, Math.abs(Number(t.amount)));
  }
  return by;
}
export const sumOf = <T>(xs: T[], f: (x: T) => number) => xs.reduce((s, x) => s + f(x), 0);

export async function categories() {
  const { supabase } = await getUser();
  const { data } = await supabase.from("categories").select("id, key, label, icon, color, kind").order("label");
  return (data ?? []) as Category[];
}

// Every tag the user has used, on transactions or in rules, for suggestions and the tag filter.
export async function allTags() {
  const { supabase } = await getUser();
  const [{ data: t }, { data: r }] = await Promise.all([
    supabase.rpc("my_tags"),
    supabase.from("rules").select("add_tags").not("add_tags", "is", null),
  ]);
  const seen = new Map<string, string>();
  for (const tag of [...((t ?? []) as string[]), ...(r ?? []).flatMap((x) => x.add_tags as string[])])
    if (!seen.has(tag.toLowerCase())) seen.set(tag.toLowerCase(), tag);
  return [...seen.values()].sort((a, b) => a.localeCompare(b));
}
