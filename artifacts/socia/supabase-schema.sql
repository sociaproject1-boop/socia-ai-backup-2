-- ══════════════════════════════════════════════════════════════════════════
-- SOCIA — Supabase schema
-- Run the entire file in the Supabase SQL Editor → New query → Run
--
-- This script is fully idempotent: safe to run multiple times.
-- ══════════════════════════════════════════════════════════════════════════

-- ── 1. USERS ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.users (
  id          UUID        PRIMARY KEY,
  email       TEXT        NOT NULL DEFAULT '',
  name        TEXT        NOT NULL DEFAULT '',
  username    TEXT        NOT NULL DEFAULT '',
  avatar_url  TEXT                 DEFAULT '',
  bio         TEXT                 DEFAULT '',
  followers   INTEGER     NOT NULL DEFAULT 0,
  following   INTEGER     NOT NULL DEFAULT 0,
  last_seen   TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add columns if upgrading from an older schema
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS last_seen   TIMESTAMPTZ;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS bio         TEXT DEFAULT '';
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS followers   INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS following   INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Drop old policy names (idempotent)
DROP POLICY IF EXISTS "users_select_all" ON public.users;
DROP POLICY IF EXISTS "users_insert_own" ON public.users;
DROP POLICY IF EXISTS "users_update_own" ON public.users;
DROP POLICY IF EXISTS "Users read"       ON public.users;
DROP POLICY IF EXISTS "Users insert"     ON public.users;
DROP POLICY IF EXISTS "Users update"     ON public.users;

-- Any authenticated user (or anon) can read any profile — needed for search
CREATE POLICY "Users read"
  ON public.users FOR SELECT
  TO anon, authenticated
  USING (true);

-- Only the owner can insert/update their own row
CREATE POLICY "Users insert"
  ON public.users FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users update"
  ON public.users FOR UPDATE
  TO authenticated
  USING     (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- ── 2. MESSAGES ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.messages (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id   UUID        NOT NULL,
  receiver_id UUID        NOT NULL,
  text        TEXT,
  image_url   TEXT,
  audio_url   TEXT,
  seen        BOOLEAN     NOT NULL DEFAULT false,
  seen_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add missing columns if upgrading from an older schema
-- (CREATE TABLE IF NOT EXISTS won't add columns to an existing table)
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS text        TEXT;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS image_url   TEXT;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS audio_url   TEXT;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS seen        BOOLEAN     NOT NULL DEFAULT false;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS seen_at     TIMESTAMPTZ;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS edited      BOOLEAN     NOT NULL DEFAULT false;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS edited_at   TIMESTAMPTZ;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Remove FK constraints (prevents FK violations when user rows lag behind auth)
ALTER TABLE public.messages DROP CONSTRAINT IF EXISTS messages_sender_id_fkey;
ALTER TABLE public.messages DROP CONSTRAINT IF EXISTS messages_receiver_id_fkey;

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_messages_sender   ON public.messages(sender_id,   created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_receiver ON public.messages(receiver_id, created_at DESC);

-- Enable Realtime (idempotent via DO block)
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
EXCEPTION WHEN duplicate_object THEN
  NULL; -- table already in publication, that's fine
END $$;

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- Drop old policy names (idempotent)
DROP POLICY IF EXISTS "messages_select"        ON public.messages;
DROP POLICY IF EXISTS "messages_insert"        ON public.messages;
DROP POLICY IF EXISTS "messages_update"        ON public.messages;
DROP POLICY IF EXISTS "Allow message read"     ON public.messages;
DROP POLICY IF EXISTS "Allow message insert"   ON public.messages;
DROP POLICY IF EXISTS "Allow message update"   ON public.messages;

-- Only the sender and receiver can read a message
CREATE POLICY "Allow message read"
  ON public.messages FOR SELECT
  TO authenticated
  USING (
    auth.uid() = sender_id OR
    auth.uid() = receiver_id
  );

-- Only the sender can insert a message (prevents spoofing sender_id)
CREATE POLICY "Allow message insert"
  ON public.messages FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = sender_id);

-- Sender can edit their own message; receiver can mark as seen
CREATE POLICY "Allow message update"
  ON public.messages FOR UPDATE
  TO authenticated
  USING (auth.uid() = sender_id OR auth.uid() = receiver_id);

-- ── 3. NOTIFICATIONS ──────────────────────────────────────────────────────
-- NOTE: No FK to users — avoids insert failures when user row doesn't exist yet
CREATE TABLE IF NOT EXISTS public.notifications (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL,
  type       TEXT        NOT NULL DEFAULT 'message',
  data       JSONB       NOT NULL DEFAULT '{}',
  read       BOOLEAN     NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON public.notifications(user_id, created_at DESC);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Each user can only see and manage their own notifications
DROP POLICY IF EXISTS "notif_select" ON public.notifications;
CREATE POLICY "notif_select"
  ON public.notifications FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "notif_insert" ON public.notifications;
CREATE POLICY "notif_insert"
  ON public.notifications FOR INSERT
  TO authenticated
  WITH CHECK (true); -- any authenticated user can create a notification for another

DROP POLICY IF EXISTS "notif_update" ON public.notifications;
CREATE POLICY "notif_update"
  ON public.notifications FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

-- ── 4. STORAGE: avatars bucket ────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('avatars', 'avatars', true, 5242880, ARRAY['image/jpeg','image/jpg','image/png','image/webp','image/gif'])
ON CONFLICT (id) DO UPDATE SET public = true, file_size_limit = 5242880;

DROP POLICY IF EXISTS "avatars_read"   ON storage.objects;
DROP POLICY IF EXISTS "avatars_insert" ON storage.objects;
DROP POLICY IF EXISTS "avatars_update" ON storage.objects;
DROP POLICY IF EXISTS "avatars_delete" ON storage.objects;

CREATE POLICY "avatars_read"   ON storage.objects FOR SELECT TO anon, authenticated USING (bucket_id = 'avatars');
CREATE POLICY "avatars_insert" ON storage.objects FOR INSERT TO authenticated          WITH CHECK (bucket_id = 'avatars');
CREATE POLICY "avatars_update" ON storage.objects FOR UPDATE TO authenticated          USING (bucket_id = 'avatars');
CREATE POLICY "avatars_delete" ON storage.objects FOR DELETE TO authenticated          USING (bucket_id = 'avatars');

-- ── 5. STORAGE: chat-images bucket ────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('chat-images', 'chat-images', true, 10485760, ARRAY['image/jpeg','image/jpg','image/png','image/webp','image/gif'])
ON CONFLICT (id) DO UPDATE SET public = true, file_size_limit = 10485760;

DROP POLICY IF EXISTS "chat_images_read"   ON storage.objects;
DROP POLICY IF EXISTS "chat_images_insert" ON storage.objects;

CREATE POLICY "chat_images_read"   ON storage.objects FOR SELECT TO anon, authenticated USING (bucket_id = 'chat-images');
CREATE POLICY "chat_images_insert" ON storage.objects FOR INSERT TO authenticated          WITH CHECK (bucket_id = 'chat-images');

-- ── 6. STORAGE: audio-messages bucket ────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('audio-messages', 'audio-messages', true, 20971520, ARRAY['audio/webm','audio/ogg','audio/mp4','audio/mpeg'])
ON CONFLICT (id) DO UPDATE SET public = true, file_size_limit = 20971520;

DROP POLICY IF EXISTS "audio_messages_read"   ON storage.objects;
DROP POLICY IF EXISTS "audio_messages_insert" ON storage.objects;

CREATE POLICY "audio_messages_read"   ON storage.objects FOR SELECT TO anon, authenticated USING (bucket_id = 'audio-messages');
CREATE POLICY "audio_messages_insert" ON storage.objects FOR INSERT TO authenticated          WITH CHECK (bucket_id = 'audio-messages');

-- ── 7. FOLLOWS ───────────────────────────────────────────────────────────
-- Persists follow relationships. FK cascades so rows are auto-deleted
-- when the user is deleted from the users table.
CREATE TABLE IF NOT EXISTS public.follows (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  follower_id  UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  following_id UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(follower_id, following_id)
);

-- If upgrading from a schema without FK constraints, add them now.
-- (These are safe no-ops if the constraints already exist.)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'follows' AND constraint_name = 'follows_follower_id_fkey'
  ) THEN
    ALTER TABLE public.follows
      ADD CONSTRAINT follows_follower_id_fkey
      FOREIGN KEY (follower_id) REFERENCES public.users(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'follows' AND constraint_name = 'follows_following_id_fkey'
  ) THEN
    ALTER TABLE public.follows
      ADD CONSTRAINT follows_following_id_fkey
      FOREIGN KEY (following_id) REFERENCES public.users(id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_follows_follower  ON public.follows(follower_id);
CREATE INDEX IF NOT EXISTS idx_follows_following ON public.follows(following_id);

ALTER TABLE public.follows ENABLE ROW LEVEL SECURITY;

-- Drop old policy names (idempotent)
DROP POLICY IF EXISTS "follows_select"     ON public.follows;
DROP POLICY IF EXISTS "follows_insert"     ON public.follows;
DROP POLICY IF EXISTS "follows_delete"     ON public.follows;
DROP POLICY IF EXISTS "Allow follow read"  ON public.follows;
DROP POLICY IF EXISTS "Allow follow insert" ON public.follows;
DROP POLICY IF EXISTS "Allow follow delete" ON public.follows;

-- Follow rows are public (followers/following counts are public info,
-- like every social network). This is REQUIRED for count queries to work.
CREATE POLICY "Allow follow read"
  ON public.follows FOR SELECT
  TO anon, authenticated
  USING (true);

-- A user can only create follows as themselves
CREATE POLICY "Allow follow insert"
  ON public.follows FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = follower_id);

-- A user can only delete their own follow rows
CREATE POLICY "Allow follow delete"
  ON public.follows FOR DELETE
  TO authenticated
  USING (auth.uid() = follower_id);

-- RPC: follow_user — inserts follow row and bumps counters atomically
CREATE OR REPLACE FUNCTION public.follow_user(target_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.follows (follower_id, following_id)
  VALUES (auth.uid(), target_id)
  ON CONFLICT DO NOTHING;

  UPDATE public.users SET followers = GREATEST(0, followers + 1) WHERE id = target_id;
  UPDATE public.users SET following = GREATEST(0, following + 1) WHERE id = auth.uid();
END;
$$;

-- RPC: unfollow_user — removes follow row and decrements counters
CREATE OR REPLACE FUNCTION public.unfollow_user(target_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.follows WHERE follower_id = auth.uid() AND following_id = target_id;
  UPDATE public.users SET followers = GREATEST(0, followers - 1) WHERE id = target_id;
  UPDATE public.users SET following = GREATEST(0, following - 1) WHERE id = auth.uid();
END;
$$;

-- ── 8. TYPED STATUS ───────────────────────────────────────────────────────
-- One row per user; upserted on every keystroke (no FK, ephemeral data)
CREATE TABLE IF NOT EXISTS public.typing_status (
  user_id         UUID        PRIMARY KEY,
  conversation_id TEXT        NOT NULL DEFAULT '',
  is_typing       BOOLEAN     NOT NULL DEFAULT false,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable Realtime
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.typing_status;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.typing_status ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "typing_select" ON public.typing_status;
CREATE POLICY "typing_select"
  ON public.typing_status FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "typing_upsert" ON public.typing_status;
CREATE POLICY "typing_upsert"
  ON public.typing_status FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "typing_update" ON public.typing_status;
CREATE POLICY "typing_update"
  ON public.typing_status FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ── 8. MESSAGE REACTIONS ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.message_reactions (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID        NOT NULL,
  user_id    UUID        NOT NULL,
  emoji      TEXT        NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (message_id, user_id, emoji)
);

CREATE INDEX IF NOT EXISTS idx_reactions_message ON public.message_reactions(message_id);

-- Enable Realtime
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.message_reactions;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.message_reactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "reactions_select" ON public.message_reactions;
CREATE POLICY "reactions_select"
  ON public.message_reactions FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "reactions_insert" ON public.message_reactions;
CREATE POLICY "reactions_insert"
  ON public.message_reactions FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "reactions_delete" ON public.message_reactions;
CREATE POLICY "reactions_delete"
  ON public.message_reactions FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- ── 8. NICKNAMES ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.nicknames (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID        NOT NULL,
  target_user_id UUID        NOT NULL,
  nickname       TEXT        NOT NULL DEFAULT '',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, target_user_id)
);

ALTER TABLE public.nicknames ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "nicknames_select" ON public.nicknames;
CREATE POLICY "nicknames_select"
  ON public.nicknames FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "nicknames_insert" ON public.nicknames;
CREATE POLICY "nicknames_insert"
  ON public.nicknames FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "nicknames_update" ON public.nicknames;
CREATE POLICY "nicknames_update"
  ON public.nicknames FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ── 12. USER SETTINGS + DELETE-ACCOUNT RPC ───────────────────────────────
-- Per-user privacy preferences; one row per user, lazily created on first
-- toggle from the Settings page.
CREATE TABLE IF NOT EXISTS user_settings (
  user_id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  private_account  BOOLEAN NOT NULL DEFAULT FALSE,
  show_online      BOOLEAN NOT NULL DEFAULT TRUE,
  allow_dms        BOOLEAN NOT NULL DEFAULT TRUE,
  two_factor       BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_settings_self_read"  ON user_settings;
DROP POLICY IF EXISTS "user_settings_self_write" ON user_settings;
DROP POLICY IF EXISTS "user_settings_self_upsrt" ON user_settings;

CREATE POLICY "user_settings_self_read"
  ON user_settings FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "user_settings_self_upsrt"
  ON user_settings FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "user_settings_self_write"
  ON user_settings FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Auto-bump updated_at on changes
CREATE OR REPLACE FUNCTION user_settings_touch() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS user_settings_touch_trg ON user_settings;
CREATE TRIGGER user_settings_touch_trg
  BEFORE UPDATE ON user_settings
  FOR EACH ROW EXECUTE FUNCTION user_settings_touch();

-- ── delete_my_account() ──────────────────────────────────────────────────
-- Lets the currently-authenticated user delete their own account in one
-- transaction. Runs as SECURITY DEFINER so it can reach `auth.users`,
-- which the regular `authenticated` role cannot.
--
-- Cleanup order is bottom-up (children → parents). Most public.* rows have
-- ON DELETE CASCADE from public.users.id, so a single delete on public.users
-- cleans the rest. The auth.users row is removed last.
CREATE OR REPLACE FUNCTION delete_my_account()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  uid UUID := auth.uid();
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  -- Defensive cleanup in case any FK isn't ON DELETE CASCADE.
  -- (notifications has only user_id; data jsonb may reference other users
  -- but we leave that as orphaned text — no FK to clean.)
  DELETE FROM typing_status WHERE user_id     = uid;
  DELETE FROM follows       WHERE follower_id = uid OR following_id = uid;
  DELETE FROM notifications WHERE user_id     = uid;
  DELETE FROM messages      WHERE sender_id   = uid OR receiver_id  = uid;
  DELETE FROM user_settings WHERE user_id     = uid;
  DELETE FROM subscriptions WHERE user_id     = uid;
  DELETE FROM users         WHERE id          = uid;
  DELETE FROM auth.users    WHERE id          = uid;
END $$;

REVOKE ALL ON FUNCTION delete_my_account() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION delete_my_account() TO authenticated;

-- ══════════════════════════════════════════════════════════════════════════
-- VERIFICATION QUERIES  (run after the above to confirm setup)
-- ══════════════════════════════════════════════════════════════════════════
--
-- SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public';
-- SELECT policyname, cmd, qual FROM pg_policies WHERE schemaname = 'public';
-- SELECT name, public FROM storage.buckets;
-- SELECT * FROM pg_publication_tables WHERE pubname = 'supabase_realtime';

-- ══════════════════════════════════════════════════════════════════════════
-- §13. PROFILE BADGES + ONLINE STATUS + SOCIAL LINKS
-- ══════════════════════════════════════════════════════════════════════════
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS is_owner         BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_verified      BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_online        BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS social_facebook  TEXT             DEFAULT '',
  ADD COLUMN IF NOT EXISTS social_instagram TEXT             DEFAULT '',
  ADD COLUMN IF NOT EXISTS social_tiktok    TEXT             DEFAULT '';

-- Index for username lookups (used by /user/:username route)
CREATE INDEX IF NOT EXISTS idx_users_username_lower ON public.users(LOWER(username));

-- Add users to realtime publication so badge / online updates push live
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.users;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ──────────────────────────────────────────────────────────────────────────
-- claim_owner_badge() — flips is_owner=true ONLY for the hard-coded
-- owner email; clears it on any other account. Called from the client
-- on every sign-in. Email lives inside the function so the client can
-- never spoof it.
-- ──────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.claim_owner_badge()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  uid       UUID := auth.uid();
  my_email  TEXT;
  is_owner  BOOLEAN := false;
BEGIN
  IF uid IS NULL THEN
    RETURN false;
  END IF;

  SELECT email INTO my_email FROM auth.users WHERE id = uid;

  IF LOWER(COALESCE(my_email, '')) = 'allanalbacen5@gmail.com' THEN
    UPDATE public.users SET is_owner = true WHERE id = uid;
    is_owner := true;
  ELSE
    -- Defensive: clear is_owner if it was somehow set on a wrong account
    UPDATE public.users SET is_owner = false
      WHERE id = uid AND is_owner = true;
  END IF;

  RETURN is_owner;
END $$;

REVOKE ALL ON FUNCTION public.claim_owner_badge() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_owner_badge() TO authenticated;

-- ──────────────────────────────────────────────────────────────────────────
-- set_online(p_online) — atomically updates the caller's is_online + last_seen
-- ──────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_online(p_online BOOLEAN)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN; END IF;
  UPDATE public.users
     SET is_online = p_online,
         last_seen = NOW()
   WHERE id = auth.uid();
END $$;

REVOKE ALL ON FUNCTION public.set_online(BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_online(BOOLEAN) TO authenticated;

-- ══════════════════════════════════════════════════════════════════════════
-- §14. SUBSCRIPTIONS / VERIFIED BADGE
-- ══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  status      TEXT        NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_user
  ON public.subscriptions(user_id, status);

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "subs_select_self" ON public.subscriptions;
DROP POLICY IF EXISTS "subs_insert_self" ON public.subscriptions;
DROP POLICY IF EXISTS "subs_update_self" ON public.subscriptions;

CREATE POLICY "subs_select_self"
  ON public.subscriptions FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "subs_insert_self"
  ON public.subscriptions FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "subs_update_self"
  ON public.subscriptions FOR UPDATE TO authenticated
  USING     (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ──────────────────────────────────────────────────────────────────────────
-- subscribe_me() — marks any prior active subs inactive, inserts a fresh
-- 'active' row, and flips is_verified=true. Called from the Subscribe page.
-- ──────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.subscribe_me()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE uid UUID := auth.uid();
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;

  UPDATE public.subscriptions
     SET status='inactive', updated_at=NOW()
   WHERE user_id = uid AND status='active';

  INSERT INTO public.subscriptions (user_id, status)
       VALUES (uid, 'active');

  UPDATE public.users SET is_verified = true WHERE id = uid;
END $$;

REVOKE ALL ON FUNCTION public.subscribe_me() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.subscribe_me() TO authenticated;

CREATE OR REPLACE FUNCTION public.unsubscribe_me()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE uid UUID := auth.uid();
BEGIN
  IF uid IS NULL THEN RETURN; END IF;

  UPDATE public.subscriptions
     SET status='inactive', updated_at=NOW()
   WHERE user_id = uid AND status='active';

  UPDATE public.users SET is_verified = false WHERE id = uid;
END $$;

REVOKE ALL ON FUNCTION public.unsubscribe_me() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.unsubscribe_me() TO authenticated;

-- ══════════════════════════════════════════════════════════════════════════
-- §15. SUBSCRIPTION STATUS COLUMN + UPDATED RPCs
-- ══════════════════════════════════════════════════════════════════════════
-- Adds users.subscription_status with three states:
--   'free'   — default (no badge)
--   'active' — paying subscriber (blue verified check)
--   'owner'  — the King account (gold crown)
-- Re-running this section is idempotent.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS subscription_status TEXT NOT NULL DEFAULT 'free'
    CHECK (subscription_status IN ('free','active','owner'));

-- Replace claim_owner_badge so it ALSO sets is_verified + subscription_status='owner'
CREATE OR REPLACE FUNCTION public.claim_owner_badge()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  uid       UUID := auth.uid();
  my_email  TEXT;
  is_king   BOOLEAN := false;
BEGIN
  IF uid IS NULL THEN RETURN false; END IF;

  SELECT email INTO my_email FROM auth.users WHERE id = uid;

  IF LOWER(COALESCE(my_email, '')) = 'allanalbacen5@gmail.com' THEN
    UPDATE public.users
       SET is_owner            = true,
           is_verified         = true,
           subscription_status = 'owner'
     WHERE id = uid;
    is_king := true;
  ELSE
    -- Defensive: clear owner flag from any other account that ended up with it
    UPDATE public.users
       SET is_owner            = false,
           subscription_status = CASE WHEN subscription_status = 'owner'
                                      THEN 'free'
                                      ELSE subscription_status
                                 END
     WHERE id = uid AND is_owner = true;
  END IF;

  RETURN is_king;
END $$;

REVOKE ALL ON FUNCTION public.claim_owner_badge() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_owner_badge() TO authenticated;

-- Replace subscribe_me to also flip subscription_status='active' (skip if owner)
CREATE OR REPLACE FUNCTION public.subscribe_me()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid     UUID := auth.uid();
  is_king BOOLEAN;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;

  SELECT is_owner INTO is_king FROM public.users WHERE id = uid;

  UPDATE public.subscriptions
     SET status='inactive', updated_at=NOW()
   WHERE user_id = uid AND status='active';

  INSERT INTO public.subscriptions (user_id, status)
       VALUES (uid, 'active');

  -- Owners stay 'owner'; everyone else becomes 'active'
  UPDATE public.users
     SET is_verified         = true,
         subscription_status = CASE WHEN COALESCE(is_king, false) THEN 'owner' ELSE 'active' END
   WHERE id = uid;
END $$;

REVOKE ALL ON FUNCTION public.subscribe_me() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.subscribe_me() TO authenticated;

-- Replace unsubscribe_me — owners cannot un-verify themselves
CREATE OR REPLACE FUNCTION public.unsubscribe_me()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid     UUID := auth.uid();
  is_king BOOLEAN;
BEGIN
  IF uid IS NULL THEN RETURN; END IF;

  SELECT is_owner INTO is_king FROM public.users WHERE id = uid;
  IF COALESCE(is_king, false) THEN
    -- Owner stays verified forever — no-op
    RETURN;
  END IF;

  UPDATE public.subscriptions
     SET status='inactive', updated_at=NOW()
   WHERE user_id = uid AND status='active';

  UPDATE public.users
     SET is_verified         = false,
         subscription_status = 'free'
   WHERE id = uid;
END $$;

REVOKE ALL ON FUNCTION public.unsubscribe_me() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.unsubscribe_me() TO authenticated;

/* ════════════════════════════════════════════════════════════════════════
   §16 — Force-update gate (app_config.min_version)
   ════════════════════════════════════════════════════════════════════════
   Single-row config table read by every client at startup. If the
   installed APK_VERSION is < min_version, the client renders a blocking
   "Update required" screen until the user installs a newer APK.

   - Public SELECT (anon + authenticated) so the gate works even before
     login. No INSERT/UPDATE/DELETE for clients — only the project owner
     can change min_version, via the Supabase Studio UI or SQL editor.
   ════════════════════════════════════════════════════════════════════════ */

CREATE TABLE IF NOT EXISTS public.app_config (
  id          INT PRIMARY KEY DEFAULT 1,
  min_version TEXT NOT NULL,
  CONSTRAINT app_config_singleton CHECK (id = 1)
);

INSERT INTO public.app_config (id, min_version)
VALUES (1, '1.0.0')
ON CONFLICT (id) DO UPDATE SET min_version = EXCLUDED.min_version;

ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "app_config_read_all" ON public.app_config;
CREATE POLICY "app_config_read_all"
  ON public.app_config
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- ─────────────────────────────────────────────────────────────────────────
-- §13  PROMPT-TO-CHAT  (April 2026)
--
--   Adds the "Send Prompt to Chat" feature with daily throttling for free
--   users. Pro (subscription_status='active') and King (='owner') users
--   are exempt and may send unlimited prompts.
--
--   Schema additions:
--     • messages.prompt        — the original prompt text (also mirrored to
--                                messages.text so existing readers still see
--                                it as a normal message)
--     • messages.is_prompt     — flag toggling the special "prompt bubble"
--                                rendering in chat
--     • message_usage          — per-user daily counter, auto-resets at
--                                midnight (server time)
--
--   The send_prompt_message(receiver, prompt) RPC is the ONLY supported
--   write path — it enforces the quota server-side, so a tampered client
--   cannot bypass the 5/day cap.  Regular sendMessage() (text/image/voice)
--   is intentionally NOT throttled — only the new "Send Prompt" action is.
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS prompt    TEXT,
  ADD COLUMN IF NOT EXISTS is_prompt BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.message_usage (
  user_id    UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  count      INTEGER     NOT NULL DEFAULT 0,
  last_reset DATE        NOT NULL DEFAULT CURRENT_DATE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.message_usage ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "message_usage_self_read" ON public.message_usage;
CREATE POLICY "message_usage_self_read"
  ON public.message_usage
  FOR SELECT
  USING (auth.uid() = user_id);

-- All writes go through the SECURITY DEFINER RPC below; no INSERT/UPDATE
-- policy is intentionally provided to clients.

CREATE OR REPLACE FUNCTION public.send_prompt_message(
  p_receiver UUID,
  p_prompt   TEXT
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid     UUID    := auth.uid();
  is_pro  BOOLEAN;
  cnt     INTEGER;
  msg_id  UUID;
  today   DATE    := CURRENT_DATE;
  trimmed TEXT    := btrim(COALESCE(p_prompt, ''));
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;
  IF p_receiver IS NULL THEN
    RAISE EXCEPTION 'Recipient required';
  END IF;
  IF length(trimmed) = 0 THEN
    RAISE EXCEPTION 'Prompt cannot be empty';
  END IF;
  IF uid = p_receiver THEN
    RAISE EXCEPTION 'Cannot send a prompt to yourself';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = p_receiver) THEN
    RAISE EXCEPTION 'Recipient not found';
  END IF;

  -- Pro / King are exempt from the daily cap
  SELECT (subscription_status IN ('active','owner')) INTO is_pro
    FROM public.users WHERE id = uid;
  is_pro := COALESCE(is_pro, false);

  -- Atomic upsert with daily reset built into the conflict path
  INSERT INTO public.message_usage (user_id, count, last_reset, updated_at)
  VALUES (uid, 0, today, NOW())
  ON CONFLICT (user_id) DO UPDATE
    SET count      = CASE WHEN public.message_usage.last_reset = today
                          THEN public.message_usage.count
                          ELSE 0 END,
        last_reset = today,
        updated_at = NOW()
  RETURNING count INTO cnt;

  IF NOT is_pro AND cnt >= 5 THEN
    RAISE EXCEPTION 'Daily prompt limit reached (5/day). Upgrade to Pro for unlimited.'
      USING ERRCODE = 'P0001';
  END IF;

  -- Cap prompt length to keep rows sane
  trimmed := left(trimmed, 2000);

  -- Mirror prompt → text so legacy code paths (lastText, search) still see it
  INSERT INTO public.messages
    (sender_id, receiver_id, text, prompt, is_prompt, seen, seen_at)
  VALUES
    (uid, p_receiver, trimmed, trimmed, true, false, NULL)
  RETURNING id INTO msg_id;

  IF NOT is_pro THEN
    UPDATE public.message_usage
       SET count = cnt + 1, updated_at = NOW()
     WHERE user_id = uid;
  END IF;

  RETURN msg_id;
END;
$$;

-- Defense-in-depth: revoke the default PUBLIC EXECUTE before granting only
-- to authenticated. The function still checks auth.uid() internally, but
-- this closes the door at the privilege layer too.
REVOKE ALL ON FUNCTION public.send_prompt_message(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.send_prompt_message(UUID, TEXT) TO authenticated;

-- Realtime: broadcast quota updates so the in-app gauge ticks live
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.message_usage;
EXCEPTION
  WHEN duplicate_object THEN NULL;  -- already in publication
  WHEN undefined_object THEN NULL;  -- publication missing in dev — non-fatal
END $$;

-- ============================================================================
-- §17  SECURE PER-USER DAILY GENERATION QUOTA  (May 2026)
-- ============================================================================
-- Replaces the api-server's in-memory quota Map. The api-server now calls
-- the SECURITY DEFINER RPC below using the caller's JWT — there is no way
-- for a client to spoof userId or plan, because the RPC reads auth.uid()
-- and the user's subscription_status server-side.
--
-- Limits:
--   free   — 10 generations/day total (image OR video)
--   active — 200 generations/day  (Pro)
--   owner  — unlimited             (King)
--
-- Re-running this section is idempotent.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.generation_usage (
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  day         DATE        NOT NULL,
  image_count INTEGER     NOT NULL DEFAULT 0,
  video_count INTEGER     NOT NULL DEFAULT 0,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, day)
);

ALTER TABLE public.generation_usage ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "generation_usage_self_read" ON public.generation_usage;
CREATE POLICY "generation_usage_self_read"
  ON public.generation_usage FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- All writes happen exclusively through the SECURITY DEFINER RPC below.
-- No INSERT/UPDATE/DELETE policy is granted to authenticated.

DROP FUNCTION IF EXISTS public.consume_generation_quota(TEXT);
CREATE OR REPLACE FUNCTION public.consume_generation_quota(p_kind TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid       UUID := auth.uid();
  today     DATE := (NOW() AT TIME ZONE 'UTC')::DATE;
  sub       TEXT;
  effective TEXT;     -- 'free' | 'active' | 'owner'
  daily_cap INTEGER;
  img_cnt   INTEGER;
  vid_cnt   INTEGER;
  total     INTEGER;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  IF p_kind NOT IN ('image', 'video') THEN
    RAISE EXCEPTION 'Invalid kind: %', p_kind USING ERRCODE = '22023';
  END IF;

  -- Derive plan SERVER-SIDE from users.subscription_status.
  -- Defaults to 'free' if the column is missing or row not found.
  BEGIN
    SELECT COALESCE(subscription_status, 'free')
      INTO sub
      FROM public.users
     WHERE id = uid;
  EXCEPTION WHEN OTHERS THEN
    sub := 'free';
  END;

  effective := COALESCE(sub, 'free');
  IF effective NOT IN ('free', 'active', 'owner') THEN
    effective := 'free';
  END IF;

  daily_cap := CASE effective
                 WHEN 'owner'  THEN 2147483647   -- effectively unlimited
                 WHEN 'active' THEN 200
                 ELSE 10
               END;

  -- Atomic upsert with auto daily reset
  INSERT INTO public.generation_usage (user_id, day, image_count, video_count)
  VALUES (uid, today, 0, 0)
  ON CONFLICT (user_id, day) DO NOTHING;

  SELECT image_count, video_count
    INTO img_cnt, vid_cnt
    FROM public.generation_usage
   WHERE user_id = uid AND day = today
   FOR UPDATE;

  total := COALESCE(img_cnt, 0) + COALESCE(vid_cnt, 0);

  IF total >= daily_cap THEN
    RETURN jsonb_build_object(
      'allowed',   false,
      'plan',      effective,
      'remaining', 0,
      'limit',     daily_cap,
      'kind',      p_kind
    );
  END IF;

  IF p_kind = 'image' THEN
    UPDATE public.generation_usage
       SET image_count = image_count + 1, updated_at = NOW()
     WHERE user_id = uid AND day = today;
  ELSE
    UPDATE public.generation_usage
       SET video_count = video_count + 1, updated_at = NOW()
     WHERE user_id = uid AND day = today;
  END IF;

  RETURN jsonb_build_object(
    'allowed',   true,
    'plan',      effective,
    'remaining', GREATEST(0, daily_cap - (total + 1)),
    'limit',     daily_cap,
    'kind',      p_kind
  );
END;
$$;

REVOKE ALL ON FUNCTION public.consume_generation_quota(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.consume_generation_quota(TEXT) TO authenticated;

/* ─────────────────────────────────────────────────────────────────────────────
   Extended profile fields — added for the profile rebuild
───────────────────────────────────────────────────────────────────────────── */
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS website              TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS location             TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS gender               TEXT DEFAULT 'Prefer not to say',
  ADD COLUMN IF NOT EXISTS birthday             DATE,
  ADD COLUMN IF NOT EXISTS relationship_status  TEXT DEFAULT 'Prefer not to say',
  ADD COLUMN IF NOT EXISTS work                 TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS education            TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS social_x             TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS social_youtube       TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS social_linkedin      TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS privacy_settings     JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS cover_photo_url      TEXT;
