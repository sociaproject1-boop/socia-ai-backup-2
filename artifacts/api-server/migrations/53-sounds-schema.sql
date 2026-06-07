-- ================================================================
-- Migration 53 — Socia Sound Ecosystem
-- ================================================================
-- Run in Supabase SQL editor.
--
-- Creates:
--   sounds         — sound library (original + user-uploaded tracks)
--   sound_usage    — which posts use which sound (many-to-many)
--   Adds sound_id column to posts table
-- ================================================================

-- ── 1. sounds ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.sounds (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  title            text        NOT NULL,
  cover_image      text,
  audio_url        text        NOT NULL,
  creator_id       uuid        REFERENCES public.users(id) ON DELETE SET NULL,
  source_type      text        NOT NULL DEFAULT 'original'
                               CHECK (source_type IN ('original', 'remix', 'user_upload')),
  duration_seconds int,
  usage_count      int         NOT NULL DEFAULT 0,
  is_active        boolean     NOT NULL DEFAULT true,
  created_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.sounds ENABLE ROW LEVEL SECURITY;

-- Everyone can read active sounds
CREATE POLICY "sounds_select"
  ON public.sounds FOR SELECT
  USING (is_active = true);

-- Authenticated users can create sounds
CREATE POLICY "sounds_insert"
  ON public.sounds FOR INSERT
  WITH CHECK (auth.uid() = creator_id);

-- Owner can update their own sound
CREATE POLICY "sounds_update"
  ON public.sounds FOR UPDATE
  USING (auth.uid() = creator_id);

-- ── 2. sound_usage ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.sound_usage (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  sound_id   uuid        NOT NULL REFERENCES public.sounds(id)  ON DELETE CASCADE,
  post_id    uuid        NOT NULL REFERENCES public.posts(id)   ON DELETE CASCADE,
  user_id    uuid        NOT NULL REFERENCES public.users(id)   ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (sound_id, post_id)
);

ALTER TABLE public.sound_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sound_usage_select"
  ON public.sound_usage FOR SELECT
  USING (true);

CREATE POLICY "sound_usage_insert"
  ON public.sound_usage FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- ── 3. Add sound_id to posts ─────────────────────────────────────
ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS sound_id uuid REFERENCES public.sounds(id) ON DELETE SET NULL;

-- ── 4. Indexes ────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_sounds_usage_count     ON public.sounds (usage_count DESC);
CREATE INDEX IF NOT EXISTS idx_sounds_creator_id      ON public.sounds (creator_id);
CREATE INDEX IF NOT EXISTS idx_sound_usage_sound_id   ON public.sound_usage (sound_id);
CREATE INDEX IF NOT EXISTS idx_sound_usage_post_id    ON public.sound_usage (post_id);
CREATE INDEX IF NOT EXISTS idx_sound_usage_user_id    ON public.sound_usage (user_id);
CREATE INDEX IF NOT EXISTS idx_posts_sound_id         ON public.posts (sound_id) WHERE sound_id IS NOT NULL;

-- ── 5. Realtime ───────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'sounds'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.sounds;
  END IF;
END $$;
