// node src/lib/unsure.test.ts
import assert from "node:assert/strict";
import { toCheck, unsureReason, type CheckRow } from "./unsure.ts";

const cat = (key: string, label: string, kind: "spend" | "income" | "transfer") => ({ id: key, key, label, kind });
const row = (x: Partial<CheckRow>): CheckRow => ({
  id: "t", date: "2026-10-01", amount: 20, name: "Starbucks", merchant_name: "Starbucks", custom_name: null, logo_url: null, currency: null,
  category_id: "FOOD", plaid_confidence: "HIGH", manual: false, category: cat("FOOD_AND_DRINK", "Dining & drinks", "spend"), ...x,
});

assert.equal(unsureReason(row({})), null, "a named, confident spend row is fine");
assert.equal(unsureReason(row({ category: null })), "none");
assert.equal(unsureReason(row({ category: cat("OTHER", "Other", "spend") })), "none", "Other counts as no category");
assert.equal(unsureReason(row({ plaid_confidence: "LOW" })), "low");
assert.equal(unsureReason(row({ amount: -522 })), "money-in", "money in on a spend category");
assert.equal(unsureReason(row({ amount: -522, category: cat("INCOME", "Income", "income") })), null, "pay on Income is fine");
assert.equal(unsureReason(row({ amount: 2500, category: cat("TRANSFER_OUT", "Transfers out", "transfer") })), "transfer");
assert.equal(unsureReason(row({ amount: 100, category: cat("TRANSFER_OUT", "Transfers out", "transfer") })), null, "a small transfer is fine");
assert.equal(unsureReason(row({ merchant_name: null, name: "CHECK 3341" })), "unknown");
assert.equal(unsureReason(row({ merchant_name: null, name: "Interest charged", category: cat("BANK_FEES", "Fees", "spend") })), null, "bankEvent places interest");
assert.equal(unsureReason(row({ merchant_name: null, name: "Cash", manual: true })), null, "typed by hand: the user named it");

const c = toCheck([row({ id: "a", category: null, amount: 12 }), row({ id: "b" }), row({ id: "c", amount: -900 }), row({ id: "d", plaid_confidence: "LOW", amount: 300 })], 2);
assert.deepEqual(c.rows.map((r) => r.id), ["c", "d"], "biggest unsure first");
assert.equal(c.total, 3);
const g = toCheck([row({ id: "s1", amount: -810 }), row({ id: "s2", amount: -810 }), row({ id: "x", category: null, amount: 5 })]);
assert.deepEqual(g.rows.map((r) => r.same), [["s1", "s2"], ["x"]], "same name and reason is one question");
assert.equal(g.total, 2, "total counts questions, not transactions");
console.log("unsure ok");
