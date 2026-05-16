-- ================================================================
-- SECTION 14 — Add social link columns to users table
-- Safe to run multiple times (idempotent ADD COLUMN IF NOT EXISTS).
-- Run this in Supabase SQL Editor.
-- ================================================================
BEGIN;

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS social_facebook  TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS social_instagram TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS social_tiktok    TEXT NOT NULL DEFAULT '';

COMMIT;
