-- Rules can also find by direction: money in or money out. "Moved" can then be Transfers in one way and Transfers out the other.
alter table public.rules add column if not exists direction text check (direction in ('in', 'out'));
