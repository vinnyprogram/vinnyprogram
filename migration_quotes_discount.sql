-- Persists the discount amount entered on the job costing sheet so it
-- can be restored when the user returns to the page.

ALTER TABLE quotes
  ADD COLUMN IF NOT EXISTS discount_amount numeric DEFAULT 0;
