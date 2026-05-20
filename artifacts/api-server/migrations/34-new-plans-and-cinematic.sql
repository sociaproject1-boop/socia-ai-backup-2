-- Migration 34: New plan catalogue + AI Cinematic Studio add-on tracking.
-- Idempotent and DEFENSIVE — makes NO assumptions about which billing
-- columns already exist on public.users. Safe to re-run.
--
-- Adds support for four new chat/cinematic plan codes:
--   premium      ₱499  / 4,500  credits / 30 days
--   elite        ₱1499 / 9,000  credits / 30 days
--   super_elite  ₱3999 / 15,000 credits / 30 days
--   cinematic    ₱3000 / 10 scenes / 30 days  (parallel add-on)
--
-- Strategy:
--   1. Ensure ALL billing columns exist on public.users (IF NOT EXISTS).
--      This covers fresh databases that never had p15/p30 billing.
--   2. Drop any old CHECK constraint referencing plan_code, add new one
--      that permits free/premium/elite/super_elite plus legacy codes.
--   3. Create atomic grant RPCs (replaces read-then-write in app code).
--   4. Grant execute to service_role explicitly so the webhook can call them.

BEGIN;

-- 1. Ensure billing columns exist on public.users. We use IF NOT EXISTS so
--    this never errors on databases where these columns are already present.
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS plan_code                    text       DEFAULT 'free',
  ADD COLUMN IF NOT EXISTS plan_expires_at              timestamptz,
  ADD COLUMN IF NOT EXISTS credits                      integer    NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cinematic_expires_at         timestamptz,
  ADD COLUMN IF NOT EXISTS cinematic_scenes_remaining   integer    NOT NULL DEFAULT 0;

-- Backfill any NULL plan_code rows to 'free' so the CHECK constraint added
-- below can never reject a pre-existing row.
UPDATE public.users SET plan_code = 'free' WHERE plan_code IS NULL;

-- 2. Drop any existing CHECK constraint on public.users that references
--    plan_code (we don't know the name across environments), then add a
--    known one. Both happen in this transaction so there's never a window
--    with no constraint.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT conname
      FROM pg_constraint
     WHERE conrelid = 'public.users'::regclass
       AND contype  = 'c'
       AND pg_get_constraintdef(oid) ILIKE '%plan_code%'
  LOOP
    EXECUTE format('ALTER TABLE public.users DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;

ALTER TABLE public.users
  ADD CONSTRAINT users_plan_code_check
  CHECK (plan_code IN ('free','premium','elite','super_elite','ultra','p15','p30'));

CREATE INDEX IF NOT EXISTS idx_users_plan_expires
  ON public.users(plan_expires_at)
  WHERE plan_expires_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_users_cinematic_expires
  ON public.users(cinematic_expires_at)
  WHERE cinematic_expires_at IS NOT NULL;

-- 3. Atomic grant functions. Webhook calls these instead of read-then-write
--    so concurrent deliveries for the same user (different payment refs)
--    cannot lose credits/scenes via interleaved baseline reads.
--    Expiry stacking: GREATEST(now, current_expiry) + N days.

CREATE OR REPLACE FUNCTION public.grant_paymongo_chat_plan(
  p_user_id        uuid,
  p_plan_code      text,
  p_credits        integer,
  p_duration_days  integer
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.users
     SET credits         = COALESCE(credits, 0) + p_credits,
         plan_code       = p_plan_code,
         plan_expires_at = GREATEST(now(), COALESCE(plan_expires_at, now()))
                         + make_interval(days => p_duration_days)
   WHERE id = p_user_id;
END $$;

CREATE OR REPLACE FUNCTION public.grant_paymongo_cinematic(
  p_user_id        uuid,
  p_scenes         integer,
  p_duration_days  integer
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.users
     SET cinematic_scenes_remaining = COALESCE(cinematic_scenes_remaining, 0) + p_scenes,
         cinematic_expires_at       = GREATEST(now(), COALESCE(cinematic_expires_at, now()))
                                    + make_interval(days => p_duration_days)
   WHERE id = p_user_id;
END $$;

-- 4. Service-role only. REVOKE PUBLIC then explicit GRANT to service_role
--    so the webhook (which uses the service-role client) can call these.
--    Without the explicit GRANT, the call could silently fail and leave a
--    paid row uncredited.
REVOKE ALL ON FUNCTION public.grant_paymongo_chat_plan(uuid, text, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.grant_paymongo_cinematic(uuid, integer, integer)        FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.grant_paymongo_chat_plan(uuid, text, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.grant_paymongo_cinematic(uuid, integer, integer)        TO service_role;

COMMIT;
