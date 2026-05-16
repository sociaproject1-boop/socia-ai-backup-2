-- ================================================================
-- SECTION 10 of 13 — Policies: nicknames + AI subscription tables
-- Depends on: Section 6 (RLS must be enabled)
-- Safe to run multiple times (idempotent).
--
-- Note: the real production table is "nicknames", NOT
--       "message_nicknames" — confirmed via schema probe.
-- ================================================================
BEGIN;

-- nicknames: private per-user
DROP POLICY IF EXISTS "nicknames_own" ON public.nicknames;

CREATE POLICY "nicknames_own" ON public.nicknames
  FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ai_subscriptions: read-own only; writes blocked for regular users
-- (service_role bypasses RLS for admin / payment webhooks)
DROP POLICY IF EXISTS "ai_subscriptions_self"       ON public.ai_subscriptions;
DROP POLICY IF EXISTS "ai_subscriptions_select_own" ON public.ai_subscriptions;

CREATE POLICY "ai_subscriptions_select_own" ON public.ai_subscriptions
  FOR SELECT USING (auth.uid() = user_id);

-- ai_usage_tracking: server writes via user JWT; users can read own rows
DROP POLICY IF EXISTS "ai_usage_tracking_self" ON public.ai_usage_tracking;
DROP POLICY IF EXISTS "ai_usage_select_own"    ON public.ai_usage_tracking;
DROP POLICY IF EXISTS "ai_usage_write_own"     ON public.ai_usage_tracking;

CREATE POLICY "ai_usage_select_own" ON public.ai_usage_tracking
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "ai_usage_write_own" ON public.ai_usage_tracking
  FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

COMMIT;
