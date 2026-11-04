-- Money plan, part 3: the priority ladder, one-time moves, saved step ticks and a data warning. Additive: old rows keep
-- null step and false once, and the page works the step out from the move's ref.
-- step: the ladder rung (1 stop the bleeding ... 7 smaller wins). once: the value comes once, not every year.
-- gate: why a move isn't counted yet ("Needs about $X a month; you have about $Y spare").
alter table public.plan_moves add column if not exists step smallint check (step is null or step between 1 and 7);
alter table public.plan_moves add column if not exists once boolean not null default false;
alter table public.plan_moves add column if not exists gate text;
alter table public.plan_moves add column if not exists steps_done int[] not null default '{}';
alter table public.plans add column if not exists note text;

alter table public.plan_moves drop constraint if exists plan_moves_kind_check;
alter table public.plan_moves add constraint plan_moves_kind_check
  check (kind in ('cancel', 'negotiate', 'insurance', 'card', 'signup', 'message', 'earn', 'tax', 'budget', 'save'));

alter table public.plan_moves drop constraint if exists plan_moves_section_check;
alter table public.plan_moves add constraint plan_moves_section_check
  check (section is null or section in ('tax', 'debt', 'bills', 'cards', 'saving', 'spending'));

-- The browser may change status, done_at and the ticked steps, nothing else (RLS "own status" still limits rows).
grant update (status, done_at, steps_done) on public.plan_moves to authenticated;
