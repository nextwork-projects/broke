// Run: node src/lib/logos.test.ts
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { CARD_ART, CARDS } from "./cards.ts";
import { isGeneric, logoFor, logoSlug } from "./logos.ts";

const cases: [string, string | null][] = [
  ["UBER EATS", "uber-eats"], ["Uber Eats", "uber-eats"], ["Internal Revenue Service", "irs"], ["IRS", "irs"],
  ["Venmo", "venmo"], ["CASH APP TRANSFER", "cash-app"], ["TRANSFER PAYPAL ADD TO BALANCE INTERNET PAYMENT", "paypal"],
  ["Earnin", "earnin"], ["Brigit", "brigit"], ["Disney+", "disney-plus"], ["HBO Max", "max"], ["Chase", "chase"],
  ["American Express", "american-express"], ["Bank of America", "bank-of-america"], ["Capital One", "capital-one"],
  ["Applebee's", null], ["Max's Diner", null], ["Monthly payment", null], ["Tectra Inc", null], [" ", null],
];
for (const [name, slug] of cases) assert.equal(logoSlug(name), slug, name);

// Every slug and every card issuer has a file on disk.
const pub = new URL("../../public", import.meta.url).pathname;
for (const [name] of cases) { const f = logoFor(name); if (f) assert.ok(existsSync(pub + f), f); }
for (const c of CARDS) assert.ok(logoFor(c.issuer) && existsSync(pub + logoFor(c.issuer)), c.issuer);
for (const [id, a] of Object.entries(CARD_ART)) {
  assert.ok(CARDS.some((c) => c.id === id), id);
  assert.ok(existsSync(pub + a.src), a.src);
}

// Money-moving rows get the category icon; merchants do not.
for (const n of ["Monthly payment", "Interest charged", "CREDIT CARD 3333 PAYMENT *//", "AUTOMATIC PAYMENT - THANK", "CD DEPOSIT .INITIAL.", "INTRST PYMNT"]) assert.ok(isGeneric(n), n);
assert.ok(isGeneric("Some bank", "transfer"));
assert.ok(!isGeneric("Tectra Inc", "bills"));
assert.ok(!isGeneric("Madison Bicycle Center", "transport"));

console.log("logos ok");
