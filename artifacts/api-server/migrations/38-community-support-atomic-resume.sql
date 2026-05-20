-- =====================================================================
-- Migration 38 — community_support: atomic "resume-or-create" RPC
-- =====================================================================
-- Phase-2 follow-up. The previous Phase-2 implementation did the
-- "find a resumable pending row" lookup OUTSIDE the advisory lock and
-- then called create_pending_community_support() to insert a fresh row
-- if none was found. That two-step pattern has a real race: two near-
-- simultaneous taps can both miss the resume row (because the first
-- request hasn't written the PayMongo session_id to raw_session yet)
-- and then both fall through and create new pending rows + new
-- PayMongo sessions, defeating the idempotency goal.
--
-- This migration ships a single atomic function that, under the SAME
-- per-user advisory lock used by create_pending_community_support():
--   1. Expires this user's stale pending rows (>30 min).
--   2. Looks for a *fully-armed* resumable pending row (same amount,
--      created < 25 min ago, has paymongo_session_id) and returns it.
--   3. Looks for a *recently-claimed* pending row with no session yet
--      (created in last 90s, same amount) — this is the racing-twin
--      case where another request inside this user is mid-flight.
--      Returns it with armed=false so the caller can either wait or
--      surface a friendly "checkout already starting" message.
--   4. Otherwise enforces the same sliding-window rate limit
--      (3 rows / 60s) and INSERTs a brand new pending row.
--
-- All four branches happen under one advisory lock, so concurrent taps
-- from the same user are serialized and only one new PayMongo session
-- can ever be created per (user, amount) window. Idempotent.
--
-- Returns a single row: (support_id uuid, was_created boolean, armed boolean)
--   was_created=true  → caller MUST hit PayMongo and persist session/url
--   was_created=false → caller can reuse the existing checkout_url
--   armed=true        → row already has paymongo_session_id + raw_session
--   armed=false       → row exists but session not yet attached (race)
-- =====================================================================

CREATE OR REPLACE FUNCTION public.create_or_resume_pending_community_support(
  p_user_id          uuid,
  p_amount_centavos  integer
)
RETURNS TABLE (
  support_id   uuid,
  was_created  boolean,
  armed        boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c_window_secs    constant integer := 60;   -- rate-limit window
  c_max_per_window constant integer := 3;    -- rate-limit cap
  c_resume_secs    constant integer := 25 * 60;  -- session-resume horizon
  c_race_secs      constant integer := 90;       -- twin-race horizon
  v_pending_count  integer;
  v_existing_id    uuid;
  v_new_id         uuid;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'USER_ID_REQUIRED';
  END IF;
  IF p_amount_centavos IS NULL OR p_amount_centavos < 5000 OR p_amount_centavos > 1000000 THEN
    RAISE EXCEPTION 'INVALID_AMOUNT';
  END IF;

  -- Per-user advisory lock — serialises concurrent taps from the same
  -- user without blocking anyone else. Released at transaction end.
  PERFORM pg_advisory_xact_lock(hashtext('community_support:' || p_user_id::text));

  -- Opportunistically expire this user's stale pending rows so they
  -- can't pollute the resume / rate-limit checks below.
  UPDATE community_support
     SET status = 'expired'
   WHERE user_id = p_user_id
     AND status  = 'pending'
     AND created_at < (now() - interval '30 minutes');

  -- 1. Fully-armed resumable row: same amount, recent, has session.
  SELECT id INTO v_existing_id
    FROM community_support
   WHERE user_id          = p_user_id
     AND status           = 'pending'
     AND amount_centavos  = p_amount_centavos
     AND paymongo_session_id IS NOT NULL
     AND created_at       > (now() - make_interval(secs => c_resume_secs))
   ORDER BY created_at DESC
   LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    RETURN QUERY SELECT v_existing_id, false, true;
    RETURN;
  END IF;

  -- 2. Racing-twin row: another request created a pending row very
  --    recently but hasn't attached the PayMongo session yet. Hand it
  --    back unarmed so the caller can take ownership of arming it
  --    (or surface a friendly retry).
  SELECT id INTO v_existing_id
    FROM community_support
   WHERE user_id          = p_user_id
     AND status           = 'pending'
     AND amount_centavos  = p_amount_centavos
     AND paymongo_session_id IS NULL
     AND created_at       > (now() - make_interval(secs => c_race_secs))
   ORDER BY created_at DESC
   LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    RETURN QUERY SELECT v_existing_id, false, false;
    RETURN;
  END IF;

  -- 3. Rate limit: at most c_max_per_window pending rows per c_window_secs.
  SELECT count(*) INTO v_pending_count
    FROM community_support
   WHERE user_id     = p_user_id
     AND status      = 'pending'
     AND created_at  > (now() - make_interval(secs => c_window_secs));

  IF v_pending_count >= c_max_per_window THEN
    RAISE EXCEPTION 'RATE_LIMIT_EXCEEDED';
  END IF;

  -- 4. Create a brand-new pending row.
  INSERT INTO community_support (user_id, amount_centavos, status)
       VALUES (p_user_id, p_amount_centavos, 'pending')
    RETURNING id INTO v_new_id;

  RETURN QUERY SELECT v_new_id, true, false;
END;
$$;

-- Lock down EXECUTE so only the service role can call this. Same posture
-- as the Phase-1 RPCs (migration 37).
REVOKE EXECUTE ON FUNCTION public.create_or_resume_pending_community_support(uuid, integer) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.create_or_resume_pending_community_support(uuid, integer) TO service_role;
