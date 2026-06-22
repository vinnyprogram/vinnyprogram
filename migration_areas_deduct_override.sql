-- deduct_sqft: the square footage deducted from an area's total
-- (e.g. columns, posts, windows inside a wall area).
-- Was previously only held in local React state and lost on every
-- page reload. Now persisted so deductions survive saves.

ALTER TABLE areas
  ADD COLUMN IF NOT EXISTS deduct_sqft numeric DEFAULT 0;

-- price_override: a per-sqft price override for a specific area on a
-- specific job, bypassing the catalog pricing entirely.

ALTER TABLE areas
  ADD COLUMN IF NOT EXISTS price_override numeric;
