-- Activity's custom date range: totals can stop at an end date too.
drop function if exists public.txn_totals(text, uuid, uuid, text, date);
create or replace function public.txn_totals(q text default null, cat uuid default null, acct uuid default null, tag text default null, start_date date default null, end_date date default null)
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
    and (end_date is null or t.date <= end_date)
$$;
revoke execute on function public.txn_totals(text, uuid, uuid, text, date, date) from public, anon;
grant execute on function public.txn_totals(text, uuid, uuid, text, date, date) to authenticated;
