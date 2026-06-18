-- Add flexible areas column to hers_field_measurements
-- Run in Supabase SQL Editor

ALTER TABLE hers_field_measurements
  ADD COLUMN IF NOT EXISTS areas jsonb DEFAULT '[]';
