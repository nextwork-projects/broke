// Run: node src/lib/checkins.test.ts
import assert from "node:assert/strict";
const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
import { changeLines, checkinFacts, checkText, factLines, sameDollars, tipText, trackLines, type CheckinTxn } from "./checkins.ts";

const today = "2026-10-22";
const txns: CheckinTxn[] = [
  // Groceries: three normal weeks, then a big one this week.
  { date: "2026-07-01", amount: 60, merchant: "Whole Foods", category: "Groceries" },
  { date: "2026-08-01", amount: 55, merchant: "Whole Foods", category: "Groceries" },
  { date: "2026-09-01", amount: 65, merchant: "Whole Foods", category: "Groceries" },
  { date: "2026-10-20", amount: 240, merchant: "Whole Foods", category: "Groceries" },
  // A normal coffee this week: not flagged.
  { date: "2026-07-02", amount: 5, merchant: "Starbucks", category: "Coffee" },
  { date: "2026-08-02", amount: 6, merchant: "Starbucks", category: "Coffee" },
  { date: "2026-09-02", amount: 5, merchant: "Starbucks", category: "Coffee" },
  { date: "2026-10-21", amount: 6, merchant: "Starbucks", category: "Coffee" },
  // Netflix since July, Spotify only since this month.
  { date: "2026-07-10", amount: 15.49, merchant: "Netflix", category: "Subscriptions" },
  { date: "2026-10-05", amount: 11.99, merchant: "Spotify", category: "Subscriptions" },
];
const streams = [
  { merchant_name: "Netflix", frequency: "MONTHLY", average_amount: 15.49, last_amount: 17.99, next_date: "2026-10-28", is_income: false },
  { merchant_name: "Spotify", frequency: "MONTHLY", average_amount: 11.99, last_amount: 11.99, next_date: "2026-11-05", is_income: false },
  { merchant_name: "Payroll", frequency: "BIWEEKLY", average_amount: 2000, last_amount: 2000, next_date: "2026-10-24", is_income: true },
];
const f = checkinFacts({ txns, streams, cash: 1200, today });

assert.deepEqual(f.unusual.map((u) => [u.merchant, u.usual]), [["Whole Foods", 60]]);
assert.deepEqual(f.newSubs.map((s) => s.merchant), ["Spotify"]);
assert.deepEqual(f.priceUps, [{ merchant: "Netflix", usual: 15.49, last: 17.99 }]);
assert.deepEqual(f.upcoming.map((u) => u.merchant), ["Netflix"], "income and bills past 10 days are left out");
assert.equal(f.upcomingTotal, 15.49);
assert.match(factLines(f).at(-1)!, /\$15\.49.*\$1,200\.00/);

// Too little history: nothing counts as new.
assert.deepEqual(checkinFacts({ txns: txns.filter((t) => t.date > "2026-09-15"), streams, cash: null, today }).newSubs, []);
// The e2e week: $849 spent, a month far above income, $500 checking with $0 available. It must not read as quiet.
const busy: CheckinTxn[] = [
  { date: "2026-10-02", amount: 1056, merchant: "Dunkin'", category: "Dining & drinks" },
  { date: "2026-10-03", amount: 5281, merchant: "Shop", category: "Other" },
  { date: "2026-10-20", amount: 600, merchant: "Shop", category: "Other" },
  { date: "2026-10-23", amount: 249, merchant: "Tomorrow's row", category: "Other" }, // dated ahead of today: still this week
];
const b = checkinFacts({ txns: busy, streams: [], cash: 500, available: 0, income: 3240, today });
assert.equal(b.weekSpend, 849);
assert.equal(b.monthSpend, 7186);
assert.equal(b.lowCash, true);
assert.deepEqual(b.bigCategories!.map((c) => c.category), ["Other", "Dining & drinks"]);
const bl = factLines(b);
assert.match(bl[0], /\$849\.00 in the last 7 days and \$7,186\.00/);
assert.match(bl[1], /\$3,946\.00 more than a typical month's income of \$3,240\.00/);
assert.match(bl.join(" "), /Low cash: \$0\.00 available in checking\./);
assert.match(bl.at(-1)!, /Checking balance: \$500\.00, \$0\.00 available\./);
// Plenty of cash and spending under income: no alarm lines.
const calm = checkinFacts({ txns: busy.slice(2), streams: [], cash: 5000, available: 5000, income: 6000, today });
assert.equal(calm.lowCash, false);
assert.ok(!factLines(calm).some((l) => /more than a typical|Low cash/.test(l)));
// Safe to spend's cash (checking plus savings): $0 available in checking but $6,000 in savings is not low cash.
const saved = checkinFacts({ txns: busy, streams: [], cash: 500, available: 0, spendable: 6000, spendableIn: "available in checking and savings", income: 3240, today });
assert.equal(saved.lowCash, false);
const thin = checkinFacts({ txns: busy, streams: [], cash: 500, available: 0, spendable: 40, spendableIn: "available in checking and savings", income: 3240, today });
assert.equal(thin.lowCash, true);
assert.match(factLines(thin).join(" "), /Low cash: \$40\.00 available in checking and savings\./);
assert.match(changeLines(thin, { $: (n) => usd.format(n) }).join(" "), /Low cash: \$40\.00 available in checking and savings\./);
// A check-in saved before these fields existed still prints.
assert.ok(factLines({ unusual: [], newSubs: [], priceUps: [], upcoming: [], upcomingTotal: 0, cash: 10 }).length === 1);

// The weekly review. Oct 22, 9 days left. Usual month $3,000 spent, $3,240 in; $2,900 spent so far; rent $1,000 due Oct 30.
const $ = (n: number) => usd.format(n);
const rent = { merchant_name: "Rent", frequency: "MONTHLY", average_amount: 1000, last_amount: 1000, next_date: "2026-10-30", is_income: false };
const spent: CheckinTxn[] = [{ date: "2026-10-05", amount: 2500, merchant: "Shop", category: "Shopping" }, { date: "2026-10-20", amount: 400, merchant: "Bistro", category: "Dining & drinks" }];
const w1 = checkinFacts({ txns: spent, streams: [rent, ...streams], cash: 900, income: 3240, usualSpend: 3000, today, budgets: [{ category: "Dining & drinks", amount: 300 }, { category: "Groceries", amount: 400 }] });
assert.equal(w1.usualWeek, Math.round((3000 * 12) / 52 * 100) / 100);
assert.ok(w1.left && w1.left.left < 0, "past income at the usual pace");
// What's left after bills: 3,240 - (1,000 rent + 15.49 Netflix) - 2,900 spent is under 0, so the bills-only tip.
assert.deepEqual(w1.tips!.map((t) => [t.kind, t.key]), [["pace", "week"], ["budget", "Dining & drinks"], ["hike", "Netflix"]], "3 tips at most, pace first");
assert.equal(w1.tips![0].amount, 0);
assert.match(tipText(w1.tips![0], { $ }), /^Spend only on bills and essentials until Oct 31\. This month is already \$675\.49 past/);
assert.match(tipText(w1.tips![1], { $ }), /Pause Dining & drinks spending until Oct 31\. It's at \$400\.00 of its \$300\.00 budget\./);
assert.match(tipText(w1.tips![2], { $ }), /Ask Netflix for the old price of \$15\.49 before Oct 28/);
assert.deepEqual(trackLines(w1, $).slice(1), ["1 of 2 budgets on track. Over: Dining & drinks $400.00 of $300.00."]);
assert.deepEqual(w1.checks, [], "no review last week, nothing to check");
// A week later: Spotify gone, $250 more spent, checking down, Netflix back to its old price.
const w2 = checkinFacts({
  txns: [...spent, { date: "2026-10-27", amount: 250, merchant: "Shop", category: "Shopping" }], cash: 600, income: 3240, usualSpend: 3000, today: "2026-10-29", prev: w1,
  streams: [rent, { ...streams[0], last_amount: 15.49 }], budgets: [{ category: "Dining & drinks", amount: 300 }],
});
assert.deepEqual(w2.stoppedSubs, ["Spotify"]);
assert.equal(w2.cashChange, -300);
assert.deepEqual(w2.checks!.map((c) => [c.tip.kind, c.ok]), [["pace", false], ["budget", false], ["hike", true]]);
assert.equal(checkText(w2.checks![2], { $ }), "Netflix is back to $15.49.");
const cl = changeLines(w2, { $ });
assert.ok(cl.includes("Spotify no longer shows as a recurring charge."));
assert.ok(cl.includes("Checking is down $300.00 since last week's review, at $600.00."));
// Summary level: placeholder names, no merchant.
assert.ok(!changeLines(w2, { $, name: () => "<S1>" }).join(" ").includes("Spotify"));
// The AI may round a figure it was given, never bring a new one.
assert.ok(sameDollars("Checking fell about $300 this week.", cl));
assert.ok(!sameDollars("You could save $5,000.", cl));
// No income: no monthly total, no pace tip.
const ni = checkinFacts({ txns: spent, streams: [rent], cash: 900, usualSpend: 3000, today });
assert.equal(ni.left, null);
assert.ok(!ni.tips!.some((t) => t.kind === "pace"));
console.log("checkins: ok");
