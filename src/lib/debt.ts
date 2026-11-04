// The Debt page's maths. Pure, so `node src/lib/debt.test.ts` runs it.
export const isInterest = (t: { plaid_category?: string | null; name: string }) => t.plaid_category === "BANK_FEES_INTEREST_CHARGE" || /interest charge/i.test(t.name);

/** Month by month until a balance is gone. Null with no rate. never: the payment doesn't cover the interest. */
export function payoff(balance: number, apr: number | null, payment: number | null) {
  if (apr == null || !payment || payment <= 0) return null;
  const rate = apr / 1200;
  if (balance > 0 && payment <= balance * rate) return { never: true as const, months: 0, interest: 0 };
  let left = balance, months = 0, interest = 0;
  while (left > 0.005 && months < 1200) {
    const i = left * rate;
    interest += i;
    left = Math.max(0, left + i - payment);
    months++;
  }
  return { never: false as const, months, interest };
}

/** "YYYY-MM" n months after "YYYY-MM-DD" or "YYYY-MM". */
export function monthsAfter(from: string, n: number) {
  const d = new Date(Date.UTC(Number(from.slice(0, 4)), Number(from.slice(5, 7)) - 1 + n, 1));
  return d.toISOString().slice(0, 7);
}

export type DebtRow = { date: string; amount: number; name: string; plaid_category: string | null; account_id: string; key: string | null };
const PAYMENT = new Set(["CREDIT_CARD_PAYMENT", "LOAN_PAYMENTS", "TRANSFER_IN"]);
/** Money arriving on a debt account. A refund on a card is money in too, but it isn't a payment. */
export const isPayment = (r: Pick<DebtRow, "amount" | "key">) => r.amount < 0 && PAYMENT.has(r.key ?? "");

/** Each month's payments and interest. Loans paid from a bank whose loan account isn't linked only show on the bank side
 * (bankLoans); when both sides are linked they're the same money, so the bigger one counts, never both. */
export function debtMonths(rows: DebtRow[], accounts: { id: string; type: string }[], bankLoans: Map<string, number>, months: string[]) {
  const type = new Map(accounts.map((a) => [a.id, a.type]));
  return months.map((month) => {
    const inMonth = rows.filter((r) => r.date.startsWith(month));
    const onCards = inMonth.filter((r) => type.get(r.account_id) === "credit" && isPayment(r)).reduce((s, r) => s - r.amount, 0);
    const onLoans = inMonth.filter((r) => type.get(r.account_id) === "loan" && isPayment(r)).reduce((s, r) => s - r.amount, 0);
    const interest = inMonth.filter((r) => r.amount > 0 && isInterest(r)).reduce((s, r) => s + r.amount, 0);
    return { month, paid: onCards + Math.max(onLoans, bankLoans.get(month) ?? 0), interest };
  });
}

/** One debt's numbers from its own rows: interest charged, and its usual payment over the full months given. */
export function debtFacts(rows: DebtRow[], accountId: string, fullMonths: string[]) {
  const own = rows.filter((r) => r.account_id === accountId);
  const interest = own.filter((r) => r.amount > 0 && isInterest(r)).reduce((s, r) => s + r.amount, 0);
  const recent = own.filter((r) => isPayment(r) && fullMonths.some((m) => r.date.startsWith(m))).reduce((s, r) => s - r.amount, 0);
  const interestRecent = own.filter((r) => r.amount > 0 && isInterest(r) && fullMonths.some((m) => r.date.startsWith(m))).reduce((s, r) => s + r.amount, 0);
  return { interest, usualPayment: fullMonths.length ? recent / fullMonths.length : 0, carrying: interestRecent >= 1 };
}
