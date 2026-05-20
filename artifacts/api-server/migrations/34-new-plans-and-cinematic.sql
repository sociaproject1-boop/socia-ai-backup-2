-- Migration 34: New plan catalogue + AI Cinematic Studio add-on tracking.
-- Idempotent. Safe to re-run.
--
-- Adds support for four new chat/cinematic plan codes:
--   premium      ₱499  / 4,500  credits / 30 days
--   elite        ₱1499 / 9,000  credits / 30 days
--   super_elite  ₱3999 / 15,000 credits / 30 days
--   cinematic    ₱3000 / 10 scenes / 30 days  (parallel add-on; does not replace chat plan)
--
-- Existing p15 / p30 / premium / ultra subscribers keep their active expiry
-- until it runs out, then drop to free naturally — no destructive update here.

BEGIN;

-- 1. Widen the CHECK constraint on public.users.plan_code to accept the new
--    chat plan codes alongside legacy values. The drop + add live in the
--    same transaction so there is never a window where the table has no
--    plan_code check.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT conname
      FROM pg_constraint
     WHERE conrelid = 'public.users'::regclass
       AND contype = 'c'
       AND pg_get_constraintdef(oid) ILIKE '%plan_code%'
  LOOP
    EXECUTE format('ALTER TABLE public.users DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;

ALTER TABLE public.users
  ADD CONSTRAINT users_plan_code_check
  CHECK (plan_code IN ('free','premium','elite','super_elite','ultra','p15','p30'));

-- 2. AI Cinematic Studio add-on columns. These live in parallel with the
--    chat plan (plan_code / plan_expires_at) — a user can hold both.
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS cinematic_expires_at         timestamptz,
  ADD COLUMN IF NOT EXISTS cinematic_scenes_remaining   integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_users_cinematic_expires
  ON public.users(cinematic_expires_at)
  WHERE cinematic_expires_at IS NOT NULL;

-- 3. Atomic grant functions. We call these from the PayMongo webhook handler
--    instead of doing read-then-write in app code. Postgres takes a row lock
--    during UPDATE, so concurrent webhook deliveries for the same user that
--    target different payment rows can no longer lose credits/scenes via
--    interleaved baseline reads. Expiry stacking uses GREATEST so a still-
--    active plan extends from its current expiry; an expired/missing one
--    starts from now().

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

-- Service role only; never called from the client. We REVOKE PUBLIC then
-- explicitly GRANT EXECUTE to service_role so the webhook (which runs with
-- the service-role client) can call these RPCs. Without the explicit GRANT,
-- depending on Supabase defaults, the call could silently fail and leave a
-- paid row uncredited (webhook intentionally swallows grant errors after
-- the status flip so PayMongo doesn't retry).
REVOKE ALL ON FUNCTION public.grant_paymongo_chat_plan(uuid, text, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.grant_paymongo_cinematic(uuid, integer, integer)        FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.grant_paymongo_chat_plan(uuid, text, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.grant_paymongo_cinematic(uuid, integer, integer)        TO service_role;

COMMIT;
