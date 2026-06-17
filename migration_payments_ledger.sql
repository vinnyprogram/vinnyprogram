-- Run in Supabase SQL Editor before deploying the payments ledger feature

ALTER TABLE hers_invoices
  ADD COLUMN IF NOT EXISTS payments jsonb DEFAULT '[]';
