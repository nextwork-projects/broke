-- Budgets: one monthly amount per category per user.
create table public.budgets (
  user_id uuid not null references auth.users on delete cascade,
  category_id uuid not null references public.categories on delete cascade,
  amount numeric not null check (amount >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, category_id)
);
alter table public.budgets enable row level security;
create policy "own" on public.budgets for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
grant select, insert, update, delete on public.budgets to authenticated;
grant all on public.budgets to service_role;
