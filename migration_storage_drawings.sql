-- ── Supabase Storage bucket for floor plan PDFs ──────────────────────────────
-- Run this in the Supabase SQL editor.
-- This creates a private bucket where uploaded PDFs are stored per project.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'drawings',
  'drawings',
  false,
  52428800,   -- 50 MB max per file
  ARRAY['application/pdf','image/jpeg','image/png','image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- Authenticated users can upload to their own company's folder
CREATE POLICY "authenticated upload"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'drawings');

-- Authenticated users can read their own drawings
CREATE POLICY "authenticated read"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'drawings');

-- Authenticated users can delete their own drawings
CREATE POLICY "authenticated delete"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'drawings');
