-- The kind you pick for an account (bank account, credit card, loan...) wins over what the bank says, sync after sync.
-- Every read stays on accounts.type: this trigger puts the override back whenever a sync writes the bank's type.
alter table public.accounts add column if not exists type_override text
  check (type_override in ('depository', 'credit', 'loan', 'investment', 'other'));
grant update (type_override) on public.accounts to authenticated;

create or replace function public.apply_type_override() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.type_override is not null and new.type is distinct from new.type_override then
    new.type := new.type_override;
    new.subtype := null; -- the bank's subtype ("checking") is wrong for the kind you picked
  end if;
  return new;
end $$;

drop trigger if exists accounts_type_override on public.accounts;
create trigger accounts_type_override before insert or update on public.accounts
  for each row execute function public.apply_type_override();

-- A hand-added or imported account's balance comes from its transactions (positive = money out). On a bank account that
-- lowers what you have; on a credit card or loan it raises what you owe.
create or replace function public.balance(public.accounts) returns numeric
language sql stable set search_path = '' as $$
  select case when $1.manual
    then coalesce($1.current_balance, 0) + case when $1.type in ('credit', 'loan') then 1 else -1 end
      * coalesce((select sum(t.amount) from public.transactions t where t.account_id = $1.id), 0)
    else $1.current_balance end
$$;
