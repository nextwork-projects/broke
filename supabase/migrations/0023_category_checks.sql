-- "Is this right?" category checks. checked_at: the user answered the check for this row (Yes, or a new category),
-- so it never comes back. plaid_confidence: Plaid's confidence_level for its category (VERY_HIGH ... LOW, UNKNOWN),
-- written on sync; LOW and UNKNOWN rows are unsure. Older rows have null and are judged by the other checks.
alter table public.transactions add column if not exists checked_at timestamptz;
alter table public.transactions add column if not exists plaid_confidence text;
grant update (checked_at) on public.transactions to authenticated;
