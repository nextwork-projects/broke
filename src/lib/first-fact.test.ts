// node src/lib/first-fact.test.ts
import assert from "node:assert/strict";
import { firstFact, type FactInput } from "./first-fact.ts";

const $ = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const base: FactInput = { typical: { income: 3000, spend: 3410 }, interest90: 90, subs: [{ monthly: 15 }, { monthly: 10 }], top: { id: "c1", label: "Dining & drinks", month: "September", spent: 620, typical: 480 } };

const a = firstFact(base, $)!;
assert.equal(a.kind, "overspend");
assert.equal(a.headline, "You spend $410 a month more than you earn");
assert.equal(a.cta.href, "/plan");

const b = firstFact({ ...base, typical: { income: 3000, spend: 3050 } }, $)!;
assert.equal(b.kind, "interest", "under the overspend bar, interest is next");
assert.equal(b.headline, "You pay about $365 a year in card interest");

const c = firstFact({ ...base, typical: null, interest90: 0 }, $)!;
assert.equal(c.headline, "Your 2 subscriptions cost $300 a year");
assert.equal(firstFact({ ...base, typical: null, interest90: 0, subs: [{ monthly: 9 }] }, $)!.headline, "Your subscription costs $108 a year");

const d = firstFact({ ...base, typical: null, interest90: 0, subs: [] }, $)!;
assert.equal(d.headline, "You spent $620 on dining & drinks in September");
assert.equal(d.detail, "Your typical month is $480.");
assert.equal(d.cta.href, "/transactions?category=c1");

assert.equal(firstFact({ typical: { income: 0, spend: 0 }, interest90: 0, subs: [], top: null }, $), null, "never a $0 fact");
assert.equal(firstFact({ typical: null, interest90: 0.4, subs: [{ monthly: 0 }], top: { ...base.top!, spent: 0 } }, $), null);
console.log("first-fact ok");
