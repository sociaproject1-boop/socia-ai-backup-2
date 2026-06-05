-- ============================================================
-- Migration 48: Live Streaming Foundation
-- Tables: stream_sessions, stream_comments, stream_reactions, stream_viewers
-- ============================================================

-- ── stream_sessions ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.stream_sessions (
  id              uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  creator_id      uuid        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  title           text        NOT NULL CHECK (char_length(title) BETWEEN 1 AND 120),
  description     text                 CHECK (char_length(description) <= 500),
  category        text        NOT NULL DEFAULT 'general',
  thumbnail_url   text,
  stream_key      text        NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(16), 'hex'),
  status          text        NOT NULL DEFAULT 'live'
                              CHECK (status IN ('live','ended')),
  viewer_count    integer     NOT NULL DEFAULT 0,
  peak_viewers    integer     NOT NULL DEFAULT 0,
  total_viewers   integer     NOT NULL DEFAULT 0,
  started_at      timestamptz NOT NULL DEFAULT now(),
  ended_at        timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- ── stream_comments ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.stream_comments (
  id              uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  stream_id       uuid        NOT NULL REFERENCES public.stream_sessions(id) ON DELETE CASCADE,
  user_id         uuid        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  content         text        NOT NULL CHECK (char_length(content) BETWEEN 1 AND 300),
  is_muted        boolean     NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- ── stream_reactions ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.stream_reactions (
  id              uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  stream_id       uuid        NOT NULL REFERENCES public.stream_sessions(id) ON DELETE CASCADE,
  user_id         uuid        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  type            text        NOT NULL CHECK (type IN ('heart','like','fire','clap')),
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- ── stream_viewers ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.stream_viewers (
  id              uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  stream_id       uuid        NOT NULL REFERENCES public.stream_sessions(id) ON DELETE CASCADE,
  user_id         uuid        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  joined_at       timestamptz NOT NULL DEFAULT now(),
  left_at         timestamptz,
  UNIQUE (stream_id, user_id)
);

-- ── Indexes ───────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_stream_sessions_status_started
  ON public.stream_sessions (status, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_stream_sessions_creator
  ON public.stream_sessions (creator_id);

CREATE INDEX IF NOT EXISTS idx_stream_comments_stream_created
  ON public.stream_comments (stream_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_stream_reactions_stream
  ON public.stream_reactions (stream_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_stream_viewers_stream
  ON public.stream_viewers (stream_id);

CREATE INDEX IF NOT EXISTS idx_stream_viewers_user
  ON public.stream_viewers (user_id);

-- ── Enable Row Level Security ─────────────────────────────────────────────────
ALTER TABLE public.stream_sessions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stream_comments  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stream_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stream_viewers   ENABLE ROW LEVEL SECURITY;

-- ── RLS Policies: stream_sessions ─────────────────────────────────────────────
CREATE POLICY "streams_select_live"
  ON public.stream_sessions FOR SELECT
  USING (status = 'live' OR creator_id = auth.uid());

CREATE POLICY "streams_insert_own"
  ON public.stream_sessions FOR INSERT
  WITH CHECK (creator_id = auth.uid());

CREATE POLICY "streams_update_own"
  ON public.stream_sessions FOR UPDATE
  USING (creator_id = auth.uid());

-- ── RLS Policies: stream_comments ─────────────────────────────────────────────
CREATE POLICY "stream_comments_select"
  ON public.stream_comments FOR SELECT
  USING (true);

CREATE POLICY "stream_comments_insert_own"
  ON public.stream_comments FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "stream_comments_delete_own"
  ON public.stream_comments FOR DELETE
  USING (user_id = auth.uid());

-- ── RLS Policies: stream_reactions ────────────────────────────────────────────
CREATE POLICY "stream_reactions_select"
  ON public.stream_reactions FOR SELECT
  USING (true);

CREATE POLICY "stream_reactions_insert_own"
  ON public.stream_reactions FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- ── RLS Policies: stream_viewers ──────────────────────────────────────────────
CREATE POLICY "stream_viewers_select"
  ON public.stream_viewers FOR SELECT
  USING (true);

CREATE POLICY "stream_viewers_insert_own"
  ON public.stream_viewers FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "stream_viewers_update_own"
  ON public.stream_viewers FOR UPDATE
  USING (user_id = auth.uid());

-- ── Enable Supabase Realtime on live tables ───────────────────────────────────
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.stream_sessions;
  EXCEPTION WHEN others THEN NULL; END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.stream_comments;
  EXCEPTION WHEN others THEN NULL; END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.stream_reactions;
  EXCEPTION WHEN others THEN NULL; END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.stream_viewers;
  EXCEPTION WHEN others THEN NULL; END;
END $$;
