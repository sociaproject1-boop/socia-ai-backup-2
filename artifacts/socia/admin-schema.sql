-- ════════════════════════════════════════════════════════════════════════════
-- SUPER ADMIN ACCOUNT SYSTEM (idempotent)
--
-- Separate from public.users / auth.users. Admins authenticate against the
-- api-server with bcrypt + JWT (signed with SESSION_SECRET) and never receive
-- a Supabase session. All privileged DB writes are performed by the api-server
-- using the SUPABASE_SERVICE_ROLE_KEY which bypasses RLS.
--
-- Tables created here are LOCKED DOWN with RLS — no policies = no client
-- access. Only the service-role key can read/write them.
--
-- Run alongside billing-schema.sql (after, since this file references the
-- payment_orders / credit_ledger tables).
-- ════════════════════════════════════════════════════════════════════════════

-- ─── §1. super_admins ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.super_admins (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  username           TEXT        UNIQUE NOT NULL,
  email              TEXT        UNIQUE NOT NULL,
  password_hash      TEXT        NOT NULL,
  role               TEXT        NOT NULL DEFAULT 'super_admin'
                                 CHECK (role IN ('super_admin','admin','support','analyst')),
  totp_secret        TEXT,
  totp_enabled       BOOLEAN     NOT NULL DEFAULT FALSE,
  is_active          BOOLEAN     NOT NULL DEFAULT TRUE,
  failed_login_count INT         NOT NULL DEFAULT 0,
  locked_until       TIMESTAMPTZ,
  last_login_at      TIMESTAMPTZ,
  last_login_ip      TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by         UUID        REFERENCES public.super_admins(id) ON DELETE SET NULL
);

ALTER TABLE public.super_admins ENABLE ROW LEVEL SECURITY;
-- No policies → only service_role bypasses RLS. Anon/authenticated cannot read.
REVOKE ALL ON public.super_admins FROM PUBLIC, anon, authenticated;

-- ─── §2. admin_audit_log ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.admin_audit_log (
  id          BIGSERIAL   PRIMARY KEY,
  admin_id    UUID        REFERENCES public.super_admins(id) ON DELETE SET NULL,
  username    TEXT,
  action      TEXT        NOT NULL,
  target_type TEXT,
  target_id   TEXT,
  meta        JSONB,
  ip          TEXT,
  user_agent  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS admin_audit_log_admin_idx   ON public.admin_audit_log (admin_id, created_at DESC);
CREATE INDEX IF NOT EXISTS admin_audit_log_action_idx  ON public.admin_audit_log (action,   created_at DESC);
ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.admin_audit_log FROM PUBLIC, anon, authenticated;

-- ─── §3. admin_settings (runtime engine config) ────────────────────────────
CREATE TABLE IF NOT EXISTS public.admin_settings (
  id                          INT         PRIMARY KEY DEFAULT 1,
  cooldown_threshold_1        INT         NOT NULL DEFAULT 200,
  cooldown_window_1_min       INT         NOT NULL DEFAULT 30,
  cooldown_duration_1_min     INT         NOT NULL DEFAULT 5,
  cooldown_threshold_2        INT         NOT NULL DEFAULT 500,
  cooldown_window_2_min       INT         NOT NULL DEFAULT 120,
  cooldown_duration_2_min     INT         NOT NULL DEFAULT 15,
  smart_saver_threshold_pct   INT         NOT NULL DEFAULT 15,
  default_image_model         TEXT        NOT NULL DEFAULT 'gpt-image-1',
  default_video_model         TEXT        NOT NULL DEFAULT 'fal-ai/wan-25',
  free_daily_image_limit      INT         NOT NULL DEFAULT 3,
  ai_features_enabled         BOOLEAN     NOT NULL DEFAULT TRUE,
  registration_enabled        BOOLEAN     NOT NULL DEFAULT TRUE,
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by                  UUID,
  CHECK (id = 1)
);
INSERT INTO public.admin_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.admin_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admin_settings_world_read" ON public.admin_settings;
CREATE POLICY "admin_settings_world_read" ON public.admin_settings
  FOR SELECT USING (TRUE);
-- Writes go via api-server with service role.

-- ─── §3b. bootstrap_first_super_admin (race-safe first-admin creation) ────
-- Ensures only one super_admin can be created via the unauthenticated
-- "setup" endpoint, even under parallel requests. Uses a transactional
-- advisory lock + count check so simultaneous setups can't both succeed.
CREATE OR REPLACE FUNCTION public.bootstrap_first_super_admin(
  p_username TEXT, p_email TEXT, p_password_hash TEXT
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  new_id UUID;
  existing INT;
BEGIN
  PERFORM pg_advisory_xact_lock(8472847284::BIGINT);
  SELECT COUNT(*) INTO existing FROM public.super_admins;
  IF existing > 0 THEN
    RAISE EXCEPTION 'setup_already_done' USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.super_admins (username, email, password_hash, role, is_active)
  VALUES (p_username, p_email, p_password_hash, 'super_admin', TRUE)
  RETURNING id INTO new_id;
  RETURN new_id;
END;
$$;
REVOKE ALL ON FUNCTION public.bootstrap_first_super_admin(TEXT,TEXT,TEXT) FROM PUBLIC, anon, authenticated;

-- ─── §4. admin_v2_* RPCs (callable by service_role only) ───────────────────
-- These mirror the existing approve_payment / reject_payment / admin_adjust_credits
-- functions but DO NOT check auth.uid(), since super-admins have no Supabase
-- auth session. The grants below restrict them to the service role.

CREATE OR REPLACE FUNCTION public.admin_v2_approve_payment(p_order_id UUID, p_admin_id UUID)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  o           public.payment_orders%ROWTYPE;
  cur_credits INT;
  new_credits INT;
  cur_expires TIMESTAMPTZ;
  new_expires TIMESTAMPTZ;
  plan_row    public.plans%ROWTYPE;
BEGIN
  SELECT * INTO o FROM public.payment_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'order not found'; END IF;
  IF o.status <> 'pending' THEN RAISE EXCEPTION 'order is not pending (status=%)', o.status; END IF;

  -- Ensure billing row exists, then lock it.
  INSERT INTO public.user_billing (user_id, plan_code) VALUES (o.user_id, 'free')
    ON CONFLICT (user_id) DO NOTHING;
  SELECT credits INTO cur_credits FROM public.user_billing WHERE user_id = o.user_id FOR UPDATE;
  cur_credits := COALESCE(cur_credits, 0);
  new_credits := cur_credits + COALESCE(o.credits_to_grant, 0);

  -- Subscription handling
  IF o.kind = 'subscription' AND o.plan_code IS NOT NULL THEN
    SELECT * INTO plan_row FROM public.plans WHERE code = o.plan_code;
    SELECT plan_expires_at INTO cur_expires FROM public.user_billing WHERE user_id = o.user_id;
    new_expires := GREATEST(COALESCE(cur_expires, NOW()), NOW())
                 + (COALESCE(plan_row.duration_days, 30) || ' days')::INTERVAL;
    UPDATE public.user_billing
       SET plan_code        = o.plan_code,
           plan_credits     = COALESCE(plan_row.credits, o.credits_to_grant),
           credits          = new_credits,
           plan_started_at  = COALESCE(plan_started_at, NOW()),
           plan_expires_at  = new_expires,
           total_spent_php  = COALESCE(total_spent_php, 0) + COALESCE(o.amount_php, 0),
           updated_at       = NOW()
     WHERE user_id = o.user_id;
    -- Mirror badge state on public.users
    UPDATE public.users
       SET is_verified         = TRUE,
           subscription_status = CASE WHEN is_owner THEN 'owner' ELSE 'active' END
     WHERE id = o.user_id;
  ELSE
    UPDATE public.user_billing
       SET credits         = new_credits,
           total_spent_php = COALESCE(total_spent_php, 0) + COALESCE(o.amount_php, 0),
           updated_at      = NOW()
     WHERE user_id = o.user_id;
  END IF;

  -- Ledger entry
  INSERT INTO public.credit_ledger (user_id, delta, reason, ref_id, balance_after)
  VALUES (o.user_id, COALESCE(o.credits_to_grant, 0),
          CASE WHEN o.kind='subscription' THEN 'plan:'||COALESCE(o.plan_code,'?')
               ELSE 'topup:'||COALESCE(o.topup_code,'?') END,
          o.id::TEXT, new_credits);

  -- Mark order
  UPDATE public.payment_orders
     SET status = 'approved', reviewed_at = NOW(), reviewed_by = p_admin_id
   WHERE id = o.id;

  RETURN json_build_object('ok', TRUE, 'credits', new_credits, 'expires_at', new_expires);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_v2_reject_payment(p_order_id UUID, p_reason TEXT, p_admin_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.payment_orders
     SET status = 'rejected', rejection_reason = p_reason, reviewed_at = NOW(), reviewed_by = p_admin_id
   WHERE id = p_order_id AND status = 'pending';
  IF NOT FOUND THEN RAISE EXCEPTION 'order not found or not pending'; END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_v2_adjust_credits(p_user UUID, p_delta INT, p_reason TEXT, p_admin_id UUID)
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE new_bal INT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = p_user) THEN
    RAISE EXCEPTION 'user not found';
  END IF;
  INSERT INTO public.user_billing (user_id, plan_code) VALUES (p_user, 'free')
    ON CONFLICT (user_id) DO NOTHING;
  UPDATE public.user_billing
     SET credits = GREATEST(COALESCE(credits,0) + p_delta, 0),
         updated_at = NOW()
   WHERE user_id = p_user
   RETURNING credits INTO new_bal;
  INSERT INTO public.credit_ledger (user_id, delta, reason, ref_id, balance_after)
  VALUES (p_user, p_delta, COALESCE(p_reason,'admin_adjust'), p_admin_id::TEXT, new_bal);
  RETURN new_bal;
END;
$$;

-- Lock down: only service_role can execute these
REVOKE ALL ON FUNCTION public.admin_v2_approve_payment(UUID,UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_v2_reject_payment(UUID,TEXT,UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_v2_adjust_credits(UUID,INT,TEXT,UUID) FROM PUBLIC, anon, authenticated;

-- ─── §5. Helper view for analytics (read by service_role) ─────────────────
CREATE OR REPLACE VIEW public.admin_metrics AS
SELECT
  (SELECT COUNT(*) FROM public.users)                                              AS total_users,
  (SELECT COUNT(*) FROM public.user_billing WHERE plan_expires_at > NOW())         AS active_subs,
  (SELECT COUNT(*) FROM public.users WHERE is_verified)                            AS verified_users,
  (SELECT COUNT(*) FROM public.payment_orders WHERE status='pending')              AS pending_orders,
  (SELECT COUNT(*) FROM public.payment_orders WHERE status='approved'
     AND created_at > NOW() - INTERVAL '30 days')                                  AS approved_30d,
  (SELECT COALESCE(SUM(amount_php),0) FROM public.payment_orders WHERE status='approved'
     AND created_at > NOW() - INTERVAL '30 days')                                  AS revenue_30d_php,
  (SELECT COUNT(*) FROM public.payment_orders WHERE flagged AND status='pending')  AS flagged_pending;
REVOKE ALL ON public.admin_metrics FROM PUBLIC, anon, authenticated;

-- ─── §6. User safety / moderation columns (idempotent) ────────────────────
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS is_banned         BOOLEAN     NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS is_suspended      BOOLEAN     NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS suspension_reason TEXT,
  ADD COLUMN IF NOT EXISTS credits_frozen    BOOLEAN     NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS support_notes     TEXT,
  ADD COLUMN IF NOT EXISTS abuse_score       INT         NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS force_logout_at   TIMESTAMPTZ;

-- ─── §7. user_login_events (unusual-login + activity feed) ────────────────
CREATE TABLE IF NOT EXISTS public.user_login_events (
  id         BIGSERIAL   PRIMARY KEY,
  user_id    UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  ip         TEXT,
  user_agent TEXT,
  country    TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS uli_user_idx ON public.user_login_events (user_id, created_at DESC);
ALTER TABLE public.user_login_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "uli_self_read"   ON public.user_login_events;
CREATE POLICY "uli_self_read"   ON public.user_login_events FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "uli_self_insert" ON public.user_login_events;
CREATE POLICY "uli_self_insert" ON public.user_login_events FOR INSERT WITH CHECK (auth.uid() = user_id);

-- ─── §8. Admin RPCs for user moderation / recovery / refunds ──────────────
CREATE OR REPLACE FUNCTION public.admin_v2_set_user_flags(
  p_user UUID, p_patch JSONB, p_admin_id UUID
) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  k TEXT; sql TEXT := ''; first BOOLEAN := TRUE;
  allowed TEXT[] := ARRAY['is_banned','is_suspended','suspension_reason',
                           'credits_frozen','support_notes','abuse_score'];
  cast_to TEXT;
BEGIN
  FOREACH k IN ARRAY allowed LOOP
    IF p_patch ? k THEN
      cast_to := CASE WHEN k IN ('is_banned','is_suspended','credits_frozen') THEN 'BOOLEAN'
                      WHEN k = 'abuse_score' THEN 'INT' ELSE 'TEXT' END;
      sql := sql || (CASE WHEN first THEN '' ELSE ', ' END)
                 || quote_ident(k) || ' = ($1->>' || quote_literal(k) || ')::' || cast_to;
      first := FALSE;
    END IF;
  END LOOP;
  IF first THEN RAISE EXCEPTION 'no valid fields'; END IF;
  EXECUTE 'UPDATE public.users SET ' || sql || ' WHERE id = $2' USING p_patch, p_user;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_v2_set_user_flags(UUID,JSONB,UUID) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_v2_extend_subscription(
  p_user UUID, p_days INT, p_admin_id UUID
) RETURNS TIMESTAMPTZ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE new_exp TIMESTAMPTZ;
BEGIN
  IF p_days <= 0 OR p_days > 3650 THEN RAISE EXCEPTION 'invalid days'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = p_user) THEN
    RAISE EXCEPTION 'user not found';
  END IF;
  INSERT INTO public.user_billing (user_id, plan_code) VALUES (p_user, 'free')
    ON CONFLICT (user_id) DO NOTHING;
  UPDATE public.user_billing
     SET plan_expires_at = GREATEST(COALESCE(plan_expires_at, NOW()), NOW())
                          + (p_days || ' days')::INTERVAL,
         updated_at      = NOW()
   WHERE user_id = p_user
   RETURNING plan_expires_at INTO new_exp;
  UPDATE public.users
     SET subscription_status = CASE WHEN is_owner THEN 'owner' ELSE 'active' END,
         is_verified         = TRUE
   WHERE id = p_user;
  RETURN new_exp;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_v2_extend_subscription(UUID,INT,UUID) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_v2_force_logout(p_user UUID, p_admin_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.users SET force_logout_at = NOW() WHERE id = p_user;
  IF NOT FOUND THEN RAISE EXCEPTION 'user not found'; END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_v2_force_logout(UUID,UUID) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_v2_refund_order(
  p_order_id UUID, p_reason TEXT, p_admin_id UUID
) RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE o public.payment_orders%ROWTYPE; new_bal INT;
BEGIN
  IF p_reason IS NULL OR length(trim(p_reason)) < 3 THEN RAISE EXCEPTION 'reason_required'; END IF;
  SELECT * INTO o FROM public.payment_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'order not found'; END IF;
  IF o.status <> 'approved' THEN RAISE EXCEPTION 'only approved orders can be refunded (current=%)', o.status; END IF;

  INSERT INTO public.user_billing (user_id, plan_code) VALUES (o.user_id, 'free')
    ON CONFLICT (user_id) DO NOTHING;
  UPDATE public.user_billing
     SET credits = GREATEST(COALESCE(credits,0) - COALESCE(o.credits_to_grant,0), 0),
         updated_at = NOW()
   WHERE user_id = o.user_id
   RETURNING credits INTO new_bal;

  UPDATE public.payment_orders
     SET status = 'rejected', rejection_reason = 'REFUND: ' || p_reason,
         reviewed_at = NOW(), reviewed_by = p_admin_id
   WHERE id = p_order_id;

  INSERT INTO public.credit_ledger (user_id, delta, reason, ref_id, balance_after)
  VALUES (o.user_id, -COALESCE(o.credits_to_grant,0),
          'refund:'||p_order_id::TEXT, p_admin_id::TEXT, new_bal);

  RETURN json_build_object('ok', TRUE, 'balance', new_bal);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_v2_refund_order(UUID,TEXT,UUID) FROM PUBLIC, anon, authenticated;

-- ─── §9. Suspicious / flagged users view ──────────────────────────────────
CREATE OR REPLACE VIEW public.admin_suspicious_users AS
SELECT u.id, u.username, u.email, u.name, u.abuse_score,
       u.is_banned, u.is_suspended, u.credits_frozen,
       u.is_owner, u.is_verified,
       COALESCE(b.credits, 0)       AS credits,
       COALESCE(b.plan_code,'free') AS plan_code,
       b.plan_expires_at,
       u.created_at
  FROM public.users u
  LEFT JOIN public.user_billing b ON b.user_id = u.id
 WHERE COALESCE(u.abuse_score,0) >= 50
    OR u.is_banned OR u.is_suspended OR u.credits_frozen
 ORDER BY u.abuse_score DESC NULLS LAST, u.created_at DESC;
REVOKE ALL ON public.admin_suspicious_users FROM PUBLIC, anon, authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- DONE. Re-run safely. Default admin is created via the api-server's
-- POST /api/admin/auth/setup endpoint (only available when 0 super_admins
-- exist) — see the SysAdmin login page for the bootstrap flow.
-- ════════════════════════════════════════════════════════════════════════════
