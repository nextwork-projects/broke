import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { bestFit, CAT_LABEL, catOf, type Card, type Cat, type Fit } from "@/lib/cards";
import { creditOf } from "@/lib/credit";
import { cardMatches } from "@/lib/cards-data";
import { cashInsights, myCashInsights } from "@/lib/cash";
import { countryOf } from "@/lib/countries";
import { cache } from "react";
import { allRows, displayName, getUser, isIncome, isSpend, moneyByMonth, today as userToday, TXN_SELECT, type Txn, loanPayments } from "@/lib/data";
import { dateLabel, fmtFor, money0, ymd } from "@/lib/format";
import { addDays, toldMonthly } from "@/lib/insights";
import { contributionRoom } from "@/lib/invest";
import { validGoalPlan, type GoalPlan } from "@/lib/advice";
import { isInterest } from "@/lib/debt";
import { loadStreams } from "@/lib/llm/tools/subscriptions";
import { ESSENTIAL_KEYS, type CardOffer, type Facts } from "@/lib/plan";
import { cancelUrl, categoryOf, negotiable, subscriptionAlerts } from "@/lib/subscriptions";
import { IRS, marginalRate, TAX_YEAR } from "@/lib/tax";

type Profile = Record<string, unknown> & { country?: string; currency?: string; state?: string; match?: string; income?: string; age?: string; dependents?: string; filing?: string; work?: string; goals?: string[] };
const PER_YEAR: Record<string, number> = { WEEKLY: 52, BIWEEKLY: 26, SEMI_MONTHLY: 24, MONTHLY: 12, ANNUALLY: 1 };
const CATS = Object.keys(CAT_LABEL) as Cat[];
const r2 = (n: number) => Math.round(n * 100) / 100;
// broke keys, most specific first: Plaid's FOOD_AND_DRINK_GROCERIES is groceries, not dining.
const PLAID_KEYS = ["GROCERIES", "FOOD_AND_DRINK", "TRAVEL", "TRANSPORTATION", "ENTERTAINMENT"];
const RENT = /\brent\b|apartment|property management|landlord|realty|leasing/i;
// Tax rows from Plaid's categories, else the name. ponytail: a property tax bill also lands in TAX_PAYMENT; split it out if it skews the owed check.
const TAX_CATS = ["INCOME_TAX_REFUND", "GOVERNMENT_AND_NON_PROFIT_TAX_PAYMENT", "GOVERNMENT_AND_NON_PROFIT_DONATIONS", "LOAN_PAYMENTS_STUDENT_LOAN_PAYMENT", "GENERAL_SERVICES_CHILDCARE"];
const TAX_NAME = /\b(irs|internal revenue|usataxpymt|treas 310|franchise tax|dep(artmen)?t of revenue)\b/i;
const REFUND_NAME = /tax ref|treas 310/i;
// Non-payroll income: Plaid's "other income", or a payout from a known platform.
const SIDE = /\b(stripe|upwork|fiverr|etsy|shopify|square|doordash|instacart|grubhub|lyft|uber)\b/i;
// Plaid investment subtypes taxed as you go. Anything retirement, education or health stays out.
const TAXABLE = new Set(["brokerage", "mutual fund", "stock plan", "cash management", "trust"]);
// Recurring rows that are bills, not subscriptions (the Recurring page's split).
const BILL_KEYS = ["RENT_AND_UTILITIES", "LOAN_PAYMENTS"];
// Categories a spike check skips: payments, fees and taxes have their own moves, and "Other" has no budget worth setting.
const NO_SPIKE = new Set(["LOAN_PAYMENTS", "CREDIT_CARD_PAYMENT", "BANK_FEES", "GOVERNMENT_AND_NON_PROFIT", "RENT_AND_UTILITIES", "TRANSFER_IN", "TRANSFER_OUT", "INCOME", "OTHER"]);
// First day of the month n months from today's.
const monthStart = (today: string, n: number) => { const d = new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 1 + n, 1)); return d.toISOString().slice(0, 10); };

const ratesOf = (c: Pick<Card, "earn">) => Object.fromEntries(CATS.map((k) => [k, (c.earn[k] ?? c.earn.other).rate])) as Record<Cat, number>;
const offer = (f: Fit): CardOffer => ({
  id: f.card.id, name: f.card.name, issuer: f.card.issuer, url: f.card.referral ?? f.card.url, referral: !!f.card.referral, fee: f.card.fee ?? 0,
  ongoing: r2(f.ongoing), yearOne: r2(f.yearOne), bonus: f.bonus == null ? null : r2(f.bonus), bonusReachable: f.bonusReachable, rates: ratesOf(f.card), fitsCredit: f.fitsCredit ?? null,
});

// Everything the money plan looks at, from the same helpers the other pages use. Own rows only:
// a partner's shared accounts are not the viewer's money.
// cash: the same cashInsights already loading for this request (the dashboard's), so it isn't queried twice.
export async function planFacts(supabase: SupabaseClient, userId: string, profile: Profile = {}, today: string, cash0?: ReturnType<typeof cashInsights>): Promise<Facts> {
  const country = countryOf(profile.country);
  const since = addDays(today, -90);
  const usTax = country.code === "US" && Number(today.slice(0, 4)) === TAX_YEAR;
  // US tax rows load in the same batch: they only depend on usTax.
  const [cash, { streams, txns: charges }, { data: rec }, months, txns, { data: cats }, room, cards, byMonth, { data: accts }, [taxTxns, { data: held }]] = await Promise.all([
    cash0 ?? cashInsights(supabase, profile, { userId, today }),
    loadStreams(supabase, userId),
    supabase.from("recurring").select("merchant_name, frequency, average_amount:home_average, next_date, is_income, category:categories(key)").eq("user_id", userId).eq("active", true).neq("status", "TOMBSTONED"),
    moneyByMonth(supabase, since),
    allRows<Txn>((a, b) => supabase.from("transactions").select(TXN_SELECT).eq("user_id", userId).gte("date", since).order("id").range(a, b)),
    supabase.from("categories").select("id, label, key"),
    contributionRoom(supabase, profile, { tax: country.tax, today, locale: country.locale, mine: profile.contributed as Record<string, number> | undefined }).catch(() => []),
    country.cards ? cardMatches(supabase, userId, creditOf(profile)?.band) : Promise.resolve(null),
    moneyByMonth(supabase, monthStart(today, -3)),
    supabase.from("accounts").select("type, subtype, current_balance:home_balance, included").eq("user_id", userId),
    usTax
      ? Promise.all([
          allRows<Txn>((a, b) => supabase.from("transactions").select(TXN_SELECT).eq("user_id", userId).gte("date", addDays(today, -365))
            .or(`plaid_category.in.(${TAX_CATS.join(",")}),name.ilike.*irs*,name.ilike.*internal revenue*,name.ilike.*tax*`).order("id").range(a, b)),
          supabase.from("holdings").select("name, ticker, value, cost_basis, account:accounts!inner(type, subtype, owner_label)").eq("user_id", userId),
        ])
      : Promise.resolve([[] as Txn[], { data: [] as unknown[] }] as const),
  ]);

  const recurring = ((rec ?? []) as unknown as { merchant_name: string; frequency: string; average_amount: number; next_date: string | null; is_income: boolean; category: { key: string } | null }[]).filter((s) => !s.is_income);
  const yearlyOf = (s: { frequency: string; average_amount: number }) => Number(s.average_amount) * (PER_YEAR[s.frequency] ?? 12);
  const bills: Facts["bills"] = recurring.map((s) => {
    const stream = streams.find((x) => x.merchant_name === s.merchant_name) ?? { merchant_name: s.merchant_name, average_amount: s.average_amount };
    const plaid = categoryOf(stream, charges);
    return {
      name: s.merchant_name, yearly: r2(yearlyOf(s)), frequency: s.frequency,
      cat: catOf(s.category?.key ?? PLAID_KEYS.find((k) => plaid?.includes(k))),
      negotiable: negotiable(s.merchant_name, plaid), cancelUrl: cancelUrl(s.merchant_name), nextDate: s.next_date,
      sub: !BILL_KEYS.includes(s.category?.key ?? ""),
    };
  }).sort((a, b) => b.yearly - a.yearly);

  const alerts = subscriptionAlerts(streams, charges);
  const billYearly = (name: string) => bills.find((b) => b.name === name)?.yearly ?? 0;
  const priceHikes = alerts.flatMap((a) => (a.kind === "price_hike" ? [{ merchant: a.merchant, from: a.from, to: a.to, date: a.date, yearly: r2((a.to - a.from) * (PER_YEAR[streams.find((s) => s.merchant_name === a.merchant)?.frequency ?? ""] ?? 12)) }] : []));
  const duplicates = alerts.flatMap((a) => (a.kind === "duplicate" ? [{ group: a.group, merchants: a.merchants, monthly: a.monthly, cheapestYearly: r2(Math.min(...a.merchants.map(billYearly))) }] : []));

  let planCards: Facts["cards"] = null;
  if (cards?.hasHistory) {
    const currentRates = Object.fromEntries(CATS.map((k) => [k, cards.owned.length ? Math.max(...cards.owned.map((c) => ratesOf(c)[k])) : cards.creditAccounts ? 1 : 0])) as Record<Cat, number>;
    // Only cards that fit the user's credit range.
    const best = bestFit(cards.fits);
    const bonus = cards.fits.filter((f) => f.fitsCredit !== false && f.bonusReachable && (f.bonus ?? 0) > 0 && f.card.id !== best?.card.id && f.card.credit !== "building").sort((a, b) => b.bonus! - a.bonus!)[0];
    planCards = {
      owned: cards.owned.map((c) => `${c.issuer} ${c.name}`),
      // Cards we can't name: assume 1% back. No credit card at all: debit earns nothing.
      currentEarn: r2(cards.ownedEarn ?? (cards.creditAccounts ? cards.total * 0.01 : 0)),
      currentRates, best: best ? offer(best) : null, bonusPick: bonus ? offer(bonus) : null,
    };
  }

  const m = cash.match;
  const g = m.status === "ok" ? (m.pct != null ? m.gaps[0] : m.gaps.find((x) => x.pct === 3) ?? m.gaps[0]) : null;
  const rentBill = recurring.find((s) => RENT.test(s.merchant_name) || categoryOf(streams.find((x) => x.merchant_name === s.merchant_name) ?? { merchant_name: s.merchant_name, average_amount: 0 }, charges) === "RENT_AND_UTILITIES_RENT");

  const label = new Map((cats ?? []).map((c) => [c.id as string, c.label as string]));
  const byCat = new Map<string, number>();
  for (const row of months) if (row.spend) byCat.set(label.get(row.category_id) ?? "Other", (byCat.get(label.get(row.category_id) ?? "Other") ?? 0) + row.spend);
  const spend = txns.filter(isSpend);
  const byMerchant = new Map<string, { spend90: number; count: number }>();
  for (const t of spend) {
    const x = byMerchant.get(displayName(t)) ?? { spend90: 0, count: 0 };
    byMerchant.set(displayName(t), { spend90: x.spend90 + t.amount, count: x.count + 1 });
  }

  // Same rules as the For you page.
  const out = txns.filter((t) => !t.ignored && t.amount > 0);
  const interest90 = out.filter(isInterest).reduce((s, t) => s + t.amount, 0);
  const fees90 = out.filter((t) => t.category?.key === "BANK_FEES" && !isInterest(t)).reduce((s, t) => s + t.amount, 0);

  const allowed = new Set<string>();
  for (const b of bills) if (b.cancelUrl) allowed.add(b.cancelUrl);
  for (const c of [planCards?.best, planCards?.bonusPick]) if (c) allowed.add(c.url);

  let tax: Facts["tax"] = null;
  if (usTax) {
    const rows = taxTxns.filter((t) => !t.ignored && t.account?.included !== false);
    const sum = (xs: Txn[]) => r2(xs.reduce((s, t) => s + Math.abs(t.amount), 0));
    const cat = (c: string) => rows.filter((t) => t.plaid_category === c);
    const loanOut = cat("LOAN_PAYMENTS_STUDENT_LOAN_PAYMENT");
    // The same payment can show on checking (out) and on the loan (in): count one side.
    const loanPaid = loanOut.some((t) => t.amount > 0) ? loanOut.filter((t) => t.amount > 0) : loanOut;
    const side = txns.filter((t) => isIncome(t) && t.amount < 0 && (t.plaid_category === "INCOME_OTHER_INCOME" || SIDE.test(displayName(t))));
    const rate = marginalRate(profile);
    const losses = ((held ?? []) as unknown as { name: string | null; ticker: string | null; value: number | null; cost_basis: number | null; account: { subtype: string | null; owner_label: string | null } }[])
      .filter((h) => !h.account.owner_label && TAXABLE.has(h.account.subtype ?? "") && h.cost_basis != null && h.value != null && Number(h.cost_basis) > Number(h.value))
      .map((h) => ({ name: h.ticker || h.name || "a holding", loss: r2(Number(h.cost_basis) - Number(h.value)) }))
      .sort((a, b) => b.loss - a.loss);
    tax = {
      filing: rate.filing, band: rate.band, rate: rate.rate, rateNote: rate.note, guessed: rate.guessed,
      work: profile.work || null, age: profile.age || null, dependents: profile.dependents || null,
      covered: profile.match !== "No 401(k)",
      refunds365: sum(rows.filter((t) => t.amount < 0 && (t.plaid_category === "INCOME_TAX_REFUND" || REFUND_NAME.test(t.name)))),
      payments365: sum(rows.filter((t) => t.amount > 0 && (t.plaid_category === "GOVERNMENT_AND_NON_PROFIT_TAX_PAYMENT" || TAX_NAME.test(t.name)))),
      side90: sum(side), sideFrom: [...new Set(side.map(displayName))],
      losses,
      charity365: sum(cat("GOVERNMENT_AND_NON_PROFIT_DONATIONS").filter((t) => t.amount > 0)),
      studentLoan365: sum(loanPaid),
      childcare365: sum(cat("GENERAL_SERVICES_CHILDCARE").filter((t) => t.amount > 0)),
    };
    for (const u of Object.values(IRS)) allowed.add(u);
  }

  // The affordability gate's numbers: monthly income and spending over the last full months with data (up to 3),
  // essentials from the same months, and cash available now (the same figure as safe to spend).
  const key = new Map((cats ?? []).map((c) => [c.id as string, c.key as string]));
  const thisMonth = today.slice(0, 7);
  const perMonth = new Map<string, { income: number; spend: number; essentials: number; cats: Map<string, number> }>();
  for (const row of byMonth) {
    const m = row.month.slice(0, 7);
    const x = perMonth.get(m) ?? { income: 0, spend: 0, essentials: 0, cats: new Map() };
    x.income += row.income;
    x.spend += row.spend;
    if (ESSENTIAL_KEYS.includes(key.get(row.category_id) ?? "")) x.essentials += row.spend;
    if (row.category_id && row.spend) x.cats.set(row.category_id, (x.cats.get(row.category_id) ?? 0) + row.spend);
    perMonth.set(m, x);
  }
  const earlier = [...perMonth].filter(([m, x]) => m < thisMonth && (x.spend || x.income)).map(([, x]) => x);
  const base = earlier.length ? earlier : [...perMonth.values()];
  const avg = (f: (x: (typeof base)[number]) => number) => (base.length ? base.reduce((s, x) => s + f(x), 0) / base.length : 0);
  const spendAvg = avg((x) => x.spend), essentials = avg((x) => x.essentials);
  // No paycheck found (typicalMonth has no income): the take-home pay they told us in onboarding, flagged. Never mixed in.
  const told = cash.typical && cash.typical.income > 0 ? null : toldMonthly(profile.pay as { amount?: number; every?: string } | undefined);
  // Loan payments aren't spending in the totals, but the money is gone and they can't be skipped: count them as essentials.
  const paid = await loanPayments(supabase, userId, monthStart(today, -3));
  const baseMonths = [...perMonth].filter(([, x]) => base.includes(x)).map(([m]) => m);
  const loanAvg = baseMonths.length ? baseMonths.reduce((s, m) => s + (paid.get(m) ?? 0), 0) / baseMonths.length : 0;
  const budget = { income: r2(told ?? avg((x) => x.income)), ...(told ? { incomeTold: true } : {}), spend: r2(spendAvg + loanAvg), cash: r2(cash.safe.cash), essentials: r2((essentials > 0 ? essentials : spendAvg) + loanAvg), essentialsAll: !(essentials > 0) };
  const last = monthStart(today, -1).slice(0, 7);
  const monthRows = [last, thisMonth].flatMap((m) => { const x = perMonth.get(m); return x && (x.spend || x.income) ? [{ month: m, income: r2(x.income), spend: r2(x.spend) }] : []; });
  const now = perMonth.get(thisMonth);
  const spikes = earlier.length && now
    ? [...now.cats].flatMap(([id, spent]) => {
        const k = key.get(id) ?? "";
        const before = earlier.reduce((s, x) => s + (x.cats.get(id) ?? 0), 0) / earlier.length;
        return !NO_SPIKE.has(k) && before >= 50 && spent >= before * 1.5 && spent - before >= 100 ? [{ id, label: label.get(id) ?? "Other", now: r2(spent), avg: r2(before), months: earlier.length }] : [];
      }).sort((a, b) => b.now - b.avg - (a.now - a.avg)).slice(0, 3)
    : [];
  const own = ((accts ?? []) as { type: string; subtype: string | null; current_balance: number | null; included: boolean }[]).filter((a) => a.included !== false);
  const debts = own.filter((a) => (a.type === "credit" || a.type === "loan") && Math.abs(Number(a.current_balance ?? 0)) >= 1)
    .map((a) => ({ kind: a.type === "credit" ? "card" as const : a.subtype === "student" ? "student" as const : "loan" as const, balance: r2(Math.abs(Number(a.current_balance))) }));

  return {
    today, country: country.code, currency: fmtFor(profile).currency, state: (profile.state as string) || null,
    monthlySpend: r2(cash.monthlySpend), bills, priceHikes, duplicates,
    idle: cash.idle && cash.idle.excess > 0 ? { cash: r2(cash.idle.cash), excess: r2(cash.idle.excess), gain: r2(cash.idle.hysa - cash.idle.bank) } : null,
    match: m.status === "ok" && g ? { cap: m.cap, pct: g.pct, guessed: m.pct == null, gapLow: r2(g.gap[0]), gapHigh: r2(g.gap[1]) } : null,
    room: room.filter((x) => x.left != null && x.left > 0).map((x) => ({ label: x.label, kind: x.kind, left: r2(x.left!), deadline: x.deadline, due: x.due })),
    cards: planCards,
    rent: rentBill ? { name: rentBill.merchant_name, yearly: r2(yearlyOf(rentBill)) } : null,
    topCategories: [...byCat].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([l, v]) => ({ label: l, spend90: r2(v) })),
    topMerchants: [...byMerchant].sort((a, b) => b[1].spend90 - a[1].spend90).slice(0, 12).map(([name, x]) => ({ name, spend90: r2(x.spend90), count: x.count })),
    bigCharges: spend.filter((t) => t.amount >= 100).sort((a, b) => b.amount - a.amount).slice(0, 8).map((t) => ({ date: t.date, name: displayName(t), amount: r2(t.amount), category: t.category?.label ?? null })),
    interest90: r2(interest90), fees90: r2(fees90),
    tax,
    allowedUrls: [...allowed],
    goals: Array.isArray(profile.goals) ? profile.goals : [],
    goalPlans: Array.isArray(profile.goalPlans) ? (profile.goalPlans as unknown[]).map(validGoalPlan).filter((g): g is GoalPlan => !!g) : [],
    risk: (profile.risk as string) || null,
    budget, months: monthRows, spikes, debts,
    iraRoth: own.some((a) => a.type === "investment" && /roth/i.test(a.subtype ?? "") && !/401/.test(a.subtype ?? "")),
    futureShare: txns.length ? txns.filter((t) => t.date > today).length / txns.length : 0,
  };
}

export const MOVE_COLS = "id, ref, kind, title, why, yearly_impact, effort, steps, message, links, confidence, status, done_at, sort, section, deadline, step, once, gate, steps_done";

// One audit per user at a time, run in the background; the page polls GET. Memory only (one local server).
const g = globalThis as unknown as { __brokePlans?: Map<string, Promise<unknown>>; __brokePlanErrors?: Map<string, string> };
export const running = (g.__brokePlans ??= new Map());
export const errors = (g.__brokePlanErrors ??= new Map());


// "Looks done": a statement cycle (35 days) after the plan, the latest data shows no card interest, or no charge from
// the merchant of a price-rise move. The user confirms; nothing is marked done on its own. The note says what the bank shows.
// ponytail: interest and price rises only; contribution rates and cancelled duplicates need data Plaid doesn't give here.
async function looksDone(supabase: SupabaseClient, userId: string, created: string, moves: { id: string; ref: string | null; status: string }[]) {
  const since = created.slice(0, 10);
  if (Date.now() - Date.parse(created) < 35 * 864e5) return [];
  const open = moves.filter((m) => (m.status === "todo" || m.status === "doing") && (m.ref === "interest" || m.ref?.startsWith("hike:")));
  if (!open.length) return [];
  type Row = { name: string; merchant_name: string | null; plaid_category: string | null; amount: number };
  const page = (gte: string, lt?: string) => allRows<Row>((a, b) => {
    const q = supabase.from("transactions").select("name, merchant_name, plaid_category, amount").eq("user_id", userId).gt("amount", 0).gte("date", gte);
    return (lt ? q.lt("date", lt) : q).order("id").range(a, b);
  });
  // The month before the plan too, for "down from $X": in parallel, so no extra round trip.
  const [rows, before] = await Promise.all([page(since), open.some((m) => m.ref === "interest") ? page(addDays(since, -35), since) : Promise.resolve([] as Row[])]);
  const day = dateLabel(since, { month: "short", day: "numeric" });
  return open.flatMap((m) => {
    if (m.ref === "interest") {
      if (rows.some(isInterest)) return [];
      const was = before.filter(isInterest).reduce((s, t) => s + Number(t.amount), 0);
      return [{ id: m.id, note: `No card interest since ${day}${was >= 1 ? `, down from ${money0(was)} in the month before` : ""}.` }];
    }
    const who = m.ref!.slice(5);
    return rows.some((t) => `${t.merchant_name ?? ""} ${t.name}`.toLowerCase().includes(who.toLowerCase())) ? [] : [{ id: m.id, note: `No ${who} charge since ${day}.` }];
  });
}

// The latest plan with its moves (one query), and what the user has done across every run. Own rows (RLS plus the user filter).
export async function loadPlan(supabase: SupabaseClient, userId: string) {
  const [{ data: row, error }, { data: done }, { data: newest }] = await Promise.all([
    supabase.from("plans").select(`id, created_at, provider, summary, total_impact, note, plan_moves(${MOVE_COLS})`).eq("user_id", userId)
      .order("created_at", { ascending: false }).order("sort", { referencedTable: "plan_moves" }).limit(1).maybeSingle(),
    // Every done move across runs: the yearly total, and the payoff chart's progress so far.
    supabase.from("plan_moves").select("id, ref, kind, section, once, gate, yearly_impact, status, done_at").eq("user_id", userId).eq("status", "done"),
    supabase.from("plaid_items").select("institution_name, created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  // Out of date: built before the newest bank was linked (its numbers can't include it, or came from a test bank),
  // or more than a statement cycle ago. Home then works its next move out live, and /plan offers a rebuild.
  const age = row ? Date.now() - Date.parse(row.created_at) : 0;
  const stale = !row ? null
    : newest && newest.created_at > row.created_at ? `Built before you linked ${newest.institution_name ?? "a bank"}, so its numbers are out of date.`
    : age > 35 * 864e5 ? `Built ${Math.round(age / 864e5)} days ago, before your latest statements.` : null;
  const { plan_moves: moves = [], ...plan } = row ?? {};
  const looks = row && moves.length ? await looksDone(supabase, userId, row.created_at, moves).catch(() => []) : [];
  return {
    ready: !error, // false before migration 0021
    plan: row ? (plan as Omit<NonNullable<typeof row>, "plan_moves">) : null, moves,
    saved: (done ?? []).filter((m) => !m.once).reduce((s, m) => s + Number(m.yearly_impact), 0),
    done: done ?? [],
    looksDone: looks.map((x) => x.id),
    looksWhy: Object.fromEntries(looks.map((x) => [x.id, x.note])) as Record<string, string>,
    running: running.has(userId), error: errors.get(userId) ?? null, stale,
  };
}

// The signed-in user's plan and plan facts, loaded once per request however many dashboard cards ask.
export const myPlan = cache(async () => {
  const { supabase, user } = await getUser();
  return loadPlan(supabase, user!.id);
});
export const myPlanFacts = cache(async () => {
  const { supabase, user } = await getUser();
  return planFacts(supabase, user!.id, user!.user_metadata?.profile ?? {}, ymd(await userToday()), myCashInsights());
});
