-- ================================================================
-- SECTION 8 of 13 — Policies: typing_status + message_reactions
-- Depends on: Section 6 (RLS must be enabled)
-- Safe to run multiple times (idempotent).
-- ================================================================
BEGIN;

-- typing_status: anyone can read; only own row can be written
DROP POLICY IF EXISTS "typing_status_select_public" ON public.typing_status;
DROP POLICY IF EXISTS "typing_status_write_own"     ON public.typing_status;
DROP POLICY IF EXISTS "typing_status_select"        ON public.typing_status;
DROP POLICY IF EXISTS "typing_status_upsert_own"    ON public.typing_status;

CREATE POLICY "typing_status_select_public" ON public.typing_status
  FOR SELECT USING (true);

CREATE POLICY "typing_status_write_own" ON public.typing_status
  FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- message_reactions: public read; own reactions only for write
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

COMMIT;
