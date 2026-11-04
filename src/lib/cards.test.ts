// Run: node src/lib/cards.test.ts
import assert from "node:assert/strict";
import { bestFit, bonusText, CARDS, creditNote, fitsCredit, catOf, earnsRewards, feeText, currentEarn, fit, ownedCards, rank, withReferrals, yearlySpend } from "./cards.ts";

const card = (id: string) => CARDS.find((c) => c.id === id)!;
const zero = { dining: 0, groceries: 0, travel: 0, transport: 0, entertainment: 0, other: 0 };
const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 0.01, `${a} != ${b}`);

assert.ok(CARDS.every((c) => c.referral === null), "catalogue never ships referral links");
assert.equal(new Set(CARDS.map((c) => c.id)).size, CARDS.length);
assert.equal(catOf("FOOD_AND_DRINK"), "dining");
assert.equal(catOf("RENT_AND_UTILITIES"), "other");

// Rewards spending leaves out interest, fees, tax, loan and card payments and transfers.
const rows = [
  { key: "FOOD_AND_DRINK", plaid: "FOOD_AND_DRINK_RESTAURANT", name: "Dunkin'", amount: 70 },
  { key: "BANK_FEES", plaid: "BANK_FEES_INTEREST_CHARGE", name: "Interest charged", amount: 41 },
  { key: "BANK_FEES", plaid: "BANK_FEES_OVERDRAFT_FEES", name: "Overdraft fee", amount: 35 },
  { key: "GOVERNMENT_AND_NON_PROFIT", plaid: "GOVERNMENT_AND_NON_PROFIT_TAX_PAYMENT", name: "IRS", amount: 744 },
  { key: "GOVERNMENT_AND_NON_PROFIT", plaid: "GOVERNMENT_AND_NON_PROFIT_GOVERNMENT_DEPARTMENTS_AND_AGENCIES", name: "Internal Revenue Service", amount: 744 },
  { key: "GOVERNMENT_AND_NON_PROFIT", plaid: "GOVERNMENT_AND_NON_PROFIT_DONATIONS", name: "Red Cross", amount: 20 },
  { key: "LOAN_PAYMENTS", plaid: "LOAN_PAYMENTS_CAR_PAYMENT", name: "Monthly payment", amount: 522 },
  { key: "OTHER", plaid: "LOAN_PAYMENTS_EWA", name: "Earnin", amount: 58 },
  { key: "TRANSFER_OUT", plaid: "TRANSFER_OUT_ACCOUNT_TRANSFER", name: "Transfer", amount: 200 },
  { key: "OTHER", plaid: "OTHER_OTHER", name: "Interest Charge on Purchases", amount: 12 },
];
assert.deepEqual(rows.filter(earnsRewards).map((r) => r.name), ["Dunkin'", "Red Cross"]);

// No spending history: the bonus is unknown, so "may not reach this in time" stays hidden.
const empty = fit(card("chase-sapphire-preferred"), zero);
assert.equal(empty.bonusReachable, null);
assert.ok(!bonusText(empty).some((l) => /may not reach/.test(l)));

// 6 months of history is annualised x2.
const today = new Date("2026-10-22");
const s = yearlySpend([{ date: "2026-04-25", amount: 100, key: "GROCERIES" }, { date: "2026-10-01", amount: 50, key: "MEDICAL" }], today);
near(s.groceries, (100 * 365) / 180);
near(s.other, (50 * 365) / 180);

// Caps: Blue Cash Preferred 6% on $6,000, then 1%.
const bcp = fit(card("amex-blue-cash-preferred"), { ...zero, groceries: 10000 });
near(bcp.earn, 6000 * 0.06 + 4000 * 0.01);
near(bcp.ongoing, bcp.earn - 95);
near(bcp.yearOne, bcp.earn); // $0 first-year fee, bonus unknown
assert.equal(bcp.bonus, null);

// Bonus only counts when monthly spend reaches the minimum in the window.
const csp = card("chase-sapphire-preferred");
assert.equal(fit(csp, { ...zero, other: 12000 }).bonusReachable, false); // $1,000/mo x 3 < $5,000
const big = fit(csp, { ...zero, dining: 6000, other: 18000 });
assert.equal(big.bonusReachable, true);
near(big.yearOne, 6000 * 0.03 + 18000 * 0.01 - 95 + 750);

// Cashback Match doubles year-one cash back.
const d = fit(card("discover-it"), { ...zero, other: 12000 });
near(d.bonus!, 200 + 120);
near(d.yearOne, 120 + 320);

// Flat 2% beats 1.5% on uncategorised spend, ongoing.
const r = rank(CARDS, { ...zero, other: 20000 }, "ongoing");
assert.ok(["citi-double-cash", "wells-fargo-active-cash", "capital-one-venture"].includes(r[0].card.id));

// Owned cards and what they earn now.
const owned = ownedCards([{ name: "Plaid Credit Card" }, { name: "CREDIT CARD", official_name: "Chase Freedom Unlimited Visa" }]);
assert.deepEqual(owned.map((c) => c.id), ["chase-freedom-unlimited"]);
near(currentEarn(owned, { ...zero, dining: 1000, other: 1000 })!, 30 + 15);
assert.equal(currentEarn([], zero), null);
assert.equal(ownedCards([{ name: "Venture X" }]).length, 0);

// Referral links: https on the issuer's domain only.
const warned: string[] = [];
const w = withReferrals(CARDS, {
  "chase-sapphire-preferred": "https://www.referyourchasecard.com/19x/ABC",
  "amex-gold": "https://americanexpress.com.evil.example/x",
  "citi-double-cash": "http://www.citi.com/x",
  "capital-one-venture": "https://user@i.capitalone.com/x",
  "nope": "https://chase.com",
}, (m) => warned.push(m));
assert.equal(w.find((c) => c.id === "chase-sapphire-preferred")!.referral, "https://www.referyourchasecard.com/19x/ABC");
assert.equal(w.filter((c) => c.referral).length, 1);
assert.equal(warned.length, 4);

assert.equal(feeText(card("amex-blue-cash-preferred")), "$0 first year, then $95");
assert.deepEqual(bonusText(fit(csp, { ...zero, other: 1200 })), ["Sign-up bonus: 75,000 Ultimate Rewards points when you spend $5,000 in the first 3 months.", "Your usual spending may not reach this in time."]);
assert.deepEqual(bonusText(fit(card("amex-gold"), zero)), ["Bonus: check the issuer's page."]);

// Credit fit: only issuer-stated levels; no level = Experian's general "good or better" rule.
assert.deepEqual(CARDS.filter((c) => c.credit).map((c) => `${c.id}:${c.credit}`), ["capital-one-venture:excellent", "capital-one-savor:excellent", "capital-one-quicksilver:excellent", "discover-it-secured:building"]);
const secured = card("discover-it-secured"), venture = card("capital-one-venture"), dc = card("citi-double-cash");
for (const b of [undefined, null, "unsure"] as const) assert.equal(fitsCredit(venture, b), null, "no band: nothing filtered");
assert.ok(CARDS.every((c) => fitsCredit(c, "excellent")), "excellent fits every card");
assert.equal(fitsCredit(venture, "good"), false);
assert.equal(fitsCredit(dc, "good"), true);
for (const b of ["fair", "poor", "none"] as const) {
  assert.equal(fitsCredit(dc, b), false);
  assert.equal(fitsCredit(secured, b), true);
  const r = rank(CARDS, { ...zero, other: 20000 }, "yearOne", b);
  assert.equal(r.length, CARDS.length, "nothing hidden");
  assert.equal(r[0].card.id, "discover-it-secured", `secured first for ${b}`);
  assert.equal(bestFit(r)!.card.id, "discover-it-secured");
}
assert.equal(creditNote(venture), "Capital One lists this card for excellent credit.");
assert.equal(creditNote(dc), "Usually needs Good credit or better.");
const good = rank(CARDS, { ...zero, other: 20000 }, "yearOne", "good");
assert.ok(good.findIndex((f) => f.fitsCredit === false) > good.findLastIndex((f) => f.fitsCredit !== false), "fits sorted above the rest");
assert.ok(!["capital-one-venture", "capital-one-savor", "capital-one-quicksilver"].includes(bestFit(good)!.card.id));
assert.equal(bestFit(rank(CARDS, { ...zero, other: 20000 }))!.card.id, bestFit(rank(CARDS, { ...zero, other: 20000 }, "yearOne", "unsure"))!.card.id, "not sure ranks as before");

console.log("cards ok");
