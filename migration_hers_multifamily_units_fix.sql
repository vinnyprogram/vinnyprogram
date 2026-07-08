-- Fixes migration_hers_multifamily_units.sql: that migration created PARTIAL
-- unique indexes (with a WHERE clause), which Postgres cannot use as an
-- ON CONFLICT target unless the conflict clause repeats the exact same WHERE
-- predicate - which the app's upsert calls don't do. Hence:
--   "there is no unique or exclusion constraint matching the ON CONFLICT
--    specification"
--
-- Fix: drop those partial indexes and replace with plain (non-partial)
-- unique constraints. This works fine even though hers_estimate_id and
-- hers_invoice_id are each NULL on the "other" row type, because Postgres
-- unique constraints treat NULL values as distinct from one another - rows
-- with a NULL in that column never conflict with each other.

drop index if exists hers_fm_estimate_unit_uidx;
drop index if exists hers_fm_invoice_unit_uidx;

alter table hers_field_measurements
  add constraint hers_fm_estimate_unit_uq unique (hers_estimate_id, unit_label);

alter table hers_field_measurements
  add constraint hers_fm_invoice_unit_uq unique (hers_invoice_id, unit_label);
