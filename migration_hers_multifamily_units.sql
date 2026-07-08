-- Adds multifamily/multi-unit support to HERS Rater.
-- One hers_estimates row = one building. unit_count says how many units
-- it has. Each unit gets its OWN row in hers_field_measurements
-- (windows/CFA/floors/areas), distinguished by unit_label.
--
-- Existing single-unit jobs are unaffected: unit_label defaults to '',
-- which is exactly what all existing rows already have (via the app
-- treating a missing/blank unit as "the only unit"), so this is backward
-- compatible with no data changes needed.

alter table hers_estimates add column if not exists unit_count integer default 1;

alter table hers_field_measurements add column if not exists unit_label text default '';

-- The old unique constraints only allowed ONE measurement row per
-- estimate/invoice. Replace them with composite constraints that allow one
-- row PER UNIT within that estimate/invoice.
do $$
begin
  if exists (select 1 from pg_constraint where conname = 'hers_field_measurements_hers_estimate_id_key') then
    alter table hers_field_measurements drop constraint hers_field_measurements_hers_estimate_id_key;
  end if;
  if exists (select 1 from pg_constraint where conname = 'hers_field_measurements_hers_invoice_id_key') then
    alter table hers_field_measurements drop constraint hers_field_measurements_hers_invoice_id_key;
  end if;
end $$;

create unique index if not exists hers_fm_estimate_unit_uidx
  on hers_field_measurements (hers_estimate_id, unit_label)
  where hers_estimate_id is not null;

create unique index if not exists hers_fm_invoice_unit_uidx
  on hers_field_measurements (hers_invoice_id, unit_label)
  where hers_invoice_id is not null;
