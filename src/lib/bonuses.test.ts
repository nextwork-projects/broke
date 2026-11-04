// Run: node src/lib/bonuses.test.ts
import assert from "node:assert/strict";
import { OFFERS } from "./bonus-offers.ts";
import { couldGet, hasInstitution, matchOffer, rankMatches, type Offer, type Who } from "./bonuses.ts";

const offer = (o: Partial<Offer> = {}): Offer => ({
  id: "x", country: "US", kind: "checking", institution: "Example Bank", product: "Total Checking", bonus: 300, requirement: "Get $1,000 of direct deposits in 90 days.",
  directDeposit: 1000, depositWithinDays: 90, newMoney: null, holdDays: 90, monthlyFee: 12, feeWaiver: "Waived with $500 in direct deposits a month", expires: null,
  url: "https://example.com", checked: "2026-10-27", verified: "institution", ...o,
});
const who = (w: Partial<Who> = {}): Who => ({ country: "US", today: "2026-10-27", payMonthly: 4000, cash: 6000, spare: 800, institutions: ["Chase"], carrying: false, cushion: true, taxRate: 0.22, ...w });

let m = matchOffer(offer(), who());
assert.equal(m.verdict, "yes");
assert.equal(m.fees, 0, "direct deposit waives the fee");
assert.equal(m.tax, 66);
assert.equal(m.net, 234);
assert.ok(m.why.some((w) => /covers the \$1,000 of direct deposits/.test(w)));

assert.equal(matchOffer(offer({ institution: "Chase" }), who()).verdict, "no", "already a customer");
assert.ok(hasInstitution({ institutions: ["JPMorgan Chase"] }, "Chase"));
assert.ok(!hasInstitution({ institutions: ["Ally"] }, "Chase"));
assert.equal(matchOffer(offer({ directDeposit: 15000, depositWithinDays: 90 }), who()).verdict, "no", "pay too small for the deposit");
assert.equal(matchOffer(offer(), who({ payMonthly: null })).verdict, "maybe", "no paychecks found yet");
assert.equal(matchOffer(offer({ expires: "2026-10-01" }), who()).verdict, "no", "ended");
assert.equal(matchOffer(offer({ country: "GB" }), who()).verdict, "no");
assert.equal(matchOffer(offer(), who({ carrying: true })).verdict, "maybe", "card interest comes first");
assert.equal(matchOffer(offer(), who({ cushion: false })).verdict, "maybe");

m = matchOffer(offer({ directDeposit: null, newMoney: 15000, holdDays: 90, kind: "savings", feeWaiver: null }), who());
assert.equal(m.verdict, "no", "not enough cash to move in");
assert.equal(m.fees, 36, "3 months of a $12 fee with no waiver");
assert.equal(matchOffer(offer({ directDeposit: null, newMoney: 5000 }), who()).verdict, "yes");

const gb = matchOffer(offer({ country: "GB", switch: true, directDeposit: 1000, monthlyFee: 0 }), who({ country: "GB", institutions: [] }));
assert.equal(gb.verdict, "maybe", "a full switch needs checking");
assert.equal(gb.tax, 0, "no US tax outside the US");

const ranked = rankMatches([matchOffer(offer({ id: "a", institution: "Chase" }), who()), matchOffer(offer({ id: "b", bonus: 200, institution: "Bank B" }), who()), matchOffer(offer({ id: "c", bonus: 500, institution: "Bank C" }), who())]);
assert.deepEqual(ranked.map((x) => x.offer.id), ["c", "b", "a"]);
assert.equal(couldGet(ranked), ranked[0].net + ranked[1].net);
// Tiers: the best one their pay reaches.
const tiered = offer({ bonus: 900, directDeposit: 10000, tiers: [{ bonus: 425, requirement: "$2,500+", need: 2500 }, { bonus: 600, requirement: "$5,000+", need: 5000 }, { bonus: 900, requirement: "$10,000+", need: 10000 }] });
m = matchOffer(tiered, who({ payMonthly: 2000 }));
assert.equal(m.verdict, "yes");
assert.equal(m.bonus, 600, "$2,000 a month for 90 days reaches the $5,000 tier");
assert.ok(m.notes.some((w) => /\$600 tier, not the top \$900/.test(w)));
assert.equal(matchOffer(tiered, who({ payMonthly: 500 })).verdict, "no", "below the lowest tier");
assert.equal(matchOffer(tiered, who({ payMonthly: 4000 })).bonus, 900);
// Investing: short on cash is only a maybe (investments elsewhere can move in).
assert.equal(matchOffer(offer({ kind: "brokerage", directDeposit: null, newMoney: 100000, monthlyFee: null }), who()).verdict, "maybe");
assert.ok(matchOffer(offer({ monthlyFee: null }), who()).notes.some((w) => /Check the monthly fee/.test(w)));
assert.ok(matchOffer(offer({ verified: "tracker" }), who()).notes.some((w) => /deal-tracking site/.test(w)));
// Total: one per institution and kind; non-cash never counts.
const two = [matchOffer(offer({ id: "c1", bonus: 400 }), who()), matchOffer(offer({ id: "c2", bonus: 300 }), who()), matchOffer(offer({ id: "fee", institution: "ii", bonus: 150, cash: false }), who())];
assert.equal(couldGet(two), two[0].net, "two offers on one account count once, the credit not at all");

// The real list: well formed, and every tier's need is a real number.
for (const o of OFFERS) {
  assert.ok(/^https:\/\//.test(o.url) && /^2026-\d\d-\d\d$/.test(o.checked), o.id);
  assert.ok(["US", "GB"].includes(o.country) && o.bonus > 0, o.id);
  for (const t of o.tiers ?? []) assert.ok(t.need > 0 && t.bonus <= o.bonus, o.id);
}
assert.equal(new Set(OFFERS.map((o) => o.id)).size, OFFERS.length, "ids are unique");
console.log("bonuses ok");
