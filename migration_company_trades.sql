-- Add trade configuration to companies so each company
-- can specify which trades they offer. Defaults to true for both
-- so existing companies are unaffected.

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS offers_insulation boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS offers_hers boolean DEFAULT true;
