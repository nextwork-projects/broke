-- What the bank feed doesn't say about a debt. The user can type these on the Debt page, so broke can work out the payoff.
-- apr: the yearly interest rate in percent. debt_payment: what they pay a month.
alter table public.accounts add column if not exists apr numeric check (apr >= 0 and apr <= 100);
alter table public.accounts add column if not exists debt_payment numeric check (debt_payment >= 0);
grant update (apr, debt_payment) on public.accounts to authenticated;
