// Weekly review facts, found in code so the numbers are exact. The AI only words them.
// No "@/" imports so `node src/lib/checkins.test.ts` runs it without Next.
import { leftThisMonth } from "./insights.ts";

export type CheckinTxn = { date: string; amount: number; merchant: string; category: string | null }; // spending only
export type CheckinStream = { merchant_name: string; frequency: string; average_amount: number; last_amount: number | null; next_date: string | null; is_income: boolean };
export type CheckinFacts = {
  unusual: { date: string; merchant: string; amount: number; usual: number; vs: "merchant" | "category" }[];
  newSubs: { merchant: string; amount: number; frequency: string; since: string }[];
  priceUps: { merchant: string; usual: number; last: number }[];
  upcoming: { merchant: string; date: string; amount: number }[];
  upcomingTotal: number;
  cash: number | null; // checking, current balance
  // Added 2026-10-23; older saved check-ins lack them.
  available?: number | null; // checking, available balance (Plaid can show $500 with $0 available)
  weekSpend?: number; // last 7 days
  monthSpend?: number; // this month so far
  income?: number | null; // typical monthly income (typicalMonth in insights.ts)
  bigCategories?: { category: string; amount: number; share: number }[]; // this month's largest, 10%+ of spending and $100+
  lowCash?: boolean;
  // Added 2026-10-23: the cash Safe to spend counts (cashBalance in insights.ts: checking, savings and money market,
  // available when the bank gives it). Low cash reads this, so the two never disagree. Older check-ins lack it.
  spendable?: number | null;
  spendableIn?: string; // what follows the amount, as Safe to spend names it: "available in checking and savings", "in savings"
  // The weekly review, added 2026-10-23 (older check-ins lack it and print as before).
  usualWeek?: number | null; // a typical month's spending as a week
  subs?: string[]; // recurring bill names, so next week can tell which stopped
  stoppedSubs?: string[]; // in last week's review, gone now
  cashChange?: number | null; // checking now minus at last week's review
  left?: ReturnType<typeof leftThisMonth>; // "Left this month", the dashboard's rule
  budgets?: { category: string; budget: number; spent: number }[]; // this month
  tips?: Tip[]; // at most 3, each with an amount, one action, a date and a check next week
  checks?: Check[]; // last week's tips against this week's bank data
  move?: { title: string; line: string; done: boolean; by: string } | null; // the plan's next move, or one done this week
};
// pace: spend under `amount` a week (0: bills only, `over` past income). budget: `key` under `amount` (budget), `spent` so far.
// hike: ask `key` for the old price `amount`, now `last`. sub: cancel `key`, `amount` each `freq`. `by`: the date to act by.
export type Tip = { kind: "pace" | "budget" | "hike" | "sub"; key: string; amount: number; by: string; on: string; over?: number; spent?: number; last?: number; freq?: string };
// now: the bank figure the check reads (last week's spending, the category so far, the latest charge). ok: the tip held.
export type Check = { tip: Tip; now: number; ok: boolean };

const DAY = 864e5;
const shift = (iso: string, days: number) => new Date(Date.parse(iso) + days * DAY).toISOString().slice(0, 10);
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[s.length >> 1] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};
const r2 = (n: number) => Math.round(n * 100) / 100;
const same = (a: string, b: string) => a.toLowerCase().includes(b.toLowerCase()) || b.toLowerCase().includes(a.toLowerCase());

// ponytail: fixed thresholds (2x a merchant's median, 3x a category's), tune if they flag too much or too little.
// Rows dated after today (Plaid dates in UTC) count as this week and this month, like every page.
export function checkinFacts(o: {
  txns: CheckinTxn[]; streams: CheckinStream[]; cash: number | null; available?: number | null; spendable?: number | null; spendableIn?: string; income?: number | null; today: string;
  usualSpend?: number | null; budgets?: { category: string; amount: number }[]; prev?: CheckinFacts | null; move?: CheckinFacts["move"];
}): CheckinFacts {
  const weekAgo = shift(o.today, -7);
  const unusual: CheckinFacts["unusual"] = [];
  for (const t of o.txns.filter((t) => t.date > weekAgo)) {
    const before = o.txns.filter((p) => p.date < t.date);
    const byMerchant = before.filter((p) => p.merchant === t.merchant).map((p) => p.amount);
    const byCategory = t.category ? before.filter((p) => p.category === t.category).map((p) => p.amount) : [];
    if (byMerchant.length >= 3) {
      const usual = median(byMerchant);
      if (t.amount >= 2 * usual && t.amount - usual >= 25) unusual.push({ date: t.date, merchant: t.merchant, amount: t.amount, usual: r2(usual), vs: "merchant" });
    } else if (byCategory.length >= 5) {
      const usual = median(byCategory);
      if (t.amount >= 3 * usual && t.amount >= 100) unusual.push({ date: t.date, merchant: t.merchant, amount: t.amount, usual: r2(usual), vs: "category" });
    }
  }
  unusual.sort((a, b) => b.amount - b.usual - (a.amount - a.usual));

  const bills = o.streams.filter((s) => !s.is_income);
  // A stream is new when its first charge is in the last 45 days, and history goes back far enough to know.
  const oldest = o.txns.reduce((m, t) => (t.date < m ? t.date : m), o.today);
  const newSubs: CheckinFacts["newSubs"] = [];
  if (oldest <= shift(o.today, -75))
    for (const s of bills) {
      const first = o.txns.filter((t) => same(t.merchant, s.merchant_name)).reduce<string | null>((m, t) => (!m || t.date < m ? t.date : m), null);
      if (first && first > shift(o.today, -45)) newSubs.push({ merchant: s.merchant_name, amount: s.last_amount ?? s.average_amount, frequency: s.frequency, since: first });
    }

  const priceUps = bills
    .filter((s) => s.last_amount != null && s.last_amount > s.average_amount * 1.05 && s.last_amount - s.average_amount >= 1)
    .map((s) => ({ merchant: s.merchant_name, usual: r2(s.average_amount), last: s.last_amount! }));

  const upcoming = bills
    .filter((s) => s.next_date && s.next_date >= o.today && s.next_date <= shift(o.today, 10))
    .map((s) => ({ merchant: s.merchant_name, date: s.next_date!, amount: s.average_amount }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const upcomingTotal = r2(upcoming.reduce((s, u) => s + u.amount, 0));
  const sum = (xs: CheckinTxn[]) => r2(xs.reduce((s, t) => s + t.amount, 0));
  const month = o.txns.filter((t) => t.date >= o.today.slice(0, 8) + "01");
  const monthSpend = sum(month);
  const byCat = new Map<string, number>();
  for (const t of month) byCat.set(t.category ?? "Other", (byCat.get(t.category ?? "Other") ?? 0) + t.amount);
  const bigCategories = [...byCat]
    .map(([category, amount]) => ({ category, amount: r2(amount), share: monthSpend ? amount / monthSpend : 0 }))
    .filter((c) => c.share >= 0.1 && c.amount >= 100)
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 3);
  // Low cash: what you can spend (Safe to spend's cash, else checking available, else its balance) is under $100 or under the bills due in 10 days.
  const spendable = o.spendable ?? o.available ?? o.cash;
  const weekSpend = sum(o.txns.filter((t) => t.date > weekAgo));
  const review = reviewOf({ ...o, weekSpend, monthSpend, month, bills, newSubs, priceUps });
  return {
    unusual: unusual.slice(0, 5), newSubs, priceUps, upcoming, upcomingTotal, cash: o.cash,
    available: o.available ?? null, weekSpend, monthSpend, income: o.income ?? null, bigCategories,
    lowCash: spendable != null && spendable < Math.max(100, upcomingTotal),
    ...(o.spendable != null ? { spendable: o.spendable, spendableIn: o.spendableIn ?? "in checking and savings" } : {}),
    ...review,
  };
}

const monthEnd = (today: string) => today.slice(0, 8) + String(new Date(Date.UTC(+today.slice(0, 4), +today.slice(5, 7), 0)).getUTCDate()).padStart(2, "0");

// The review part: changes since last week's review, on track this month, tips, and how last week's tips went.
function reviewOf(o: Parameters<typeof checkinFacts>[0] & {
  weekSpend: number; monthSpend: number; month: CheckinTxn[]; bills: CheckinStream[]; newSubs: CheckinFacts["newSubs"]; priceUps: CheckinFacts["priceUps"];
}) {
  const end = monthEnd(o.today), daysLeft = Number(end.slice(8)) - Number(o.today.slice(8));
  const subs = [...new Set(o.bills.map((s) => s.merchant_name))].sort();
  const prev = o.prev?.subs ? o.prev : null;
  const left = leftThisMonth({ income: o.income ?? null, spend: o.usualSpend ?? null, streams: o.streams, spent: o.monthSpend, today: o.today });
  const byCat = (c: string) => r2(o.month.filter((t) => (t.category ?? "Other") === c).reduce((s, t) => s + t.amount, 0));
  const budgets = (o.budgets ?? []).filter((b) => b.amount > 0).map((b) => ({ category: b.category, budget: b.amount, spent: byCat(b.category) }));

  const tips: Tip[] = [];
  // Past what comes in at the usual pace: a weekly cap from what's left after bills (0: already past income).
  if (left && left.left < 0 && daysLeft > 0) {
    const room = left.income - left.due - left.spent;
    tips.push(room > 0
      ? { kind: "pace", key: "week", amount: r2((room * 7) / daysLeft), by: end, on: o.today }
      : { kind: "pace", key: "week", amount: 0, over: r2(-room), by: end, on: o.today });
  }
  for (const b of budgets.filter((b) => b.spent >= b.budget * 0.8).sort((a, b) => b.spent / b.budget - a.spent / a.budget))
    if (daysLeft > 0) tips.push({ kind: "budget", key: b.category, amount: b.budget, spent: b.spent, by: end, on: o.today });
  const next = (m: string) => o.bills.find((s) => s.merchant_name === m)?.next_date ?? shift(o.today, 7);
  for (const p of o.priceUps) tips.push({ kind: "hike", key: p.merchant, amount: p.usual, last: p.last, by: next(p.merchant), on: o.today });
  for (const n of o.newSubs) tips.push({ kind: "sub", key: n.merchant, amount: n.amount, freq: n.frequency, by: next(n.merchant), on: o.today });

  // Last week's tips against this week's bank data.
  // A budget tip from last month has nothing to check against in a new month.
  const checks: Check[] = (prev?.tips ?? []).flatMap((t): Check[] => {
    if (t.kind === "pace") return [{ tip: t, now: o.weekSpend, ok: o.weekSpend <= t.amount }];
    if (t.kind === "budget") return t.by.slice(0, 7) === o.today.slice(0, 7) ? [{ tip: t, now: byCat(t.key), ok: byCat(t.key) <= t.amount }] : [];
    if (t.kind === "hike") { const now = o.streams.find((s) => s.merchant_name === t.key)?.last_amount ?? t.last ?? 0; return [{ tip: t, now, ok: now <= t.amount * 1.05 }]; }
    const charged = o.txns.filter((x) => x.date > t.on && same(x.merchant, t.key)).reduce((s, x) => s + x.amount, 0);
    return [{ tip: t, now: r2(charged), ok: charged === 0 }];
  });

  return {
    usualWeek: o.usualSpend ? r2((o.usualSpend * 12) / 52) : null,
    subs, stoppedSubs: prev ? prev.subs!.filter((n) => !subs.includes(n)) : [],
    cashChange: prev && prev.cash != null && o.cash != null ? r2(o.cash - prev.cash) : null,
    left, budgets, tips: tips.slice(0, 3), checks, move: o.move ?? null,
  };
}

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

// The same cash as Safe to spend, named the same way ("available in checking and savings"). Older check-ins: checking.
const lowCashLine = (f: CheckinFacts, $: (n: number) => string) => {
  const bills = f.upcomingTotal ? `, with ${$(f.upcomingTotal)} of bills due in the next 10 days` : "";
  if (f.spendable != null) return `Low cash: ${$(f.spendable)} ${f.spendableIn ?? "in checking and savings"}${bills}.`;
  return `Low cash: ${$(f.available ?? f.cash ?? 0)}${f.available != null ? " available" : ""} in checking${bills}.`;
};

/** The spending, income and cash flags as lines. Category names and totals only, no merchants: safe for every AI level.
 * Comes first so a check-in never says "nothing stands out" over spending above income or $0 available. */
export function flagLines(f: CheckinFacts, $: (n: number) => string): string[] {
  const lines: string[] = [];
  if (f.weekSpend != null && f.monthSpend != null) lines.push(`Spent ${$(f.weekSpend)} in the last 7 days and ${$(f.monthSpend)} so far this month.`);
  if (f.income && f.monthSpend != null && f.monthSpend > f.income)
    lines.push(`This month's spending is already ${$(f.monthSpend - f.income)} more than a typical month's income of ${$(f.income)}.`);
  if (f.bigCategories?.length) lines.push(`Biggest this month: ${f.bigCategories.map((c) => `${c.category} ${$(c.amount)} (${Math.round(c.share * 100)}%)`).join(", ")}.`);
  if (f.lowCash) lines.push(lowCashLine(f, $));
  return lines;
}

/** The facts as plain lines: the AI prompt, the fallback when no AI is set up, and what "Ask about this" sends.
 * $ and locale: the user's money format (format.ts fmtWith), US dollars by default. */
export function factLines(f: CheckinFacts, $: (n: number) => string = (n) => usd.format(n), locale = "en-US"): string[] {
  const day = (iso: string) => new Date(iso + "T00:00:00Z").toLocaleDateString(locale, { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
  const lines = [
    ...flagLines(f, $),
    ...f.unusual.map((u) => `${u.merchant} charged ${$(u.amount)} on ${day(u.date)}. ${u.vs === "merchant" ? "Usually" : "Usual for that category:"} ${$(u.usual)}.`),
    ...f.newSubs.map((s) => `New recurring charge: ${s.merchant}, ${$(s.amount)} ${s.frequency.toLowerCase()}, first seen ${day(s.since)}.`),
    ...f.priceUps.map((p) => `${p.merchant} went up: last charge ${$(p.last)}, usually ${$(p.usual)}.`),
    ...f.upcoming.map((u) => `${u.merchant} due ${day(u.date)}: ${$(u.amount)}.`),
  ];
  const bal = f.cash == null ? "" : ` Checking balance: ${$(f.cash)}${f.available != null && Math.round(f.available) !== Math.round(f.cash) ? `, ${$(f.available)} available` : ""}.`;
  if (f.upcoming.length) lines.push(`Bills in the next 10 days: ${$(f.upcomingTotal)}.${bal}`);
  else lines.push(`No bills due in the next 10 days.${bal}`);
  return lines;
}

type Words = { $: (n: number) => string; name?: (kind: "merchant" | "sub", n: string) => string; day?: (iso: string) => string };
const usDay = (iso: string) => new Date(iso + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const FREQ: Record<string, string> = { WEEKLY: "a week", BIWEEKLY: "every 2 weeks", SEMI_MONTHLY: "twice a month", MONTHLY: "a month", ANNUALLY: "a year" };

/** What changed this week: spending against a usual week, odd charges, new, stopped and pricier subscriptions, checking.
 * The only part the AI may reword. Summary level passes placeholder names, rounded $ and month-only days. */
export function changeLines(f: CheckinFacts, w: Words): string[] {
  const { $ } = w, name = w.name ?? ((_: string, n: string) => n), day = w.day ?? usDay;
  const out: string[] = [];
  if (f.weekSpend != null) out.push(`You spent ${$(f.weekSpend)} in the last 7 days${f.usualWeek ? `. A usual week is about ${$(f.usualWeek)}` : ""}.`);
  for (const u of f.unusual.slice(0, 3)) out.push(`${name("merchant", u.merchant)} charged ${$(u.amount)} this week. ${u.vs === "merchant" ? "Usually" : "Usual for that category:"} ${$(u.usual)}.`);
  for (const n of f.newSubs) out.push(`New recurring charge: ${name("sub", n.merchant)}, ${$(n.amount)} ${FREQ[n.frequency] ?? "each time"}, first seen ${day(n.since)}.`);
  for (const n of f.stoppedSubs ?? []) out.push(`${name("sub", n)} no longer shows as a recurring charge.`);
  for (const p of f.priceUps) out.push(`${name("sub", p.merchant)} went up: last charge ${$(p.last)}, usually ${$(p.usual)}.`);
  if (f.cashChange != null && Math.round(f.cashChange) !== 0) out.push(`Checking is ${f.cashChange > 0 ? "up" : "down"} ${$(Math.abs(f.cashChange))} since last week's review${f.cash != null ? `, at ${$(f.cash)}` : ""}.`);
  if (f.lowCash) out.push(lowCashLine(f, $));
  return out;
}

/** On track: "Left this month" and the budgets. */
export function trackLines(f: CheckinFacts, $: (n: number) => string): string[] {
  const out: string[] = [];
  const l = f.left;
  if (l) out.push(l.left < 0 ? `At your usual pace, ${$(-l.left)} more goes out than comes in this month.` : `About ${$(l.left)} left this month at your usual pace.`);
  else out.push("No regular income found yet, so there's no monthly total to check against.");
  const over = (f.budgets ?? []).filter((b) => b.spent > b.budget);
  if (f.budgets?.length) out.push(over.length ? `${f.budgets.length - over.length} of ${f.budgets.length} budgets on track. Over: ${over.map((b) => `${b.category} ${$(b.spent)} of ${$(b.budget)}`).join(", ")}.` : `All ${f.budgets.length} budgets on track.`);
  return out;
}

/** One tip as its action, with its amount and date. */
export function tipText(t: Tip, w: Words): string {
  const { $ } = w, name = w.name ?? ((_: string, n: string) => n), day = w.day ?? usDay;
  if (t.kind === "pace") return t.amount > 0 ? `Keep spending under ${$(t.amount)} a week until ${day(t.by)}.` : `Spend only on bills and essentials until ${day(t.by)}. This month is already ${$(t.over ?? 0)} past what comes in.`;
  if (t.kind === "budget") return (t.spent ?? 0) >= t.amount ? `Pause ${t.key} spending until ${day(t.by)}. It's at ${$(t.spent ?? 0)} of its ${$(t.amount)} budget.` : `Keep ${t.key} under ${$(t.amount - (t.spent ?? 0))} more until ${day(t.by)}, to stay in its ${$(t.amount)} budget.`;
  if (t.kind === "hike") return `Ask ${name("sub", t.key)} for the old price of ${$(t.amount)} before ${day(t.by)}. It went up to ${$(t.last ?? 0)}.`;
  return `Cancel ${name("sub", t.key)} before ${day(t.by)} if you don't use it. It costs ${$(t.amount)} ${FREQ[t.freq ?? ""] ?? "each time"}.`;
}

/** Last week's tip against this week's bank data. */
export function checkText(c: Check, w: Words): string {
  const { $ } = w, name = w.name ?? ((_: string, n: string) => n), day = w.day ?? usDay, t = c.tip;
  if (t.kind === "pace") return t.amount > 0 ? `You spent ${$(c.now)} last week, ${c.ok ? "under" : "over"} the ${$(t.amount)} aim.` : `You spent ${$(c.now)} last week.`;
  if (t.kind === "budget") return `${t.key} is at ${$(c.now)} of its ${$(t.amount)} budget.`;
  if (t.kind === "hike") return c.ok ? `${name("sub", t.key)} is back to ${$(c.now)}.` : `${name("sub", t.key)} still charges ${$(c.now)}.`;
  return c.ok ? `No ${name("sub", t.key)} charge since ${day(t.on)}.` : `${name("sub", t.key)} charged ${$(c.now)} since ${day(t.on)}.`;
}

// Dollar figures in a text. A rewrite may round a figure it was given (5%), never bring a new one.
const dollars = (s: string) => [...s.matchAll(/\$\s?(\d[\d,]*(?:\.\d+)?)\s?(k\b)?/gi)].map((x) => Number(x[1].replace(/,/g, "")) * (x[2] ? 1000 : 1));
export const sameDollars = (text: string, given: string[]) => {
  const known = dollars(given.join(" "));
  return dollars(text).every((n) => known.some((k) => Math.abs(n - k) <= Math.max(1, k * 0.05)));
};
