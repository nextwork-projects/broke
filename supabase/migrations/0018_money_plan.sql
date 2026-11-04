-- Money plan: each audit run, and the moves it found. The server writes both (admin client, after checking the user);
-- the browser reads its own and may only change a move's status.
create table if not exists public.plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  created_at timestamptz not null default now(),
  provider text,
  summary text,
  total_impact numeric not null default 0
);
create index if not exists plans_user_created on public.plans (user_id, created_at desc);

create table if not exists public.plan_moves (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.plans on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  ref text, -- what the move is about ("negotiate:Comcast"), so a new run keeps done and dismissed moves out
  kind text not null check (kind in ('cancel', 'negotiate', 'insurance', 'card', 'signup', 'message', 'earn')),
  title text not null,
  why text not null,
  yearly_impact numeric not null default 0,
  effort text not null check (effort in ('5 min', '30 min', '1 hour+')),
  steps jsonb not null default '[]',
  message jsonb,
  links jsonb not null default '[]',
  confidence text not null check (confidence in ('high', 'medium', 'low')),
  status text not null default 'todo' check (status in ('todo', 'doing', 'done', 'dismissed')),
  done_at timestamptz,
  sort int not null default 0
);
create index if not exists plan_moves_plan on public.plan_moves (plan_id, sort);
create index if not exists plan_moves_user on public.plan_moves (user_id, status);

alter table public.plans enable row level security;
alter table public.plan_moves enable row level security;
create policy "own read" on public.plans for select to authenticated using (user_id = (select auth.uid()));
create policy "own read" on public.plan_moves for select to authenticated using (user_id = (select auth.uid()));
create policy "own status" on public.plan_moves for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

revoke all on public.plans, public.plan_moves from anon, authenticated;
grant select on public.plans, public.plan_moves to authenticated;
grant update (status, done_at) on public.plan_moves to authenticated;
grant all on public.plans, public.plan_moves to service_role;
