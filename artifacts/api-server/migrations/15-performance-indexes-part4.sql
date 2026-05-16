-- =============================================================================
-- Migration 15 — Performance indexes  PART 4 of 4
-- Sections: ai_subscriptions, refund_requests, ANALYZE, ROLLBACK
-- Run parts 1 → 2 → 3 → 4 in order in Supabase SQL editor.
-- Every statement is idempotent (IF NOT EXISTS). Safe to re-run.
-- =============================================================================


-- ─────────────────────────────────────────────────────────────────────────────
-- 14. ai_subscriptions  (AI billing — subscriptions.user_id)
--
-- Already indexed by migration 05 (ai_subscriptions_user_status_idx).
-- Adding a covering index for the active-plan lookup used on every AI request.
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'ai_subscriptions'
  ) THEN

    -- Covers: WHERE user_id=$uid AND status='active'  (most common lookup)
    EXECUTE $idx$
      CREATE INDEX IF NOT EXISTS idx_ai_subs_user_active
        ON public.ai_subscriptions(user_id, status)
        WHERE status = 'active'
    $idx$;

    -- Full-status index (already created in migration 05 as
    -- ai_subscriptions_user_status_idx — this is a safe no-op)
    EXECUTE $idx$
      CREATE INDEX IF NOT EXISTS idx_ai_subs_user_status
        ON public.ai_subscriptions(user_id, status)
    $idx$;

    -- expiry lookup for cron-based plan expiration
    EXECUTE $idx$
      CREATE INDEX IF NOT EXISTS idx_ai_subs_expires_at
        ON public.ai_subscriptions(expires_at)
        WHERE status = 'active'
    $idx$;

  END IF;
END $$;


-- ─────────────────────────────────────────────────────────────────────────────
-- 15. refund_requests
--
-- Already indexed by migration 05 (user_id, status, created_at).
-- Adding a composite covering index for the admin review queue.
--
-- Schema note: The subscription-type column is named 'subscription_type'
-- (NOT 'type') as defined in migration 03-create-refund-requests.sql.
-- The DO block below verifies each column exists before creating any index,
-- so this is safe against schema drift in either direction.
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  v_type_col TEXT := NULL;
BEGIN
  -- Skip entirely if the table does not exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'refund_requests'
  ) THEN
    RETURN;
  END IF;

  -- ── Composite admin queue index ──────────────────────────────────────────
  -- Detect the subscription-type column (real name varies by deployment).
  -- Priority: subscription_type (canonical) → refund_type → type
  SELECT column_name INTO v_type_col
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name   = 'refund_requests'
    AND column_name  IN ('subscription_type', 'refund_type', 'type')
  ORDER BY
    CASE column_name
      WHEN 'subscription_type' THEN 1
      WHEN 'refund_type'       THEN 2
      WHEN 'type'              THEN 3
    END
  LIMIT 1;

  -- Only create the composite index when all three columns are confirmed present
  IF v_type_col IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name   = 'refund_requests'
         AND column_name  = 'status'
     )
     AND EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name   = 'refund_requests'
         AND column_name  = 'created_at'
     )
  THEN
    -- Admin queue: WHERE subscription_type=$t AND status=$s ORDER BY created_at DESC
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS idx_refund_requests_type_status_at
         ON public.refund_requests(%I, status, created_at DESC)',
      v_type_col
    );
  END IF;

  -- ── Abuse-score partial index ────────────────────────────────────────────
  -- Only create when the abuse_score column exists
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'refund_requests'
      AND column_name  = 'abuse_score'
  ) THEN
    EXECUTE $idx$
      CREATE INDEX IF NOT EXISTS idx_refund_requests_abuse
        ON public.refund_requests(abuse_score DESC)
        WHERE abuse_score >= 50
    $idx$;
  END IF;

END $$;


-- =============================================================================
-- UPDATE PLANNER STATISTICS
-- Run these after applying the migration to let the query planner immediately
-- benefit from the new indexes.  Safe on a live database — takes a few seconds.
-- =============================================================================

ANALYZE public.users;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema='public' AND table_name='messages') THEN
    ANALYZE public.messages;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema='public' AND table_name='follows') THEN
    ANALYZE public.follows;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema='public' AND table_name='notifications') THEN
    ANALYZE public.notifications;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema='public' AND table_name='payment_orders') THEN
    ANALYZE public.payment_orders;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema='public' AND table_name='funding_donations') THEN
    ANALYZE public.funding_donations;
  END IF;
END $$;


-- =============================================================================
-- ROLLBACK
-- If you need to undo every index this migration created, run the block below.
-- It is safe: DROP INDEX IF EXISTS never fails on a missing index.
-- Indexes from migration 05 are NOT dropped here.
-- =============================================================================

/*  ── ROLLBACK SCRIPT (copy-paste to Supabase SQL editor) ──────────────────

-- users
DROP INDEX IF EXISTS public.idx_users_username_trgm;
DROP INDEX IF EXISTS public.idx_users_name_trgm;
DROP INDEX IF EXISTS public.idx_users_username_btree;
DROP INDEX IF EXISTS public.idx_users_email_btree;
DROP INDEX IF EXISTS public.idx_users_online;

-- messages (DMs)
DROP INDEX IF EXISTS public.idx_messages_sender_at;
DROP INDEX IF EXISTS public.idx_messages_receiver_at;
DROP INDEX IF EXISTS public.idx_messages_thread_asc;
DROP INDEX IF EXISTS public.idx_messages_thread_reverse;
DROP INDEX IF EXISTS public.idx_messages_receiver_unseen;

-- messages (AI chat)
DROP INDEX IF EXISTS public.idx_messages_conversation_at;

-- follows
DROP INDEX IF EXISTS public.idx_follows_follower_id;
DROP INDEX IF EXISTS public.idx_follows_following_id;
DROP INDEX IF EXISTS public.idx_follows_pair;

-- notifications
DROP INDEX IF EXISTS public.idx_notifications_user_at;
DROP INDEX IF EXISTS public.idx_notifications_user_unread;

-- payment_orders
DROP INDEX IF EXISTS public.idx_payment_orders_user_at;
DROP INDEX IF EXISTS public.idx_payment_orders_status_at;
DROP INDEX IF EXISTS public.idx_payment_orders_sha256;
DROP INDEX IF EXISTS public.idx_payment_orders_flagged;

-- credit_ledger
DROP INDEX IF EXISTS public.idx_credit_ledger_user_at;

-- message_reactions
DROP INDEX IF EXISTS public.idx_message_reactions_message_id;
DROP INDEX IF EXISTS public.idx_message_reactions_unique;

-- message_usage
DROP INDEX IF EXISTS public.idx_message_usage_user_id;

-- typing_status
DROP INDEX IF EXISTS public.idx_typing_status_user_id;
DROP INDEX IF EXISTS public.idx_typing_status_receiver_id;

-- nicknames
DROP INDEX IF EXISTS public.idx_nicknames_user_id;
DROP INDEX IF EXISTS public.idx_nicknames_pair;

-- user_settings
DROP INDEX IF EXISTS public.idx_user_settings_user_id;

-- funding_donations
DROP INDEX IF EXISTS public.idx_funding_donations_user_at;
DROP INDEX IF EXISTS public.idx_funding_donations_status_at;

-- conversations
DROP INDEX IF EXISTS public.idx_conversations_created_at;

-- ai_subscriptions (new additions only; migration-05 indexes preserved)
DROP INDEX IF EXISTS public.idx_ai_subs_user_active;
DROP INDEX IF EXISTS public.idx_ai_subs_user_status;
DROP INDEX IF EXISTS public.idx_ai_subs_expires_at;

-- refund_requests (new additions only)
DROP INDEX IF EXISTS public.idx_refund_requests_type_status_at;
DROP INDEX IF EXISTS public.idx_refund_requests_abuse;

*/

-- =============================================================================
-- END OF PART 4 — migration complete
-- =============================================================================
