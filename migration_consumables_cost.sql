-- Adds consumables_cost to the quotes table so the Quote screen's
-- editable consumables total is recorded alongside labor_cost,
-- fuel_cost, and commission_cost (same pattern as those columns).

ALTER TABLE quotes
  ADD COLUMN IF NOT EXISTS consumables_cost numeric DEFAULT 0;
