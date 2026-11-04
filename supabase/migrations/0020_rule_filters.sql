-- Rules can also find transactions by account and by day of the month, and the name match becomes optional.
-- day_from/day_to: days of the month, both inclusive. day_from > day_to wraps past the month end (28 to 3).
alter table public.rules
  add column if not exists account_id uuid references public.accounts on delete cascade,
  add column if not exists day_from smallint check (day_from between 1 and 31),
  add column if not exists day_to smallint check (day_to between 1 and 31);
alter table public.rules alter column match set default '';
alter table public.rules drop constraint if exists rules_match_check;
alter table public.rules drop constraint if exists rules_finds_something;
alter table public.rules add constraint rules_finds_something check (
  length(trim(match)) > 0 or amount_min is not null or amount_max is not null
  or account_id is not null or day_from is not null or day_to is not null
);
