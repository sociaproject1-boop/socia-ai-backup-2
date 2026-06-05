-- Migration 42: Social upload system, alert settings, music library, cover photo
-- Run: copy contents into Supabase SQL Editor and execute

-- ─── Alert settings (owner-configurable alert channels) ──────────────────
CREATE TABLE IF NOT EXISTS public.alert_settings (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  email_enabled   boolean NOT NULL DEFAULT false,
  sms_enabled     boolean NOT NULL DEFAULT false,
  webhook_enabled boolean NOT NULL DEFAULT false,
  email_address   text,
  phone_number    text,
  webhook_url     text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT alert_settings_user_id_unique UNIQUE (user_id)
);

ALTER TABLE public.alert_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner manages alert settings"
  ON public.alert_settings
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.is_owner = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.is_owner = true
    )
  );

-- ─── Cover photo on users ────────────────────────────────────────────────
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS cover_photo_url text;

-- ─── Posts (user-uploaded social content) ────────────────────────────────
CREATE TABLE IF NOT EXISTS public.posts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id   uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  caption     text,
  type        text NOT NULL DEFAULT 'photo' CHECK (type IN ('photo','video','multi')),
  view_count  integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Posts are public read"
  ON public.posts FOR SELECT USING (true);

CREATE POLICY "Authors manage own posts"
  ON public.posts FOR ALL
  USING (author_id = auth.uid())
  WITH CHECK (author_id = auth.uid());

-- ─── Post media (multiple files per post) ─────────────────────────────────
CREATE TABLE IF NOT EXISTS public.post_media (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id     uuid NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  url         text NOT NULL,
  type        text NOT NULL CHECK (type IN ('photo','video')),
  width       integer,
  height      integer,
  duration    integer,
  position    integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.post_media ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Post media public read"
  ON public.post_media FOR SELECT USING (true);

CREATE POLICY "Authors manage own post media"
  ON public.post_media FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.posts p WHERE p.id = post_id AND p.author_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.posts p WHERE p.id = post_id AND p.author_id = auth.uid())
  );

-- ─── Comments ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.comments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id     uuid NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  author_id   uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  content     text NOT NULL CHECK (char_length(content) BETWEEN 1 AND 2000),
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Comments public read"
  ON public.comments FOR SELECT USING (true);

CREATE POLICY "Authors manage own comments"
  ON public.comments FOR ALL
  USING (author_id = auth.uid())
  WITH CHECK (author_id = auth.uid());

-- ─── Likes ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.likes (
  post_id    uuid NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, user_id)
);

ALTER TABLE public.likes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Likes public read"
  ON public.likes FOR SELECT USING (true);

CREATE POLICY "Users manage own likes"
  ON public.likes FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ─── Saves ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.saves (
  post_id    uuid NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, user_id)
);

ALTER TABLE public.saves ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Saves private to user"
  ON public.saves FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ─── Shares ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.shares (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id    uuid NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.shares ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Shares public read"
  ON public.shares FOR SELECT USING (true);

CREATE POLICY "Users create own shares"
  ON public.shares FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- ─── Post notifications ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.post_notifications (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  actor_id    uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  post_id     uuid REFERENCES public.posts(id) ON DELETE CASCADE,
  type        text NOT NULL CHECK (type IN ('like','comment','follow','mention','share')),
  read        boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.post_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own notifications"
  ON public.post_notifications FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "System creates notifications"
  ON public.post_notifications FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Users update own notifications"
  ON public.post_notifications FOR UPDATE
  USING (user_id = auth.uid());

-- ─── Sounds / Music library ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.sounds (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title        text NOT NULL,
  artist       text,
  url          text,
  duration     integer,
  cover_url    text,
  genre        text,
  is_available boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.sounds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Sounds public read"
  ON public.sounds FOR SELECT USING (true);

CREATE POLICY "Owners manage sounds"
  ON public.sounds FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.is_owner = true
    )
  );

-- ─── Sound usage (which posts use which sounds) ────────────────────────────
CREATE TABLE IF NOT EXISTS public.sound_usage (
  post_id    uuid NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  sound_id   uuid NOT NULL REFERENCES public.sounds(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, sound_id)
);

ALTER TABLE public.sound_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Sound usage public read"
  ON public.sound_usage FOR SELECT USING (true);

CREATE POLICY "Authors attach sounds to own posts"
  ON public.sound_usage FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.posts p WHERE p.id = post_id AND p.author_id = auth.uid())
  );

-- ─── Indexes for performance ───────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS posts_author_id_idx ON public.posts(author_id);
CREATE INDEX IF NOT EXISTS posts_created_at_idx ON public.posts(created_at DESC);
CREATE INDEX IF NOT EXISTS post_media_post_id_idx ON public.post_media(post_id);
CREATE INDEX IF NOT EXISTS comments_post_id_idx ON public.comments(post_id);
CREATE INDEX IF NOT EXISTS likes_post_id_idx ON public.likes(post_id);
CREATE INDEX IF NOT EXISTS post_notifications_user_id_idx ON public.post_notifications(user_id, created_at DESC);

-- ─── Storage bucket for post media ────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'post-media',
  'post-media',
  true,
  104857600,
  ARRAY['image/jpeg','image/png','image/webp','image/gif','video/mp4','video/quicktime','video/webm']
)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Post media public read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'post-media');

CREATE POLICY "Authenticated users upload post media"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'post-media' AND auth.role() = 'authenticated');

CREATE POLICY "Users delete own post media"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'post-media' AND auth.uid()::text = (storage.foldername(name))[1]);

-- ─── Storage bucket for cover photos ──────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'cover-photos',
  'cover-photos',
  true,
  10485760,
  ARRAY['image/jpeg','image/png','image/webp']
)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Cover photos public read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'cover-photos');

CREATE POLICY "Authenticated users upload cover photos"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'cover-photos' AND auth.role() = 'authenticated');

CREATE POLICY "Users delete own cover photos"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'cover-photos' AND auth.uid()::text = (storage.foldername(name))[1]);
