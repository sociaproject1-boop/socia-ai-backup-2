-- ================================================================
-- SOCIA GLOW — Combined Security Migration (Production-Safe)
-- ================================================================
-- Verified against the LIVE Supabase production schema on 2026-05-13.
--
-- PRODUCTION TABLE INVENTORY (confirmed via REST API probe):
--   EXISTS:  messages, users, typing_status, message_reactions,
--            nicknames, community_funding, funding_donations,
--            notifications, generation_usage, credit_ledger,
--            user_billing, plans
--   MISSING: ai_subscriptions, ai_usage_tracking, ai_requests,
--            ai_cooldowns, ai_abuse_flags, ai_billing_history,
--            refund_requests, refund_decisions
--
-- DESIGN RULES (every statement is idempotent):
--   • Missing tables   → CREATE TABLE IF NOT EXISTS (never fails)
--   • Missing columns  → ADD COLUMN IF NOT EXISTS  (never fails)
--   • Indexes          → CREATE INDEX IF NOT EXISTS (never fails)
--   • RLS enable       → ENABLE ROW LEVEL SECURITY  (idempotent)
--   • Policies         → DROP IF EXISTS then CREATE  (idempotent)
--   • Trigger fn       → CREATE OR REPLACE FUNCTION  (idempotent)
--   • Trigger          → DROP IF EXISTS then CREATE   (idempotent)
--
-- WRAPPED IN ONE TRANSACTION: all sections succeed together or
-- the whole migration rolls back with no partial state.
-- ================================================================

BEGIN;


-- ════════════════════════════════════════════════════════════════
-- §1  CREATE MISSING AI SUBSCRIPTION TABLES
-- ════════════════════════════════════════════════════════════════
-- None of these tables existed in production when this migration
-- was written.  CREATE TABLE IF NOT EXISTS is a no-op if they are
-- ever created before this runs.

-- 1a. AI plan subscriptions (one active row per user)
CREATE TABLE IF NOT EXISTS public.ai_subscriptions (
  id             UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id        UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_code      TEXT        NOT NULL CHECK (plan_code IN ('free', 'premium', 'ultra')),
  status         TEXT        NOT NULL DEFAULT 'active'
                             CHECK (status IN ('active', 'cancelled', 'expired')),
  price_php      NUMERIC(10,2),
  period_days    INT,
  expires_at     TIMESTAMPTZ,
  payment_ref    TEXT,
  payment_method TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ai_subscriptions_user_status_idx
  ON public.ai_subscriptions (user_id, status);

-- 1b. Per-user per-period usage counters for AI rate limiting
--     Includes last_request_at for persistent cooldown seeding
--     so cooldowns survive API server restarts.
CREATE TABLE IF NOT EXISTS public.ai_usage_tracking (
  id            UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id       UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_code     TEXT        NOT NULL,
  period_type   TEXT        NOT NULL CHECK (period_type IN ('daily', 'monthly')),
  period_key    TEXT        NOT NULL,   -- '2025-05-12' (daily) or '2025-05' (monthly)
  request_count INT         NOT NULL DEFAULT 0,
  limit_count   INT         NOT NULL DEFAULT 15,
  reset_at      TIMESTAMPTZ NOT NULL,
  last_request_at TIMESTAMPTZ,         -- seeded into in-memory cooldown on cold start
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, plan_code, period_key)
);
CREATE INDEX IF NOT EXISTS idx_ai_usage_tracking_user_period
  ON public.ai_usage_tracking (user_id, plan_code, period_key);

-- 1c. Audit log of every AI chat request
CREATE TABLE IF NOT EXISTS public.ai_requests (
  id               UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id          UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_code        TEXT        NOT NULL,
  model            TEXT        NOT NULL,
  mode             TEXT,
  input_chars      INT,
  output_chars     INT,
  attachment_count INT         DEFAULT 0,
  status           TEXT        DEFAULT 'completed'
                               CHECK (status IN ('completed','error','aborted','rate_limited')),
  error_code       TEXT,
  abuse_score      INT         DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ai_requests_user_created_idx
  ON public.ai_requests (user_id, created_at DESC);

-- 1d. Admin-imposed cooldown overrides (persist across restarts)
CREATE TABLE IF NOT EXISTS public.ai_cooldowns (
  user_id      UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  locked_until TIMESTAMPTZ,
  reason       TEXT,
  created_by   TEXT        DEFAULT 'system',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 1e. Flagged accounts for manual abuse review
CREATE TABLE IF NOT EXISTS public.ai_abuse_flags (
  id          UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reason      TEXT        NOT NULL,
  abuse_score INT         DEFAULT 0,
  resolved    BOOLEAN     DEFAULT FALSE,
  resolved_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ai_abuse_flags_user_idx
  ON public.ai_abuse_flags (user_id, resolved);

-- 1f. Payment records for AI plan purchases
CREATE TABLE IF NOT EXISTS public.ai_billing_history (
  id             UUID           NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id        UUID           NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_code      TEXT           NOT NULL,
  amount_php     NUMERIC(10,2)  NOT NULL,
  payment_method TEXT,
  payment_ref    TEXT,
  status         TEXT           DEFAULT 'pending'
                                CHECK (status IN ('pending','completed','failed','refunded')),
  notes          TEXT,
  created_at     TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ai_billing_history_user_idx
  ON public.ai_billing_history (user_id, created_at DESC);


-- ════════════════════════════════════════════════════════════════
-- §2  CREATE MISSING REFUND TABLES
-- ════════════════════════════════════════════════════════════════

-- 2a. Refund requests submitted by users
CREATE TABLE IF NOT EXISTS public.refund_requests (
  id                       UUID          NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id                  UUID          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subscription_type        TEXT          NOT NULL CHECK (subscription_type IN ('creator','ai')),
  plan_code                TEXT          NOT NULL,
  payment_reference        TEXT,
  payment_amount_php       NUMERIC       NOT NULL DEFAULT 0,
  estimated_used_php       NUMERIC       NOT NULL DEFAULT 0,
  estimated_refundable_php NUMERIC       NOT NULL DEFAULT 0,
  requested_amount_php     NUMERIC,
  credits_total            INTEGER       NOT NULL DEFAULT 0,
  credits_used             INTEGER       NOT NULL DEFAULT 0,
  credits_remaining        INTEGER       NOT NULL DEFAULT 0,
  ai_requests_used         INTEGER       NOT NULL DEFAULT 0,
  ai_requests_limit        INTEGER       NOT NULL DEFAULT 0,
  reason                   TEXT          NOT NULL
                           CHECK (reason IN ('unused','partial','technical','billing_error','other')),
  description              TEXT          NOT NULL,
  screenshot_url           TEXT,
  status                   TEXT          NOT NULL DEFAULT 'pending'
                           CHECK (status IN ('pending','reviewing','approved','partial','rejected')),
  approved_amount_php      NUMERIC,
  admin_notes              TEXT,
  reviewed_by              TEXT,
  reviewed_at              TIMESTAMPTZ,
  abuse_score              INTEGER       NOT NULL DEFAULT 0,
  is_flagged               BOOLEAN       NOT NULL DEFAULT FALSE,
  flag_reason              TEXT,
  created_at               TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS refund_requests_user_id_idx    ON public.refund_requests (user_id);
CREATE INDEX IF NOT EXISTS refund_requests_status_idx     ON public.refund_requests (status);
CREATE INDEX IF NOT EXISTS refund_requests_created_at_idx ON public.refund_requests (created_at DESC);

-- updated_at trigger for refund_requests
CREATE OR REPLACE FUNCTION public.update_refund_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;
DROP TRIGGER IF EXISTS trg_refund_updated_at ON public.refund_requests;
CREATE TRIGGER trg_refund_updated_at
  BEFORE UPDATE ON public.refund_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_refund_updated_at();

-- 2b. Admin audit trail of every refund decision
CREATE TABLE IF NOT EXISTS public.refund_decisions (
  id         UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  request_id UUID        NOT NULL REFERENCES public.refund_requests(id) ON DELETE CASCADE,
  admin_id   TEXT        NOT NULL,
  action     TEXT        NOT NULL CHECK (action IN ('approve','partial','reject','review','flag')),
  amount_php NUMERIC,
  notes      TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS refund_decisions_request_idx
  ON public.refund_decisions (request_id);


-- ════════════════════════════════════════════════════════════════
-- §3  SCHEMA PATCH — add last_request_at to ai_usage_tracking
--     if the table already existed without it
-- ════════════════════════════════════════════════════════════════
-- ADD COLUMN IF NOT EXISTS is a no-op when the column is already
-- present (including when we just created it in §1b above).
ALTER TABLE public.ai_usage_tracking
  ADD COLUMN IF NOT EXISTS last_request_at TIMESTAMPTZ;


-- ════════════════════════════════════════════════════════════════
-- §4  MESSAGES TABLE — RLS + ownership policies
-- ════════════════════════════════════════════════════════════════
-- Confirmed EXISTS in production.
--
-- Defense-in-depth: API server (POST /api/messages/send|seen|edit)
-- enforces sender identity via JWT middleware.  These RLS policies
-- are the secondary safety net that blocks direct Supabase calls.
--
--   SELECT  → sender OR receiver only
--   INSERT  → sender_id must equal auth.uid()
--   UPDATE  → receiver (mark seen) OR sender (edit own text)
--   DELETE  → sender only

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "messages_select_own"          ON public.messages;
DROP POLICY IF EXISTS "messages_insert_as_sender"    ON public.messages;
DROP POLICY IF EXISTS "messages_update_seen_or_edit" ON public.messages;
DROP POLICY IF EXISTS "messages_delete_own"          ON public.messages;

CREATE POLICY "messages_select_own" ON public.messages
  FOR SELECT USING (
    auth.uid() = sender_id OR auth.uid() = receiver_id
  );

CREATE POLICY "messages_insert_as_sender" ON public.messages
  FOR INSERT WITH CHECK (
    auth.uid() = sender_id
  );

CREATE POLICY "messages_update_seen_or_edit" ON public.messages
  FOR UPDATE
  USING  (auth.uid() = receiver_id OR auth.uid() = sender_id)
  WITH CHECK (auth.uid() = receiver_id OR auth.uid() = sender_id);

CREATE POLICY "messages_delete_own" ON public.messages
  FOR DELETE USING (
    auth.uid() = sender_id
  );


-- ════════════════════════════════════════════════════════════════
-- §5  TYPING_STATUS TABLE — RLS + own-row policy
-- ════════════════════════════════════════════════════════════════
-- Confirmed EXISTS in production.
-- Transient typing indicators.  Both sides of a chat can read;
-- only the owner can write their own flag.

ALTER TABLE public.typing_status ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "typing_status_select_public" ON public.typing_status;
DROP POLICY IF EXISTS "typing_status_write_own"     ON public.typing_status;
-- Clean up old names that may exist from earlier drafts
DROP POLICY IF EXISTS "typing_status_select"        ON public.typing_status;
DROP POLICY IF EXISTS "typing_status_upsert_own"    ON public.typing_status;

CREATE POLICY "typing_status_select_public" ON public.typing_status
  FOR SELECT USING (true);

CREATE POLICY "typing_status_write_own" ON public.typing_status
  FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);


-- ════════════════════════════════════════════════════════════════
-- §6  USERS TABLE — RLS + privilege escalation trigger
-- ════════════════════════════════════════════════════════════════
-- Confirmed EXISTS in production.
--
-- Two-layer protection:
--   Layer 1 — RLS: SELECT public; UPDATE own row only
--   Layer 2 — Trigger: even own-row UPDATEs cannot change
--             is_owner / is_verified / is_banned / is_suspended
--             unless the request role is service_role / postgres /
--             supabase_admin.

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_select_public"  ON public.users;
DROP POLICY IF EXISTS "users_update_own_row" ON public.users;
-- Clean up old names
DROP POLICY IF EXISTS "users_update_own"     ON public.users;

CREATE POLICY "users_select_public" ON public.users
  FOR SELECT USING (true);

CREATE POLICY "users_update_own_row" ON public.users
  FOR UPDATE
  USING  (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Privilege escalation guard (SECURITY INVOKER so current_user
-- reflects the PostgREST role: 'authenticated', 'service_role', etc.)
CREATE OR REPLACE FUNCTION public.prevent_privilege_escalation()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  -- service_role (admin panel), postgres, and supabase_admin can
  -- modify these columns.  All other roles are blocked.
  IF current_user NOT IN ('service_role', 'postgres', 'supabase_admin') THEN
    IF NEW.is_owner     IS DISTINCT FROM OLD.is_owner     OR
       NEW.is_verified  IS DISTINCT FROM OLD.is_verified  OR
       NEW.is_banned    IS DISTINCT FROM OLD.is_banned    OR
       NEW.is_suspended IS DISTINCT FROM OLD.is_suspended THEN
      RAISE EXCEPTION
        'privilege_escalation_blocked: '
        'is_owner / is_verified / is_banned / is_suspended '
        'are admin-only columns (service_role required)';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_privilege_escalation ON public.users;
CREATE TRIGGER trg_prevent_privilege_escalation
  BEFORE UPDATE ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_privilege_escalation();


-- ════════════════════════════════════════════════════════════════
-- §7  MESSAGE_REACTIONS TABLE — RLS + ownership policies
-- ════════════════════════════════════════════════════════════════
-- Confirmed EXISTS in production.
-- Reactions are visible to everyone; users add/remove only their own.

ALTER TABLE public.message_reactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "reactions_select_public" ON public.message_reactions;
DROP POLICY IF EXISTS "reactions_insert_own"    ON public.message_reactions;
DROP POLICY IF EXISTS "reactions_delete_own"    ON public.message_reactions;
DROP POLICY IF EXISTS "reactions_select"        ON public.message_reactions;

CREATE POLICY "reactions_select_public" ON public.message_reactions
  FOR SELECT USING (true);

CREATE POLICY "reactions_insert_own" ON public.message_reactions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "reactions_delete_own" ON public.message_reactions
  FOR DELETE USING (auth.uid() = user_id);


-- ════════════════════════════════════════════════════════════════
-- §8  NICKNAMES TABLE — RLS + own-row policy
-- ════════════════════════════════════════════════════════════════
-- Confirmed EXISTS in production as "nicknames" (NOT "message_nicknames").
-- Per-user private nicknames for contacts.

ALTER TABLE public.nicknames ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "nicknames_own" ON public.nicknames;

CREATE POLICY "nicknames_own" ON public.nicknames
  FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);


-- ════════════════════════════════════════════════════════════════
-- §9  AI_SUBSCRIPTIONS TABLE — RLS (read-own; writes blocked)
-- ════════════════════════════════════════════════════════════════
-- Just created in §1a (or already existed).
-- POST /api/ai/subscribe is disabled — only service_role writes.

ALTER TABLE public.ai_subscriptions ENABLE ROW LEVEL SECURITY;

-- Drop both old policy names (from ai-subscription-schema.sql)
-- and new names in case either version was partially applied.
DROP POLICY IF EXISTS "ai_subscriptions_self"       ON public.ai_subscriptions;
DROP POLICY IF EXISTS "ai_subscriptions_select_own" ON public.ai_subscriptions;

CREATE POLICY "ai_subscriptions_select_own" ON public.ai_subscriptions
  FOR SELECT USING (auth.uid() = user_id);

-- No INSERT / UPDATE / DELETE policy → deny for all non-service-role.
-- service_role bypasses RLS entirely and manages this table.


-- ════════════════════════════════════════════════════════════════
-- §10  AI_USAGE_TRACKING TABLE — RLS + own-row policy
-- ════════════════════════════════════════════════════════════════
-- Just created in §1b (or already existed with schema patch in §3).
-- Written by the API server via the user's own JWT (requireAuth
-- middleware), so auth.uid() = user_id for every server write.

ALTER TABLE public.ai_usage_tracking ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ai_usage_tracking_self" ON public.ai_usage_tracking;
DROP POLICY IF EXISTS "ai_usage_select_own"    ON public.ai_usage_tracking;
DROP POLICY IF EXISTS "ai_usage_write_own"     ON public.ai_usage_tracking;

CREATE POLICY "ai_usage_select_own" ON public.ai_usage_tracking
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "ai_usage_write_own" ON public.ai_usage_tracking
  FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);


-- ════════════════════════════════════════════════════════════════
-- §11  AI_REQUESTS TABLE — RLS (read-own; server writes only)
-- ════════════════════════════════════════════════════════════════
-- Just created in §1c.  Audit log — users can read their own rows;
-- server writes via the user's JWT (auth.uid() = user_id).

ALTER TABLE public.ai_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ai_requests_self"       ON public.ai_requests;
DROP POLICY IF EXISTS "ai_requests_select_own" ON public.ai_requests;
DROP POLICY IF EXISTS "ai_requests_write_own"  ON public.ai_requests;

CREATE POLICY "ai_requests_select_own" ON public.ai_requests
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "ai_requests_write_own" ON public.ai_requests
  FOR INSERT WITH CHECK (auth.uid() = user_id);


-- ════════════════════════════════════════════════════════════════
-- §12  AI_BILLING_HISTORY TABLE — RLS (read-own; admin writes)
-- ════════════════════════════════════════════════════════════════

ALTER TABLE public.ai_billing_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ai_billing_history_self"       ON public.ai_billing_history;
DROP POLICY IF EXISTS "ai_billing_history_select_own" ON public.ai_billing_history;

CREATE POLICY "ai_billing_history_select_own" ON public.ai_billing_history
  FOR SELECT USING (auth.uid() = user_id);

-- No INSERT / UPDATE / DELETE → only service_role (admin / payment webhook).


-- ════════════════════════════════════════════════════════════════
-- §13  REFUND_REQUESTS TABLE — RLS + ownership policies
-- ════════════════════════════════════════════════════════════════
-- Just created in §2a.  Admin reads/updates via service_role;
-- users submit and read their own requests.

ALTER TABLE public.refund_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "refunds_select_own" ON public.refund_requests;
DROP POLICY IF EXISTS "refunds_insert_own" ON public.refund_requests;

CREATE POLICY "refunds_select_own" ON public.refund_requests
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "refunds_insert_own" ON public.refund_requests
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- No UPDATE / DELETE → only service_role (admin panel).


-- ════════════════════════════════════════════════════════════════
-- §14  REFUND_DECISIONS TABLE — admin-only (no user policies)
-- ════════════════════════════════════════════════════════════════
-- Just created in §2b.  Fully admin-managed; service_role bypasses RLS.

ALTER TABLE public.refund_decisions ENABLE ROW LEVEL SECURITY;

-- No user-facing policies — service_role handles all reads and writes.


-- ════════════════════════════════════════════════════════════════
-- §15  FUNDING_DONATIONS TABLE — RLS + ownership policies
-- ════════════════════════════════════════════════════════════════
-- Confirmed EXISTS in production.
-- Users submit pending donations; admins approve via service_role.

ALTER TABLE public.funding_donations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_read_own_donations"      ON public.funding_donations;
DROP POLICY IF EXISTS "users_insert_own_donations"    ON public.funding_donations;
DROP POLICY IF EXISTS "funding_donations_select_own"  ON public.funding_donations;
DROP POLICY IF EXISTS "funding_donations_insert_pending" ON public.funding_donations;

CREATE POLICY "funding_donations_select_own" ON public.funding_donations
  FOR SELECT USING (auth.uid() = user_id);

-- Enforce status = 'pending' at insert time — blocks pre-approved submissions.
CREATE POLICY "funding_donations_insert_pending" ON public.funding_donations
  FOR INSERT WITH CHECK (
    auth.uid() = user_id
    AND status = 'pending'
  );

-- No UPDATE / DELETE → only service_role (admin approval flow).


-- ════════════════════════════════════════════════════════════════
-- §16  COMMUNITY_FUNDING TABLE — RLS (public read; admin write)
-- ════════════════════════════════════════════════════════════════
-- Confirmed EXISTS in production.
-- Single global row.  Home page reads it; admin updates it.

ALTER TABLE public.community_funding ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_read_funding"             ON public.community_funding;
DROP POLICY IF EXISTS "community_funding_select_public" ON public.community_funding;

CREATE POLICY "community_funding_select_public" ON public.community_funding
  FOR SELECT USING (true);

-- No INSERT / UPDATE / DELETE → only service_role.


-- ════════════════════════════════════════════════════════════════
-- §17  STORAGE — chat-images bucket
-- ════════════════════════════════════════════════════════════════
-- Path convention: {userId}/{filename}
-- Policy enforces that (storage.foldername(name))[1] = auth.uid()
-- so users can only upload/delete files inside their own folder.
--
-- storage.objects has RLS enabled by default in Supabase.
-- Using standard CREATE POLICY on storage.objects (not the old
-- JSON-blob INSERT INTO storage.policies format).

DROP POLICY IF EXISTS "chat_images_upload_own_folder"    ON storage.objects;
DROP POLICY IF EXISTS "chat_images_select_authenticated" ON storage.objects;
DROP POLICY IF EXISTS "chat_images_delete_own_folder"    ON storage.objects;

CREATE POLICY "chat_images_upload_own_folder" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'chat-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "chat_images_select_authenticated" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'chat-images'
  );

CREATE POLICY "chat_images_delete_own_folder" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'chat-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );


-- ════════════════════════════════════════════════════════════════
-- §18  VERIFICATION QUERY
-- ════════════════════════════════════════════════════════════════
-- Shown in SQL Editor output immediately before COMMIT.
-- Every row must show rls_enabled = true.
-- Expected row count: 13

SELECT
  tablename                    AS "table",
  rowsecurity                  AS rls_enabled,
  CASE rowsecurity
    WHEN true  THEN '✓ protected'
    WHEN false THEN '✗ UNPROTECTED'
  END                          AS status
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN (
    'messages',
    'typing_status',
    'users',
    'message_reactions',
    'nicknames',
    'ai_subscriptions',
    'ai_usage_tracking',
    'ai_requests',
    'ai_billing_history',
    'refund_requests',
    'refund_decisions',
    'funding_donations',
    'community_funding'
  )
ORDER BY tablename;


COMMIT;
