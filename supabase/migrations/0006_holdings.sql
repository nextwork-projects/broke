-- Investment holdings (brokerage, IRA, 401(k), HSA) from Plaid Investments. Replaced on every sync.
create table if not exists public.holdings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  account_id uuid not null references public.accounts on delete cascade,
  security_id text not null,
  name text,
  ticker text,
  type text,
  quantity numeric,
  price numeric,
  value numeric,
  cost_basis numeric,
  updated_at timestamptz not null default now(),
  unique (account_id, security_id)
);
alter table public.holdings enable row level security;
create policy "own" on public.holdings for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
grant select on public.holdings to authenticated;
grant all on public.holdings to service_role;
