// Run: node src/lib/budget.test.ts
import assert from "node:assert/strict";
import { budgetChanges, daysBetween, scaleBudget, startPeriod, yearView, merge, month, perDay, roundUp, step, suggest, tone } from "./budget.ts";

assert.equal(roundUp(0), 0);
assert.equal(roundUp(42.1), 50);
assert.equal(roundUp(190), 190);
assert.equal(roundUp(201), 225);
assert.equal(roundUp(1001), 1050);
assert.equal(step(950), 25);

assert.deepEqual(month(new Date("2026-10-22T12:00:00Z")), { day: 22, days: 31, left: 10, pace: 22 / 31 });
assert.equal(month(new Date("2026-02-28T00:00:00Z")).left, 1);

{
  const months = [{ month: "2026-03", cats: { a: 100, b: 50, x: 999 } }, { month: "2026-01", cats: {} }, { month: "2026-02", cats: { a: 200 } }];
  const all = yearView(months, { a: 150, b: 50 }, null);
  assert.deepEqual(all.rows, [{ month: "2026-02", budget: 200, spent: 200 }, { month: "2026-03", budget: 200, spent: 150 }]); // empty January out; unbudgeted x not counted
  assert.equal(all.spent, 350);
  assert.equal(all.budget, 400);
  assert.deepEqual(yearView(months, { a: 150, b: 50 }, "a").rows.map((r) => [r.budget, r.spent]), [[150, 200], [150, 100]]);
  assert.deepEqual(yearView([], { a: 1 }, null).rows, []);
}

assert.equal(daysBetween("2026-09-01", "2026-09-30"), 30);
assert.equal(daysBetween("2026-09-01", "2026-09-01"), 1);
assert.equal(daysBetween("2026-02-27", "2028-03-01") > 730, true);
assert.equal(Math.round(scaleBudget(300, 30.44)), 300);
assert.equal(Math.round(scaleBudget(300, 61)), 601); // two months: about double

assert.equal(startPeriod(1, 500), "last");
assert.equal(startPeriod(3, 500), "last");
assert.equal(startPeriod(4, 500), "this");
assert.equal(startPeriod(1, 0), "this"); // nothing last month: never an empty month instead of an empty month

assert.equal(perDay(500, 200, 10), 30);
assert.equal(perDay(500, 600, 10), 0);
assert.equal(perDay(100, 0, 0), 100);

assert.equal(tone(50, 100), "ok");
assert.equal(tone(85, 100), "near");
assert.equal(tone(101, 100), "over");
assert.equal(tone(5, 0), "over");
assert.equal(tone(1677.12, 1677), "near");

assert.deepEqual(merge({ a: 1, b: 2 }, { a: null, c: 3 }), { b: 2, c: 3 });
// Dining averaged $142 but October is already $1,056: suggest $1,100 (the $50 step), not $150.
assert.equal(suggest(142, 1056), 1100);
assert.equal(suggest(142, 20), 150);
assert.equal(suggest(0, 0), 0);
console.log("budget: ok");

{
  const cats = [{ id: "a", label: "Groceries" }, { id: "b", label: "Coffee" }, { id: "c", label: "Rent" }];
  const got = budgetChanges({ groceries: 400.4, Coffee: null, Rent: 900, Pets: 50, Gym: null, Bad: -5, Worse: "9", Same: undefined }, cats, { a: 500, b: 30, c: 900 });
  assert.deepEqual(got, [
    { id: "a", label: "Groceries", from: 500, to: 400 }, // case-blind, rounded
    { id: "b", label: "Coffee", from: 30, to: null }, // removed
    { id: null, label: "Pets", from: null, to: 50 }, // new category; Rent unchanged, Gym unknown, Bad and Worse dropped
  ]);
  assert.deepEqual(budgetChanges({ Coffee: null }, cats, {}), []); // nothing to remove
}

// The usual month: one big month doesn't set the budget.
import { median as med, monthList as ml } from "./budget.ts";
assert.equal(med([120, 900, 140]), 140);
assert.equal(med([100, 200]), 150);
assert.equal(med([]), 0);
assert.equal(ml(["2026-10", "2026-08", "2026-09"]), "August, September and October");
assert.equal(ml(["2026-10"]), "October");
