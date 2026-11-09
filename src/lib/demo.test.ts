// Run: node src/lib/demo.test.ts
import assert from "node:assert/strict";
import { demoBank } from "./demo.ts";

const a = demoBank("2026-11-09"), b = demoBank("2026-11-09");
assert.deepEqual(a, b, "the same every time");
assert.ok(a.txns.length > 150 && a.txns.length < 400, `${a.txns.length} transactions`);
assert.ok(a.txns.every((t) => t.date >= "2026-08-06" && t.date <= "2026-11-09"), "inside the last 95 days");
const pay = a.txns.filter((t) => t.category === "INCOME");
assert.ok(pay.length >= 6 && pay.every((t) => t.amount === -1850), "pay every other week, as money in");
assert.ok(a.txns.some((t) => t.name === "Delta Air Lines"), "one unusual month");
for (const m of ["2026-09", "2026-10"]) {
  const out = a.txns.filter((t) => t.date.startsWith(m) && t.category === "CREDIT_CARD_PAYMENT").reduce((s, t) => s + t.amount, 0);
  assert.equal(Math.round(out * 100), 0, `${m}: the card payment leaves checking and lands on the card`);
}
assert.ok(a.streams.every((s) => s.next > s.last), "each bill's next date comes after its last");
console.log("demo: ok");
