-- Rules: when a transaction's merchant or name contains `match` (and its amount is in range), set its category,
-- rename it, hide it from totals, or add tags (transactions.tags, 0011). Applied to new transactions on sync, and to past ones when a rule is saved.
create table if not exists public.rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  match text not null check (length(trim(match)) > 0),
  amount_min numeric check (amount_min >= 0),
  amount_max numeric check (amount_max >= 0),
  category_id uuid references public.categories on delete cascade,
  rename text,
  ignore boolean,
  add_tags text[],
  created_at timestamptz not null default now(),
  check (category_id is not null or rename is not null or ignore is not null or cardinality(add_tags) > 0)
);
alter table public.rules enable row level security;
create policy "own" on public.rules for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
grant select, insert, update, delete on public.rules to authenticated;
grant all on public.rules to service_role;
