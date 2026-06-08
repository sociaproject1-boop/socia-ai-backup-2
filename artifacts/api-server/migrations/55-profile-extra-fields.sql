-- Migration 55: Profile extra fields
-- Run in Supabase SQL Editor
-- Adds headline, interests, skills, languages, timezone, pronunciation,
-- mood_status, mood_emoji columns to the public.users table.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS headline        TEXT,
  ADD COLUMN IF NOT EXISTS interests       JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS skills          JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS languages       JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS timezone        TEXT,
  ADD COLUMN IF NOT EXISTS pronunciation   TEXT,
  ADD COLUMN IF NOT EXISTS mood_status     TEXT,
  ADD COLUMN IF NOT EXISTS mood_emoji      TEXT,
  ADD COLUMN IF NOT EXISTS profile_views   INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS link_clicks     INTEGER DEFAULT 0;

-- Grant select/update on new columns to authenticated users (if RLS is enabled)
-- These columns are controlled by existing RLS policies on the users table.

COMMENT ON COLUMN public.users.headline      IS 'Professional headline / tagline (e.g. Founder of SOCIA)';
COMMENT ON COLUMN public.users.interests     IS 'Array of interest chip labels the user selected';
COMMENT ON COLUMN public.users.skills        IS 'Array of custom skill tags';
COMMENT ON COLUMN public.users.languages     IS 'Array of languages the user speaks';
COMMENT ON COLUMN public.users.timezone      IS 'IANA timezone string (e.g. Asia/Manila)';
COMMENT ON COLUMN public.users.pronunciation IS 'How to pronounce the users name';
COMMENT ON COLUMN public.users.mood_status   IS 'Short status text (e.g. Building something great)';
COMMENT ON COLUMN public.users.mood_emoji    IS 'Single emoji for the mood indicator';
COMMENT ON COLUMN public.users.profile_views IS 'Running count of profile page views';
COMMENT ON COLUMN public.users.link_clicks   IS 'Running count of website link clicks';
