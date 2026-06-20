-- Fixes "no unique or exclusion constraint matching ON CONFLICT" error
-- when saving HERS field measurements from the estimate (not invoice) page.
--
-- The previous migration created a PARTIAL unique index
-- (WHERE hers_estimate_id IS NOT NULL), but Supabase's upsert just sends
-- ON CONFLICT (hers_estimate_id) with no WHERE clause, which can't match
-- a partial index. A true UNIQUE constraint works because Postgres
-- already treats every NULL as distinct from every other NULL, so rows
-- where hers_estimate_id is NULL (invoice-only rows) never conflict
-- with each other anyway — no WHERE filter needed.

DROP INDEX IF EXISTS hers_field_measurements_estimate_id_idx;

ALTER TABLE hers_field_measurements
  ADD CONSTRAINT hers_field_measurements_estimate_id_key UNIQUE (hers_estimate_id);
