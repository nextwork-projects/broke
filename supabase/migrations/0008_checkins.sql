-- Weekly check-ins broke AI writes on its own: the facts found in code, plus the AI's short summary of them.
create table if not exists public.checkins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  created_at timestamptz not null default now(),
  facts jsonb not null,
  summary text,
  provider text
);
create index if not exists checkins_user_created on public.checkins (user_id, created_at desc);
alter table public.checkins enable row level security;
create policy "own" on public.checkins for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
grant select, insert on public.checkins to authenticated;
grant all on public.checkins to service_role;
