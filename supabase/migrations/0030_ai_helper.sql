-- The helper that runs a person's own AI app on their computer for a hosted copy of broke (Connect your AI).
-- Like ai_keys: no policies and no grants, so only the server's secret key can read these.
create table public.ai_helpers (
  user_id uuid primary key references auth.users on delete cascade,
  code_hash text,
  code_expires timestamptz,
  token_hash text unique,
  clis jsonb not null default '[]',
  last_seen timestamptz
);
alter table public.ai_helpers enable row level security;
revoke all on public.ai_helpers from anon, authenticated;
grant all on public.ai_helpers to service_role;

-- One question on its way to the helper and back. Deleted as soon as it's answered: nothing is kept.
create table public.ai_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  provider text not null,
  model text,
  prompt text not null,
  status text not null default 'pending',
  answer text not null default '',
  created_at timestamptz not null default now()
);
create index ai_jobs_user_pending on public.ai_jobs (user_id, created_at) where status = 'pending';
alter table public.ai_jobs enable row level security;
revoke all on public.ai_jobs from anon, authenticated;
grant all on public.ai_jobs to service_role;
