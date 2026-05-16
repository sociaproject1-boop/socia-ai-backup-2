-- Migration 20: Refund Thread System
-- Creates refund_messages + refund_notifications tables.
-- Adds payout_status column to refund_requests.
-- Safe to re-run (all IF NOT EXISTS / DROP POLICY IF EXISTS guards).
-- Run AFTER migration 19.

-- ── 1. refund_messages ───────────────────────────────────────────────────
-- One row per message in a refund support thread.
-- Internal admin notes (is_internal_note = true) are NEVER exposed to users.

CREATE TABLE IF NOT EXISTS public.refund_messages (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  refund_request_id   UUID        NOT NULL REFERENCES public.refund_requests(id) ON DELETE CASCADE,
  sender_id           UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  sender_role         TEXT        NOT NULL DEFAULT 'user'
    CHECK (sender_role IN ('user', 'admin', 'system')),
  message             TEXT        NOT NULL,
  attachment_url      TEXT,
  is_internal_note    BOOLEAN     NOT NULL DEFAULT false,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS refund_messages_request_idx ON public.refund_messages(refund_request_id);
CREATE INDEX IF NOT EXISTS refund_messages_created_idx ON public.refund_messages(refund_request_id, created_at ASC);

-- RLS: users see only their own threads, no internal notes.
-- Admin reads via service-role client (bypasses RLS).
ALTER TABLE public.refund_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "refund_messages_own_select" ON public.refund_messages;
CREATE POLICY "refund_messages_own_select"
  ON public.refund_messages FOR SELECT
  USING (
    NOT is_internal_note
    AND EXISTS (
      SELECT 1 FROM public.refund_requests rr
      WHERE rr.id = refund_messages.refund_request_id
        AND rr.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "refund_messages_own_insert" ON public.refund_messages;
CREATE POLICY "refund_messages_own_insert"
  ON public.refund_messages FOR INSERT
  WITH CHECK (
    sender_role = 'user'
    AND sender_id = auth.uid()
    AND NOT is_internal_note
    AND EXISTS (
      SELECT 1 FROM public.refund_requests rr
      WHERE rr.id = refund_messages.refund_request_id
        AND rr.user_id = auth.uid()
        AND rr.status IN ('pending', 'reviewing')
    )
  );

-- ── 2. refund_notifications ──────────────────────────────────────────────
-- One row per notification delivered to the user about their refund request.

CREATE TABLE IF NOT EXISTS public.refund_notifications (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  refund_request_id   UUID        NOT NULL REFERENCES public.refund_requests(id) ON DELETE CASCADE,
  type                TEXT        NOT NULL DEFAULT 'new_message'
    CHECK (type IN ('status_update', 'new_message', 'decision', 'proof_requested', 'info')),
  title               TEXT        NOT NULL,
  message             TEXT        NOT NULL,
  is_read             BOOLEAN     NOT NULL DEFAULT false,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS refund_notifications_user_idx ON public.refund_notifications(user_id, is_read, created_at DESC);
CREATE INDEX IF NOT EXISTS refund_notifications_request_idx ON public.refund_notifications(refund_request_id);

-- RLS: users see / update only their own notifications.
ALTER TABLE public.refund_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "refund_notif_own_select" ON public.refund_notifications;
CREATE POLICY "refund_notif_own_select"
  ON public.refund_notifications FOR SELECT
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "refund_notif_own_update" ON public.refund_notifications;
CREATE POLICY "refund_notif_own_update"
  ON public.refund_notifications FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ── 3. payout_status column on refund_requests ───────────────────────────
ALTER TABLE public.refund_requests
  ADD COLUMN IF NOT EXISTS payout_status  TEXT
    CHECK (payout_status IN ('queued', 'processing', 'sent', 'failed')),
  ADD COLUMN IF NOT EXISTS payout_ref     TEXT,
  ADD COLUMN IF NOT EXISTS payout_at      TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS refund_requests_payout_idx
  ON public.refund_requests(payout_status)
  WHERE payout_status IS NOT NULL;

-- ── 4. Supabase Realtime publication ─────────────────────────────────────
-- Allows clients to subscribe to live changes on these tables.
-- Supabase creates the "supabase_realtime" publication by default.
-- The DO block silently skips if the table is already in the publication.

DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.refund_messages;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.refund_notifications;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END;
$$;
