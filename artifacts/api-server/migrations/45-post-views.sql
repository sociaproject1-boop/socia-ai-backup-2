-- Migration 45: Database-backed unique post view tracking
-- Replaces in-memory session cache for authenticated users.
-- Unique constraint (post_id, user_id) is enforced by the DB — survives restarts.

CREATE TABLE IF NOT EXISTS public.post_views (
  id          uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id     uuid        NOT NULL REFERENCES public.posts(id)  ON DELETE CASCADE,
  user_id     uuid        NOT NULL REFERENCES public.users(id)  ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT  post_views_unique UNIQUE (post_id, user_id)
);

ALTER TABLE public.post_views ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service manages post_views"
  ON public.post_views FOR ALL
  USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS post_views_post_id_idx  ON public.post_views(post_id);
CREATE INDEX IF NOT EXISTS post_views_user_id_idx  ON public.post_views(user_id);
CREATE INDEX IF NOT EXISTS post_views_created_idx  ON public.post_views(created_at DESC);

-- Atomic RPC: inserts a view row; if it already exists the DO NOTHING branch
-- fires and view_count is NOT incremented. Returns TRUE if a new unique view
-- was recorded, FALSE if the user already viewed this post.
CREATE OR REPLACE FUNCTION public.record_post_view(
  p_post_id uuid,
  p_user_id uuid
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.post_views (post_id, user_id)
  VALUES (p_post_id, p_user_id)
  ON CONFLICT (post_id, user_id) DO NOTHING;

  IF FOUND THEN
    UPDATE public.posts
    SET    view_count = COALESCE(view_count, 0) + 1
    WHERE  id = p_post_id;
    RETURN true;
  END IF;

  RETURN false;
END;
$$;

-- Back-fill: give the old in-memory counts a view_count floor of 0
-- (no-op if view_count is already set)
UPDATE public.posts SET view_count = 0 WHERE view_count IS NULL;
