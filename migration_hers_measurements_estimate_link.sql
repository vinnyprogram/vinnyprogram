-- Allow field measurements to be linked to a HERS estimate directly,
-- not just via invoice. This lets HERS-only users access measurements
-- from the estimate stage without needing to create an invoice first.

-- Add estimate-level link
ALTER TABLE hers_field_measurements
  ADD COLUMN IF NOT EXISTS hers_estimate_id uuid REFERENCES hers_estimates(id) ON DELETE CASCADE;

-- Make invoice link optional (was previously required)
ALTER TABLE hers_field_measurements
  ALTER COLUMN hers_invoice_id DROP NOT NULL;

-- Unique index so each estimate has at most one measurement record
CREATE UNIQUE INDEX IF NOT EXISTS hers_field_measurements_estimate_id_idx
  ON hers_field_measurements(hers_estimate_id)
  WHERE hers_estimate_id IS NOT NULL;

-- Allow photos/docs to also be linked to HERS estimates (not just invoices)
ALTER TABLE job_photos
  ADD COLUMN IF NOT EXISTS hers_estimate_id uuid REFERENCES hers_estimates(id) ON DELETE CASCADE;
