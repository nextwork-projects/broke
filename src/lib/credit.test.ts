// Run: node src/lib/credit.test.ts
import assert from "node:assert/strict";
import { bandLabel, creditOf, monthText } from "./credit.ts";

assert.equal(creditOf(undefined), null);
assert.equal(creditOf({}), null);
assert.equal(creditOf({ credit: "Excellent (740+)" }), null, "a label is not a band");
assert.deepEqual(creditOf({ credit: "good" }), { band: "good", source: "self" });
assert.deepEqual(creditOf({ credit: "none", creditAsOf: "2026-09" }), { band: "none", source: "self", asOf: "2026-09" });
assert.deepEqual(creditOf({ credit: "fair", creditAsOf: "2026-13" }), { band: "fair", source: "self" }, "bad month dropped");
assert.equal(bandLabel("poor"), "Poor (under 580)");
assert.equal(bandLabel("nope"), undefined);
assert.equal(monthText("2026-09"), "September 2026");

console.log("credit ok");
