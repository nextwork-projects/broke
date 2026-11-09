// Pure math for safe-to-spend, idle cash and the 401(k) match check.
// No "@/" imports, so `node src/lib/insights.test.ts` runs it directly.

export type Acct = { type: string; subtype: string | null; current_balance: number | null; available_balance: number | null; included: boolean };
export type Stream = { merchant_name: string; frequency: string; average_amount: number; next_date: string | null; is_income: boolean };

// Assumptions, not quotes. Rates move with the market.
export const HYSA_APY = 0.04; // a typical high-yield savings rate
export const BANK_APY = 0.005; // a typical big-bank savings rate
export const TAKE_HOME = 0.75; // take-home as a share of gross pay, rough for tax and benefits
const PER_YEAR: Record<string, number> = { WEEKLY: 52, BIWEEKLY: 26, SEMI_MONTHLY: 24, MONTHLY: 12, ANNUALLY: 1 };

export const addDays = (iso: string, n: number) => new Date(Date.parse(iso + "T00:00:00Z") + n * 864e5).toISOString().slice(0, 10);
const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0);

// Spendable cash: included checking, savings and money market. A CD is locked, so it is left out.
// The bank's available balance when it gives one (it holds back pending charges), else the current balance.
export const isCash = (a: Acct) => a.included && a.type === "depository" && a.subtype !== "cd";
export const cashBalance = (accts: Acct[]) => sum(accts.filter(isCash).map((a) => Number(a.available_balance ?? a.current_balance ?? 0)));
// The same accounts' current balance, what the Accounts list shows. More than cashBalance when money is held back.
export const cashCurrent = (accts: Acct[]) => sum(accts.filter(isCash).map((a) => Number(a.current_balance ?? 0)));
// How to name that cash on screen: "available" when any account's figure is the available balance.
export function cashWords(accts: Acct[]) {
  const cash = accts.filter(isCash);
  const kinds = new Set(cash.map((a) => (a.subtype === "checking" ? "checking" : "savings")));
  return { where: kinds.size === 1 ? [...kinds][0] : "checking and savings", available: cash.some((a) => a.available_balance != null) };
}

// Typical month: the average of the last 3 full calendar months before this one that have income ($100 or more).
// A month the history starts partway through is left out, and so is a month with no income in it: linked accounts
// often reach back months with only a few cents of interest before the paychecks start, and $0.12 is not a typical
// income. With no such month yet, everything from the first month with income (or the first row, if later) to today,
// scaled to a month, once that covers 14 days or more. Null below that, or with no income at all.
// Every "about $X a month" income on screen comes from this (Budgets, For you, Optimize, the check-in).
// ponytail: a real month with no pay (a job gap) is skipped, not averaged in as $0; count it once there's a way to tell.
export function typicalMonth(rows: { month: string; income: number; spend: number }[], today: string, oldest: string | null) {
  if (!oldest) return null;
  const [y, m] = today.split("-").map(Number);
  const of = (months: string[], f: (r: (typeof rows)[number]) => number) => sum(rows.filter((r) => months.includes(r.month.slice(0, 7))).map(f));
  const paid = (ym: string) => of([ym], (r) => r.income) >= 100;
  const full = [1, 2, 3].map((k) => new Date(Date.UTC(y, m - 1 - k, 1)).toISOString().slice(0, 7)).filter((ym) => `${ym}-01` >= oldest && paid(ym));
  if (full.length) return { income: of(full, (r) => r.income) / full.length, spend: of(full, (r) => r.spend) / full.length, months: full.length, list: full };
  const seen = [...new Set(rows.map((r) => r.month.slice(0, 7)))].sort();
  const first = seen.find(paid);
  if (!first) return null;
  const start = `${first}-01` > oldest ? `${first}-01` : oldest;
  const days = (Date.parse(today) - Date.parse(start)) / 864e5 + 1;
  if (days < 14) return null;
  const since = seen.filter((ym) => ym >= start.slice(0, 7));
  const scale = 365 / 12 / days;
  return { income: of(since, (r) => r.income) * scale, spend: of(since, (r) => r.spend) * scale, months: 0, list: [] as string[] };
}

// The take-home pay typed in onboarding (profile.pay), as a month. Used only when no paycheck is found, never added to one.
export function toldMonthly(pay?: { amount?: number; every?: string } | null) {
  const n = Number(pay?.amount), per = PER_YEAR[pay?.every ?? ""];
  return n > 0 && per ? (n * per) / 12 : null;
}

// Regular income that isn't interest or dividends.
export const isPaycheck = (s: Stream) => s.is_income && s.frequency in PER_YEAR && !/interest|intrst|dividend/i.test(s.merchant_name);

// Cash minus the bills due before the next paycheck (or the next 14 days when no paycheck is found).
// ponytail: each bill counts once, so a weekly bill due twice in the window is undercounted.
export function safeToSpend(accts: Acct[], streams: Stream[], today: string) {
  const cash = cashBalance(accts);
  const next = streams.filter((s) => isPaycheck(s) && s.next_date && s.next_date >= today).map((s) => s.next_date!).sort()[0];
  const payday = next ?? addDays(today, 14);
  const bills = streams
    .filter((s) => !s.is_income && s.next_date && s.next_date >= today && s.next_date < payday)
    .map((s) => ({ name: s.merchant_name, date: s.next_date!, amount: Number(s.average_amount) }))
    .sort((a, b) => a.date.localeCompare(b.date));
  const due = sum(bills.map((b) => b.amount));
  return { cash, current: cashCurrent(accts), ...cashWords(accts), payday, paydayGuessed: !next, bills, due, safe: cash - due };
}

// Bills still due from today to the last day of the month. A weekly or every-two-weeks bill counts each time it lands.
const STEP_DAYS: Record<string, number> = { WEEKLY: 7, BIWEEKLY: 14, SEMI_MONTHLY: 15 };
export function billsDueThisMonth(streams: Stream[], today: string) {
  const end = today.slice(0, 8) + String(new Date(Date.UTC(+today.slice(0, 4), +today.slice(5, 7), 0)).getUTCDate()).padStart(2, "0");
  const out: { name: string; date: string; amount: number }[] = [];
  for (const s of streams.filter((s) => !s.is_income && s.next_date && s.next_date >= today))
    for (let d = s.next_date!; d <= end; d = addDays(d, STEP_DAYS[s.frequency] ?? 99)) out.push({ name: s.merchant_name, date: d, amount: Number(s.average_amount) });
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

// Left this month: typical monthly income, minus bills still due this month, minus spending so far this month,
// minus the rest of the month at the usual pace. The usual pace is a typical month's spending without its recurring
// bills (they are counted on their own dates), spread over the days left after today.
// Null with no typical income: broke doesn't guess one.
export function leftThisMonth(o: { income: number | null; spend: number | null; streams: Stream[]; spent: number; today: string }) {
  if (!o.income || o.income <= 0) return null;
  const days = new Date(Date.UTC(+o.today.slice(0, 4), +o.today.slice(5, 7), 0)).getUTCDate();
  const due = sum(billsDueThisMonth(o.streams, o.today).map((b) => b.amount));
  const monthlyBills = sum(o.streams.filter((s) => !s.is_income).map((s) => (Number(s.average_amount) * (PER_YEAR[s.frequency] ?? 12)) / 12));
  const rest = (Math.max(0, (o.spend ?? 0) - monthlyBills) / days) * (days - +o.today.slice(8, 10));
  return { income: o.income, due, spent: o.spent, rest, left: o.income - due - o.spent - rest };
}

// Cash above `months` of average spending, and what it would earn per year.
export function idleCash(accts: Acct[], monthlySpend: number, months = 3) {
  if (monthlySpend <= 0) return null;
  const cash = cashBalance(accts);
  const cushion = monthlySpend * months;
  const excess = Math.max(0, cash - cushion);
  return { cash, current: cashCurrent(accts), ...cashWords(accts), cushion, excess, hysa: excess * HYSA_APY, bank: excess * BANK_APY };
}

// Profile answer -> match cap in % of pay, as [low, high]. "4-6%" is a range; "over 6%" is at least 6.
export const MATCH_CAP: Record<string, [number, number]> = { "Match up to 3%": [3, 3], "Match up to 4-6%": [4, 6], "Match over 6%": [6, 6] };
// Profile income range -> a single yearly figure. Household income, so only a fallback for one person's pay.
const INCOME_MID: Record<string, number> = { "Under $50k": 40000, "$50k-$100k": 75000, "$100k-$200k": 150000, "$200k-$400k": 300000, "Over $400k": 400000 };

export type PaySource = "income" | "paychecks" | "profile";
// Yearly gross pay, best source first: typical monthly income (typicalMonth, the figure every page shows), then
// recurring paychecks (no full month of history yet), then the profile range.
export function grossPay(streams: Stream[], monthlyIncome: number | null, income?: string): { gross: number; source: PaySource; takeHome?: number } | null {
  if (monthlyIncome && monthlyIncome > 0) return { gross: (monthlyIncome * 12) / TAKE_HOME, source: "income", takeHome: monthlyIncome * 12 };
  const fromChecks = sum(streams.filter(isPaycheck).map((s) => Number(s.average_amount) * PER_YEAR[s.frequency]));
  if (fromChecks > 0) return { gross: fromChecks / TAKE_HOME, source: "paychecks", takeHome: fromChecks };
  if (income && INCOME_MID[income]) return { gross: INCOME_MID[income], source: "profile" };
  return null;
}

// Yearly match left unclaimed at contribution `pct`, as [low, high]. Assumes a dollar-for-dollar match.
export const matchGap = (gross: number, [lo, hi]: [number, number], pct: number): [number, number] =>
  [(gross * Math.max(0, lo - pct)) / 100, (gross * Math.max(0, hi - pct)) / 100];

export type MatchResult =
  | { status: "no-profile" | "not-sure" | "no-plan" | "no-match" | "no-pay" }
  | { status: "ok"; cap: [number, number]; gross: number; source: PaySource; takeHome?: number; pct: number | null; gaps: { pct: number; gap: [number, number] }[] };

// contributed = yearly 401(k) contributions when known (investment transactions), else null.
export function matchCheck(profile: { match?: string; income?: string } | undefined, streams: Stream[], monthlyIncome: number | null, contributed: number | null): MatchResult {
  const m = profile?.match;
  if (!m) return { status: "no-profile" };
  if (m === "Not sure") return { status: "not-sure" };
  if (m === "No 401(k)") return { status: "no-plan" };
  const cap = MATCH_CAP[m];
  if (!cap) return { status: "no-match" };
  const pay = grossPay(streams, monthlyIncome, profile?.income);
  if (!pay) return { status: "no-pay" };
  const pct = contributed != null ? (contributed / pay.gross) * 100 : null;
  // Known: the gap at their rate. Unknown: the gap at common rates below the cap.
  const rates = pct != null ? [pct] : [0, 3, 5].filter((p) => p < cap[1]);
  return { status: "ok", cap, ...pay, pct, gaps: rates.map((p) => ({ pct: p, gap: matchGap(pay.gross, cap, p) })) };
}
