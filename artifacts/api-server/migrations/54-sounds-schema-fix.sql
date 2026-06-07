-- ================================================================
-- Migration 54 — Sounds Schema Upgrade
-- ================================================================
-- Run this in Supabase SQL editor if migration 53 failed silently
-- (i.e., the sounds table already existed with a different schema).
--
-- Safe to run multiple times (all ADD COLUMN IF NOT EXISTS).
-- ================================================================

-- ── 1. Upgrade existing sounds table ────────────────────────────
ALTER TABLE public.sounds
  ADD COLUMN IF NOT EXISTS audio_url        text,
  ADD COLUMN IF NOT EXISTS cover_image      text,
  ADD COLUMN IF NOT EXISTS creator_id       uuid REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_type      text NOT NULL DEFAULT 'original',
  ADD COLUMN IF NOT EXISTS duration_seconds int,
  ADD COLUMN IF NOT EXISTS usage_count      int  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_active        boolean NOT NULL DEFAULT true;

-- Copy existing url → audio_url for rows that don't have it yet
UPDATE public.sounds SET audio_url = url WHERE audio_url IS NULL AND url IS NOT NULL;

-- Enable RLS (idempotent)
ALTER TABLE public.sounds ENABLE ROW LEVEL SECURITY;

-- Drop old permissive policies if they exist and recreate
DROP POLICY IF EXISTS "sounds_select"   ON public.sounds;
DROP POLICY IF EXISTS "sounds_insert"   ON public.sounds;
DROP POLICY IF EXISTS "sounds_update"   ON public.sounds;

CREATE POLICY "sounds_select" ON public.sounds FOR SELECT USING (is_active = true);
CREATE POLICY "sounds_insert" ON public.sounds FOR INSERT WITH CHECK (auth.uid() = creator_id);
CREATE POLICY "sounds_update" ON public.sounds FOR UPDATE USING (auth.uid() = creator_id);

-- ── 2. Upgrade existing sound_usage table ───────────────────────
ALTER TABLE public.sound_usage
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES public.users(id) ON DELETE CASCADE;

-- Add primary key id if missing
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'sound_usage'
      AND column_name  = 'id'
  ) THEN
    ALTER TABLE public.sound_usage ADD COLUMN id uuid DEFAULT gen_random_uuid();
  END IF;
END $$;

ALTER TABLE public.sound_usage ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sound_usage_select" ON public.sound_usage;
DROP POLICY IF EXISTS "sound_usage_insert" ON public.sound_usage;

CREATE POLICY "sound_usage_select" ON public.sound_usage FOR SELECT USING (true);
CREATE POLICY "sound_usage_insert" ON public.sound_usage FOR INSERT WITH CHECK (auth.uid() = user_id);

-- ── 3. Add sound_id to posts ─────────────────────────────────────
ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS sound_id uuid REFERENCES public.sounds(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_posts_sound_id ON public.posts (sound_id) WHERE sound_id IS NOT NULL;

-- ── 4. Indexes ───────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_sounds_is_active    ON public.sounds (is_active);
CREATE INDEX IF NOT EXISTS idx_sounds_usage_count  ON public.sounds (usage_count DESC);
CREATE INDEX IF NOT EXISTS idx_sounds_creator_id   ON public.sounds (creator_id);
CREATE INDEX IF NOT EXISTS idx_sound_usage_sound_id ON public.sound_usage (sound_id);
CREATE INDEX IF NOT EXISTS idx_sound_usage_post_id  ON public.sound_usage (post_id);
