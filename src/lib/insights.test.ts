// Run: node src/lib/insights.test.ts
import assert from "node:assert/strict";
import { billsDueThisMonth, cashWords, toldMonthly, idleCash, leftThisMonth, matchCheck, matchGap, safeToSpend, typicalMonth, type Acct, type Stream } from "./insights.ts";

const acct = (subtype: string, bal: number, extra: Partial<Acct> = {}): Acct =>
  ({ type: "depository", subtype, current_balance: bal, available_balance: null, included: true, ...extra });
const accts = [acct("checking", 3000), acct("savings", 20000), acct("cd", 5000), acct("checking", 999, { included: false }), { ...acct("credit card", 400), type: "credit" }];
const s = (merchant_name: string, average_amount: number, next_date: string | null, is_income = false, frequency = "MONTHLY"): Stream =>
  ({ merchant_name, average_amount, next_date, is_income, frequency });

// Safe to spend: bills between today and payday only; CD, excluded and credit accounts left out.
const streams = [
  s("Acme Payroll", 2400, "2026-10-30", true, "BIWEEKLY"),
  s("INTRST PYMNT", 4, "2026-10-23", true),
  s("Rent", 1800, "2026-10-25"),
  s("Netflix", 15.49, "2026-10-22"),
  s("Gym", 50, "2026-10-30"),
  s("Old", 99, "2026-10-01"),
];
let r = safeToSpend(accts, streams, "2026-10-22");
assert.equal(r.cash, 23000);
assert.equal(r.payday, "2026-10-30");
assert.equal(r.paydayGuessed, false);
assert.deepEqual(r.bills.map((b) => b.name), ["Netflix", "Rent"]);
assert.equal(r.safe, 23000 - 1815.49);

// No paycheck: 14-day window, interest isn't a payday.
r = safeToSpend(accts, streams.slice(1), "2026-10-22");
assert.equal(r.payday, "2026-11-05");
assert.equal(r.paydayGuessed, true);
assert.deepEqual(r.bills.map((b) => b.name), ["Netflix", "Rent", "Gym"]);

// Idle cash: above 3 months of spending.
const idle = idleCash(accts, 2000)!;
assert.equal(idle.excess, 17000);
assert.equal(Math.round(idle.hysa), 680);
assert.equal(Math.round(idle.bank), 85);
assert.equal(idleCash(accts, 10000)!.excess, 0);
assert.equal(idleCash(accts, 0), null);

// Match gap.
assert.deepEqual(matchGap(100000, [4, 6], 3), [1000, 3000]);
assert.deepEqual(matchGap(100000, [3, 3], 5), [0, 0]);

// Match check: profile states first.
assert.equal(matchCheck(undefined, streams, 0, null).status, "no-profile");
assert.equal(matchCheck({ match: "Not sure" }, streams, 0, null).status, "not-sure");
assert.equal(matchCheck({ match: "No 401(k)" }, streams, 0, null).status, "no-plan");
assert.equal(matchCheck({ match: "401(k), no match" }, streams, 0, null).status, "no-match");
assert.equal(matchCheck({ match: "Match up to 3%" }, [], 0, null).status, "no-pay");

// Gross from paychecks: 2400 x 26 / 0.75 = 83,200. Unknown contribution: gaps at 0% and 3%.
let m = matchCheck({ match: "Match up to 4-6%" }, streams, 0, null);
assert.ok(m.status === "ok");
assert.equal(m.source, "paychecks");
assert.equal(Math.round(m.gross), 83200);
assert.deepEqual(m.gaps.map((g) => g.pct), [0, 3, 5]);
assert.deepEqual(m.gaps[1].gap.map(Math.round), [832, 2496]);

// Known contribution: 3% of gross.
m = matchCheck({ match: "Match up to 3%" }, streams, 0, 83200 * 0.03);
assert.ok(m.status === "ok");
assert.equal(Math.round(m.pct!), 3);
assert.deepEqual(m.gaps[0].gap.map(Math.round), [0, 0]);

// Typical monthly income wins over paychecks, so Optimize shows the same income as every other page: 5,000 x 12 / 0.75.
m = matchCheck({ match: "Match up to 3%" }, streams, 5000, null);
assert.ok(m.status === "ok" && m.source === "income" && Math.round(m.gross) === 80000);
// Fallback: the profile range.
m = matchCheck({ match: "Match up to 3%", income: "$50k-$100k" }, [], 0, null);
assert.ok(m.status === "ok" && m.source === "profile" && m.gross === 75000);

// $500 checking with $0 available (Plaid sandbox): Safe to Spend uses $0 and says it is the available balance.
const held = [acct("checking", 500, { available_balance: 0 })];
r = safeToSpend(held, [], "2026-10-22");
assert.equal(r.cash, 0);
assert.equal(r.current, 500);
assert.deepEqual(cashWords(held), { where: "checking", available: true });
assert.deepEqual(cashWords(accts), { where: "checking and savings", available: false });
assert.equal(safeToSpend([acct("checking", 500)], [], "2026-10-22").cash, 500, "no available balance: the current one");

// Typical month: full months only. History from Jul 30 leaves July out: (3240 + 3240) / 2.
const rows = [
  { month: "2026-07-01", income: 810, spend: 0 },
  { month: "2026-08-01", income: 3240, spend: 200 },
  { month: "2026-09-01", income: 3240, spend: 1800 },
  { month: "2026-10-01", income: 3240, spend: 7000 },
];
assert.deepEqual(typicalMonth(rows, "2026-10-23", "2026-07-30"), { income: 3240, spend: 1000, months: 2, list: ["2026-09", "2026-08"] }, "the partial July is left out");
assert.equal(typicalMonth(rows, "2026-10-23", "2026-06-01")!.income, (810 + 3240 + 3240) / 3, "3 full months");
// The e2e user: history from Jul 30 but only cents of interest until October's paychecks. Not $0.12 a month:
// October so far (2,835.92 over 23 days) scaled to a month.
const late = [{ month: "2026-08-01", income: 0.12, spend: 160 }, { month: "2026-09-01", income: 0.12, spend: 1800 }, { month: "2026-10-01", income: 2835.92, spend: 7185 }];
assert.equal(Math.round(typicalMonth(late, "2026-10-23", "2026-07-30")!.income), Math.round(2835.92 * (365 / 12) / 23));
assert.equal(typicalMonth([{ month: "2026-09-01", income: 0.12, spend: 100 }], "2026-10-23", "2026-07-30"), null, "no income: unknown");
assert.equal(typicalMonth(rows, "2026-10-23", "2026-10-15"), null, "under 14 days of history");
// No full month: history from Sep 12, so Sep + Oct (6,480 in) over 42 days, scaled to a month.
const partial = typicalMonth(rows, "2026-10-23", "2026-09-12")!;
assert.equal(partial.months, 0);
assert.equal(Math.round(partial.income), Math.round(6480 * (365 / 12) / 42));
const dec = ["2025-10-01", "2025-11-01", "2025-12-01"].map((month) => ({ month, income: 3000, spend: 100 }));
assert.equal(typicalMonth(dec, "2026-01-10", "2025-01-01")!.months, 3, "January looks back into last year");

// Left this month, Oct 23 (31 days, 8 left after today). Gym weekly from Oct 24 lands Oct 24 and 31; rent Oct 25 once;
// an annual bill in December and income don't count. Typical month: 4,000 spent, of which bills are 1,800 + 52*10/12 + 120/12.
const lm = [s("Rent", 1800, "2026-10-25"), s("Gym", 10, "2026-10-24", false, "WEEKLY"), s("Domain", 120, "2026-12-01", false, "ANNUALLY"), s("Acme Payroll", 2400, "2026-10-30", true, "BIWEEKLY"), s("Late", 50, "2026-10-01")];
assert.deepEqual(billsDueThisMonth(lm, "2026-10-23").map((b) => `${b.name} ${b.date}`), ["Gym 2026-10-24", "Rent 2026-10-25", "Gym 2026-10-31"]);
const left = leftThisMonth({ income: 5200, spend: 4000, streams: lm, spent: 2100, today: "2026-10-23" })!;
assert.equal(left.due, 1820);
const pace = (4000 - (1800 + (10 * 52) / 12 + 120 / 12 + 50)) / 31;
assert.equal(Math.round(left.rest), Math.round(pace * 8));
assert.equal(Math.round(left.left), Math.round(5200 - 1820 - 2100 - pace * 8));
assert.equal(leftThisMonth({ income: null, spend: 4000, streams: lm, spent: 2100, today: "2026-10-23" }), null, "no income: no guess");
assert.equal(leftThisMonth({ income: 3000, spend: 4000, streams: [], spent: 2900, today: "2026-10-31" })!.left, 100, "last day: nothing more at the usual pace");
assert.ok(leftThisMonth({ income: 2000, spend: 4000, streams: lm, spent: 2100, today: "2026-10-23" })!.left < 0, "negative when spending runs past income");

console.log("insights ok");

// The take-home pay typed in onboarding, as a month.
assert.equal(toldMonthly({ amount: 2000, every: "BIWEEKLY" }), (2000 * 26) / 12);
assert.equal(toldMonthly({ amount: 4000, every: "MONTHLY" }), 4000);
assert.equal(toldMonthly({ amount: 0, every: "MONTHLY" }), null);
assert.equal(toldMonthly({ amount: 100, every: "SOMETIMES" }), null);
assert.equal(toldMonthly(undefined), null);
