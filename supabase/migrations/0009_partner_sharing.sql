-- broke: partner sharing. An owner marks accounts as shared and invites a partner by link.
-- The partner reads shared accounts and their transactions, recurring charges and holdings. Never writes, never plaid_items.

alter table public.accounts add column if not exists shared boolean not null default false;
grant update (shared) on public.accounts to authenticated;

create table public.shares (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users on delete cascade,
  owner_email text default (auth.jwt() ->> 'email'), -- the label the partner sees
  partner_email text not null check (partner_email like '%_@_%'),
  partner_id uuid references auth.users on delete cascade, -- set on accept
  token text not null unique default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  expires_at timestamptz not null default now() + interval '7 days',
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);
create index on public.shares (owner_id);
create index on public.shares (partner_id);
alter table public.shares enable row level security;

create policy "owner or partner reads" on public.shares for select to authenticated
  using (owner_id = (select auth.uid()) or partner_id = (select auth.uid()));
create policy "owner invites" on public.shares for insert to authenticated
  with check (owner_id = (select auth.uid()));
create policy "either side ends" on public.shares for delete to authenticated
  using (owner_id = (select auth.uid()) or partner_id = (select auth.uid()));
-- Only the email is client-set; owner, label, token and acceptance come from defaults and accept_share.
grant select, delete on public.shares to authenticated;
grant insert (partner_email) on public.shares to authenticated;
grant all on public.shares to service_role;

-- Account ids the caller may read as a partner. Definer so the policies below don't recurse through accounts RLS.
create function public.shared_account_ids() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select a.id from public.accounts a join public.shares s on s.owner_id = a.user_id
  where a.shared and s.accepted_at is not null and s.partner_id = (select auth.uid())
$$;

-- Read-only: SELECT policies only. The "own" policies still gate every write.
create policy "partner reads shared" on public.accounts for select to authenticated
  using (id in (select public.shared_account_ids()));
create policy "partner reads shared" on public.transactions for select to authenticated
  using (account_id in (select public.shared_account_ids()));
create policy "partner reads shared" on public.recurring for select to authenticated
  using (account_id in (select public.shared_account_ids()));
create policy "partner reads shared" on public.holdings for select to authenticated
  using (account_id in (select public.shared_account_ids()));

-- Accepts an invite as the signed-in user. The invite must be unused, unexpired, someone else's, and for this email.
create function public.accept_share(invite text) returns text
language plpgsql security definer set search_path = '' as $$
declare who text;
begin
  update public.shares set partner_id = auth.uid(), accepted_at = now()
  where token = invite and accepted_at is null and expires_at > now()
    and owner_id <> auth.uid() and lower(partner_email) = lower(auth.jwt() ->> 'email')
  returning coalesce(owner_email, '') into who;
  if not found then raise exception 'invite not valid' using errcode = 'P0002'; end if;
  return who;
end $$;

-- Computed columns (select "owner_label" / "institution_name" on accounts).
-- owner_label: the owner's email on accounts shared with the caller, null on the caller's own.
create function public.owner_label(public.accounts) returns text
language sql stable set search_path = '' as $$
  select s.owner_email from public.shares s
  where s.owner_id = $1.user_id and s.partner_id = (select auth.uid()) and s.accepted_at is not null limit 1
$$;
-- institution_name: plaid_items stays unreadable to partners, so only this one field crosses over.
create function public.institution_name(public.accounts) returns text
language sql stable security definer set search_path = '' as $$
  select i.institution_name from public.accounts a join public.plaid_items i on i.id = a.item_id
  where a.id = $1.id and (a.user_id = (select auth.uid()) or a.id in (select public.shared_account_ids()))
$$;

revoke execute on function public.shared_account_ids(), public.accept_share(text), public.owner_label(public.accounts), public.institution_name(public.accounts) from public, anon;
grant execute on function public.shared_account_ids(), public.accept_share(text), public.owner_label(public.accounts), public.institution_name(public.accounts) to authenticated;
