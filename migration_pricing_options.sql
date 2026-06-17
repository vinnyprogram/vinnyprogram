-- Run this in Supabase SQL Editor before deploying the new HERS estimate code

ALTER TABLE hers_estimates
  ADD COLUMN IF NOT EXISTS markup_type text CHECK (markup_type IN ('percent','fixed')),
  ADD COLUMN IF NOT EXISTS markup_value numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount_type text CHECK (discount_type IN ('percent','fixed')),
  ADD COLUMN IF NOT EXISTS discount_value numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS deposit_type text CHECK (deposit_type IN ('percent','fixed')),
  ADD COLUMN IF NOT EXISTS deposit_value numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payment_schedule jsonb DEFAULT '[]';

ALTER TABLE hers_invoices
  ADD COLUMN IF NOT EXISTS markup_type text CHECK (markup_type IN ('percent','fixed')),
  ADD COLUMN IF NOT EXISTS markup_value numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount_type text CHECK (discount_type IN ('percent','fixed')),
  ADD COLUMN IF NOT EXISTS discount_value numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS deposit_type text CHECK (deposit_type IN ('percent','fixed')),
  ADD COLUMN IF NOT EXISTS deposit_value numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS deposit_paid boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS payment_schedule jsonb DEFAULT '[]';
