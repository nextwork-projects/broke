// Run: node src/lib/format.test.ts
import assert from "node:assert/strict";
import { cleanName, dayIn, hourIn, monthStart, plural, todayIn, ymd } from "./format.ts";

const cases: [string, string][] = [
  ["PURCHASE AUTHORIZED ON 05/27 ROYAL FARMS 100 MONUMENT AVE A P NATIONAL HARBOR MD 0846248421604 CARD 44", "Royal Farms Monument Ave"],
  ["72116609 POS PURCHASE EARNIN RE SC 6 721582259", "Earnin Re Sc"],
  ["Sweetgreen inc payroll ppd id", "Sweetgreen payroll"],
  ["5 PURCHASE-SIG DENNY'S 3669", "Denny's"],
  ["APPLE 857979823 NEWKIRK #4", "Apple Newkirk"],
  ["Uber", "Uber"],
];
for (const [raw, want] of cases) assert.equal(cleanName(raw), want, raw);
console.log(`cleanName: ${cases.length} cases ok`);

// Time zones: 2026-10-01 02:30 UTC is still Sep 30 in New York, already Oct 1 in Auckland.
const at = new Date("2026-10-01T02:30:00Z");
assert.equal(todayIn("America/New_York", at), "2026-09-30");
assert.equal(todayIn("Pacific/Auckland", at), "2026-10-01");
assert.equal(todayIn("UTC", at), "2026-10-01");
assert.equal(todayIn("Not/AZone", at), "2026-09-30"); // bad cookie falls back to New York
assert.equal(todayIn(undefined, at), "2026-09-30");
assert.equal(ymd(monthStart(dayIn("America/New_York", at))), "2026-09-01");
assert.equal(ymd(monthStart(dayIn("Pacific/Auckland", at), -1)), "2026-09-01");
assert.equal(dayIn("America/Los_Angeles", at).getUTCDate(), 30);
assert.equal(hourIn("America/New_York", at), 22);
assert.equal(hourIn("UTC", new Date("2026-10-01T00:05:00Z")), 0);
assert.equal(plural(1, "recurring charge"), "1 recurring charge");
assert.equal(plural(2, "account"), "2 accounts");
console.log("time zones + plural ok");

// Currency and locale: US default, the country's currency and locale, an amount in its own currency.
import { dateLabel, fmtFor, fmtWith, money, money0, monthLabel, parseAmount, signed } from "./format.ts";
assert.equal(money(1234.5), "$1,234.50");
assert.equal(money0(-0.2), "$0");
assert.equal(signed(-12), "+$12.00");
const nz = fmtWith(fmtFor({ country: "NZ" }));
assert.equal(nz.money(1234.5), "$1,234.50");
assert.equal(nz.currency, "NZD");
assert.equal(nz.money(10, "USD"), "US$10.00");
const de = fmtWith(fmtFor({ country: "DE" }));
assert.equal(de.money0(1234.4).replace(/\s/g, " "), "1.234 €");
assert.equal(fmtWith(fmtFor({ country: "JP" })).money(1234.6).replace("￥", "¥"), "¥1,235");
assert.equal(fmtFor({ country: "XX", currency: "AED" }).currency, "AED");
assert.equal(fmtFor(null).currency, "USD"); // existing users without a country
assert.equal(monthLabel(new Date("2026-03-01T00:00:00Z"), fmtFor({ country: "FR" })), "mars");
assert.equal(de.dateLabel("2026-10-01", { day: "numeric", month: "short" }), "1. Okt.");
assert.equal(dateLabel("2026-10-01", { day: "numeric", month: "short" }), "Oct 1");
assert.equal(parseAmount("$1,200.50"), 1200.5);
assert.equal(de.parseAmount("1.200,50 €"), 1200.5);
assert.equal(de.parseAmount("12,5"), 12.5);
assert.ok(Number.isNaN(parseAmount("abc")));
console.log("currency + locale ok");

// "Last audit Oct 23" at 01:30 UTC is still Oct 22 in Chicago. Calendar days never shift.
const chi = { currency: "USD", locale: "en-US", tz: "America/Chicago" };
assert.equal(dateLabel("2026-10-23T01:30:00.000Z", { month: "short", day: "numeric" }, chi), "Oct 22");
assert.equal(dateLabel("2026-10-23", { month: "short", day: "numeric" }, chi), "Oct 23");
assert.equal(dateLabel(new Date("2026-10-23T00:00:00Z"), { month: "short", day: "numeric" }, chi), "Oct 23");
console.log("dateLabel: ok");
