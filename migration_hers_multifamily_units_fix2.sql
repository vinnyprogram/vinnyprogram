-- The very first migration guessed the old constraint was named
-- hers_field_measurements_hers_estimate_id_key, but it's actually named
-- hers_field_measurements_estimate_id_key (no double "hers_"), so it was
-- never dropped. It's a single-column unique constraint on hers_estimate_id
-- alone, which blocks a second unit's row from ever being created for the
-- same estimate - exactly the "duplicate key value violates unique
-- constraint" error.

do $$
begin
  if exists (select 1 from pg_constraint where conname = 'hers_field_measurements_estimate_id_key') then
    alter table hers_field_measurements drop constraint hers_field_measurements_estimate_id_key;
  end if;
  if exists (select 1 from pg_constraint where conname = 'hers_field_measurements_invoice_id_key') then
    alter table hers_field_measurements drop constraint hers_field_measurements_invoice_id_key;
  end if;
end $$;
