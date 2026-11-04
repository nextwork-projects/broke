-- Loan payments are neither income nor spend: paying a loan moves money between your own debts and accounts, like a
-- card payment. The built-in category becomes a transfer, so isSpend / isIncome (src/lib/data.ts), money_rows and
-- txn_totals (0014, 0015) all leave it out by the one rule they share: kind = 'transfer'. "Monthly payment +$522" on a
-- loan account no longer counts as money in. Interest and fees on a loan stay spend (BANK_FEES).
update public.categories set kind = 'transfer' where user_id is null and key = 'LOAN_PAYMENTS';
