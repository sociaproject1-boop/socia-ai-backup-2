-- Migration 35: Creator-friendly daily quota + soft-limit system.
-- Idempotent, defensive, safe to re-run. Builds on migration 34.
--
-- Concept:
--   * Replaces credit-pool model with per-day soft quotas per content type
--     (chat / image / video).
--   * NEVER hard-blocks users — when daily quota is exceeded, render code
--     reads "economy" status from consume_usage() and degrades quality/queue
--     priority instead of refusing the request.
--   * Cinematic Studio: 10 projects/month is a soft cap; further projects
--     return "economy" status so creators are never frustrated.
--   * priority_tier drives render queue priority (3=super_elite, 2=elite,
--     1=premium, 0=free).
--
-- This migration ONLY adds data + grant infrastructure. Wiring the render
-- pipeline (renderWorker.ts, generateImage/Video routes, chat handler) to
-- actually consume the status returned by consume_usage() is Phase 2.

BEGIN;

-- 1. Creator-system columns on public.users. All IF NOT EXISTS so this is
--    safe on databases that have partial migrations applied.
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS priority_tier                  smallint    NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS daily_chat_used                integer     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS daily_image_used               integer     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS daily_video_used               integer     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS daily_chat_quota               integer     NOT NULL DEFAULT 20,
  ADD COLUMN IF NOT EXISTS daily_image_quota              integer     NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS daily_video_quota              integer     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS daily_reset_at                 timestamptz NOT NULL DEFAULT (date_trunc('day', now()) + interval '1 day'),
  ADD COLUMN IF NOT EXISTS cinematic_projects_remaining   integer     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cinematic_projects_used_month  integer     NOT NULL DEFAULT 0;

-- 2. Replace grant_paymongo_chat_plan so it ALSO refreshes daily quotas
--    and sets priority_tier when a paid chat plan is granted. We DROP first
--    because the signature changes (adds three new int params).
DROP FUNCTION IF EXISTS public.grant_paymongo_chat_plan(uuid, text, integer, integer);

CREATE OR REPLACE FUNCTION public.grant_paymongo_chat_plan(
  p_user_id           uuid,
  p_plan_code         text,
  p_credits           integer,
  p_duration_days     integer,
  p_daily_chat        integer,
  p_daily_image       integer,
  p_daily_video       integer,
  p_priority_tier     smallint
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE public.users
     SET credits            = COALESCE(credits, 0) + p_credits,
         plan_code          = p_plan_code,
         plan_expires_at    = GREATEST(now(), COALESCE(plan_expires_at, now()))
                            + make_interval(days => p_duration_days),
         priority_tier      = p_priority_tier,
         daily_chat_quota   = p_daily_chat,
         daily_image_quota  = p_daily_image,
         daily_video_quota  = p_daily_video,
         -- Reset today's counters so the user immediately gets a fresh day
         -- on upgrade. Next reset still rolls at UTC midnight.
         daily_chat_used    = 0,
         daily_image_used   = 0,
         daily_video_used   = 0,
         daily_reset_at     = date_trunc('day', now()) + interval '1 day'
   WHERE id = p_user_id;

  -- If the user row is missing (no FK on paymongo_payments.user_id in
  -- legacy schemas), the UPDATE silently no-ops. RAISE here so the calling
  -- finalize transaction rolls back and PayMongo retries — never let a
  -- payment terminate as "paid" without a real entitlement applied.
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'grant_paymongo_chat_plan: user % not found (rows=%)', p_user_id, v_count
      USING ERRCODE = 'no_data_found';
  END IF;
END $$;

-- 3. Replace grant_paymongo_cinematic to use the new project model.
DROP FUNCTION IF EXISTS public.grant_paymongo_cinematic(uuid, integer, integer);

CREATE OR REPLACE FUNCTION public.grant_paymongo_cinematic(
  p_user_id        uuid,
  p_projects       integer,
  p_duration_days  integer
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE public.users
     SET cinematic_projects_remaining = COALESCE(cinematic_projects_remaining, 0) + p_projects,
         cinematic_projects_used_month = 0,
         cinematic_expires_at          = GREATEST(now(), COALESCE(cinematic_expires_at, now()))
                                       + make_interval(days => p_duration_days)
   WHERE id = p_user_id;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'grant_paymongo_cinematic: user % not found (rows=%)', p_user_id, v_count
      USING ERRCODE = 'no_data_found';
  END IF;
END $$;

-- 4. consume_usage(): atomic per-content-type consumption with soft-limit
--    degradation. Returns JSON the application uses to decide render quality.
--
--    Returns:
--      { status: "normal" | "economy" | "high_demand",
--        used: int, quota: int, priority_tier: int }
--
--    Status meaning:
--      normal      — under quota, full quality, normal queue priority
--      economy     — over quota, render in low-priority economy mode
--      high_demand — far over quota (>2x), heaviest degradation, slowest queue
--
--    NEVER returns "blocked" — soft-limit philosophy.
CREATE OR REPLACE FUNCTION public.consume_usage(
  p_user_id  uuid,
  p_kind     text       -- 'chat' | 'image' | 'video'
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user        public.users%ROWTYPE;
  v_used        integer;
  v_quota       integer;
  v_status      text;
BEGIN
  -- Lazy daily reset: if we've rolled past daily_reset_at, zero counters
  -- and bump reset to next UTC midnight. Single UPDATE — no race.
  UPDATE public.users
     SET daily_chat_used  = 0,
         daily_image_used = 0,
         daily_video_used = 0,
         daily_reset_at   = date_trunc('day', now()) + interval '1 day'
   WHERE id = p_user_id
     AND now() >= daily_reset_at;

  -- Atomically increment the right counter and read its post-increment
  -- value plus the quota in one shot.
  IF p_kind = 'chat' THEN
    UPDATE public.users
       SET daily_chat_used = daily_chat_used + 1
     WHERE id = p_user_id
     RETURNING daily_chat_used, daily_chat_quota, priority_tier
        INTO v_used, v_quota, v_user.priority_tier;
  ELSIF p_kind = 'image' THEN
    UPDATE public.users
       SET daily_image_used = daily_image_used + 1
     WHERE id = p_user_id
     RETURNING daily_image_used, daily_image_quota, priority_tier
        INTO v_used, v_quota, v_user.priority_tier;
  ELSIF p_kind = 'video' THEN
    UPDATE public.users
       SET daily_video_used = daily_video_used + 1
     WHERE id = p_user_id
     RETURNING daily_video_used, daily_video_quota, priority_tier
        INTO v_used, v_quota, v_user.priority_tier;
  ELSE
    RAISE EXCEPTION 'consume_usage: invalid kind %', p_kind;
  END IF;

  -- Determine soft-limit status. Quota=0 (e.g. free user video) still
  -- yields a status; render code can decide to refuse only when economic
  -- limits truly bite (Phase 2). 2x quota = high_demand, anything over
  -- quota = economy, otherwise normal.
  IF v_quota IS NULL OR v_quota <= 0 THEN
    v_status := 'economy';
  ELSIF v_used <= v_quota THEN
    v_status := 'normal';
  ELSIF v_used <= v_quota * 2 THEN
    v_status := 'economy';
  ELSE
    v_status := 'high_demand';
  END IF;

  RETURN jsonb_build_object(
    'status',        v_status,
    'used',          v_used,
    'quota',         v_quota,
    'priority_tier', COALESCE(v_user.priority_tier, 0)
  );
END $$;

-- 5. consume_cinematic_project(): same soft-limit pattern for cinematic
--    monthly project quota. Returns status; never blocks.
CREATE OR REPLACE FUNCTION public.consume_cinematic_project(
  p_user_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_used   integer;
  v_remain integer;
  v_status text;
BEGIN
  -- Cinematic monthly quota is 10 (set by grant_paymongo_cinematic). Status
  -- is derived from used count, NOT from post-decrement remaining, so the
  -- 10th project of the month resolves to 'normal' rather than 'economy'.
  UPDATE public.users
     SET cinematic_projects_used_month  = cinematic_projects_used_month + 1,
         cinematic_projects_remaining   = GREATEST(0, cinematic_projects_remaining - 1)
   WHERE id = p_user_id
   RETURNING cinematic_projects_used_month, cinematic_projects_remaining
      INTO v_used, v_remain;

  IF v_used <= 10 THEN
    v_status := 'normal';
  ELSIF v_used <= 20 THEN
    v_status := 'economy';
  ELSE
    v_status := 'high_demand';
  END IF;

  RETURN jsonb_build_object(
    'status',    v_status,
    'used',      v_used,
    'remaining', v_remain
  );
END $$;

-- 6. Atomic claim+grant RPCs for the PayMongo webhook.
--
-- These wrap "flip paymongo_payments.status to paid" AND "apply entitlement"
-- into a single transaction. If grant fails for any reason, the whole TX
-- rolls back and the payment row stays pending — PayMongo's retry will then
-- re-attempt cleanly. This eliminates the previous "paid-without-grant"
-- failure mode where the Node process could crash between two separate
-- statements.
--
-- Idempotency: built into the function — duplicate event IDs and
-- already-paid rows return a "no-op" status without touching anything.
-- This is safe even under concurrent webhook delivery because the row
-- is locked FOR UPDATE before any decision is made.
--
-- Returns:
--   { result: 'granted' | 'already_paid' | 'duplicate' | 'not_found',
--     credits_added: int }

CREATE OR REPLACE FUNCTION public.paymongo_finalize_chat(
  p_payment_id            uuid,
  p_paymongo_payment_id   text,
  p_event_id              text,
  p_event                 jsonb,
  p_plan_code_db          text,
  p_credits               integer,
  p_duration_days         integer,
  p_daily_chat            integer,
  p_daily_image           integer,
  p_daily_video           integer,
  p_priority_tier         smallint
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row paymongo_payments%ROWTYPE;
BEGIN
  -- Lock the row; idempotency decisions made under this lock.
  SELECT * INTO v_row FROM public.paymongo_payments WHERE id = p_payment_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('result','not_found','credits_added',0);
  END IF;

  IF p_event_id IS NOT NULL AND v_row.processed_event_ids IS NOT NULL
     AND p_event_id = ANY(v_row.processed_event_ids) THEN
    RETURN jsonb_build_object('result','duplicate','credits_added',0);
  END IF;

  IF v_row.status = 'paid' THEN
    RETURN jsonb_build_object('result','already_paid','credits_added',0);
  END IF;

  -- Flip + grant atomically. If grant_paymongo_chat_plan raises (e.g. user
  -- row missing), the whole TX aborts and PayMongo will retry the webhook.
  UPDATE public.paymongo_payments
     SET status               = 'paid',
         paymongo_payment_id  = COALESCE(p_paymongo_payment_id, paymongo_payment_id),
         credits_added        = p_credits,
         paid_at              = now(),
         raw_event            = p_event,
         processed_event_ids  = CASE
                                  WHEN p_event_id IS NULL THEN processed_event_ids
                                  ELSE array_append(COALESCE(processed_event_ids, ARRAY[]::text[]), p_event_id)
                                END
   WHERE id = p_payment_id;

  PERFORM public.grant_paymongo_chat_plan(
    v_row.user_id, p_plan_code_db, p_credits, p_duration_days,
    p_daily_chat, p_daily_image, p_daily_video, p_priority_tier
  );

  RETURN jsonb_build_object('result','granted','credits_added',p_credits);
END $$;

CREATE OR REPLACE FUNCTION public.paymongo_finalize_cinematic(
  p_payment_id            uuid,
  p_paymongo_payment_id   text,
  p_event_id              text,
  p_event                 jsonb,
  p_projects              integer,
  p_duration_days         integer
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row paymongo_payments%ROWTYPE;
BEGIN
  SELECT * INTO v_row FROM public.paymongo_payments WHERE id = p_payment_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('result','not_found','credits_added',0);
  END IF;

  IF p_event_id IS NOT NULL AND v_row.processed_event_ids IS NOT NULL
     AND p_event_id = ANY(v_row.processed_event_ids) THEN
    RETURN jsonb_build_object('result','duplicate','credits_added',0);
  END IF;

  IF v_row.status = 'paid' THEN
    RETURN jsonb_build_object('result','already_paid','credits_added',0);
  END IF;

  UPDATE public.paymongo_payments
     SET status               = 'paid',
         paymongo_payment_id  = COALESCE(p_paymongo_payment_id, paymongo_payment_id),
         credits_added        = p_projects,
         paid_at              = now(),
         raw_event            = p_event,
         processed_event_ids  = CASE
                                  WHEN p_event_id IS NULL THEN processed_event_ids
                                  ELSE array_append(COALESCE(processed_event_ids, ARRAY[]::text[]), p_event_id)
                                END
   WHERE id = p_payment_id;

  PERFORM public.grant_paymongo_cinematic(v_row.user_id, p_projects, p_duration_days);

  RETURN jsonb_build_object('result','granted','credits_added',p_projects);
END $$;

-- 7. Grants. Service role only — never callable from the client directly.
REVOKE ALL ON FUNCTION public.grant_paymongo_chat_plan(uuid, text, integer, integer, integer, integer, integer, smallint) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.grant_paymongo_cinematic(uuid, integer, integer)                                            FROM PUBLIC;
REVOKE ALL ON FUNCTION public.consume_usage(uuid, text)                                                                   FROM PUBLIC;
REVOKE ALL ON FUNCTION public.consume_cinematic_project(uuid)                                                             FROM PUBLIC;
REVOKE ALL ON FUNCTION public.paymongo_finalize_chat(uuid, text, text, jsonb, text, integer, integer, integer, integer, integer, smallint) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.paymongo_finalize_cinematic(uuid, text, text, jsonb, integer, integer)                                       FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.grant_paymongo_chat_plan(uuid, text, integer, integer, integer, integer, integer, smallint) TO service_role;
GRANT EXECUTE ON FUNCTION public.grant_paymongo_cinematic(uuid, integer, integer)                                            TO service_role;
GRANT EXECUTE ON FUNCTION public.consume_usage(uuid, text)                                                                   TO service_role;
GRANT EXECUTE ON FUNCTION public.consume_cinematic_project(uuid)                                                             TO service_role;
GRANT EXECUTE ON FUNCTION public.paymongo_finalize_chat(uuid, text, text, jsonb, text, integer, integer, integer, integer, integer, smallint) TO service_role;
GRANT EXECUTE ON FUNCTION public.paymongo_finalize_cinematic(uuid, text, text, jsonb, integer, integer)                                       TO service_role;

COMMIT;
