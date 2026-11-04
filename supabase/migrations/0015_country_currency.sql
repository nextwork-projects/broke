-- broke: money in more than one currency. Every account and transaction keeps its own currency; totals are in the
-- user's home currency, converted at the ECB rate for that day (exchange_rates, filled by src/lib/fx.ts).
-- A null currency means the home currency: manual accounts, and anything a bank sends without a code.

-- The home currency: profile.currency in the caller's auth metadata (the app writes it with profile.country), else USD.
create or replace function public.home_currency() returns text
language sql stable security definer set search_path = '' as $$
  select coalesce((select upper(u.raw_user_meta_data #>> '{profile,currency}') from auth.users u
    where u.id = (select auth.uid()) and u.raw_user_meta_data #>> '{profile,currency}' ~* '^[a-z]{3}$'), 'USD')
$$;

-- Manual accounts are in the home currency, whatever it is now. They were 'USD' by default, which was home for everyone.
alter table public.accounts alter column currency drop default;
update public.accounts set currency = null where manual;

-- Transactions: the account's currency unless the row says otherwise.
alter table public.transactions add column if not exists currency text;
update public.transactions t set currency = a.currency from public.accounts a where a.id = t.account_id and t.currency is null;
create or replace function public.txn_currency() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.currency is null then select a.currency into new.currency from public.accounts a where a.id = new.account_id; end if;
  return new;
end $$;
drop trigger if exists transactions_currency on public.transactions;
create trigger transactions_currency before insert on public.transactions for each row execute function public.txn_currency();

-- ECB reference rates, one row per day and currency, all against EUR. Public data: anyone signed in reads, only the server writes.
create table if not exists public.exchange_rates (
  date date not null,
  base text not null,
  quote text not null,
  rate numeric not null check (rate > 0),
  primary key (base, quote, date)
);
alter table public.exchange_rates enable row level security;
drop policy if exists "read" on public.exchange_rates;
create policy "read" on public.exchange_rates for select to authenticated using (true);
grant select on public.exchange_rates to authenticated;
grant all on public.exchange_rates to service_role;

-- Units of cur per euro on day d: the latest rate on or before d, else the first after (older than the stored history).
create or replace function public.eur_rate(cur text, d date) returns numeric
language sql stable set search_path = '' as $$
  select case when cur = 'EUR' then 1 else coalesce(
    (select r.rate from public.exchange_rates r where r.base = 'EUR' and r.quote = cur and r.date <= d order by r.date desc limit 1),
    (select r.rate from public.exchange_rates r where r.base = 'EUR' and r.quote = cur and r.date > d order by r.date limit 1)) end
$$;

-- One src in dst on day d. Null when either has no rate: callers leave that money out, never add it unconverted.
create or replace function public.fx(src text, dst text, d date) returns numeric
language sql stable set search_path = '' as $$
  select case when src is null or src = dst then 1 else public.eur_rate(dst, d) / public.eur_rate(src, d) end
$$;

-- money_rows (0014) in the home currency. Same rules otherwise; change both together with src/lib/data.ts.
create or replace function public.money_rows(start_date date, end_date date default null)
returns table (date date, category_id uuid, spend numeric, income numeric)
language sql stable set search_path = '' as $$
  with b as (
    select (select id from public.categories where user_id is null and key = 'OTHER') as other,
           (select id from public.categories where user_id is null and key = 'INCOME') as income,
           public.home_currency() as home
  ), r as (
    select t.date, t.amount * public.fx(coalesce(t.currency, a.currency, b.home), b.home, t.date) as amount,
      coalesce(t.category_id, case when t.amount > 0 then b.other else b.income end) as category_id,
      not t.ignored and a.included as counted,
      coalesce(c.kind, case when t.amount > 0 then 'spend' else 'income' end) as kind
    from public.transactions t
    join public.accounts a on a.id = t.account_id
    left join public.categories c on c.id = t.category_id
    cross join b
    where t.user_id = (select auth.uid()) and t.date >= start_date and (end_date is null or t.date <= end_date)
  )
  select date, category_id,
    case when counted and kind = 'spend' and amount > 0 then amount else 0 end,
    case when counted and kind = 'income' and amount is not null then -amount else 0 end
  from r
$$;

-- txn_totals (0014) in the home currency.
create or replace function public.txn_totals(q text default null, cat uuid default null, acct uuid default null, tag text default null, start_date date default null)
returns table (money_out numeric, money_in numeric)
language sql stable set search_path = '' as $$
  with h as (select public.home_currency() as home), r as (
    select t.amount * public.fx(coalesce(t.currency, a.currency, h.home), h.home, t.date) as amount
    from public.transactions t
    join public.accounts a on a.id = t.account_id
    left join public.categories c on c.id = t.category_id
    cross join h
    where t.user_id = (select auth.uid()) and not t.ignored and c.kind is distinct from 'transfer'
      and (q is null or t.name ilike '%' || q || '%' or t.merchant_name ilike '%' || q || '%' or t.custom_name ilike '%' || q || '%')
      and (cat is null or t.category_id = cat)
      and (acct is null or t.account_id = acct)
      and (tag is null or t.tags @> array[tag])
      and (start_date is null or t.date >= start_date)
  )
  select coalesce(sum(amount) filter (where amount > 0), 0), coalesce(-sum(amount) filter (where amount < 0), 0) from r
$$;

-- Computed columns for totals: an account's balance and a recurring stream's average in the home currency, at today's rate.
-- Null when there is no rate; fx_missing() says which currency.
create or replace function public.home_balance(public.accounts) returns numeric
language sql stable set search_path = '' as $$
  select public.balance($1) * public.fx(coalesce($1.currency, public.home_currency()), public.home_currency(), current_date)
$$;
create or replace function public.home_average(public.recurring) returns numeric
language sql stable set search_path = '' as $$
  select $1.average_amount * public.fx(coalesce((select a.currency from public.accounts a where a.id = $1.account_id), public.home_currency()), public.home_currency(), current_date)
$$;

-- The caller's currencies that totals leave out because there is no rate for them (or for the home currency).
create or replace function public.fx_missing() returns setof text
language sql stable set search_path = '' as $$
  with h as (select public.home_currency() as home), c as (
    select a.currency as cur from public.accounts a where a.user_id = (select auth.uid()) and a.currency is not null
    union
    select distinct t.currency from public.transactions t where t.user_id = (select auth.uid()) and t.currency is not null
  )
  select c.cur from c cross join h where c.cur <> h.home and public.fx(c.cur, h.home, current_date) is null
$$;

revoke execute on function public.home_currency(), public.eur_rate(text, date), public.fx(text, text, date), public.home_balance(public.accounts),
  public.home_average(public.recurring), public.fx_missing() from public, anon;
grant execute on function public.home_currency(), public.eur_rate(text, date), public.fx(text, text, date), public.home_balance(public.accounts),
  public.home_average(public.recurring), public.fx_missing() to authenticated;
revoke execute on function public.txn_currency() from public, anon, authenticated;

create index if not exists transactions_user_currency on public.transactions (user_id, currency);
