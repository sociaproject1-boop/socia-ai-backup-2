-- Migration 60: Trending Engine — watch-time & retention signals
-- Run in Supabase SQL editor BEFORE deploying the trending route.
--
-- Adds:
--   posts.total_watch_ms     — cumulative milliseconds watched across all viewers
--   posts.avg_retention_pct  — 0-100 average percentage of video watched per viewer
--   posts.share_count        — cached count of shares (updated by trigger)
--   posts.trending_score     — denormalized score (updated async, read by index scan)
--
-- Also creates:
--   idx_posts_trending       — composite index for fast trending queries
--   fn_increment_share_count — trigger to keep share_count in sync

-- ── Signal columns ─────────────────────────────────────────────────────────
ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS total_watch_ms    bigint  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS avg_retention_pct real    NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS share_count       integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS trending_score    real    NOT NULL DEFAULT 0;

-- ── Indexes ────────────────────────────────────────────────────────────────
-- Used by GET /api/trending to quickly pull recent candidates
CREATE INDEX IF NOT EXISTS idx_posts_trending
  ON public.posts (created_at DESC, trending_score DESC);

-- ── Share-count sync trigger ───────────────────────────────────────────────
-- Increments share_count on posts when a row is inserted into shares.
CREATE OR REPLACE FUNCTION public.fn_increment_share_count()
  RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE public.posts
     SET share_count = share_count + 1
   WHERE id = NEW.post_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_increment_share_count ON public.shares;
CREATE TRIGGER trg_increment_share_count
  AFTER INSERT ON public.shares
  FOR EACH ROW EXECUTE FUNCTION public.fn_increment_share_count();

-- ── Watch-time RPC ─────────────────────────────────────────────────────────
-- Called by the frontend on video end / page unload with actual watch data.
-- Atomically updates cumulative watch time and recomputes avg retention.
CREATE OR REPLACE FUNCTION public.record_watch_event(
  p_post_id         uuid,
  p_watch_ms        bigint,
  p_duration_ms     bigint
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_view_count  integer;
  v_retention   real;
BEGIN
  IF p_duration_ms IS NULL OR p_duration_ms <= 0 THEN RETURN; END IF;

  SELECT view_count INTO v_view_count FROM public.posts WHERE id = p_post_id;
  IF v_view_count IS NULL OR v_view_count = 0 THEN v_view_count := 1; END IF;

  v_retention := LEAST(100.0, (p_watch_ms::real / p_duration_ms::real) * 100.0);

  UPDATE public.posts
     SET total_watch_ms    = total_watch_ms + p_watch_ms,
         avg_retention_pct = (
           (avg_retention_pct * (view_count - 1) + v_retention)
           / GREATEST(1, view_count)
         )
   WHERE id = p_post_id;
END;
$$;
