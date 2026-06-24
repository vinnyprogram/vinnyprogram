-- Drawing measurements tables
-- drawing_pages: one row per PDF page — stores page name and calibration
-- drawing_areas: one row per traced polygon — stores area type, floor, sqft

CREATE TABLE IF NOT EXISTS drawing_pages (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id            uuid REFERENCES projects(id) ON DELETE CASCADE,
  company_id            uuid REFERENCES companies(id) ON DELETE CASCADE,
  page_number           integer NOT NULL,
  page_name             text,                  -- "Attic", "1st Floor", "Basement"
  scale_pixels_per_foot numeric,               -- calibrated: pixels per foot
  calibration_points    jsonb,                 -- [{x,y},{x,y}] — the two calibration clicks
  calibration_distance  numeric,               -- real-world distance in feet between the two points
  created_at            timestamptz DEFAULT now()
);
ALTER TABLE drawing_pages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "company_isolation" ON drawing_pages FOR ALL
  USING  (company_id IN (SELECT id FROM companies WHERE user_id = auth.uid()))
  WITH CHECK (company_id IN (SELECT id FROM companies WHERE user_id = auth.uid()));

CREATE TABLE IF NOT EXISTS drawing_areas (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      uuid REFERENCES projects(id) ON DELETE CASCADE,
  company_id      uuid REFERENCES companies(id) ON DELETE CASCADE,
  page_number     integer,
  area_type       text,           -- "Roof Rafter w/ Strapping", "Exterior Wall", etc.
  floor_name      text,           -- maps to the estimate's floor tab
  polygon_points  jsonb,          -- [{x,y}, ...] canvas coordinates
  sqft            numeric,        -- calculated via shoelace formula + scale
  pitch_factor    numeric DEFAULT 1,  -- roof pitch multiplier (e.g. 1.118 for 6:12)
  created_at      timestamptz DEFAULT now()
);
ALTER TABLE drawing_areas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "company_isolation" ON drawing_areas FOR ALL
  USING  (company_id IN (SELECT id FROM companies WHERE user_id = auth.uid()))
  WITH CHECK (company_id IN (SELECT id FROM companies WHERE user_id = auth.uid()));
