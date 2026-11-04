-- broke: saved AI chats and bookmarks. Same rules as 0001/0002: owner-only RLS, explicit grants.

create table public.chat_threads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  title text not null,
  provider text,
  model text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.chat_threads (user_id, updated_at desc);

create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.chat_threads on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamptz not null default now()
);
create index on public.chat_messages (thread_id, created_at);

create table public.bookmarks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  kind text not null default 'page' check (kind in ('page', 'transaction')),
  href text not null check (href like '/%'), -- in-app paths only, never external URLs
  label text not null,
  created_at timestamptz not null default now(),
  unique (user_id, href)
);
create index on public.bookmarks (user_id, created_at desc);

alter table public.chat_threads enable row level security;
alter table public.chat_messages enable row level security;
alter table public.bookmarks enable row level security;

create policy "own" on public.chat_threads for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
-- A message must belong to the user AND sit in one of their own threads.
create policy "own" on public.chat_messages for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and exists (select 1 from public.chat_threads t where t.id = thread_id and t.user_id = (select auth.uid())));
create policy "own" on public.bookmarks for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

grant select, insert, update (title, updated_at), delete on public.chat_threads to authenticated;
grant select, insert, delete on public.chat_messages to authenticated;
grant select, insert, update (label), delete on public.bookmarks to authenticated;
grant all on public.chat_threads, public.chat_messages, public.bookmarks to service_role;
