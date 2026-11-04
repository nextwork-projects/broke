-- More bank connections, each through its vendor's hosted consent page: Enable Banking (UK, Europe), Basiq (Australia),
-- Belvo (Brazil). access_token holds the vendor's reference for this user, unreadable by signed-in users like Plaid's.
alter table public.plaid_items drop constraint if exists plaid_items_provider;
alter table public.plaid_items add constraint plaid_items_provider check (provider in ('plaid', 'akahu', 'enablebanking', 'basiq', 'belvo'));
