-- ================================================================
-- SECTION 12 of 13 — Policies: refunds + funding
-- Depends on: Section 6 (RLS must be enabled)
-- Safe to run multiple times (idempotent).
-- ================================================================
BEGIN;

-- refund_requests: users submit and read their own requests
DROP POLICY IF EXISTS "refunds_select_own" ON public.refund_requests;
DROP POLICY IF EXISTS "refunds_insert_own" ON public.refund_requests;

CREATE POLICY "refunds_select_own" ON public.refund_requests
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "refunds_insert_own" ON public.refund_requests
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- refund_decisions: admin-only — no user policies (service_role bypasses RLS)

-- funding_donations: users submit and read their own; status locked to 'pending'
DROP POLICY IF EXISTS "users_read_own_donations"         ON public.funding_donations;
DROP POLICY IF EXISTS "users_insert_own_donations"       ON public.funding_donations;
DROP POLICY IF EXISTS "funding_donations_select_own"     ON public.funding_donations;
DROP POLICY IF EXISTS "funding_donations_insert_pending" ON public.funding_donations;

CREATE POLICY "funding_donations_select_own" ON public.funding_donations
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "funding_donations_insert_pending" ON public.funding_donations
  FOR INSERT WITH CHECK (
    auth.uid() = user_id AND status = 'pending'
  );

-- community_funding: public read; admin writes only
DROP POLICY IF EXISTS "public_read_funding"             ON public.community_funding;
DROP POLICY IF EXISTS "community_funding_select_public" ON public.community_funding;

CREATE POLICY "community_funding_select_public" ON public.community_funding
  FOR SELECT USING (true);

COMMIT;
