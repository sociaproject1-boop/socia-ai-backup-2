-- Migration 44: Social feed v2 — notifications, reports, comment replies, RPCs
-- Run in Supabase SQL Editor after migration 42.

-- ─── parent_comment_id for replies ──────────────────────────────────────
ALTER TABLE public.comments
  ADD COLUMN IF NOT EXISTS parent_comment_id uuid REFERENCES public.comments(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS comments_parent_id_idx ON public.comments(parent_comment_id)
  WHERE parent_comment_id IS NOT NULL;

-- ─── Post notifications table ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.post_notifications (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  actor_id    uuid REFERENCES public.users(id) ON DELETE SET NULL,
  post_id     uuid REFERENCES public.posts(id) ON DELETE CASCADE,
  comment_id  uuid REFERENCES public.comments(id) ON DELETE CASCADE,
  type        text NOT NULL CHECK (type IN ('like','comment','reply','follow','mention')),
  read        boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.post_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own notifications"
  ON public.post_notifications FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Service inserts notifications"
  ON public.post_notifications FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Users mark own read"
  ON public.post_notifications FOR UPDATE
  USING (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS post_notifications_user_id_idx
  ON public.post_notifications(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS post_notifications_unread_idx
  ON public.post_notifications(user_id, read)
  WHERE read = false;

-- ─── Reports table ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.reports (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  post_id     uuid REFERENCES public.posts(id) ON DELETE CASCADE,
  comment_id  uuid REFERENCES public.comments(id) ON DELETE CASCADE,
  reason      text NOT NULL CHECK (reason IN ('spam','inappropriate','harassment','misinformation','other')),
  notes       text,
  status      text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','reviewed','dismissed','actioned')),
  reviewed_by uuid REFERENCES public.users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  CONSTRAINT reports_one_target CHECK (
    (post_id IS NOT NULL AND comment_id IS NULL) OR
    (post_id IS NULL AND comment_id IS NOT NULL)
  )
);

ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users submit reports"
  ON public.reports FOR INSERT
  WITH CHECK (reporter_id = auth.uid());

CREATE POLICY "Owner reviews all reports"
  ON public.reports FOR ALL
  USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_owner = true));

CREATE INDEX IF NOT EXISTS reports_status_idx ON public.reports(status, created_at DESC);
CREATE INDEX IF NOT EXISTS reports_post_id_idx ON public.reports(post_id) WHERE post_id IS NOT NULL;

-- ─── increment_post_views RPC ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.increment_post_views(post_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE public.posts SET view_count = view_count + 1 WHERE id = post_id;
END;
$$;

-- ─── Unread notification count helper ────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_unread_notification_count(target_user_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE cnt integer;
BEGIN
  SELECT COUNT(*) INTO cnt
  FROM public.post_notifications
  WHERE user_id = target_user_id AND read = false;
  RETURN COALESCE(cnt, 0);
END;
$$;

-- ─── Engagement score index helper ───────────────────────────────────────
-- Add computed stats columns for faster trending sort (populated by triggers)
ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS cached_like_count    integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cached_comment_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cached_save_count    integer NOT NULL DEFAULT 0;

-- Trigger to keep cached counts in sync
CREATE OR REPLACE FUNCTION public.sync_post_like_count()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.posts SET cached_like_count = cached_like_count + 1 WHERE id = NEW.post_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.posts SET cached_like_count = GREATEST(0, cached_like_count - 1) WHERE id = OLD.post_id;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_like_count ON public.likes;
CREATE TRIGGER trg_sync_like_count
  AFTER INSERT OR DELETE ON public.likes
  FOR EACH ROW EXECUTE FUNCTION public.sync_post_like_count();

CREATE OR REPLACE FUNCTION public.sync_post_comment_count()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.posts SET cached_comment_count = cached_comment_count + 1 WHERE id = NEW.post_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.posts SET cached_comment_count = GREATEST(0, cached_comment_count - 1) WHERE id = OLD.post_id;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_comment_count ON public.comments;
CREATE TRIGGER trg_sync_comment_count
  AFTER INSERT OR DELETE ON public.comments
  FOR EACH ROW EXECUTE FUNCTION public.sync_post_comment_count();

CREATE OR REPLACE FUNCTION public.sync_post_save_count()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.posts SET cached_save_count = cached_save_count + 1 WHERE id = NEW.post_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.posts SET cached_save_count = GREATEST(0, cached_save_count - 1) WHERE id = OLD.post_id;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_save_count ON public.saves;
CREATE TRIGGER trg_sync_save_count
  AFTER INSERT OR DELETE ON public.saves
  FOR EACH ROW EXECUTE FUNCTION public.sync_post_save_count();

-- ─── Backfill cached counts for existing data ─────────────────────────────
UPDATE public.posts p
SET
  cached_like_count    = (SELECT COUNT(*) FROM public.likes    WHERE post_id = p.id),
  cached_comment_count = (SELECT COUNT(*) FROM public.comments WHERE post_id = p.id),
  cached_save_count    = (SELECT COUNT(*) FROM public.saves    WHERE post_id = p.id);
