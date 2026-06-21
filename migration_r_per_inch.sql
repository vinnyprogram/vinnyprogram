-- Spray foam thickness is calculated from the target R-value (R-value ÷
-- R-per-inch = inches to spray), not selected from a stud-cavity dropdown
-- like batts use. This column lets each spray foam product (Open Cell,
-- Closed Cell, or any future variant) have its own R-per-inch rate.
-- Only meaningful for unit='board_ft' materials; null for everything else.

ALTER TABLE material_costs
  ADD COLUMN IF NOT EXISTS r_per_inch numeric;
