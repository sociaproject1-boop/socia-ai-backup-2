-- =============================================================================
-- Migration 15 — Performance indexes  PART 1 of 4
-- Sections: EXTENSIONS, users, messages
-- Run parts 1 → 2 → 3 → 4 in order in Supabase SQL editor.
-- Every statement is idempotent (IF NOT EXISTS). Safe to re-run.
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


-- =============================================================================
-- END OF PART 1 — continue with part 2
-- =============================================================================
