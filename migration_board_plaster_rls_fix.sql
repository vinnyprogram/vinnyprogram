-- Replaces the interim policy with the exact same company-data-isolation
-- pattern already used by hers_estimates, so board_plaster_estimates is
-- consistent with the rest of the app: a row is visible/editable only if
-- its company_id is null, or belongs to a company owned by the current
-- authenticated user.

alter table board_plaster_estimates enable row level security;

drop policy if exists "authenticated users can manage board_plaster_estimates" on board_plaster_estimates;

create policy "Company data isolation - board_plaster_estimates"
on board_plaster_estimates
for all
using (
  (company_id is null) or (company_id in (
    select companies.id from companies where companies.user_id = auth.uid()
  ))
);
