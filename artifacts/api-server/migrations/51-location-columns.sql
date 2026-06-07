-- ============================================================
-- Migration 51 — Extended location columns on users table
-- Run in Supabase SQL editor
-- ============================================================

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS location_city     TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS location_province TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS location_country  TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS location_lat      NUMERIC(12,7),
  ADD COLUMN IF NOT EXISTS location_lng      NUMERIC(12,7);

-- Back-fill index for country-level queries
CREATE INDEX IF NOT EXISTS idx_users_location_country ON users (location_country)
  WHERE location_country IS NOT NULL AND location_country != '';
