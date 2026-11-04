// Run: node src/lib/invest.test.ts
import assert from "node:assert/strict";
import { deadline, feeCost30, isContribution, limitFor, localRoom, taxYear } from "./invest.ts";

assert.equal(limitFor("k401", 2026).limit, 24500);
assert.equal(limitFor("k401", 2026, { age: "50-59" }).limit, 32500);
assert.equal(limitFor("ira", 2026, { age: "60+" }).limit, 8600);
assert.equal(limitFor("ira", 2025).limit, 7000);
assert.equal(limitFor("ira", 2031).limit, 7500, "unknown year falls back to the newest table");
let h = limitFor("hsa", 2026);
assert.equal(h.limit, 4400);
assert.match(h.note, /self-only/);
assert.equal(limitFor("hsa", 2026, { dependents: "2" }).limit, 8750);
assert.equal(limitFor("hsa", 2026, { age: "60+" }).limit, 5400);
h = limitFor("hsa", 2026, { age: "50-59" });
assert.equal(h.limit, 4400);
assert.match(h.note, /55 or older/);
assert.equal(deadline("hsa", 2026), "April 15, 2027");
assert.equal(deadline("k401", 2026), "Dec 31, 2026");

assert.ok(isContribution({ type: "cash", subtype: "contribution", amount: -500 }));
assert.ok(isContribution({ type: "transfer", subtype: "transfer", amount: -500 }));
assert.ok(!isContribution({ type: "cash", subtype: "dividend", amount: -12 }));
assert.ok(!isContribution({ type: "buy", subtype: "buy", amount: 500 }));

assert.equal(feeCost30(10000, 0.03), 0);
assert.equal(feeCost30(10000, 0), 0, "cheaper than the index fund costs nothing extra");
// $10,000 at 1% vs 0.03% for 30 years: 10000 * (1.0697^30 - 1.06^30)
assert.equal(Math.round(feeCost30(10000, 1)), Math.round(10000 * (1.0697 ** 30 - 1.06 ** 30)));
assert.ok(feeCost30(10000, 1) > 18000 && feeCost30(10000, 1) < 19000);
// Tax years start on different days per country.
assert.deepEqual([taxYear([4, 6], "2026-04-05").label, taxYear([4, 6], "2026-04-06").label], ["2025-26", "2026-27"], "UK year turns on 6 April");
assert.equal(taxYear([4, 6], "2026-10-22").to, "2027-04-05");
assert.equal(taxYear([7, 1], "2026-06-30").to, "2026-06-30", "NZ/AU year ends 30 June");
assert.deepEqual([taxYear([1, 1], "2026-10-22").label, taxYear([1, 1], "2026-10-22").to], ["2026", "2026-12-31"]);
assert.equal(taxYear([4, 1], "2027-03-31").from, "2026-04-01");

// NZ: a target, not a cap. Linked beats typed; typed fills in; neither leaves the row with no room figure.
let [k] = localRoom("nz", "2026-10-22", {}, { kiwisaver: 600 }, { "kiwisaver:2026-27": 999 }, "en-NZ");
assert.equal(k.goal, true);
assert.equal(k.from, "linked");
assert.equal(Math.round(k.left! * 100), 44286);
assert.equal(k.deadline, "30 June 2027");
[k] = localRoom("nz", "2026-10-22", {}, {}, { "kiwisaver:2026-27": 2000 });
assert.equal(k.from, "you");
assert.ok(k.left! < 0);
[k] = localRoom("nz", "2026-10-22", {}, {}, { "kiwisaver:2025-26": 500 });
assert.equal(k.contributed, null, "last year's typed figure doesn't count");
assert.equal(k.left, null);

// CA: RRSP for 2026 can go in during the first 60 days of 2027.
const ca = localRoom("ca", "2026-10-22", {}, {}, {}, "en-CA");
assert.deepEqual(ca.map((r) => [r.kind, r.limit]), [["rrsp", 33810], ["tfsa", 7000]]);
assert.match(ca[0].deadline, /March 1, 2027/);
// IE: limit depends on earnings, so it stays null and the note carries the age band.
const [ie] = localRoom("ie", "2026-10-22", { age: "40-49" }, {});
assert.equal(ie.limit, null);
assert.match(ie.note, /25%/);
assert.deepEqual(localRoom("none", "2026-10-22", {}, {}), []);
assert.deepEqual(localRoom("uk", "2026-10-22", {}, {}).map((r) => r.limit), [20000, 60000]);
assert.equal(limitFor("hsa", 2026, { hsaCover: "Me and family" }).limit, 8750, "told family beats the kids guess");
assert.equal(limitFor("hsa", 2026, { hsaCover: "Just me", dependents: "2" }).limit, 4400);
assert.equal(limitFor("hsa", 2026, { dependents: "2" }).limit, 8750, "no answer: kids mean family");
console.log("invest ok");
