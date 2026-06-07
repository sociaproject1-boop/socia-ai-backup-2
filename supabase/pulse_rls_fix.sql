-- ============================================================
-- PULSE RLS FIX — Run this in Supabase SQL editor
-- Fixes: "new row violates row-level security policy"
-- Root cause: The FOR ALL policy needs WITH CHECK for INSERT.
-- ============================================================

-- Fix the pulses table policies
DROP POLICY IF EXISTS "Owner full access" ON pulses;

-- Recreate with explicit WITH CHECK so INSERT is also allowed
CREATE POLICY "Owner full access"
  ON pulses FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Ensure the SELECT policy for non-expired + public exists
DROP POLICY IF EXISTS "Read active public pulses" ON pulses;
CREATE POLICY "Read active public pulses"
  ON pulses FOR SELECT
  USING (
    (visibility = 'public' AND expires_at > now())
    OR (auth.uid() = user_id)
  );

-- ── Storage bucket policies for "pulses" bucket ───────────────
-- Create the bucket first if it doesn't exist:
-- Dashboard → Storage → New bucket → name: "pulses", Public ON

-- Allow authenticated users to upload to their own folder
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'pulses') THEN
    -- SELECT: anyone can view public pulse media
    INSERT INTO storage.policies (name, bucket_id, operation, definition)
    VALUES
      ('Public read pulses',          'pulses', 'SELECT', 'true'),
      ('Auth users upload own pulses','pulses', 'INSERT', 'auth.uid()::text = (storage.foldername(name))[1]'),
      ('Auth users delete own pulses','pulses', 'DELETE', 'auth.uid()::text = (storage.foldername(name))[1]')
    ON CONFLICT DO NOTHING;
  END IF;
END $$;
