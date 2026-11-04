-- broke: core schema. Every row belongs to auth.uid(); Plaid access tokens are never readable by the browser.

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users on delete cascade, -- null = built-in
  key text not null,
  label text not null,
  icon text not null,
  color text not null,
  kind text not null check (kind in ('spend', 'income', 'transfer')),
  unique (user_id, key)
);

create table public.plaid_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  plaid_item_id text not null unique,
  access_token text not null,
  institution_id text,
  institution_name text,
  institution_logo text,
  institution_color text,
  cursor text,
  status text not null default 'ok',
  last_synced_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  item_id uuid not null references public.plaid_items on delete cascade,
  plaid_account_id text not null unique,
  name text not null,
  official_name text,
  mask text,
  type text not null,
  subtype text,
  current_balance numeric,
  available_balance numeric,
  credit_limit numeric,
  currency text default 'USD',
  included boolean not null default true
);

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  account_id uuid not null references public.accounts on delete cascade,
  plaid_transaction_id text not null unique,
  date date not null,
  amount numeric not null, -- Plaid sign: positive = money out
  name text not null,
  merchant_name text,
  logo_url text,
  pending boolean not null default false,
  plaid_category text,
  category_id uuid references public.categories on delete set null,
  custom_name text,
  note text,
  ignored boolean not null default false,
  tax_deductible boolean not null default false
);
create index on public.transactions (user_id, date desc);

create table public.recurring (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  plaid_stream_id text not null unique,
  account_id uuid references public.accounts on delete cascade,
  merchant_name text not null,
  logo_url text,
  frequency text not null,
  average_amount numeric not null,
  last_amount numeric,
  last_date date,
  next_date date,
  is_income boolean not null default false,
  active boolean not null default true,
  status text,
  category_id uuid references public.categories on delete set null
);

alter table public.categories enable row level security;
alter table public.plaid_items enable row level security;
alter table public.accounts enable row level security;
alter table public.transactions enable row level security;
alter table public.recurring enable row level security;

create policy "read built-in and own" on public.categories for select to authenticated
  using (user_id is null or user_id = (select auth.uid()));
create policy "write own" on public.categories for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own" on public.plaid_items for select to authenticated using (user_id = (select auth.uid()));
create policy "own" on public.accounts for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own" on public.transactions for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own" on public.recurring for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- "Expose new tables" is off, so grant exactly what the browser may touch.
grant select, insert, update, delete on public.categories to authenticated;
grant select (id, user_id, institution_name, institution_logo, institution_color, status, last_synced_at, created_at)
  on public.plaid_items to authenticated; -- no access_token, no cursor
grant select, update (included, name) on public.accounts to authenticated;
grant select, update (category_id, custom_name, note, ignored, tax_deductible) on public.transactions to authenticated;
grant select, update (active, category_id) on public.recurring to authenticated;
grant all on all tables in schema public to service_role;

-- Built-in categories keyed on Plaid personal_finance_category.primary (groceries split out of food).
insert into public.categories (key, label, icon, color, kind) values
  ('INCOME', 'Income', 'income', '#16a34a', 'income'),
  ('TRANSFER_IN', 'Transfers in', 'transfer', '#64748b', 'transfer'),
  ('TRANSFER_OUT', 'Transfers out', 'transfer', '#64748b', 'transfer'),
  ('CREDIT_CARD_PAYMENT', 'Credit card payment', 'credit_card', '#64748b', 'transfer'),
  ('LOAN_PAYMENTS', 'Loan payments', 'loan', '#7c3aed', 'spend'),
  ('BANK_FEES', 'Fees', 'fees', '#dc2626', 'spend'),
  ('ENTERTAINMENT', 'Entertainment', 'entertainment', '#db2777', 'spend'),
  ('FOOD_AND_DRINK', 'Dining & drinks', 'dining', '#ea580c', 'spend'),
  ('GROCERIES', 'Groceries', 'groceries', '#65a30d', 'spend'),
  ('GENERAL_MERCHANDISE', 'Shopping', 'shopping', '#2563eb', 'spend'),
  ('HOME_IMPROVEMENT', 'Home', 'home', '#a16207', 'spend'),
  ('MEDICAL', 'Health', 'health', '#e11d48', 'spend'),
  ('PERSONAL_CARE', 'Personal care', 'personal_care', '#c026d3', 'spend'),
  ('GENERAL_SERVICES', 'Services', 'services', '#0891b2', 'spend'),
  ('GOVERNMENT_AND_NON_PROFIT', 'Taxes & giving', 'taxes', '#4f46e5', 'spend'),
  ('TRANSPORTATION', 'Auto & transport', 'transport', '#0284c7', 'spend'),
  ('TRAVEL', 'Travel', 'travel', '#0d9488', 'spend'),
  ('RENT_AND_UTILITIES', 'Bills & utilities', 'bills', '#9333ea', 'spend'),
  ('OTHER', 'Other', 'other', '#78716c', 'spend');
