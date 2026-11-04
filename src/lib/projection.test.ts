// Run: node src/lib/projection.test.ts
import assert from "node:assert/strict";
import { deterministicMoves, type Facts } from "./plan.ts";
import { at, flows, laterOf, project, type PMove } from "./projection.ts";

const today = "2026-10-23";
const mv = (m: Partial<PMove>): PMove => ({ ref: "other", kind: "cancel", section: "bills", once: false, gate: null, yearly_impact: 0, status: "todo", done_at: null, ...m });
const near = (a: number, b: number, tol = 1) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);

// A $0 plan is a flat line.
const flat = project(flows([mv({}), mv({ ref: "fund:starter", kind: "save", section: "saving" })], today, 0.12), { months: 360, growth: 0.06 });
assert.equal(flat.length, 361);
assert.ok(flat.every((p) => p.total === 0));
assert.equal(project([], { months: 12, growth: 0.06 }).at(-1)!.total, 0);

// Yearly moves count every year; one-time moves count once.
const yearly = project(flows([mv({ yearly_impact: 1200 })], today, null), { months: 60, growth: 0.06 });
near(at(yearly, 12).kept, 1200);
near(at(yearly, 60).kept, 6000);
const once = project(flows([mv({ yearly_impact: 500, once: true, kind: "signup", section: "cards" })], today, null), { months: 60, growth: 0.06 });
near(at(once, 0).kept, 500);
near(at(once, 60).kept, 500);
// Dismissed moves don't count.
assert.equal(at(project(flows([mv({ yearly_impact: 900, status: "dismissed" })], today, null), { months: 12, growth: 0 }), 12).total, 0);

// Compounding: the match is employer money that grows; with 0% it is just the sum.
const match = [mv({ ref: "match", kind: "signup", section: "saving", yearly_impact: 1200 })];
const m0 = project(flows(match, today, 0.12), { months: 120, growth: 0 });
near(at(m0, 120).put, 12000);
assert.equal(at(m0, 120).growth, 0);
const m6 = project(flows(match, today, 0.12), { months: 120, growth: 0.06 });
// $100 a month at 6% a year for 10 years (deposit, then a month's growth): about $16,470.
near(at(m6, 120).total, 100 * ((Math.pow(1.06, 10) - 1) / (Math.pow(1.06, 1 / 12) - 1)) * Math.pow(1.06, 1 / 12), 2);
assert.ok(at(m6, 120).growth > 4000);
// A contribution move: its yearly value is tax saved; the contribution (value / rate) is invested.
const hsa = project(flows([mv({ ref: "room:hsa", kind: "earn", section: "tax", yearly_impact: 240 })], today, 0.12), { months: 12, growth: 0 });
near(at(hsa, 12).tax, 240);
near(at(hsa, 12).put, 2000);
// No rate (outside the US): the contribution can't be worked out, so only the tax figure counts.
near(at(project(flows([mv({ ref: "room:hsa", kind: "earn", section: "tax", yearly_impact: 240 })], today, null), { months: 12, growth: 0 }), 12).put, 0);

// Done moves count from their done_at date: 6 months ago at $1,200 a year is $600 by today.
const done = project(flows([mv({ yearly_impact: 1200, status: "done", done_at: "2026-04-23T10:00:00Z" })], today, null), { months: 12, growth: 0 });
near(at(done, 0).kept, 600, 1);
near(at(done, 12).kept, 1800, 1);
const doneOnce = project(flows([mv({ yearly_impact: 300, once: true, status: "done", done_at: "2026-09-20" })], today, null), { months: 12, growth: 0 });
near(at(doneOnce, 0).kept, 300);

// Gated moves only in "possible later", from the facts, after the steps above.
const facts: Facts = {
  today, country: "US", currency: "USD", state: "CA", monthlySpend: 3000, bills: [], priceHikes: [], duplicates: [], idle: null,
  match: null, room: [{ label: "HSA", kind: "hsa", left: 4000, deadline: "April 15, 2027", due: "2027-04-15" }],
  cards: null, rent: null, interest90: 90, fees90: 0, topCategories: [], topMerchants: [], bigCharges: [],
  tax: { filing: "single", band: [50000, 100000], rate: 0.12, rateNote: "", guessed: false, work: "W-2 employee", age: "30-39", dependents: "0", covered: true, refunds365: 0, payments365: 0, side90: 0, sideFrom: [], losses: [], charity365: 0, studentLoan365: 0, childcare365: 0 },
  allowedUrls: [], goals: [], debts: [{ kind: "card", balance: 1200 }],
  budget: { income: 3000, spend: 3000, cash: 0, essentials: 1000, essentialsAll: false }, // $0 spare
};
const plan = deterministicMoves(facts).map((m) => ({ ...m, status: "todo", done_at: null }));
const room = plan.find((m) => m.ref === "room:hsa")!;
assert.equal(room.yearly_impact, 0, "gated today");
assert.ok(room.gate);
const later = laterOf(facts, plan);
assert.equal(later.why, "unknown");
assert.equal(later.delay, 12);
assert.deepEqual(later.extra.find((e) => e.ref === "room:hsa"), { ref: "room:hsa", yearly: 480 });
assert.equal(later.fund, 1500, "starter fund: half a month of $3,000 spending beats $1,000 essentials");
const fs = flows(plan, today, 0.12, later);
assert.ok(fs.filter((f) => f.layer === "counted").every((f) => f.bucket === "kept"), "nothing gated is counted");
const counted = project(fs.filter((f) => f.layer === "counted"), { months: 60, growth: 0.06 });
const possible = project(fs.filter((f) => f.layer === "later"), { months: 60, growth: 0 });
near(at(possible, 11).tax, 0, 0); // starts after the 12-month delay
near(at(possible, 12).tax, 480);
near(at(possible, 24).tax, 480);
near(at(possible, 24).put, 4000 + 1500);
near(at(possible, 60).tax, 480, 0); // a contribution counts once, at this year's room
assert.deepEqual(later.first, ["card", "fund"]);
assert.ok(at(counted, 60).tax === 0 && at(counted, 60).put === 0);
// With spare money the delay is timed from it: $1,200 card + $1,500 fund at $300 a month = 9 months.
const spare = laterOf({ ...facts, budget: { ...facts.budget!, spend: 2700 } }, plan);
assert.equal(spare.why, "spare");
assert.equal(spare.delay, 9);
// Nothing above it to finish: no delay.
assert.equal(laterOf({ ...facts, interest90: 0, debts: [], budget: { ...facts.budget!, cash: 5000 } }, plan).delay, 0);

console.log("projection ok");
