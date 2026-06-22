-- Adds a notes column to cost_settings so the fuel row can store the
-- shop/office address alongside the $/mile rate. Used by the Quote screen
-- to auto-calculate driving distance to the job site.

ALTER TABLE cost_settings
  ADD COLUMN IF NOT EXISTS notes text;
