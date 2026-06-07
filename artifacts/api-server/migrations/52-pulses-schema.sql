-- ================================================================
-- Migration 52 — Pulses (Stories) System — COMPLETE SCHEMA
-- ================================================================
--
-- IMPORTANT: This supersedes supabase/pulse_migration.sql and
-- supabase/pulse_rls_fix.sql. Do NOT run those old files.
--
-- Context after database inspection:
--   • No pulses tables existed in Supabase before this migration.
--   • Project uses: users, posts, post_media, comments, likes,
--     saves, post_views, follows, reports — NOT stories/moments.
--   • Pulses is the correct name for the stories feature.
--
-- RLS correctness notes:
--   • FOR ALL with USING only does NOT cover INSERT rows.
--     INSERT requires a WITH CHECK clause to pass RLS.
--   • pulse_views SELECT policy is intentionally permissive (true)
--     so view-count queries work when SUPABASE_SERVICE_ROLE_KEY
--     is absent and the server falls back to the anon key.
--   • pulse_reactions needs both INSERT and UPDATE policies because
--     the route uses upsert({ onConflict: "pulse_id,user_id" }).
-- ================================================================

-- ── 1. pulses ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pulses (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  type          text        NOT NULL CHECK (type IN ('image', 'video', 'text')),
  media_url     text,
  text_content  text,
  text_bg       text        NOT NULL DEFAULT '#0f0f23',
  text_color    text        NOT NULL DEFAULT '#ffffff',
  music_url     text,
  music_name    text,
  visibility    text        NOT NULL DEFAULT 'public'
                            CHECK (visibility IN ('public', 'followers', 'friends', 'private')),
  is_reported   boolean     NOT NULL DEFAULT false,
  expires_at    timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
  created_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.pulses ENABLE ROW LEVEL SECURITY;

-- ── 2. pulse_views ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pulse_views (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  pulse_id   uuid        NOT NULL REFERENCES public.pulses(id)  ON DELETE CASCADE,
  viewer_id  uuid        NOT NULL REFERENCES public.users(id)   ON DELETE CASCADE,
  viewed_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (pulse_id, viewer_id)
);

ALTER TABLE public.pulse_views ENABLE ROW LEVEL SECURITY;

-- ── 3. pulse_reactions ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pulse_reactions (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  pulse_id   uuid        NOT NULL REFERENCES public.pulses(id)  ON DELETE CASCADE,
  user_id    uuid        NOT NULL REFERENCES public.users(id)   ON DELETE CASCADE,
  emoji      text        NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (pulse_id, user_id)
);

ALTER TABLE public.pulse_reactions ENABLE ROW LEVEL SECURITY;

-- ── 4. pulse_reports ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pulse_reports (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  pulse_id    uuid        NOT NULL REFERENCES public.pulses(id)  ON DELETE CASCADE,
  reporter_id uuid        NOT NULL REFERENCES public.users(id)   ON DELETE CASCADE,
  reason      text        NOT NULL DEFAULT 'Inappropriate content',
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (pulse_id, reporter_id)
);

ALTER TABLE public.pulse_reports ENABLE ROW LEVEL SECURITY;

-- ================================================================
-- RLS Policies
-- ================================================================

-- ── pulses ──────────────────────────────────────────────────────

-- Anyone authenticated can read: public+non-expired, or their own (any state)
CREATE POLICY "pulses_select"
  ON public.pulses FOR SELECT
  USING (
    (visibility = 'public' AND expires_at > now())
    OR auth.uid() = user_id
  );

-- INSERT: WITH CHECK is mandatory — USING alone does not cover inserts
CREATE POLICY "pulses_insert"
  ON public.pulses FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- UPDATE: owner only
CREATE POLICY "pulses_update"
  ON public.pulses FOR UPDATE
  USING      (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- DELETE: owner only
CREATE POLICY "pulses_delete"
  ON public.pulses FOR DELETE
  USING (auth.uid() = user_id);

-- ── pulse_views ─────────────────────────────────────────────────

-- SELECT is public so view-count queries work without service-role key
CREATE POLICY "pulse_views_select"
  ON public.pulse_views FOR SELECT
  USING (true);

-- INSERT own view only
CREATE POLICY "pulse_views_insert"
  ON public.pulse_views FOR INSERT
  WITH CHECK (auth.uid() = viewer_id);

-- ── pulse_reactions ─────────────────────────────────────────────

-- Reactions are public (emoji counts shown to everyone)
CREATE POLICY "pulse_reactions_select"
  ON public.pulse_reactions FOR SELECT
  USING (true);

-- INSERT own reaction
CREATE POLICY "pulse_reactions_insert"
  ON public.pulse_reactions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- UPDATE needed because route uses .upsert() on (pulse_id, user_id) conflict
CREATE POLICY "pulse_reactions_update"
  ON public.pulse_reactions FOR UPDATE
  USING      (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ── pulse_reports ───────────────────────────────────────────────

CREATE POLICY "pulse_reports_insert"
  ON public.pulse_reports FOR INSERT
  WITH CHECK (auth.uid() = reporter_id);

-- Reporter can read their own reports
CREATE POLICY "pulse_reports_select_own"
  ON public.pulse_reports FOR SELECT
  USING (auth.uid() = reporter_id);

-- ================================================================
-- Indexes
-- ================================================================

-- Feed query: ORDER BY created_at DESC, filtered by visibility + expires_at
CREATE INDEX IF NOT EXISTS idx_pulses_feed
  ON public.pulses (visibility, expires_at, created_at DESC);

-- Per-user pulse queries
CREATE INDEX IF NOT EXISTS idx_pulses_user_id
  ON public.pulses (user_id, expires_at DESC);

-- pulse_views lookups (who viewed, count per pulse)
CREATE INDEX IF NOT EXISTS idx_pulse_views_pulse_id
  ON public.pulse_views (pulse_id);

CREATE INDEX IF NOT EXISTS idx_pulse_views_viewer_id
  ON public.pulse_views (viewer_id);

-- pulse_reactions per pulse
CREATE INDEX IF NOT EXISTS idx_pulse_reactions_pulse_id
  ON public.pulse_reactions (pulse_id);

-- pulse_reports per pulse (admin mod queue)
CREATE INDEX IF NOT EXISTS idx_pulse_reports_pulse_id
  ON public.pulse_reports (pulse_id);

-- ================================================================
-- Realtime (safe — skips if already published)
-- ================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'pulses'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.pulses;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'pulse_views'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.pulse_views;
  END IF;
END $$;

-- ================================================================
-- Storage bucket policies
-- ================================================================
-- STEP 1 (do this first in Supabase Dashboard):
--   Storage → New bucket
--   Name: pulses
--   Public: ON  (toggle enabled)
--
-- STEP 2: Run the block below. It is safe to re-run (IF NOT EXISTS guards).

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'pulses') THEN

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'storage' AND tablename = 'objects'
        AND policyname = 'pulses_public_read'
    ) THEN
      EXECUTE $pol$
        CREATE POLICY "pulses_public_read"
          ON storage.objects FOR SELECT
          USING (bucket_id = 'pulses');
      $pol$;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'storage' AND tablename = 'objects'
        AND policyname = 'pulses_upload_own'
    ) THEN
      EXECUTE $pol$
        CREATE POLICY "pulses_upload_own"
          ON storage.objects FOR INSERT
          WITH CHECK (
            bucket_id = 'pulses'
            AND auth.role() = 'authenticated'
            AND auth.uid()::text = (storage.foldername(name))[1]
          );
      $pol$;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'storage' AND tablename = 'objects'
        AND policyname = 'pulses_delete_own'
    ) THEN
      EXECUTE $pol$
        CREATE POLICY "pulses_delete_own"
          ON storage.objects FOR DELETE
          USING (
            bucket_id = 'pulses'
            AND auth.uid()::text = (storage.foldername(name))[1]
          );
      $pol$;
    END IF;

  END IF;
END $$;
