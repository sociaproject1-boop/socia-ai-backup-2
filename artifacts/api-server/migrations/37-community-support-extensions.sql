-- Migration 37: Community Support — Phase-1 extensions.
--
-- Layered ON TOP of migration 36 (creates table + finalize RPC).
-- All statements are idempotent so this migration is safe to re-run.
--
-- Adds:
--   1. status values 'cancelled' + 'expired' (relaxed CHECK constraint)
--   2. Explicit btree indexes on (status), (created_at) and a GIN index on
--      processed_event_ids for fast O(log n) replay lookups
--   3. expire_stale_community_support() — marks any pending row older than
--      30 minutes as 'expired'. Designed to be called periodically by a
--      lightweight cron / scheduled function on the API server.
--   4. community_support_stats() SQL function — single source of truth used
--      by GET /api/community-support/stats. Excludes pending>30min,
--      failed, cancelled, expired. Sums only status='paid'.

BEGIN;

-- 1. Status CHECK ----------------------------------------------------------
-- Drop and re-add so we can extend the allowed set safely.
ALTER TABLE public.community_support
  DROP CONSTRAINT IF EXISTS community_support_status_check;
ALTER TABLE public.community_support
  ADD  CONSTRAINT community_support_status_check
       CHECK (status IN ('pending','paid','failed','cancelled','expired'));

-- 2. Indexes ---------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_cs_status     ON public.community_support (status);
CREATE INDEX IF NOT EXISTS idx_cs_created_at ON public.community_support (created_at DESC);
-- GIN on processed_event_ids lets the webhook check "has this event id been
-- processed?" in O(log n) even when the array grows.
CREATE INDEX IF NOT EXISTS idx_cs_event_ids_gin
  ON public.community_support USING GIN (processed_event_ids);

-- 3. Pending expiration ----------------------------------------------------
-- Any row stuck in 'pending' for >30 minutes is presumed abandoned (user
-- closed the PayMongo checkout tab, never paid). We mark it 'expired' so
-- the stats endpoint and dashboards can filter it out cleanly.
--
-- This intentionally does NOT touch rows already in a terminal state
-- (paid/failed/cancelled/expired) and is safe to invoke concurrently —
-- the UPDATE is a single statement.
CREATE OR REPLACE FUNCTION public.expire_stale_community_support()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE public.community_support
     SET status     = 'expired',
         updated_at = now()
   WHERE status     = 'pending'
     AND created_at < (now() - interval '30 minutes');
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END $$;

-- 4. Stats function --------------------------------------------------------
-- Returns the live community-support totals derived ENTIRELY from
-- community_support rows. Used by GET /api/community-support/stats.
-- This is independent of the community_funding.current_amount counter
-- (the latter is still atomically maintained by paymongo_finalize_support
-- for cheap O(1) reads, but this function is the source of truth).
--
-- Rules:
--   * Only rows with status='paid' contribute to 'raised' / 'supporters'
--   * 'goal' comes from the singleton community_funding row
--   * 'remaining' is non-negative
--   * 'percentage' is capped at 100
CREATE OR REPLACE FUNCTION public.community_support_stats()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_raised      numeric(12,2);
  v_supporters  integer;
  v_goal        numeric(12,2);
  v_remaining   numeric(12,2);
  v_percentage  numeric(6,2);
BEGIN
  SELECT
    COALESCE(SUM(amount_centavos), 0) / 100.0,
    COUNT(*)
  INTO v_raised, v_supporters
  FROM public.community_support
  WHERE status = 'paid';

  SELECT COALESCE(target_amount, 50000)
    INTO v_goal
    FROM public.community_funding
   WHERE id = '00000000-0000-0000-0000-000000000001';
  IF v_goal IS NULL THEN v_goal := 50000; END IF;

  v_remaining  := GREATEST(0, v_goal - v_raised);
  v_percentage := CASE WHEN v_goal > 0
    THEN LEAST(100, ROUND((v_raised / v_goal) * 100, 2))
    ELSE 0
  END;

  RETURN jsonb_build_object(
    'raised',      v_raised,
    'remaining',   v_remaining,
    'goal',        v_goal,
    'supporters',  v_supporters,
    'percentage',  v_percentage
  );
END $$;

-- 5. Atomic create-pending RPC -------------------------------------------
-- Single transaction: takes a per-user advisory lock, opportunistically
-- expires stale pending rows for that user, enforces the sliding-window
-- anti-spam cap, then inserts the new pending row. Returning a row id keeps
-- the API surface identical to the prior raw insert.
--
-- Failure modes are signalled via the returned jsonb shape so the route can
-- map them to user-facing codes without parsing SQLSTATE strings:
--   { ok: false, code: 'TOO_MANY_REQUESTS' }
--   { ok: false, code: 'AMOUNT_BELOW_MIN' | 'AMOUNT_ABOVE_MAX' }
--   { ok: true,  id:   <uuid> }
--
-- pg_advisory_xact_lock is released automatically at COMMIT/ROLLBACK so a
-- crashed transaction can never leave a user permanently locked out.
-- Tunables are hardcoded inside the function so that even if EXECUTE on this
-- SECURITY DEFINER routine ever leaks to a non-trusted role, callers cannot
-- relax the rate limit by passing larger windows / caps.
CREATE OR REPLACE FUNCTION public.create_pending_community_support(
  p_user_id          uuid,
  p_amount_centavos  integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c_window_seconds  constant integer := 60;
  c_max_in_window   constant integer := 3;
  v_recent          integer;
  v_id              uuid;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'UNAUTHENTICATED');
  END IF;
  IF p_amount_centavos IS NULL OR p_amount_centavos < 5000 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'AMOUNT_BELOW_MIN');
  END IF;
  IF p_amount_centavos > 1000000 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'AMOUNT_ABOVE_MAX');
  END IF;

  -- Per-user transactional advisory lock — serialises concurrent calls
  -- from the same user without blocking any other user.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));

  -- Opportunistic expiration for THIS user only — keeps the count below
  -- bounded by recent abandons rather than all-time abandons.
  UPDATE public.community_support
     SET status = 'expired', updated_at = now()
   WHERE user_id    = p_user_id
     AND status     = 'pending'
     AND created_at < (now() - interval '30 minutes');

  -- Anti-spam window check (atomic with the insert below).
  SELECT COUNT(*) INTO v_recent
    FROM public.community_support
   WHERE user_id    = p_user_id
     AND status     = 'pending'
     AND created_at >= (now() - make_interval(secs => c_window_seconds));

  IF v_recent >= c_max_in_window THEN
    RETURN jsonb_build_object('ok', false, 'code', 'TOO_MANY_REQUESTS');
  END IF;

  INSERT INTO public.community_support (user_id, amount_centavos, status)
       VALUES (p_user_id, p_amount_centavos, 'pending')
    RETURNING id INTO v_id;

  RETURN jsonb_build_object('ok', true, 'id', v_id);
END $$;

-- 6. Lock down direct table access ---------------------------------------
-- Migration 36 created an RLS policy that let authenticated clients INSERT
-- their own pending rows directly. That defeats the anti-spam RPC because
-- a malicious client using the Supabase anon/auth key could insert raw
-- rows. The API uses service_role (bypasses RLS), so dropping the policy
-- has no effect on the legitimate flow. Reads stay open under the
-- existing read policy.
DROP POLICY IF EXISTS users_insert_own_support ON public.community_support;

-- 7. Lock down RPC execution ---------------------------------------------
-- All three RPCs must only be callable by service_role. The API server is
-- the only legitimate caller; the anon/authenticated keys must not be able
-- to invoke them directly. We revoke from PUBLIC (covers anon + authenticated
-- inherits) and explicitly grant to service_role for clarity.
REVOKE EXECUTE ON FUNCTION public.create_pending_community_support(uuid, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.expire_stale_community_support()                FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.community_support_stats()                       FROM PUBLIC;

GRANT  EXECUTE ON FUNCTION public.create_pending_community_support(uuid, integer) TO service_role;
GRANT  EXECUTE ON FUNCTION public.expire_stale_community_support()                TO service_role;
GRANT  EXECUTE ON FUNCTION public.community_support_stats()                       TO service_role;

-- 8. Lock down the migration-36 finalize RPC ----------------------------
-- paymongo_finalize_support is SECURITY DEFINER and credits community_funding
-- atomically. Migration 36 shipped without an EXECUTE lockdown, which means
-- an authenticated client could in theory invoke it directly with a pending
-- row's ref + a forged payment_id and credit the fund without paying.
-- The webhook (service_role) is the only legitimate caller — revoke from
-- PUBLIC and grant explicitly to service_role.
REVOKE EXECUTE ON FUNCTION public.paymongo_finalize_support(uuid, text, text, jsonb) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.paymongo_finalize_support(uuid, text, text, jsonb) TO   service_role;

COMMIT;
