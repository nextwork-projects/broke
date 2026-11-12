// Run: node src/lib/recurring-find.test.ts
import assert from "node:assert/strict";
import { cleanName, findRecurring, nextAfter } from "./recurring-find.ts";

const today = "2026-11-11";
const monthly = (name: string, amounts: number[], day = "05", category: string | null = "RENT_AND_UTILITIES") =>
  amounts.map((amount, i) => ({ name, date: `2026-${String(6 + i).padStart(2, "0")}-${day}`, amount, category }));

// A bill that varies (electricity) is found; next date is after today.
let f = findRecurring(monthly("PG&E Electric", [62, 90, 118, 84, 75, 101]), today);
assert.equal(f.length, 1);
assert.equal(f[0].frequency, "MONTHLY");
assert.equal(f[0].next_date, "2026-12-05");
assert.equal(f[0].status, "MATURE");
assert.equal(f[0].is_income, false);

// Pay every 2 weeks, money in.
const pay = [0, 14, 28, 42, 56].map((d) => ({ name: "Northwind Labs Payroll", date: new Date(Date.UTC(2026, 8, 4 + d)).toISOString().slice(0, 10), amount: -2150, category: "INCOME" }));
f = findRecurring(pay, today);
assert.equal(f[0].frequency, "BIWEEKLY");
assert.equal(f[0].is_income, true);

// Weekly groceries that vary aren't a bill; the same amount every week (a meal kit) is.
const weekly = (amount: (i: number) => number) => [0, 7, 14, 21, 28].map((d, i) => ({ name: "Whole Foods Market", date: new Date(Date.UTC(2026, 9, 3 + d)).toISOString().slice(0, 10), amount: amount(i), category: "GROCERIES" }));
assert.equal(findRecurring(weekly((i) => 55 + i * 17), today).length, 0);
assert.equal(findRecurring(weekly(() => 69.99), today).length, 1);

// Transfers are skipped; one-offs and random-day spending are not patterns.
assert.equal(findRecurring(monthly("Transfer to Savings", [300, 300, 300, 300], "22", "TRANSFER_OUT"), today).length, 0);
assert.equal(findRecurring([{ name: "Delta", date: "2026-07-03", amount: 386, category: "TRAVEL" }], today).length, 0);
assert.equal(findRecurring(["2026-10-01", "2026-10-03", "2026-10-10", "2026-10-11", "2026-10-25"].map((date) => ({ name: "Chipotle", date, amount: 14, category: "FOOD_AND_DRINK" })), today).length, 0);

// Names with store numbers group together.
assert.equal(cleanName("SPOTIFY USA #1234 NY"), cleanName("Spotify USA #9876 NY"));

// A subscription that stopped months ago is marked ended, not due.
f = findRecurring(monthly("Hulu", [17.99, 17.99, 17.99], "10", "ENTERTAINMENT").map((r) => ({ ...r, date: r.date.replace("2026-0", "2026-0").replace(/2026-(\d\d)/, (_, m) => `2026-${String(Number(m) - 4).padStart(2, "0")}`) })), today);
assert.equal(f[0].status, "TOMBSTONED");

// Yearly needs only 2.
assert.equal(findRecurring([{ name: "Amazon Prime", date: "2025-03-02", amount: 139, category: "GENERAL_MERCHANDISE" }, { name: "Amazon Prime", date: "2026-03-02", amount: 139, category: "GENERAL_MERCHANDISE" }], today)[0].frequency, "ANNUALLY");

assert.equal(nextAfter("2026-10-01", "MONTHLY", "2026-11-11"), "2026-12-01");
assert.equal(nextAfter("2026-01-31", "MONTHLY", "2026-02-10"), "2026-02-28", "short month");
assert.equal(nextAfter("2026-11-04", "BIWEEKLY", "2026-11-11"), "2026-11-18");
assert.equal(nextAfter("2025-03-02", "ANNUALLY", "2026-11-11"), "2027-03-02");
console.log("recurring-find: ok");
