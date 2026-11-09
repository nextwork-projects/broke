// Run: node src/lib/pay.test.ts
import assert from "node:assert/strict";
import { payGuess } from "./pay.ts";

const weekly = ["2026-10-03", "2026-10-10", "2026-10-17", "2026-10-24"].map((date) => ({ name: "Sweetgreen", date, amount: -810.5, kind: "spend" }));
assert.deepEqual(payGuess(weekly), { name: "Sweetgreen", typical: 811, every: "week", count: 4 });
assert.equal(payGuess(weekly.map((r) => ({ ...r, kind: "income" }))), null, "already income");
assert.equal(payGuess(weekly, ["Sweetgreen"]), null, "they said it isn't pay");
assert.equal(payGuess(weekly.slice(0, 1)), null, "one deposit isn't a pattern");
assert.equal(payGuess([{ name: "Refund", date: "2026-10-01", amount: -900, kind: "spend" }, { name: "Refund", date: "2026-10-20", amount: -40, kind: "spend" }]), null, "amounts too different");
assert.equal(payGuess(weekly.map((r) => ({ ...r, amount: -50 }))), null, "small amounts aren't pay");
const monthly = ["2026-08-01", "2026-09-01", "2026-10-01"].map((date) => ({ name: "Acme Payroll", date, amount: -4000, kind: "transfer" }));
assert.equal(payGuess(monthly), null, "transfers between own accounts aren't pay");
assert.equal(payGuess([...weekly, ...monthly.map((r) => ({ ...r, kind: "spend" }))])!.name, "Acme Payroll", "the bigger pay by month wins: $4,000 a month beats $811 a week");
console.log("pay: ok");
