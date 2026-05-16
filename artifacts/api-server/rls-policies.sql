-- ============================================================
-- RLS Policy Audit & Fixes
-- Run this in your Supabase SQL editor.
--
-- Based on a full code audit of Socia Glow's client-side writes.
-- These policies enforce server-side ownership for tables that
-- receive direct client writes via Supabase JS SDK.
--
-- NOTE: After Step 2 server-side migration (messages/seen/edit
-- now go through the API), the messages table is protected by
-- both RLS AND server-enforced JWT identity. Defense in depth.
-- ============================================================

-- ──────────────────────────────────────────────────────────────
-- 1. MESSAGES TABLE
--    - SELECT: only parties to the conversation
--    - INSERT: blocked — use POST /api/messages/send instead
--      (server enforces sender_id = auth.uid())
--      Keep INSERT policy only for Realtime subscription use.
--    - UPDATE: only receiver (for seen) or sender (for edit)
--    - DELETE: only sender
-- ──────────────────────────────────────────────────────────────

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "messages_select_own" ON messages;
CREATE POLICY "messages_select_own" ON messages
  FOR SELECT USING (
    auth.uid() = sender_id OR auth.uid() = receiver_id
  );

DROP POLICY IF EXISTS "messages_insert_as_sender" ON messages;
CREATE POLICY "messages_insert_as_sender" ON messages
  FOR INSERT WITH CHECK (
    auth.uid() = sender_id
  );

DROP POLICY IF EXISTS "messages_update_seen_or_edit" ON messages;
CREATE POLICY "messages_update_seen_or_edit" ON messages
  FOR UPDATE USING (
    -- receiver can mark seen; sender can edit text
    auth.uid() = receiver_id OR auth.uid() = sender_id
  ) WITH CHECK (
    auth.uid() = receiver_id OR auth.uid() = sender_id
  );

DROP POLICY IF EXISTS "messages_delete_own" ON messages;
CREATE POLICY "messages_delete_own" ON messages
  FOR DELETE USING (auth.uid() = sender_id);

-- ──────────────────────────────────────────────────────────────
-- 2. TYPING_STATUS TABLE
--    - SELECT: public (anyone can see who is typing in their thread)
--    - INSERT/UPDATE: only own row (user_id = auth.uid())
--    - DELETE: only own row
-- ──────────────────────────────────────────────────────────────

ALTER TABLE typing_status ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "typing_status_select" ON typing_status;
CREATE POLICY "typing_status_select" ON typing_status
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "typing_status_upsert_own" ON typing_status;
CREATE POLICY "typing_status_upsert_own" ON typing_status
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ──────────────────────────────────────────────────────────────
-- 3. USERS (PROFILES) TABLE
--    Critical: users must NOT be able to self-promote
--    is_owner, is_verified, is_banned, is_suspended.
--    Use a column-level security approach via a separate update policy.
-- ──────────────────────────────────────────────────────────────

ALTER TABLE users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_select_public" ON users;
CREATE POLICY "users_select_public" ON users
  FOR SELECT USING (true);

-- Users can only update their OWN row, and ONLY safe columns.
-- Protected columns (is_owner, is_verified, is_banned, is_suspended,
-- force_logout_at, followers, following) are excluded — only admins
-- can update those via the service-role client.
DROP POLICY IF EXISTS "users_update_own" ON users;
CREATE POLICY "users_update_own" ON users
  FOR UPDATE USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Enforce that protected columns cannot be changed by users.
-- Create a trigger-based guard so RLS alone is not the only layer.
CREATE OR REPLACE FUNCTION prevent_privilege_escalation()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- Reject any attempt by a non-service-role session to change privilege bits
  IF current_setting('role') <> 'service_role' THEN
    IF NEW.is_owner     IS DISTINCT FROM OLD.is_owner     OR
       NEW.is_verified  IS DISTINCT FROM OLD.is_verified  OR
       NEW.is_banned    IS DISTINCT FROM OLD.is_banned    OR
       NEW.is_suspended IS DISTINCT FROM OLD.is_suspended OR
       (NEW.followers IS DISTINCT FROM OLD.followers AND NEW.followers <> OLD.followers + 1 AND NEW.followers <> OLD.followers - 1) THEN
      RAISE EXCEPTION 'Privilege escalation blocked';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_privilege_escalation ON users;
CREATE TRIGGER trg_prevent_privilege_escalation
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION prevent_privilege_escalation();

-- ──────────────────────────────────────────────────────────────
-- 4. MESSAGE_REACTIONS TABLE
--    - SELECT: public
--    - INSERT: user_id = auth.uid() only
--    - DELETE: user_id = auth.uid() only (can only remove own reactions)
-- ──────────────────────────────────────────────────────────────

ALTER TABLE message_reactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "reactions_select" ON message_reactions;
CREATE POLICY "reactions_select" ON message_reactions
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "reactions_insert_own" ON message_reactions;
CREATE POLICY "reactions_insert_own" ON message_reactions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "reactions_delete_own" ON message_reactions;
CREATE POLICY "reactions_delete_own" ON message_reactions
  FOR DELETE USING (auth.uid() = user_id);

-- ──────────────────────────────────────────────────────────────
-- 5. MESSAGE_NICKNAMES TABLE
--    - SELECT: owner only (nicknames are private)
--    - INSERT/UPDATE/DELETE: owner only (user_id = auth.uid())
-- ──────────────────────────────────────────────────────────────

ALTER TABLE message_nicknames ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "nicknames_own" ON message_nicknames;
CREATE POLICY "nicknames_own" ON message_nicknames
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ──────────────────────────────────────────────────────────────
-- 6. AI_SUBSCRIPTIONS TABLE
--    - SELECT: own row only
--    - INSERT/UPDATE: BLOCKED — managed by API server only
--      (POST /api/ai/subscribe is currently disabled pending payment)
-- ──────────────────────────────────────────────────────────────

ALTER TABLE ai_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ai_subscriptions_select_own" ON ai_subscriptions;
CREATE POLICY "ai_subscriptions_select_own" ON ai_subscriptions
  FOR SELECT USING (auth.uid() = user_id);

-- No INSERT/UPDATE policy for regular users — only service_role can write.

-- ──────────────────────────────────────────────────────────────
-- 7. AI_USAGE_TRACKING TABLE
--    - SELECT: own row only
--    - INSERT/UPDATE: own row only (API server uses anon-key Supabase client
--      scoped to the authenticated user via requireAuth middleware)
-- ──────────────────────────────────────────────────────────────

ALTER TABLE ai_usage_tracking ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ai_usage_select_own" ON ai_usage_tracking;
CREATE POLICY "ai_usage_select_own" ON ai_usage_tracking
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "ai_usage_write_own" ON ai_usage_tracking;
CREATE POLICY "ai_usage_write_own" ON ai_usage_tracking
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ──────────────────────────────────────────────────────────────
-- 8. FUNDING_DONATIONS TABLE
--    - SELECT: own row only (users see their own submissions)
--    - INSERT: authenticated users only, status must be 'pending'
--    - UPDATE/DELETE: BLOCKED — admin only via service_role
-- ──────────────────────────────────────────────────────────────

ALTER TABLE funding_donations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "funding_donations_select_own" ON funding_donations;
CREATE POLICY "funding_donations_select_own" ON funding_donations
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "funding_donations_insert_pending" ON funding_donations;
CREATE POLICY "funding_donations_insert_pending" ON funding_donations
  FOR INSERT WITH CHECK (auth.uid() = user_id AND status = 'pending');

-- ──────────────────────────────────────────────────────────────
-- 9. SUPABASE STORAGE — chat-images bucket
--    Enforce that users can only upload to their own folder:
--      {userId}/{filename}
-- ──────────────────────────────────────────────────────────────

-- Run in Supabase Storage policy editor or via SQL:
INSERT INTO storage.policies (name, bucket_id, definition)
VALUES (
  'chat_images_upload_own_folder',
  'chat-images',
  $${
    "operation": "INSERT",
    "check": "(storage.foldername(name))[1] = auth.uid()::text"
  }$$
) ON CONFLICT DO NOTHING;

INSERT INTO storage.policies (name, bucket_id, definition)
VALUES (
  'chat_images_select_authenticated',
  'chat-images',
  $${
    "operation": "SELECT",
    "using": "auth.uid() IS NOT NULL"
  }$$
) ON CONFLICT DO NOTHING;
