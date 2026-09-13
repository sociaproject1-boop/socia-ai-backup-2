-- Migration 46: durable social engagement integrity
-- Run once in Supabase SQL Editor. Idempotent.

CREATE TABLE IF NOT EXISTS public.post_views (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id uuid NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT post_views_unique UNIQUE (post_id, user_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS likes_post_user_unique ON public.likes(post_id, user_id);
ALTER TABLE public.post_views ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service manages post_views" ON public.post_views;
CREATE POLICY "Service manages post_views" ON public.post_views FOR ALL USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS post_views_post_id_idx ON public.post_views(post_id);
CREATE INDEX IF NOT EXISTS post_views_user_id_idx ON public.post_views(user_id);

CREATE OR REPLACE FUNCTION public.record_post_view(p_post_id uuid, p_user_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.post_views(post_id, user_id) VALUES (p_post_id, p_user_id)
  ON CONFLICT (post_id, user_id) DO NOTHING;
  IF FOUND THEN
    UPDATE public.posts SET view_count = COALESCE(view_count, 0) + 1 WHERE id = p_post_id;
    RETURN true;
  END IF;
  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public.increment_post_views(post_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE public.posts SET view_count = COALESCE(view_count, 0) + 1 WHERE id = post_id;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='likes') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.likes;
  END IF;
END $$;
