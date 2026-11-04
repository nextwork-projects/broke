// Run: node src/lib/fx.test.ts
import assert from "node:assert/strict";
import { rateRows } from "./fx.ts";

const rows = rateRows({ base: "EUR", rates: { "2026-10-21": { USD: 1.12, NZD: 1.97 }, "2026-10-22": { USD: 1.1205 } } });
assert.deepEqual(rows, [
  { date: "2026-10-21", base: "EUR", quote: "USD", rate: 1.12 },
  { date: "2026-10-21", base: "EUR", quote: "NZD", rate: 1.97 },
  { date: "2026-10-22", base: "EUR", quote: "USD", rate: 1.1205 },
]);
assert.deepEqual(rateRows({ base: "EUR", rates: {} }), []);
console.log("fx rows ok");
