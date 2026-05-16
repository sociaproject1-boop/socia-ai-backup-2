-- ================================================================
-- SECTION 11 of 13 — Policies: ai_requests + ai_billing_history
-- Depends on: Section 6 (RLS must be enabled)
-- Safe to run multiple times (idempotent).
-- ================================================================
BEGIN;

-- ai_requests: audit log — users read own; server inserts via user JWT
DROP POLICY IF EXISTS "ai_requests_self"       ON public.ai_requests;
DROP POLICY IF EXISTS "ai_requests_select_own" ON public.ai_requests;
DROP POLICY IF EXISTS "ai_requests_write_own"  ON public.ai_requests;

CREATE POLICY "ai_requests_select_own" ON public.ai_requests
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "ai_requests_write_own" ON public.ai_requests
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- ai_billing_history: read-own only; admin (service_role) writes
DROP POLICY IF EXISTS "ai_billing_history_self"       ON public.ai_billing_history;
DROP POLICY IF EXISTS "ai_billing_history_select_own" ON public.ai_billing_history;

CREATE POLICY "ai_billing_history_select_own" ON public.ai_billing_history
  FOR SELECT USING (auth.uid() = user_id);

COMMIT;
