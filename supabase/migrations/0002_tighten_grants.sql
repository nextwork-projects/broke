-- Supabase default privileges gave anon/authenticated full table access, which made the column grants in 0001 moot.
revoke all on all tables in schema public from anon, authenticated;
alter default privileges in schema public revoke all on tables from anon, authenticated;

grant select, insert, update, delete on public.categories to authenticated;
grant select (id, user_id, institution_name, institution_logo, institution_color, status, last_synced_at, created_at)
  on public.plaid_items to authenticated;
grant select, update (included, name) on public.accounts to authenticated;
grant select, update (category_id, custom_name, note, ignored, tax_deductible) on public.transactions to authenticated;
grant select, update (active, category_id) on public.recurring to authenticated;
