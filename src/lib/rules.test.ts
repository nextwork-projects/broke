// node src/lib/rules.test.ts
import assert from "node:assert/strict";
import { applyRules, validRules, conditions, describeMatch, inDays, matches, mergeTags, type Rule } from "./rules.ts";

const r = (x: Partial<Rule>): Rule => ({ id: "r", match: "uber", amount_min: null, amount_max: null, category_id: null, rename: null, ignore: null, add_tags: null, ...x });
const uber = { name: "UBER *TRIP 8812", merchant_name: "Uber", amount: 23.5 };

assert.ok(matches(r({}), uber));
assert.ok(matches(r({ match: "  TRIP " }), uber), "trims and ignores case");
assert.ok(!matches(r({ match: "lyft" }), uber));
assert.ok(!matches(r({ match: " " }), uber), "blank never matches");
assert.ok(matches(r({ amount_min: 20, amount_max: 30 }), uber));
assert.ok(!matches(r({ amount_max: 20 }), uber));
assert.ok(matches(r({ amount_min: 100 }), { ...uber, amount: -150 }), "refunds compare by size");

// Newest first: the first rule to set a field wins, later rules fill the rest.
const p = applyRules([r({ category_id: "travel" }), r({ category_id: "transport", rename: "Uber", ignore: true })], uber);
assert.deepEqual(p, { category_id: "travel", custom_name: "Uber", ignored: true });
assert.deepEqual(applyRules([r({ match: "lyft", category_id: "x" })], uber), {});

// Tags from every matching rule add up, without case duplicates.
assert.deepEqual(applyRules([r({ add_tags: ["Work", "travel"] }), r({ add_tags: ["work", "rides"] })], uber).tags, ["Work", "travel", "rides"]);
assert.deepEqual(mergeTags([" a ", "B"], ["b", "", "c"]), ["a", "B", "c"]);

assert.equal(describeMatch(r({ amount_min: 10, amount_max: 40 })), 'Name contains "uber", amount from $10 to $40');
assert.equal(describeMatch(r({ amount_max: 5 })), 'Name contains "uber", amount is up to $5');
assert.equal(describeMatch(r({ match: "", account_id: "a1", day_from: 1, day_to: 1 }), undefined, "Checking"), "Account is Checking, on the 1st of the month");
assert.deepEqual(conditions(r({ match: "", day_from: 22, day_to: 3 })), [{ label: "On the", value: "22nd to 3rd of the month" }]);

// Account and day of the month (migration 0020). Name is optional once something else is set.
const rent = { name: "ACH RENT", amount: 1800, account_id: "chk", date: "2026-10-01" };
assert.ok(matches(r({ match: "", account_id: "chk" }), rent), "account alone");
assert.ok(!matches(r({ match: "", account_id: "sav" }), rent));
assert.ok(!matches(r({ match: "" }), rent), "no conditions matches nothing");
assert.ok(matches(r({ match: "rent", day_from: 1, day_to: 5 }), rent));
assert.ok(!matches(r({ match: "rent", day_from: 2, day_to: 5 }), rent));
assert.ok(!matches(r({ match: "rent", day_from: 1 }), { ...rent, date: null }), "a day rule needs a date");
assert.ok(matches(r({ match: "", amount_min: 1000 }), rent), "amount alone");
assert.ok(inDays(30, 28, 3) && inDays(2, 28, 3) && !inDays(10, 28, 3), "wraps past the month end");
assert.ok(inDays(7, 7, null) && !inDays(8, 7, null), "one side is that day only");
// Direction: the same name goes to different categories by which way the money moved.
{
  const out = { name: "To USD Moved", amount: 6000 }, into = { name: "From NZD Moved", amount: -3524 };
  assert.ok(matches(r({ match: "moved", direction: "out" }), out));
  assert.ok(!matches(r({ match: "moved", direction: "out" }), into));
  assert.ok(matches(r({ match: "moved", direction: "in" }), into));
  assert.ok(!matches(r({ match: "moved", direction: "in" }), out));
  assert.ok(matches(r({ match: "moved" }), into), "no direction: both ways");
  const cats = [{ id: "i", label: "Transfers in" }, { id: "o", label: "Transfers out" }];
  assert.deepEqual(validRules([
    { match: " Moved ", direction: "in", category: "transfers IN" },
    { match: "moved", direction: "in", category: "Transfers in" }, // repeat
    { match: "moved", direction: "out", category: "Transfers out" },
    { match: "x", category: "Transfers in" }, // too short: would sweep up nearly everything
    { match: "", direction: "in", category: "Transfers in" },
    { match: "shop", category: "Made up" }, // no such category
    { match: "uber", direction: "sideways", category: "Transfers out" }, // bad direction: dropped, the rule stays
    null,
  ], cats), [
    { match: "Moved", direction: "in", category_id: "i", category: "Transfers in" },
    { match: "moved", direction: "out", category_id: "o", category: "Transfers out" },
    { match: "uber", direction: null, category_id: "o", category: "Transfers out" },
  ]);
  assert.deepEqual(validRules("nope", cats), []);
}

console.log("rules ok");
