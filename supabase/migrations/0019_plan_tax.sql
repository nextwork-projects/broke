-- Money plan, part 2: tax moves and the plan's sections and deadlines. Additive: old rows keep null section and
-- deadline and the page works them out from the move's ref. The browser still updates only status and done_at
-- (0018's column grants; new columns get no update grant).
alter table public.plan_moves add column if not exists section text
  check (section is null or section in ('tax', 'debt', 'bills', 'cards', 'saving'));
alter table public.plan_moves add column if not exists deadline date;

alter table public.plan_moves drop constraint if exists plan_moves_kind_check;
alter table public.plan_moves add constraint plan_moves_kind_check
  check (kind in ('cancel', 'negotiate', 'insurance', 'card', 'signup', 'message', 'earn', 'tax'));
