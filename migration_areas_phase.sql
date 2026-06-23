-- Adds phase tracking to individual area rows.
-- null = no phase distinction (single-phase job, existing behavior).
-- 1 = 1st phase (done first, e.g. before rough inspection or concrete pour).
-- 2 = 2nd phase (done after rough inspection / later site visit).

ALTER TABLE areas
  ADD COLUMN IF NOT EXISTS phase integer DEFAULT NULL;
