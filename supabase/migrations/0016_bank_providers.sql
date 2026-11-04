-- broke: bank connections beyond Plaid, and statement imports. Safe on existing data.

-- Which service a connection comes through. Every existing row is Plaid. Akahu connections read their tokens from
-- the server's settings, so access_token may be empty for them.
alter table public.plaid_items add column if not exists provider text not null default 'plaid';
alter table public.plaid_items drop constraint if exists plaid_items_provider;
alter table public.plaid_items add constraint plaid_items_provider check (provider in ('plaid', 'akahu'));
alter table public.plaid_items alter column access_token drop not null;
grant select (provider) on public.plaid_items to authenticated;

-- Statement imports: one key per row (date, amount, name, occurrence; or the bank's own id), unique per account,
-- so importing the same file twice adds nothing. Rows stay manual = true, so 0012's insert and delete policies apply.
alter table public.transactions add column if not exists import_key text;
alter table public.transactions drop constraint if exists transactions_import_key;
alter table public.transactions add constraint transactions_import_key unique (account_id, import_key);
-- custom_name: a rule's rename applies to imported rows too.
grant insert (import_key, custom_name) on public.transactions to authenticated;
