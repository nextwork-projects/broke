// Run: node src/lib/subscriptions.test.ts
import assert from "node:assert/strict";
import { cancelPrompt, cancelUrl, negotiable, negotiatePrompt, priceHike, subscriptionAlerts, type Charge, type Stream } from "./subscriptions.ts";

const tx = (merchant_name: string, amount: number, date: string): Charge => ({ merchant_name, name: merchant_name.toUpperCase(), amount, date });
const s = (merchant_name: string, average_amount = 10, more: Partial<Stream> = {}): Stream => ({ merchant_name, average_amount, frequency: "MONTHLY", ...more });
const netflix = [tx("Netflix", 15.49, "2026-06-03"), tx("Netflix", 15.49, "2026-07-03"), tx("Netflix", 15.49, "2026-08-03"), tx("Netflix", 17.99, "2026-09-03")];

assert.deepEqual(priceHike(s("Netflix"), netflix), { from: 15.49, to: 17.99, date: "2026-09-03" });
assert.equal(priceHike(s("Netflix"), netflix.slice(0, 3)), null, "steady price");
assert.equal(priceHike(s("Netflix"), netflix.slice(2)), null, "needs 2 earlier charges");
assert.equal(priceHike(s("Electric"), [tx("Electric", 80, "2026-06-01"), tx("Electric", 120, "2026-07-01"), tx("Electric", 140, "2026-08-01")]), null, "variable bill is not a hike");
assert.equal(priceHike(s("Netflix"), [...netflix, tx("Netflix", -17.99, "2026-09-10")]).to, 17.99, "refunds ignored");

const a = subscriptionAlerts(
  [s("Netflix", 17.99), s("Spotify", 11.99), s("Apple Music", 131.88, { frequency: "ANNUALLY" }), s("Hulu", 9.99, { active: false }), s("Gym", 50), s("GYM", 50), s("Payroll", 2000, { is_income: true }), s("Payroll", 2000, { is_income: true })],
  netflix,
);
assert.deepEqual(a.map((x) => x.kind), ["price_hike", "duplicate", "duplicate"]);
assert.deepEqual(a[1], { kind: "duplicate", group: "music", same: false, merchants: ["Spotify", "Apple Music"], monthly: 22.98 });
assert.deepEqual(a[2], { kind: "duplicate", group: "Gym", same: true, merchants: ["Gym", "GYM"], monthly: 100 });

assert.equal(cancelUrl("NETFLIX.COM"), "https://www.netflix.com/cancelplan");
assert.equal(cancelUrl("Touchstone Climbing"), null);
assert.match(cancelPrompt(s("Netflix", 17.99)), /netflix\.com\/cancelplan/);
assert.match(cancelPrompt(s("Touchstone Climbing", 78.5)), /Do not give a cancel link/);

assert.equal(negotiable("Comcast Xfinity"), "internet");
assert.equal(negotiable("T-Mobile"), "phone");
assert.equal(negotiable("GEICO"), "insurance");
assert.equal(negotiable("Farmers Market"), null);
assert.equal(negotiable("Acme Fiber", "RENT_AND_UTILITIES_INTERNET_AND_CABLE"), "internet");
assert.match(negotiatePrompt(s("Verizon", 85), "phone", "Texas"), /\$85\.00 a month.*Texas/);
console.log("subscriptions: ok");
