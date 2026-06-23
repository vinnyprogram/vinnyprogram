-- quote_material_selections links a specific area on a specific job to a
-- specific material_products row (brand/SKU). The material_coverage_id column
-- is repurposed to point to material_products.id since material_coverage is
-- empty and serves the same concept.
--
-- Adding a unique constraint on (project_id, area_id) so we can upsert
-- (change the selection) without creating duplicate rows.

ALTER TABLE quote_material_selections
  ADD CONSTRAINT IF NOT EXISTS qms_project_area_unique
  UNIQUE (project_id, area_id);
