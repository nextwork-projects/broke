-- Tags: free-form labels on transactions ("vacation", "work trip"), set by hand or by a rule.
alter table public.transactions add column if not exists tags text[] not null default '{}';
create index if not exists transactions_tags_idx on public.transactions using gin (tags);
grant update (tags) on public.transactions to authenticated;
