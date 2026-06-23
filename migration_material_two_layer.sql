-- ─────────────────────────────────────────────────────────────────────────────
-- TWO-LAYER MATERIAL SYSTEM
-- ─────────────────────────────────────────────────────────────────────────────
-- Layer 1: material_types — what appears in the area dropdown.
--   "Fiberglass Batt", "Closed Cell", "Open Cell", "Cellulose", etc.
--   The customer sees this level. No brand, no supplier, no price.
--
-- Layer 2: material_products — the specific brand/SKU you actually buy.
--   "Owens Corning EcoTouch", "CertainTeed ComfortBatt", "Lapolla 4G", etc.
--   Each product belongs to one type. You can have many products per type
--   (different brands, different R-values, different suppliers).
--   One product per type is marked is_active — that product's price is used
--   for estimating until you switch it.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS material_types (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid REFERENCES companies(id) ON DELETE CASCADE,
  name            text NOT NULL,
  unit            text NOT NULL DEFAULT 'sqft',   -- 'sqft' | 'board_ft' | 'bag'
  r_per_inch      numeric,                        -- spray foam only (Layer 1 knows this)
  sort_order      integer DEFAULT 0,
  created_at      timestamptz DEFAULT now()
);

ALTER TABLE material_types ENABLE ROW LEVEL SECURITY;
CREATE POLICY "company isolation" ON material_types FOR ALL
  USING  (company_id IN (SELECT id FROM companies WHERE user_id = auth.uid()))
  WITH CHECK (company_id IN (SELECT id FROM companies WHERE user_id = auth.uid()));

CREATE TABLE IF NOT EXISTS material_products (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        uuid REFERENCES companies(id) ON DELETE CASCADE,
  material_type_id  uuid REFERENCES material_types(id) ON DELETE CASCADE,
  brand             text DEFAULT '',          -- "Owens Corning", "CertainTeed"
  description       text DEFAULT '',          -- "EcoTouch R-21 2×6"
  cost_per_unit     numeric DEFAULT 0,
  markup_pct        numeric DEFAULT 20,
  coverage_factor   numeric DEFAULT 1,        -- sqft-inches per bag (bag unit only)
  is_active         boolean DEFAULT true,     -- is this the currently-used product?
  r_value           text DEFAULT NULL,        -- optional: specific R-value for this SKU
  sort_order        integer DEFAULT 0,
  created_at        timestamptz DEFAULT now()
);

ALTER TABLE material_products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "company isolation" ON material_products FOR ALL
  USING  (company_id IN (SELECT id FROM companies WHERE user_id = auth.uid()))
  WITH CHECK (company_id IN (SELECT id FROM companies WHERE user_id = auth.uid()));
