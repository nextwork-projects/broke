// Run: node src/lib/steps.test.ts
import assert from "node:assert/strict";
import { budgetCheck, excessLadder, goalSlices, moneyPicture, openStep, pictureMonth, plainAccount } from "./steps.ts";

const cats = ["a", "b", "c", "d", "e", "f"].map((id) => ({ id, label: id.toUpperCase(), color: "#000", icon: "other" }));
const row = (month: string, category_id: string, spend: number, income = 0) => ({ month: `${month}-01`, category_id, spend, income });
const rows = [row("2026-10", "a", 500), row("2026-10", "b", 400), row("2026-10", "c", 300), row("2026-10", "d", 200), row("2026-10", "e", 60), row("2026-10", "f", 40), row("2026-10", "z", 0, 2000), row("2026-11", "a", 10)];

const p = moneyPicture(rows, cats, "2026-10", null);
assert.deepEqual(p.slices.map((s) => s.label), ["A", "B", "C", "D", "Everything else"]);
assert.equal(p.slices.at(-1)!.amount, 100);
assert.equal(p.spent, 1500);
assert.equal(p.left, 500);
assert.equal(p.base, 2000);

// Loan payments are money out even though they aren't spending in the totals.
const withLoan = moneyPicture(rows, [...cats, { id: "l", key: "LOAN_PAYMENTS", label: "Loans", color: "#111", icon: "other" }], "2026-10", null, 350);
assert.deepEqual(withLoan.slices.map((s) => s.label), ["A", "B", "Loan payments", "C", "D", "Everything else"]);
assert.equal(withLoan.spent, 1850);
assert.equal(withLoan.left, 150);
assert.equal(withLoan.slices[2].id, "l");

// No deposit that month: what they told us. Told nothing either: no left-over number, never a made-up one.
assert.equal(moneyPicture(rows, cats, "2026-11", 1000).left, 990);
assert.equal(moneyPicture(rows, cats, "2026-11", null).left, null);
// Spending past income: the bar scales to the spending, left goes negative.
const over = moneyPicture([row("2026-10", "a", 3000), row("2026-10", "z", 0, 2000)], cats, "2026-10", null);
assert.equal(over.left, -1000);
assert.equal(over.base, 3000);

assert.equal(pictureMonth(rows, "2026-11", "2026-10"), "2026-10");
assert.equal(pictureMonth([row("2026-11", "a", 5)], "2026-11", "2026-10"), "2026-11");

// Goals share what's left, first goal first; a finished one drops out; no income, no room.
const plans = [{ goal: "Japan", amount: 4000, by: "2027-09" }, { goal: "Home", amount: 40000, by: "2036-11", saved: 16000 }, { goal: "Done", amount: 100, by: "2027-01", saved: 100 }];
assert.deepEqual(goalSlices(plans, "2026-11-01", 500).map((g) => [g.label, g.need, g.got]), [["Japan", 400, 400], ["Home", 200, 100]]);
assert.equal(goalSlices(plans, "2026-11-01", null)[0].got, 0);

const c = budgetCheck([{ label: "Food", amount: 300, spent: 410 }, { label: "Fun", amount: 100, spent: 50 }, { label: "Gas", amount: 100, spent: 50 }], 10);
assert.deepEqual(c.over, [{ label: "Food", by: 110 }]);
assert.equal(c.onTrack, 2);
assert.equal(c.total, 500);
assert.equal(budgetCheck([{ label: "Bills", amount: 1677, spent: 1677.12 }], 10).over.length, 0); // cents over: never "$0 over"
assert.equal(c.perDay, 10); // the overspend doesn't eat other budgets' days

const money = (n: number) => `$${n}`;
const L = (cash: number, carrying = false) => ({ b: { cash } as never, starter: 1000, full: 6000, carrying });
assert.deepEqual(excessLadder({ b: null, starter: null, full: null, carrying: false }, "US", money), []);
assert.deepEqual(excessLadder(L(0, true), "US", money).map((r) => r.state), ["now", "later", "later", "later"]);
assert.deepEqual(excessLadder(L(1500), "US", money).map((r) => r.state), ["done", "now", "later"]);
const full = excessLadder(L(9000), "NZ", money);
assert.deepEqual(full.map((r) => r.state), ["done", "done", "now"]);
assert.match(full[2].accounts![0].name, /KiwiSaver/);
assert.ok(full[2].accounts![0].plain);
// US accounts never reach another country's list, and every step names accounts, not funds.
assert.ok(!excessLadder(L(9000), "UK", money)[2].accounts!.some((a) => /401|HSA/.test(a.name)));
assert.equal(plainAccount("Something unknown"), null);

assert.equal(openStep(false, 0, 500), 1);
assert.equal(openStep(true, 1, 500), 2);
assert.equal(openStep(true, 0, 0), 2);
assert.equal(openStep(true, 0, 500), 3);
assert.equal(openStep(true, 0, null), 3);

console.log("steps: ok");
