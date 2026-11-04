-- broke: hardening from the 2026-10-22 audit. Safe on existing data.

-- Renames survive sync: Plaid owns accounts.name, the user owns custom_name. Show coalesce(custom_name, name).
alter table public.accounts add column if not exists custom_name text;
revoke update (name) on public.accounts from authenticated;
grant update (custom_name) on public.accounts to authenticated;

-- Broken connections: status holds Plaid's error_code (ITEM_LOGIN_REQUIRED...), error its message.
alter table public.plaid_items add column if not exists error text;
grant select (error) on public.plaid_items to authenticated;

-- A row may only point at a built-in category or one owned by the row's user.
create or replace function public.check_category_owner() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.category_id is not null and not exists (
    select 1 from public.categories c where c.id = new.category_id and (c.user_id is null or c.user_id = new.user_id)
  ) then
    raise exception 'category not found' using errcode = '23503';
  end if;
  return new;
end $$;
revoke execute on function public.check_category_owner() from public, anon, authenticated;

drop trigger if exists category_owner on public.budgets;
create trigger category_owner before insert or update of category_id, user_id on public.budgets for each row execute function public.check_category_owner();
drop trigger if exists category_owner on public.rules;
create trigger category_owner before insert or update of category_id, user_id on public.rules for each row execute function public.check_category_owner();
drop trigger if exists category_owner on public.transactions;
create trigger category_owner before insert or update of category_id, user_id on public.transactions for each row execute function public.check_category_owner();
drop trigger if exists category_owner on public.recurring;
create trigger category_owner before insert or update of category_id, user_id on public.recurring for each row execute function public.check_category_owner();

-- Check-ins are written by the server (admin client) only.
revoke insert on public.checkins from authenticated;

-- Bookmarks: in-app paths only. "//host" and "/\host" are protocol-relative URLs to the browser.
delete from public.bookmarks where href !~ '^/([^/\\]|$)';
alter table public.bookmarks drop constraint if exists bookmarks_href_local;
alter table public.bookmarks add constraint bookmarks_href_local check (href ~ '^/([^/\\]|$)');
