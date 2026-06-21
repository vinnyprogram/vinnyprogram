-- Adds support for per-thickness/R-value pricing (batts, rigid foam sheets)
-- instead of one flat price per material name. Run before deploying.

CREATE TABLE IF NOT EXISTS material_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES companies(id) ON DELETE CASCADE,
  material_name text NOT NULL,
  thickness_in text,
  r_value text,
  facing text,
  cost_per_sqft numeric DEFAULT 0,
  markup_pct numeric DEFAULT 20,
  sort_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE material_variants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "company isolation" ON material_variants FOR ALL
  USING (company_id IN (SELECT id FROM companies WHERE user_id = auth.uid()))
  WITH CHECK (company_id IN (SELECT id FROM companies WHERE user_id = auth.uid()));

-- coverage_factor was already referenced in the cost-calculation formula
-- (used for bag-based materials like cellulose: bags = sqft*thickness /
-- coverage_factor) but the column never actually existed.
ALTER TABLE material_costs
  ADD COLUMN IF NOT EXISTS coverage_factor numeric DEFAULT 1;
