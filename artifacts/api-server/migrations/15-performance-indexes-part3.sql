-- =============================================================================
-- Migration 15 — Performance indexes  PART 3 of 4
-- Sections: message_usage, typing_status, nicknames, user_settings,
--           funding_donations, conversations
-- Run parts 1 → 2 → 3 → 4 in order in Supabase SQL editor.
-- Every statement is idempotent (IF NOT EXISTS). Safe to re-run.
-- =============================================================================


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


-- =============================================================================
-- END OF PART 3 — continue with part 4
-- =============================================================================
