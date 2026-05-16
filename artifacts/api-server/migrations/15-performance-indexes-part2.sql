-- =============================================================================
-- Migration 15 — Performance indexes  PART 2 of 4
-- Sections: follows, notifications, payment_orders, credit_ledger,
--           message_reactions
-- Run parts 1 → 2 → 3 → 4 in order in Supabase SQL editor.
-- Every statement is idempotent (IF NOT EXISTS). Safe to re-run.
-- =============================================================================


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
--   Toggle reaction               : WHERE message_id=X AND user_id=Y AND <reaction_col>
--
-- The reaction-type column name varies by schema version:
--   'emoji'         — canonical name in supabase-schema.sql
--   'reaction'      — alternate name seen in some deployments
--   'reaction_type' — alternate name seen in some deployments
--   'type'          — generic fallback
-- The DO block below detects whichever column is actually present and builds
-- the unique index against it.  If none of the known names exist the unique
-- index is skipped entirely — the message_id B-tree index is still created.
--
-- Impact: Reaction rendering fetches the right rows without a table scan.
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  v_reaction_col TEXT := NULL;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'message_reactions'
  ) THEN
    RETURN;
  END IF;

  -- Simple lookup index on message_id — always safe regardless of other columns
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'message_reactions'
      AND column_name  = 'message_id'
  ) THEN
    EXECUTE $idx$
      CREATE INDEX IF NOT EXISTS idx_message_reactions_message_id
        ON public.message_reactions(message_id)
    $idx$;
  END IF;

  -- Detect the reaction-type column (try known names in priority order)
  SELECT column_name INTO v_reaction_col
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name   = 'message_reactions'
    AND column_name  IN ('emoji', 'reaction', 'reaction_type', 'type')
  ORDER BY
    CASE column_name
      WHEN 'emoji'         THEN 1
      WHEN 'reaction'      THEN 2
      WHEN 'reaction_type' THEN 3
      WHEN 'type'          THEN 4
    END
  LIMIT 1;

  -- Only create the unique index when message_id, user_id, AND reaction col all exist
  IF v_reaction_col IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name   = 'message_reactions'
         AND column_name  = 'user_id'
     )
     AND EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name   = 'message_reactions'
         AND column_name  = 'message_id'
     )
  THEN
    -- Prevents duplicate reactions; also serves as the toggle lookup
    EXECUTE format(
      'CREATE UNIQUE INDEX IF NOT EXISTS idx_message_reactions_unique
         ON public.message_reactions(message_id, user_id, %I)',
      v_reaction_col
    );
  END IF;

END $$;


-- =============================================================================
-- END OF PART 2 — continue with part 3
-- =============================================================================
