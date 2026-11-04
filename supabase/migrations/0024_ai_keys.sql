-- The OpenRouter key each user connects (Connect your AI). Like plaid_items.access_token, signed-in users can't read it:
-- no policies and no grants, so only the server's secret key can.
create table public.ai_keys (
  user_id uuid primary key references auth.users on delete cascade,
  openrouter_key text not null,
  updated_at timestamptz not null default now()
);
alter table public.ai_keys enable row level security;
revoke all on public.ai_keys from anon, authenticated;
grant all on public.ai_keys to service_role;
