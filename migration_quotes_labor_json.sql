-- Persists the job-specific crew selection from the costing sheet,
-- so returning to the page restores exactly which roles were chosen
-- (not the full Settings list).

ALTER TABLE quotes
  ADD COLUMN IF NOT EXISTS labor_roles_json text;
