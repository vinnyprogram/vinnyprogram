-- Run in Supabase SQL Editor before deploying the field measurements feature

CREATE TABLE IF NOT EXISTS hers_field_measurements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hers_invoice_id uuid REFERENCES hers_invoices(id) ON DELETE CASCADE UNIQUE,
  company_id uuid REFERENCES companies(id),
  floors jsonb DEFAULT '[]',
  roof_segments jsonb DEFAULT '[]',
  wall_segments jsonb DEFAULT '[]',
  rim_joist_segments jsonb DEFAULT '[]',
  bedrooms integer DEFAULT 0,
  windows jsonb DEFAULT '[]',
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE hers_field_measurements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "company isolation" ON hers_field_measurements FOR ALL
  USING (company_id IN (SELECT id FROM companies WHERE user_id = auth.uid()))
  WITH CHECK (company_id IN (SELECT id FROM companies WHERE user_id = auth.uid()));

-- Reuse the existing job_photos table + job-photos storage bucket for HERS
-- photos/documents too, rather than building a parallel system.
ALTER TABLE job_photos
  ADD COLUMN IF NOT EXISTS hers_invoice_id uuid REFERENCES hers_invoices(id) ON DELETE CASCADE;

-- project_id was likely required before; make it optional since HERS uploads
-- will use hers_invoice_id instead.
ALTER TABLE job_photos ALTER COLUMN project_id DROP NOT NULL;
