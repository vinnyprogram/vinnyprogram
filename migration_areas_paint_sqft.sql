-- Adds intumescent paint square footage to individual area rows.
-- When closed cell or open cell spray foam isn't covered for fire rating,
-- the exposed surface needs to be painted with intumescent paint.
-- This field tracks how many sqft of that area need painting,
-- priced using the "Intumescent Paint" entry in Settings → Materials.

ALTER TABLE areas
  ADD COLUMN IF NOT EXISTS paint_sqft numeric DEFAULT 0;
