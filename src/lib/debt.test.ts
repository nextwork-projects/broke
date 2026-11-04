// Run: node src/lib/debt.test.ts
import assert from "node:assert/strict";
import { debtFacts, debtMonths, isInterest, monthsAfter, payoff, type DebtRow } from "./debt.ts";

// A $1,000 debt at 12% (1% a month), $100 a month: the textbook answer is 11 months, about $59 of interest.
const p = payoff(1000, 12, 100)!;
assert.equal(p.never, false);
assert.equal(p.months, 11);
assert.ok(p.interest > 58 && p.interest < 60, String(p.interest));
assert.deepEqual(payoff(1000, 0, 100), { never: false, months: 10, interest: 0 });
assert.equal(payoff(1000, null, 100), null);
assert.equal(payoff(1000, 12, null), null);
assert.equal(payoff(1000, 24, 20)!.never, true); // $20 interest a month, $20 paid: never gone
assert.ok(payoff(1000, 24, 200)!.months < payoff(1000, 24, 150)!.months);

assert.equal(monthsAfter("2026-11-01", 3), "2027-02");
assert.equal(monthsAfter("2026-01", -1), "2025-12");

const row = (date: string, amount: number, account_id: string, key: string | null, name = "x", plaid_category: string | null = null): DebtRow => ({ date, amount, account_id, key, name, plaid_category });
const accounts = [{ id: "c", type: "credit" }, { id: "l", type: "loan" }];
const rows = [
  row("2026-10-03", -500, "c", "CREDIT_CARD_PAYMENT"),
  row("2026-10-04", -40, "c", "SHOPPING"), // a refund, not a payment
  row("2026-10-05", 90, "c", "SHOPPING"), // a purchase
  row("2026-10-06", 20, "c", "BANK_FEES", "Interest charged", "BANK_FEES_INTEREST_CHARGE"),
  row("2026-10-07", -350, "l", "LOAN_PAYMENTS"),
];
// Loan linked on both sides: the same $350 counts once. Not linked: the bank side still counts.
assert.deepEqual(debtMonths(rows, accounts, new Map([["2026-10", 350]]), ["2026-10"]), [{ month: "2026-10", paid: 850, interest: 20 }]);
assert.deepEqual(debtMonths([], accounts, new Map([["2026-10", 350]]), ["2026-10"]), [{ month: "2026-10", paid: 350, interest: 0 }]);

assert.deepEqual(debtFacts(rows, "c", ["2026-10"]), { interest: 20, usualPayment: 500, carrying: true });
assert.deepEqual(debtFacts(rows, "l", ["2026-10"]), { interest: 0, usualPayment: 350, carrying: false });
assert.equal(debtFacts(rows, "c", ["2026-09"]).carrying, false); // interest long ago: not carrying now
assert.ok(isInterest({ plaid_category: null, name: "INTEREST CHARGE ON PURCHASES" }));

console.log("debt: ok");
