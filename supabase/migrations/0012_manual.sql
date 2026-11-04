-- Manual accounts and transactions: cash, a bank Plaid can't reach, anything typed in by hand.
-- Manual rows have no Plaid ids. Users can add and delete only manual rows, and only on their own accounts.
alter table public.accounts alter column item_id drop not null;
alter table public.accounts alter column plaid_account_id drop not null;
alter table public.accounts alter column user_id set default auth.uid();
alter table public.accounts add column if not exists manual boolean not null default false;

alter table public.transactions alter column plaid_transaction_id drop not null;
alter table public.transactions alter column user_id set default auth.uid();
alter table public.transactions add column if not exists manual boolean not null default false;

grant insert (name, type, subtype, current_balance, manual) on public.accounts to authenticated;
grant delete on public.accounts to authenticated;
grant insert (account_id, date, amount, name, merchant_name, category_id, note, tags, ignored, manual) on public.transactions to authenticated;
grant delete on public.transactions to authenticated;

-- Restrictive: on top of the "own" policies. Plaid-synced rows can't be created or deleted from the app.
create policy "manual accounts only" on public.accounts as restrictive for insert to authenticated with check (manual);
create policy "delete manual accounts only" on public.accounts as restrictive for delete to authenticated using (manual);
create policy "manual on own account" on public.transactions as restrictive for insert to authenticated
  with check (manual and account_id in (select id from public.accounts where user_id = (select auth.uid())));
create policy "delete manual only" on public.transactions as restrictive for delete to authenticated using (manual);
