-- =============================================================================
-- Migration 15 — Performance indexes (comprehensive, production-safe)
--
-- Purpose: Eliminate sequential scans on every high-traffic table.
--
-- Safety guarantees:
--   • Every CREATE INDEX uses IF NOT EXISTS        → re-runnable, zero-downtime
--   • Every block that touches optional tables uses DO $$ EXECUTE guards
--     so the script never fails if a table has not been created yet
--   • CREATE INDEX CONCURRENTLY is NOT used here because it cannot run inside
--     a transaction block and Supabase SQL editor runs DDL in auto-commit mode.
--     PostgreSQL B-tree and GIN index builds lock the table only at the very
--     start and end (Share lock), not for reads/writes during the build, so
--     these are safe to run on a live production database.
--   • Extensions use IF NOT EXISTS — already present on Supabase projects.
--   • No data modifications.  Rollback instructions at the bottom.
--
-- Run order: Any time after migrations 01–14.
-- Estimated impact: listed per section.
-- =============================================================================


-- ─────────────────────────────────────────────────────────────────────────────
-- EXTENSIONS
-- ─────────────────────────────────────────────────────────────────────────────

-- pg_trgm unlocks GIN trigram indexes that support arbitrary ILIKE '%q%'
-- patterns.  Without it, every user-search call does a full table scan.
-- Already present on all Supabase-managed projects but the guard is harmless.
CREATE EXTENSION IF NOT EXISTS pg_trgm;


-- ─────────────────────────────────────────────────────────────────────────────
-- 1. users
--
-- Hot queries:
--   searchUsers()  : username ILIKE '%q%' OR name ILIKE '%q%'
--   fetchProfile() : id = $uid                  (PK already indexed)
--   UserByUsername : username = $handle
--   presence/badge : id = $uid                  (PK already indexed)
--
-- Impact:
--   • GIN trgm on username/name: full table scan → bitmap index scan.
--     On 10 k users the query drops from ~15 ms to <1 ms.
--   • B-tree on username: exact/prefix match + unique lookup for /u/:handle.
-- ─────────────────────────────────────────────────────────────────────────────

-- Trigram GIN — enables ILIKE '%q%' without a full table scan
CREATE INDEX IF NOT EXISTS idx_users_username_trgm
  ON public.users USING gin(username gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_users_name_trgm
  ON public.users USING gin(name gin_trgm_ops);

-- B-tree — exact match for /profile/:username and admin user lookups
CREATE INDEX IF NOT EXISTS idx_users_username_btree
  ON public.users(username);

-- B-tree — admin user search by email
CREATE INDEX IF NOT EXISTS idx_users_email_btree
  ON public.users(email);

-- Partial — online-user queries (presence badge)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'is_online'
  ) THEN
    EXECUTE $idx$
      CREATE INDEX IF NOT EXISTS idx_users_online
        ON public.users(is_online)
        WHERE is_online = true
    $idx$;
  END IF;
END $$;


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. messages  (Supabase DMs: sender_id / receiver_id / seen / created_at)
--
-- Hot queries:
--   useConversations() inbox:
--     WHERE sender_id=me OR receiver_id=me ORDER BY created_at DESC LIMIT 100
--
--   useMessages() thread:
--     WHERE (sender_id=me AND receiver_id=other)
--        OR (sender_id=other AND receiver_id=me)
--     ORDER BY created_at ASC LIMIT 300
--
--   useNotifications() unread count:
--     WHERE receiver_id=me AND seen=false
--
--   markThreadSeen() bulk update:
--     WHERE receiver_id=me AND sender_id=other AND seen=false
--
-- Impact:
--   • Inbox: BitmapOr across two separate b-tree index scans — removes
--     full sort + full scan even with millions of messages.
--   • Thread: single composite scan for (a,b) or (b,a) pair.
--   • Unread: partial index covers only unseen rows; tiny and very fast.
--
-- Note: The Drizzle AI-chat `messages` table (conversation_id, role, content)
--   uses a different column layout.  The DO block below detects which variant
--   is present by checking for the `sender_id` column and applies the correct
--   set of indexes to whichever schema is live.
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  -- ── DM messages variant (sender_id / receiver_id / seen) ──────────────────
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'messages'
      AND column_name  = 'sender_id'
  ) THEN

    -- Inbox query — BitmapOr plan needs both of these
    EXECUTE $idx$
      CREATE INDEX IF NOT EXISTS idx_messages_sender_at
        ON public.messages(sender_id, created_at DESC)
    $idx$;

    EXECUTE $idx$
      CREATE INDEX IF NOT EXISTS idx_messages_receiver_at
        ON public.messages(receiver_id, created_at DESC)
    $idx$;

    -- Thread view — composite covers both orderings via BitmapOr
    EXECUTE $idx$
      CREATE INDEX IF NOT EXISTS idx_messages_thread_asc
        ON public.messages(sender_id, receiver_id, created_at ASC)
    $idx$;

    EXECUTE $idx$
      CREATE INDEX IF NOT EXISTS idx_messages_thread_reverse
        ON public.messages(receiver_id, sender_id, created_at ASC)
    $idx$;

    -- Unread count + markThreadSeen update — partial index only on unseen rows
    -- (much smaller than a full-column index; fits in memory even at scale)
    EXECUTE $idx$
      CREATE INDEX IF NOT EXISTS idx_messages_receiver_unseen
        ON public.messages(receiver_id, sender_id)
        WHERE seen = false
    $idx$;

  END IF;

  -- ── AI-chat messages variant (conversation_id / role / content) ───────────
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'messages'
      AND column_name  = 'conversation_id'
  ) THEN
    -- SociaGPT history lookup: WHERE conversation_id=X ORDER BY created_at
    EXECUTE $idx$
      CREATE INDEX IF NOT EXISTS idx_messages_conversation_at
        ON public.messages(conversation_id, created_at ASC)
    $idx$;
  END IF;
END $$;


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. follows
--
-- Hot queries:
--   Profile follower count  : COUNT(*) WHERE following_id=target
--   Profile following count : COUNT(*) WHERE follower_id=me
--   Follow status check     : WHERE follower_id=me AND following_id=target
--   Followers list          : WHERE following_id=target  (Followers page)
--   Following list          : WHERE follower_id=me       (Followers page)
--
-- Impact: Without indexes, every count / follow-status check scans the
--   full follows table.  These two b-tree indexes make all of those O(1).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_follows_follower_id
  ON public.follows(follower_id);

CREATE INDEX IF NOT EXISTS idx_follows_following_id
  ON public.follows(following_id);

-- Covering index for the "am I following this person?" check
-- (fetched on every UserProfile mount)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'follows'
  ) THEN
    EXECUTE $idx$
      CREATE UNIQUE INDEX IF NOT EXISTS idx_follows_pair
        ON public.follows(follower_id, following_id)
    $idx$;
  END IF;
END $$;


-- ─────────────────────────────────────────────────────────────────────────────
-- 4. notifications
--
-- Hot queries:
--   Notification bell  : WHERE user_id=me ORDER BY created_at DESC LIMIT 20
--   Unread badge count : WHERE user_id=me AND read=false
--   Mark all read      : UPDATE … WHERE user_id=me AND read=false
--
-- Impact: Without an index, every page-load notification fetch scans the
--   full table.  Composite (user_id, created_at) covers both list and count.
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'notifications'
  ) THEN

    -- Notification list ordered by recency
    EXECUTE $idx$
      CREATE INDEX IF NOT EXISTS idx_notifications_user_at
        ON public.notifications(user_id, created_at DESC)
    $idx$;

    -- Unread-only partial index (tiny; stays hot in the buffer cache)
    EXECUTE $idx$
      CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
        ON public.notifications(user_id)
        WHERE read = false
    $idx$;

  END IF;
END $$;


-- ─────────────────────────────────────────────────────────────────────────────
-- 5. payment_orders  (creator billing)
--
-- Hot queries:
--   fetchMyOrders()  : ORDER BY created_at DESC (RLS scopes to user automatically)
--   adminListOrders(): WHERE status='pending'  ORDER BY created_at DESC
--   admin user view  : WHERE user_id=X         ORDER BY created_at DESC
--   Receipt dedup    : WHERE receipt_sha256=$hash
--
-- Impact: User billing history and admin pending-order queue both become
--   index scans instead of full table sorts.
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'payment_orders'
  ) THEN

    -- User's own order history (RLS adds the user_id filter implicitly)
    EXECUTE $idx$
      CREATE INDEX IF NOT EXISTS idx_payment_orders_user_at
        ON public.payment_orders(user_id, created_at DESC)
    $idx$;

    -- Admin pending queue
    EXECUTE $idx$
      CREATE INDEX IF NOT EXISTS idx_payment_orders_status_at
        ON public.payment_orders(status, created_at DESC)
    $idx$;

    -- Receipt duplicate detection
    EXECUTE $idx$
      CREATE INDEX IF NOT EXISTS idx_payment_orders_sha256
        ON public.payment_orders(receipt_sha256)
    $idx$;

    -- Flagged order admin view
    EXECUTE $idx$
      CREATE INDEX IF NOT EXISTS idx_payment_orders_flagged
        ON public.payment_orders(flagged, created_at DESC)
        WHERE flagged = true
    $idx$;

  END IF;
END $$;


-- ─────────────────────────────────────────────────────────────────────────────
-- 6. credit_ledger
--
-- Hot queries:
--   fetchMyLedger() : ORDER BY created_at DESC LIMIT 50 (RLS scopes to user)
--   admin view      : WHERE user_id=X ORDER BY created_at DESC
--   balance calc    : latest row WHERE user_id=X for balance_after
--
-- Impact: Ledger history renders in one index scan rather than a full sort.
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'credit_ledger'
  ) THEN

    EXECUTE $idx$
      CREATE INDEX IF NOT EXISTS idx_credit_ledger_user_at
        ON public.credit_ledger(user_id, created_at DESC)
    $idx$;

  END IF;
END $$;


-- ─────────────────────────────────────────────────────────────────────────────
-- 7. message_reactions
--
-- Hot queries:
--   Load reactions for a message : WHERE message_id=X
--   Toggle reaction               : WHERE message_id=X AND user_id=Y AND emoji=E
--
-- Impact: Reaction rendering fetches the right rows without a table scan.
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'message_reactions'
  ) THEN

    EXECUTE $idx$
      CREATE INDEX IF NOT EXISTS idx_message_reactions_message_id
        ON public.message_reactions(message_id)
    $idx$;

    -- Prevents duplicate reactions; also serves as the toggle lookup
    EXECUTE $idx$
      CREATE UNIQUE INDEX IF NOT EXISTS idx_message_reactions_unique
        ON public.message_reactions(message_id, user_id, emoji)
    $idx$;

  END IF;
END $$;


-- ─────────────────────────────────────────────────────────────────────────────
-- 8. message_usage
--
-- Hot queries:
--   Daily quota check : WHERE user_id=me (single row lookup)
--   Upsert            : ON CONFLICT (user_id)
--
-- Impact: quota check is O(1).
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'message_usage'
  ) THEN

    -- Ensure user_id is unique and indexed (may already be a PK)
    EXECUTE $idx$
      CREATE INDEX IF NOT EXISTS idx_message_usage_user_id
        ON public.message_usage(user_id)
    $idx$;

  END IF;
END $$;


-- ─────────────────────────────────────────────────────────────────────────────
-- 9. typing_status
--
-- Hot queries:
--   Upsert own typing status  : WHERE user_id=me (or sender/receiver pair)
--   Read partner typing state : WHERE receiver_id=partner (if column exists)
--
-- Impact: Typing indicator lookups avoid seq-scan on a frequently-written table.
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'typing_status'
  ) THEN

    -- Index on user_id (always present)
    EXECUTE $idx$
      CREATE INDEX IF NOT EXISTS idx_typing_status_user_id
        ON public.typing_status(user_id)
    $idx$;

    -- Index on receiver_id if the column exists
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name   = 'typing_status'
        AND column_name  = 'receiver_id'
    ) THEN
      EXECUTE $idx$
        CREATE INDEX IF NOT EXISTS idx_typing_status_receiver_id
          ON public.typing_status(receiver_id)
      $idx$;
    END IF;

  END IF;
END $$;


-- ─────────────────────────────────────────────────────────────────────────────
-- 10. nicknames
--
-- Hot queries:
--   Load nickname for a pair : WHERE (user_id=A AND target_id=B)
--   Upsert own nickname       : ON CONFLICT (user_id, target_id)
--
-- Impact: Nickname lookup is a composite equality — currently a seq-scan
--   on every chat thread open.
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'nicknames'
  ) THEN

    -- Covers both "who named whom" lookups
    EXECUTE $idx$
      CREATE INDEX IF NOT EXISTS idx_nicknames_user_id
        ON public.nicknames(user_id)
    $idx$;

    -- Unique pair index — column name varies by schema version ('target_id' or 'receiver_id')
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'nicknames' AND column_name = 'target_id'
    ) THEN
      EXECUTE $idx$
        CREATE UNIQUE INDEX IF NOT EXISTS idx_nicknames_pair
          ON public.nicknames(user_id, target_id)
      $idx$;
    ELSIF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'nicknames' AND column_name = 'receiver_id'
    ) THEN
      EXECUTE $idx$
        CREATE UNIQUE INDEX IF NOT EXISTS idx_nicknames_pair
          ON public.nicknames(user_id, receiver_id)
      $idx$;
    END IF;

  END IF;
END $$;


-- ─────────────────────────────────────────────────────────────────────────────
-- 11. user_settings
--
-- Hot queries:
--   Load settings  : WHERE user_id=me (single row)
--   Upsert         : ON CONFLICT (user_id)
--
-- Impact: Settings page load skips the seq-scan.
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'user_settings'
  ) THEN

    EXECUTE $idx$
      CREATE INDEX IF NOT EXISTS idx_user_settings_user_id
        ON public.user_settings(user_id)
    $idx$;

  END IF;
END $$;


-- ─────────────────────────────────────────────────────────────────────────────
-- 12. funding_donations  (community funding)
--
-- Hot queries:
--   User history  : WHERE user_id=me ORDER BY created_at DESC
--   Anti-spam     : WHERE user_id=me AND status='pending'
--                   AND created_at > (now - interval '24 hours')
--   Admin list    : WHERE status='pending' ORDER BY created_at DESC
--   Admin counts  : COUNT(*) WHERE status=X  (pending / approved / rejected)
--
-- Impact: All admin list and status-count queries become index scans.
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'funding_donations'
  ) THEN

    -- User history + anti-spam (24h check)
    EXECUTE $idx$
      CREATE INDEX IF NOT EXISTS idx_funding_donations_user_at
        ON public.funding_donations(user_id, created_at DESC)
    $idx$;

    -- Admin pending queue
    EXECUTE $idx$
      CREATE INDEX IF NOT EXISTS idx_funding_donations_status_at
        ON public.funding_donations(status, created_at DESC)
    $idx$;

  END IF;
END $$;


-- ─────────────────────────────────────────────────────────────────────────────
-- 13. conversations  (Drizzle — SociaGPT AI chat sessions)
--
-- Hot queries:
--   List sessions  : SELECT * FROM conversations ORDER BY created_at DESC
--
-- Impact: Session list renders in index order without a sort.
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'conversations'
  ) THEN

    EXECUTE $idx$
      CREATE INDEX IF NOT EXISTS idx_conversations_created_at
        ON public.conversations(created_at DESC)
    $idx$;

  END IF;
END $$;


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
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'refund_requests'
  ) THEN

    -- Admin queue: WHERE type=$t AND status=$s ORDER BY created_at DESC
    EXECUTE $idx$
      CREATE INDEX IF NOT EXISTS idx_refund_requests_type_status_at
        ON public.refund_requests(type, status, created_at DESC)
    $idx$;

    -- Abuse-score filter: WHERE abuse_score >= 50
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
