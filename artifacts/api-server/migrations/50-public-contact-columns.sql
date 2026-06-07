-- Migration 50: Add public_email and public_phone to users table
-- Run in Supabase SQL editor

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS public_email text DEFAULT '' NOT NULL,
  ADD COLUMN IF NOT EXISTS public_phone text DEFAULT '' NOT NULL;

COMMENT ON COLUMN users.public_email IS 'Optional contact email shown publicly on profile (user-controlled)';
COMMENT ON COLUMN users.public_phone IS 'Optional contact phone shown publicly on profile (user-controlled)';
