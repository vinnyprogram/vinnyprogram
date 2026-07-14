-- The segments RLS policy was missing the "company_id IS NULL" allowance
-- that other tables (like hers_estimates) have. Any segment row with a
-- null company_id was silently invisible to every query - not an error,
-- just filtered out by Postgres's row-level security, since "NULL IN (...)"
-- is never true. This is very likely why real, existing segments weren't
-- showing up when imported into Board & Plaster.

drop policy if exists "Company data isolation - segments" on segments;

create policy "Company data isolation - segments"
on segments
for all
using (
  (company_id is null) or (company_id in (
    select companies.id from companies where companies.user_id = auth.uid()
  ))
);
