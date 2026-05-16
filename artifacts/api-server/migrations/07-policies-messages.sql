-- ================================================================
-- SECTION 7 of 13 — Policies: messages
-- Depends on: Section 6 (RLS must be enabled)
-- Safe to run multiple times (idempotent).
--
-- Access model:
--   SELECT → sender or receiver only
--   INSERT → sender_id must equal auth.uid()
--   UPDATE → receiver (mark seen) or sender (edit own text)
--   DELETE → sender only
-- ================================================================
BEGIN;

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

COMMIT;
