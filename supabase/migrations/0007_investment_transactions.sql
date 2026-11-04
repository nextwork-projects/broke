-- Investment transactions (buys, sells, contributions) from Plaid Investments. Feeds contribution tracking.
create table if not exists public.investment_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  account_id uuid not null references public.accounts on delete cascade,
  plaid_investment_transaction_id text not null unique,
  date date not null,
  name text,
  type text,
  subtype text,
  amount numeric,
  ticker text
);
alter table public.investment_transactions enable row level security;
create policy "own" on public.investment_transactions for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
grant select on public.investment_transactions to authenticated;
grant all on public.investment_transactions to service_role;
