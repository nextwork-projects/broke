-- broke: money totals in SQL (PostgREST returns at most 1000 rows, so totals over fetched rows undercount), manual balances, indexes.
-- Every function is security invoker (RLS still applies) and counts only the caller's own rows: partner-shared rows
-- are readable, but never the viewer's money.

-- One row per own transaction with its spend and income share. Same rules as isSpend / isIncome in src/lib/data.ts:
-- not ignored, on an included account; spend = money out on a spend category, income = minus the amount on an income
-- category (so income is positive). No category: money out counts as spend under Other, money in as income under Income.
create or replace function public.money_rows(start_date date, end_date date default null)
returns table (date date, category_id uuid, spend numeric, income numeric)
language sql stable set search_path = '' as $$
  with b as (
    select (select id from public.categories where user_id is null and key = 'OTHER') as other,
           (select id from public.categories where user_id is null and key = 'INCOME') as income
  ), r as (
    select t.date, t.amount,
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
    case when counted and kind = 'income' then -amount else 0 end
  from r
$$;

-- By month and category. n counts every own row in the group, counted or not (pages use it for "months of data").
create or replace function public.money_by_month(start_date date, end_date date default null)
returns table (month date, category_id uuid, spend numeric, income numeric, n bigint)
language sql stable set search_path = '' as $$
  select date_trunc('month', date)::date, category_id, sum(spend), sum(income), count(*)
  from public.money_rows(start_date, end_date) group by 1, 2
$$;

-- Spend per day (dashboard chart).
create or replace function public.spend_by_day(start_date date, end_date date default null)
returns table (day date, spend numeric)
language sql stable set search_path = '' as $$
  select date, sum(spend) from public.money_rows(start_date, end_date) group by 1
$$;

-- Transactions page: money out and in over the whole filter, own rows, without ignored rows and transfers.
-- q is matched like the page's search (name, merchant or custom name contains it).
create or replace function public.txn_totals(q text default null, cat uuid default null, acct uuid default null, tag text default null, start_date date default null)
returns table (money_out numeric, money_in numeric)
language sql stable set search_path = '' as $$
  select coalesce(sum(t.amount) filter (where t.amount > 0), 0), coalesce(-sum(t.amount) filter (where t.amount < 0), 0)
  from public.transactions t left join public.categories c on c.id = t.category_id
  where t.user_id = (select auth.uid()) and not t.ignored and c.kind is distinct from 'transfer'
    and (q is null or t.name ilike '%' || q || '%' or t.merchant_name ilike '%' || q || '%' or t.custom_name ilike '%' || q || '%')
    and (cat is null or t.category_id = cat)
    and (acct is null or t.account_id = acct)
    and (tag is null or t.tags @> array[tag])
    and (start_date is null or t.date >= start_date)
$$;

-- Every tag on the caller's own transactions.
create or replace function public.my_tags() returns setof text
language sql stable set search_path = '' as $$
  select distinct unnest(tags) from public.transactions where user_id = (select auth.uid()) and tags <> '{}'
$$;

-- Computed column (select "balance" on accounts): a manual account is its starting balance less its transactions,
-- a linked one is what the bank says. One rule for every page.
create or replace function public.balance(public.accounts) returns numeric
language sql stable set search_path = '' as $$
  select case when $1.manual
    then coalesce($1.current_balance, 0) - coalesce((select sum(t.amount) from public.transactions t where t.account_id = $1.id), 0)
    else $1.current_balance end
$$;

revoke execute on function public.money_rows(date, date), public.money_by_month(date, date), public.spend_by_day(date, date),
  public.txn_totals(text, uuid, uuid, text, date), public.my_tags(), public.balance(public.accounts) from public, anon;
grant execute on function public.money_rows(date, date), public.money_by_month(date, date), public.spend_by_day(date, date),
  public.txn_totals(text, uuid, uuid, text, date), public.my_tags(), public.balance(public.accounts) to authenticated;

-- Indexes: the partner policy (account_id in shared ids), the totals above, and every unindexed foreign key.
-- holdings(account_id) is already covered by unique (account_id, security_id); categories(user_id) by unique (user_id, key).
create index if not exists transactions_account_date on public.transactions (account_id, date desc);
create index if not exists transactions_user_category_date on public.transactions (user_id, category_id, date);
create index if not exists transactions_category on public.transactions (category_id);
create index if not exists recurring_account on public.recurring (account_id);
create index if not exists recurring_user on public.recurring (user_id);
create index if not exists recurring_category on public.recurring (category_id);
create index if not exists accounts_user on public.accounts (user_id);
create index if not exists accounts_item on public.accounts (item_id);
create index if not exists plaid_items_user on public.plaid_items (user_id);
create index if not exists holdings_user on public.holdings (user_id);
create index if not exists investment_transactions_account_date on public.investment_transactions (account_id, date);
create index if not exists investment_transactions_user on public.investment_transactions (user_id);
create index if not exists chat_messages_user on public.chat_messages (user_id);
create index if not exists budgets_category on public.budgets (category_id);
create index if not exists rules_user on public.rules (user_id);
create index if not exists rules_category on public.rules (category_id);
