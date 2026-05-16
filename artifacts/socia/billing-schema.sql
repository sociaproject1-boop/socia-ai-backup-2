-- ════════════════════════════════════════════════════════════════════════════
-- Socia Billing Schema (idempotent — safe to re-run)
--
-- Adds the manual-receipt billing system on top of the base schema:
--   • plans + topup_packages catalog
--   • user_billing — per-user wallet (plan_code, credits, expiry)
--   • credit_ledger — append-only credit ledger
--   • cooldowns — anti-burst protection
--   • payment_orders — pending/approved/rejected manual payments
--   • payment_methods_config — admin-managed GCash/Maya QR text
--   • admins — minimal admin role
--   • RPCs: consume_credits, refund_credits, submit_payment,
--           approve_payment, reject_payment, set_admin, my_billing_summary
--   • Storage bucket: payment-receipts (private, owner+admins only)
-- ════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────── §1. plans ─────────────────────────────────
CREATE TABLE IF NOT EXISTS public.plans (
  code           TEXT        PRIMARY KEY,
  name           TEXT        NOT NULL,
  price_php      INTEGER     NOT NULL DEFAULT 0,
  credits        INTEGER     NOT NULL DEFAULT 0,
  duration_days  INTEGER     NOT NULL DEFAULT 0,
  hd_enabled     BOOLEAN     NOT NULL DEFAULT FALSE,
  watermark      BOOLEAN     NOT NULL DEFAULT TRUE,
  is_active      BOOLEAN     NOT NULL DEFAULT TRUE,
  sort           INTEGER     NOT NULL DEFAULT 0
);

INSERT INTO public.plans (code, name, price_php, credits, duration_days, hd_enabled, watermark, sort)
VALUES
  ('free',    'Free',          0,    0,    0,  FALSE, TRUE,  0),
  ('p15',     '15-Day Plan',   1000, 1000, 15, TRUE,  FALSE, 1),
  ('p30',     'Monthly Plan',  1500, 2500, 30, TRUE,  FALSE, 2)
ON CONFLICT (code) DO UPDATE
  SET name          = EXCLUDED.name,
      price_php     = EXCLUDED.price_php,
      credits       = EXCLUDED.credits,
      duration_days = EXCLUDED.duration_days,
      hd_enabled    = EXCLUDED.hd_enabled,
      watermark     = EXCLUDED.watermark,
      sort          = EXCLUDED.sort;

ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "plans_public_read" ON public.plans;
CREATE POLICY "plans_public_read" ON public.plans FOR SELECT USING (TRUE);

-- ──────────────────────────── §2. topup_packages ───────────────────────────
CREATE TABLE IF NOT EXISTS public.topup_packages (
  code        TEXT        PRIMARY KEY,
  label       TEXT        NOT NULL,
  credits     INTEGER     NOT NULL,
  price_php   INTEGER     NOT NULL,
  bonus_label TEXT,
  is_active   BOOLEAN     NOT NULL DEFAULT TRUE,
  sort        INTEGER     NOT NULL DEFAULT 0
);

INSERT INTO public.topup_packages (code, label, credits, price_php, bonus_label, sort)
VALUES
  ('t300',  'Starter',  300,  350,  NULL,        1),
  ('t800',  'Creator',  800,  800,  '+50 bonus', 2),
  ('t2000', 'Pro',     2000, 1800, '+200 bonus', 3)
ON CONFLICT (code) DO UPDATE
  SET label       = EXCLUDED.label,
      credits     = EXCLUDED.credits,
      price_php   = EXCLUDED.price_php,
      bonus_label = EXCLUDED.bonus_label,
      sort        = EXCLUDED.sort;

ALTER TABLE public.topup_packages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "topup_public_read" ON public.topup_packages;
CREATE POLICY "topup_public_read" ON public.topup_packages FOR SELECT USING (TRUE);

-- ──────────────────────────── §3. user_billing ─────────────────────────────
-- Single row per user. Owner accounts effectively have unlimited credits via
-- the consume_credits RPC bypassing the balance check.
CREATE TABLE IF NOT EXISTS public.user_billing (
  user_id          UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_code        TEXT        NOT NULL DEFAULT 'free' REFERENCES public.plans(code),
  credits          INTEGER     NOT NULL DEFAULT 0,
  plan_credits     INTEGER     NOT NULL DEFAULT 0,    -- credits granted by current plan (for smart-saver threshold)
  plan_started_at  TIMESTAMPTZ,
  plan_expires_at  TIMESTAMPTZ,
  smart_saver      BOOLEAN     NOT NULL DEFAULT FALSE,
  total_spent_php  INTEGER     NOT NULL DEFAULT 0,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.user_billing ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "billing_self_read" ON public.user_billing;
CREATE POLICY "billing_self_read" ON public.user_billing
  FOR SELECT TO authenticated USING (user_id = auth.uid());
-- All writes go through SECURITY DEFINER RPCs.

-- ──────────────────────────── §4. credit_ledger ────────────────────────────
CREATE TABLE IF NOT EXISTS public.credit_ledger (
  id              BIGSERIAL   PRIMARY KEY,
  user_id         UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  delta           INTEGER     NOT NULL,                    -- +grant, -spend, +refund
  reason          TEXT        NOT NULL,                    -- e.g. 'spend:hd_image' / 'grant:plan' / 'refund:fal_billing'
  ref_id          TEXT,                                    -- order id, generation id, etc.
  balance_after   INTEGER     NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ledger_user_time
  ON public.credit_ledger (user_id, created_at DESC);

ALTER TABLE public.credit_ledger ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ledger_self_read" ON public.credit_ledger;
CREATE POLICY "ledger_self_read" ON public.credit_ledger
  FOR SELECT TO authenticated USING (user_id = auth.uid());

-- ─────────────────────────────── §5. cooldowns ─────────────────────────────
-- One row per (user, scope). scope = 'burst' | 'submit' | 'video' | etc.
CREATE TABLE IF NOT EXISTS public.cooldowns (
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scope       TEXT        NOT NULL,
  until_at    TIMESTAMPTZ NOT NULL,
  reason      TEXT,
  PRIMARY KEY (user_id, scope)
);

ALTER TABLE public.cooldowns ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "cooldowns_self_read" ON public.cooldowns;
CREATE POLICY "cooldowns_self_read" ON public.cooldowns
  FOR SELECT TO authenticated USING (user_id = auth.uid());

-- ─────────────────────────────── §6. admins ────────────────────────────────
CREATE TABLE IF NOT EXISTS public.admins (
  user_id     UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  granted_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  granted_by  UUID
);

ALTER TABLE public.admins ENABLE ROW LEVEL SECURITY;
-- Authenticated users can SELECT only their own row to know "am I admin?".
DROP POLICY IF EXISTS "admins_self_read" ON public.admins;
CREATE POLICY "admins_self_read" ON public.admins
  FOR SELECT TO authenticated USING (user_id = auth.uid());
-- Writes only via set_admin() RPC.

CREATE OR REPLACE FUNCTION public.is_admin(uid UUID)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.admins WHERE user_id = uid
  ) OR EXISTS (
    SELECT 1 FROM public.users WHERE id = uid AND is_owner = TRUE
  );
$$;
REVOKE ALL ON FUNCTION public.is_admin(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin(UUID) TO authenticated;

-- Bootstrap helper: only the King (is_owner) can grant/revoke admin to others.
CREATE OR REPLACE FUNCTION public.set_admin(target UUID, make_admin BOOLEAN)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE caller UUID := auth.uid();
BEGIN
  IF caller IS NULL THEN RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = caller AND is_owner = TRUE) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF make_admin THEN
    INSERT INTO public.admins (user_id, granted_by) VALUES (target, caller)
      ON CONFLICT (user_id) DO NOTHING;
  ELSE
    DELETE FROM public.admins WHERE user_id = target;
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.set_admin(UUID, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_admin(UUID, BOOLEAN) TO authenticated;

-- ──────────────────────── §7. payment_methods_config ───────────────────────
-- Single row (id=1) holding admin-editable GCash / Maya / Bank instructions.
CREATE TABLE IF NOT EXISTS public.payment_methods_config (
  id                 INTEGER     PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  gcash_name         TEXT,
  gcash_number       TEXT,
  gcash_qr_url       TEXT,
  maya_name          TEXT,
  maya_number        TEXT,
  maya_qr_url        TEXT,
  bank_name          TEXT,
  bank_account_name  TEXT,
  bank_account_no    TEXT,
  notes              TEXT,
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.payment_methods_config (id, gcash_name, gcash_number, maya_name, maya_number, notes)
VALUES (1, 'Socia AI', '09XX-XXX-XXXX', 'Socia AI', '09XX-XXX-XXXX',
        'Send the EXACT amount and upload your receipt below. Payments are usually approved within 1–6 hours.')
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.payment_methods_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pmc_public_read" ON public.payment_methods_config;
CREATE POLICY "pmc_public_read" ON public.payment_methods_config FOR SELECT USING (TRUE);
-- Updates via update_payment_methods() RPC (admin-only).

CREATE OR REPLACE FUNCTION public.update_payment_methods(
  p_gcash_name TEXT, p_gcash_number TEXT, p_gcash_qr_url TEXT,
  p_maya_name TEXT,  p_maya_number TEXT,  p_maya_qr_url TEXT,
  p_bank_name TEXT,  p_bank_account_name TEXT, p_bank_account_no TEXT,
  p_notes TEXT
) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE caller UUID := auth.uid();
BEGIN
  IF NOT public.is_admin(caller) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  UPDATE public.payment_methods_config
     SET gcash_name = p_gcash_name, gcash_number = p_gcash_number, gcash_qr_url = p_gcash_qr_url,
         maya_name  = p_maya_name,  maya_number  = p_maya_number,  maya_qr_url  = p_maya_qr_url,
         bank_name  = p_bank_name,  bank_account_name = p_bank_account_name, bank_account_no = p_bank_account_no,
         notes      = p_notes,      updated_at = NOW()
   WHERE id = 1;
END $$;
REVOKE ALL ON FUNCTION public.update_payment_methods(TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_payment_methods(TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT) TO authenticated;

-- ─────────────────────────── §8. payment_orders ────────────────────────────
CREATE TABLE IF NOT EXISTS public.payment_orders (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind               TEXT        NOT NULL CHECK (kind IN ('subscription','topup')),
  plan_code          TEXT        REFERENCES public.plans(code),
  topup_code         TEXT        REFERENCES public.topup_packages(code),
  amount_php         INTEGER     NOT NULL,
  credits_to_grant   INTEGER     NOT NULL DEFAULT 0,
  payment_method     TEXT        NOT NULL CHECK (payment_method IN ('gcash','maya','bank')),
  reference_no       TEXT        NOT NULL,
  sender_name        TEXT,
  receipt_path       TEXT        NOT NULL,                 -- storage path in 'payment-receipts'
  receipt_sha256     TEXT        NOT NULL,                 -- duplicate detection
  status             TEXT        NOT NULL DEFAULT 'pending'
                                  CHECK (status IN ('pending','approved','rejected','expired')),
  rejection_reason   TEXT,
  reviewed_by        UUID,
  reviewed_at        TIMESTAMPTZ,
  flagged            BOOLEAN     NOT NULL DEFAULT FALSE,   -- duplicate / suspicious
  flag_reason        TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_orders_status_time ON public.payment_orders (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_user_time   ON public.payment_orders (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_ref         ON public.payment_orders (reference_no);
CREATE INDEX IF NOT EXISTS idx_orders_sha         ON public.payment_orders (receipt_sha256);

ALTER TABLE public.payment_orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "orders_self_read"  ON public.payment_orders;
DROP POLICY IF EXISTS "orders_admin_read" ON public.payment_orders;
CREATE POLICY "orders_self_read"  ON public.payment_orders
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "orders_admin_read" ON public.payment_orders
  FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));
-- All writes via RPCs.

-- ───────────────────────────── §9. usage_events ────────────────────────────
-- Lightweight per-action log used for analytics & burst detection.
CREATE TABLE IF NOT EXISTS public.usage_events (
  id            BIGSERIAL   PRIMARY KEY,
  user_id       UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action        TEXT        NOT NULL,        -- 'std_image' | 'hd_image' | 'std_video_5s' | etc.
  credits       INTEGER     NOT NULL,
  meta          JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_usage_user_time ON public.usage_events (user_id, created_at DESC);

ALTER TABLE public.usage_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "usage_self_read" ON public.usage_events;
CREATE POLICY "usage_self_read" ON public.usage_events
  FOR SELECT TO authenticated USING (user_id = auth.uid());

-- ═══════════════════════ §10. consume_credits RPC ══════════════════════════
-- Server-side action cost map. Caller passes only an action code.
-- Returns:
--   { allowed, balance, plan, action, cost, smart_saver, cooldown_until,
--     reason }
--
-- Burst protection: if the user spends > 200 credits in 30 min OR
-- > 500 credits in 2 hours, a 5-min / 15-min cooldown (respectively) is set.
-- Owner accounts skip balance + cooldown checks entirely.
CREATE OR REPLACE FUNCTION public.consume_credits(p_action TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid          UUID := auth.uid();
  cost         INTEGER;
  bal          INTEGER;
  plan         TEXT;
  is_owner_u   BOOLEAN := FALSE;
  cd_until     TIMESTAMPTZ;
  spent_30min  INTEGER;
  spent_2h     INTEGER;
  saver        BOOLEAN := FALSE;
  plan_total   INTEGER;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501'; END IF;

  -- Cost map (single source of truth, server-side)
  cost := CASE p_action
    WHEN 'std_image'      THEN 3
    WHEN 'hd_image'       THEN 10
    WHEN 'std_video_5s'   THEN 20
    WHEN 'hd_video_5s'    THEN 30
    WHEN 'std_video_10s'  THEN 40
    WHEN 'hd_video_10s'   THEN 60
    WHEN 'multi_frame'    THEN 60
    WHEN 'gpt_msg'        THEN 1
    ELSE NULL
  END;
  IF cost IS NULL THEN RAISE EXCEPTION 'unknown action %', p_action USING ERRCODE = '22023'; END IF;

  SELECT is_owner INTO is_owner_u FROM public.users WHERE id = uid;

  -- Owner bypass — log for analytics, no debit, no cooldown.
  IF COALESCE(is_owner_u, FALSE) THEN
    INSERT INTO public.usage_events (user_id, action, credits, meta)
      VALUES (uid, p_action, 0, jsonb_build_object('owner', TRUE));
    RETURN jsonb_build_object(
      'allowed', TRUE, 'balance', 2147483647, 'plan', 'owner',
      'action', p_action, 'cost', cost, 'smart_saver', FALSE,
      'cooldown_until', NULL
    );
  END IF;

  -- Ensure billing row exists.
  INSERT INTO public.user_billing (user_id, plan_code) VALUES (uid, 'free')
    ON CONFLICT (user_id) DO NOTHING;

  -- Lock the row.
  SELECT plan_code, credits, plan_credits
    INTO plan, bal, plan_total
    FROM public.user_billing WHERE user_id = uid FOR UPDATE;

  -- Cooldown check.
  SELECT until_at INTO cd_until
    FROM public.cooldowns
   WHERE user_id = uid AND scope = 'burst' AND until_at > NOW();
  IF cd_until IS NOT NULL THEN
    RETURN jsonb_build_object(
      'allowed', FALSE, 'balance', bal, 'plan', plan,
      'action', p_action, 'cost', cost,
      'smart_saver', FALSE, 'cooldown_until', cd_until,
      'reason', 'cooldown'
    );
  END IF;

  -- Plan expiry: bump back to free if expired.
  IF plan <> 'free' THEN
    PERFORM 1 FROM public.user_billing
      WHERE user_id = uid AND plan_expires_at IS NOT NULL AND plan_expires_at < NOW();
    IF FOUND THEN
      UPDATE public.user_billing
         SET plan_code = 'free', plan_credits = 0, plan_started_at = NULL,
             plan_expires_at = NULL, smart_saver = FALSE, updated_at = NOW()
       WHERE user_id = uid;
      plan := 'free';
    END IF;
  END IF;

  -- Free plan: credits-based system never applies; the API server keeps the
  -- daily-quota model for free users. Block here so no free user ever spends
  -- a stray paid credit accidentally.
  IF plan = 'free' THEN
    RETURN jsonb_build_object(
      'allowed', FALSE, 'balance', bal, 'plan', plan,
      'action', p_action, 'cost', cost,
      'smart_saver', FALSE, 'cooldown_until', NULL,
      'reason', 'free_plan'
    );
  END IF;

  IF bal < cost THEN
    RETURN jsonb_build_object(
      'allowed', FALSE, 'balance', bal, 'plan', plan,
      'action', p_action, 'cost', cost,
      'smart_saver', FALSE, 'cooldown_until', NULL,
      'reason', 'insufficient'
    );
  END IF;

  -- Debit.
  UPDATE public.user_billing
     SET credits     = credits - cost,
         smart_saver = ((credits - cost) * 100) < (GREATEST(plan_credits, 1) * 15),
         updated_at  = NOW()
   WHERE user_id = uid
   RETURNING credits, smart_saver INTO bal, saver;

  -- Ledger + analytics.
  INSERT INTO public.credit_ledger (user_id, delta, reason, balance_after)
    VALUES (uid, -cost, 'spend:' || p_action, bal);
  INSERT INTO public.usage_events (user_id, action, credits)
    VALUES (uid, p_action, cost);

  -- Burst detection.
  SELECT COALESCE(SUM(credits), 0) INTO spent_30min
    FROM public.usage_events
   WHERE user_id = uid AND created_at > NOW() - INTERVAL '30 minutes';
  SELECT COALESCE(SUM(credits), 0) INTO spent_2h
    FROM public.usage_events
   WHERE user_id = uid AND created_at > NOW() - INTERVAL '2 hours';

  IF spent_2h > 500 THEN
    INSERT INTO public.cooldowns (user_id, scope, until_at, reason)
      VALUES (uid, 'burst', NOW() + INTERVAL '15 minutes', 'high_volume_2h')
      ON CONFLICT (user_id, scope) DO UPDATE
        SET until_at = EXCLUDED.until_at, reason = EXCLUDED.reason;
    cd_until := NOW() + INTERVAL '15 minutes';
  ELSIF spent_30min > 200 THEN
    INSERT INTO public.cooldowns (user_id, scope, until_at, reason)
      VALUES (uid, 'burst', NOW() + INTERVAL '5 minutes', 'burst_30min')
      ON CONFLICT (user_id, scope) DO UPDATE
        SET until_at = EXCLUDED.until_at, reason = EXCLUDED.reason;
    cd_until := NOW() + INTERVAL '5 minutes';
  END IF;

  RETURN jsonb_build_object(
    'allowed', TRUE, 'balance', bal, 'plan', plan,
    'action', p_action, 'cost', cost,
    'smart_saver', saver, 'cooldown_until', cd_until
  );
END $$;
REVOKE ALL ON FUNCTION public.consume_credits(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.consume_credits(TEXT) TO authenticated;

-- ════════════════════════ §11. refund_credits RPC ══════════════════════════
-- Returns previously-debited credits when a generation fails for a
-- non-user-fault reason (provider billing, timeout, etc.).
CREATE OR REPLACE FUNCTION public.refund_credits(p_amount INTEGER, p_reason TEXT, p_ref TEXT DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid UUID := auth.uid();
  bal INTEGER;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501'; END IF;
  IF p_amount IS NULL OR p_amount <= 0 OR p_amount > 200 THEN
    RAISE EXCEPTION 'invalid refund amount' USING ERRCODE = '22023';
  END IF;

  -- Owner: ignore.
  IF EXISTS (SELECT 1 FROM public.users WHERE id = uid AND is_owner = TRUE) THEN
    RETURN jsonb_build_object('refunded', 0, 'balance', 2147483647);
  END IF;

  INSERT INTO public.user_billing (user_id, plan_code) VALUES (uid, 'free')
    ON CONFLICT (user_id) DO NOTHING;

  UPDATE public.user_billing
     SET credits = credits + p_amount,
         smart_saver = ((credits + p_amount) * 100) < (GREATEST(plan_credits, 1) * 15),
         updated_at = NOW()
   WHERE user_id = uid
   RETURNING credits INTO bal;

  INSERT INTO public.credit_ledger (user_id, delta, reason, ref_id, balance_after)
    VALUES (uid, p_amount, 'refund:' || p_reason, p_ref, bal);

  RETURN jsonb_build_object('refunded', p_amount, 'balance', bal);
END $$;
REVOKE ALL ON FUNCTION public.refund_credits(INTEGER, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.refund_credits(INTEGER, TEXT, TEXT) TO authenticated;

-- ═══════════════════════ §12. submit_payment RPC ═══════════════════════════
-- Validates kind/code, checks anti-fraud (sha256 / reference duplicates,
-- failed-submission cooldown), inserts a pending payment_orders row.
CREATE OR REPLACE FUNCTION public.submit_payment(
  p_kind             TEXT,           -- 'subscription' | 'topup'
  p_plan_code        TEXT,           -- when kind='subscription'
  p_topup_code       TEXT,           -- when kind='topup'
  p_payment_method   TEXT,           -- 'gcash' | 'maya' | 'bank'
  p_reference_no     TEXT,
  p_sender_name      TEXT,
  p_receipt_path     TEXT,
  p_receipt_sha256   TEXT
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid          UUID := auth.uid();
  amt          INTEGER;
  credits_g    INTEGER := 0;
  rejected_24h INTEGER;
  pending_n    INTEGER;
  dup_sha      INTEGER;
  dup_ref      INTEGER;
  flag         BOOLEAN := FALSE;
  flag_reason  TEXT;
  new_id       UUID;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501'; END IF;
  IF p_kind NOT IN ('subscription','topup') THEN
    RAISE EXCEPTION 'invalid kind' USING ERRCODE = '22023';
  END IF;
  IF p_payment_method NOT IN ('gcash','maya','bank') THEN
    RAISE EXCEPTION 'invalid payment_method' USING ERRCODE = '22023';
  END IF;
  IF COALESCE(LENGTH(TRIM(p_reference_no)), 0) < 4 THEN
    RAISE EXCEPTION 'reference_no must be at least 4 characters' USING ERRCODE = '22023';
  END IF;
  IF COALESCE(LENGTH(p_receipt_path), 0) < 4 OR COALESCE(LENGTH(p_receipt_sha256), 0) <> 64 THEN
    RAISE EXCEPTION 'receipt is required' USING ERRCODE = '22023';
  END IF;

  -- Submission cooldown: 3+ rejected in last 24h → block for 24h.
  SELECT COUNT(*) INTO rejected_24h FROM public.payment_orders
   WHERE user_id = uid AND status = 'rejected' AND reviewed_at > NOW() - INTERVAL '24 hours';
  IF rejected_24h >= 3 THEN
    RAISE EXCEPTION 'Too many rejected receipts. Try again in 24 hours, or contact support.' USING ERRCODE = '42501';
  END IF;

  -- Cap pending: 1 active pending of each kind at a time.
  SELECT COUNT(*) INTO pending_n FROM public.payment_orders
   WHERE user_id = uid AND status = 'pending' AND kind = p_kind;
  IF pending_n >= 1 THEN
    RAISE EXCEPTION 'You already have a pending %. Wait for it to be reviewed first.', p_kind USING ERRCODE = '42501';
  END IF;

  IF p_kind = 'subscription' THEN
    SELECT price_php, credits INTO amt, credits_g FROM public.plans
     WHERE code = p_plan_code AND is_active = TRUE;
    IF amt IS NULL THEN RAISE EXCEPTION 'unknown plan' USING ERRCODE = '22023'; END IF;
  ELSE
    SELECT price_php, credits INTO amt, credits_g FROM public.topup_packages
     WHERE code = p_topup_code AND is_active = TRUE;
    IF amt IS NULL THEN RAISE EXCEPTION 'unknown topup package' USING ERRCODE = '22023'; END IF;
  END IF;

  -- Anti-fraud: duplicate sha256 across ALL users in the last 90 days.
  SELECT COUNT(*) INTO dup_sha FROM public.payment_orders
   WHERE receipt_sha256 = p_receipt_sha256 AND created_at > NOW() - INTERVAL '90 days';
  SELECT COUNT(*) INTO dup_ref FROM public.payment_orders
   WHERE reference_no = p_reference_no   AND created_at > NOW() - INTERVAL '90 days';
  IF dup_sha > 0 OR dup_ref > 0 THEN
    flag := TRUE;
    flag_reason := CASE WHEN dup_sha > 0 AND dup_ref > 0 THEN 'duplicate_receipt_and_reference'
                        WHEN dup_sha > 0 THEN 'duplicate_receipt_image'
                        ELSE 'duplicate_reference_number' END;
  END IF;

  INSERT INTO public.payment_orders (
    user_id, kind, plan_code, topup_code, amount_php, credits_to_grant,
    payment_method, reference_no, sender_name, receipt_path, receipt_sha256,
    flagged, flag_reason
  ) VALUES (
    uid, p_kind,
    CASE WHEN p_kind='subscription' THEN p_plan_code ELSE NULL END,
    CASE WHEN p_kind='topup' THEN p_topup_code ELSE NULL END,
    amt, credits_g, p_payment_method, p_reference_no, p_sender_name,
    p_receipt_path, p_receipt_sha256, flag, flag_reason
  ) RETURNING id INTO new_id;

  RETURN jsonb_build_object('id', new_id, 'flagged', flag, 'flag_reason', flag_reason);
END $$;
REVOKE ALL ON FUNCTION public.submit_payment(TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_payment(TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT) TO authenticated;

-- ═══════════════════════ §13. approve / reject RPCs ════════════════════════
CREATE OR REPLACE FUNCTION public.approve_payment(p_order_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  caller    UUID := auth.uid();
  o         public.payment_orders%ROWTYPE;
  new_bal   INTEGER;
  new_exp   TIMESTAMPTZ;
  add_days  INTEGER;
  cur_plan  TEXT;
  cur_exp   TIMESTAMPTZ;
BEGIN
  IF NOT public.is_admin(caller) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;

  SELECT * INTO o FROM public.payment_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'order not found'; END IF;
  IF o.status <> 'pending' THEN RAISE EXCEPTION 'order is %', o.status USING ERRCODE = '22023'; END IF;

  -- Ensure billing row exists.
  INSERT INTO public.user_billing (user_id, plan_code) VALUES (o.user_id, 'free')
    ON CONFLICT (user_id) DO NOTHING;

  IF o.kind = 'subscription' THEN
    SELECT duration_days INTO add_days FROM public.plans WHERE code = o.plan_code;
    SELECT plan_code, plan_expires_at INTO cur_plan, cur_exp FROM public.user_billing WHERE user_id = o.user_id;
    -- If renewing the SAME plan and it's still active, extend from the existing expiry.
    IF cur_plan = o.plan_code AND cur_exp IS NOT NULL AND cur_exp > NOW() THEN
      new_exp := cur_exp + (add_days || ' days')::INTERVAL;
    ELSE
      new_exp := NOW() + (add_days || ' days')::INTERVAL;
    END IF;

    UPDATE public.user_billing
       SET plan_code        = o.plan_code,
           plan_credits     = o.credits_to_grant,
           credits          = credits + o.credits_to_grant,
           plan_started_at  = COALESCE(plan_started_at, NOW()),
           plan_expires_at  = new_exp,
           smart_saver      = ((credits + o.credits_to_grant) * 100) < (GREATEST(o.credits_to_grant, 1) * 15),
           total_spent_php  = total_spent_php + o.amount_php,
           updated_at       = NOW()
     WHERE user_id = o.user_id
     RETURNING credits INTO new_bal;

    -- Mirror legacy verified flag for badge UI.
    UPDATE public.users
       SET is_verified         = TRUE,
           subscription_status = CASE WHEN is_owner THEN 'owner' ELSE 'active' END
     WHERE id = o.user_id;

  ELSE
    UPDATE public.user_billing
       SET credits         = credits + o.credits_to_grant,
           smart_saver     = ((credits + o.credits_to_grant) * 100) < (GREATEST(plan_credits, 1) * 15),
           total_spent_php = total_spent_php + o.amount_php,
           updated_at      = NOW()
     WHERE user_id = o.user_id
     RETURNING credits INTO new_bal;
  END IF;

  INSERT INTO public.credit_ledger (user_id, delta, reason, ref_id, balance_after)
    VALUES (o.user_id, o.credits_to_grant,
            CASE WHEN o.kind='subscription' THEN 'grant:plan:' || o.plan_code
                 ELSE 'grant:topup:' || o.topup_code END,
            o.id::TEXT, new_bal);

  UPDATE public.payment_orders
     SET status='approved', reviewed_by=caller, reviewed_at=NOW()
   WHERE id = p_order_id;

  RETURN jsonb_build_object('ok', TRUE, 'balance', new_bal);
END $$;
REVOKE ALL ON FUNCTION public.approve_payment(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.approve_payment(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.reject_payment(p_order_id UUID, p_reason TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE caller UUID := auth.uid();
BEGIN
  IF NOT public.is_admin(caller) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  IF COALESCE(LENGTH(TRIM(p_reason)), 0) < 3 THEN
    RAISE EXCEPTION 'rejection_reason required' USING ERRCODE = '22023';
  END IF;
  UPDATE public.payment_orders
     SET status='rejected', rejection_reason=p_reason, reviewed_by=caller, reviewed_at=NOW()
   WHERE id = p_order_id AND status='pending';
  IF NOT FOUND THEN RAISE EXCEPTION 'order not pending' USING ERRCODE = '22023'; END IF;
  RETURN jsonb_build_object('ok', TRUE);
END $$;
REVOKE ALL ON FUNCTION public.reject_payment(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reject_payment(UUID, TEXT) TO authenticated;

-- ═══════════════════════ §14. my_billing_summary RPC ═══════════════════════
-- One round-trip the dashboard uses to render everything.
CREATE OR REPLACE FUNCTION public.my_billing_summary()
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid UUID := auth.uid();
  b   public.user_billing%ROWTYPE;
  cd  TIMESTAMPTZ;
  is_owner_u BOOLEAN := FALSE;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501'; END IF;
  SELECT is_owner INTO is_owner_u FROM public.users WHERE id = uid;

  INSERT INTO public.user_billing (user_id, plan_code) VALUES (uid, 'free')
    ON CONFLICT (user_id) DO NOTHING;
  SELECT * INTO b FROM public.user_billing WHERE user_id = uid;

  -- Auto-expire plan.
  IF b.plan_code <> 'free' AND b.plan_expires_at IS NOT NULL AND b.plan_expires_at < NOW() THEN
    UPDATE public.user_billing
       SET plan_code='free', plan_credits=0, plan_started_at=NULL, plan_expires_at=NULL,
           smart_saver=FALSE, updated_at=NOW()
     WHERE user_id = uid;
    SELECT * INTO b FROM public.user_billing WHERE user_id = uid;
    UPDATE public.users
       SET is_verified         = COALESCE(is_owner, FALSE),
           subscription_status = CASE WHEN is_owner THEN 'owner' ELSE 'free' END
     WHERE id = uid;
  END IF;

  SELECT until_at INTO cd FROM public.cooldowns
   WHERE user_id = uid AND scope='burst' AND until_at > NOW();

  RETURN jsonb_build_object(
    'is_owner',         COALESCE(is_owner_u, FALSE),
    'plan_code',        b.plan_code,
    'credits',          CASE WHEN COALESCE(is_owner_u, FALSE) THEN 2147483647 ELSE b.credits END,
    'plan_credits',     b.plan_credits,
    'plan_started_at',  b.plan_started_at,
    'plan_expires_at',  b.plan_expires_at,
    'smart_saver',      b.smart_saver,
    'cooldown_until',   cd,
    'total_spent_php',  b.total_spent_php
  );
END $$;
REVOKE ALL ON FUNCTION public.my_billing_summary() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.my_billing_summary() TO authenticated;

-- ═══════════════════════ §15. admin_pending_orders RPC ═════════════════════
-- Returns pending orders enriched with the user's display info.
CREATE OR REPLACE FUNCTION public.admin_list_orders(p_status TEXT DEFAULT 'pending', p_limit INTEGER DEFAULT 100)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE caller UUID := auth.uid(); rows JSONB;
BEGIN
  IF NOT public.is_admin(caller) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  SELECT COALESCE(jsonb_agg(row_to_jsonb(o.*) || jsonb_build_object(
            'username',     u.username,
            'display_name', u.display_name,
            'email',        au.email
          ) ORDER BY o.created_at DESC), '[]'::jsonb)
    INTO rows
    FROM (
      SELECT * FROM public.payment_orders
       WHERE (p_status IS NULL OR status = p_status)
       ORDER BY created_at DESC
       LIMIT GREATEST(1, LEAST(p_limit, 500))
    ) o
    LEFT JOIN public.users u  ON u.id  = o.user_id
    LEFT JOIN auth.users   au ON au.id = o.user_id;
  RETURN rows;
END $$;
REVOKE ALL ON FUNCTION public.admin_list_orders(TEXT, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_list_orders(TEXT, INTEGER) TO authenticated;

-- Signed URL for the receipt image (admin only).
CREATE OR REPLACE FUNCTION public.admin_receipt_url(p_order_id UUID)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, storage AS $$
DECLARE caller UUID := auth.uid(); o public.payment_orders%ROWTYPE;
BEGIN
  IF NOT public.is_admin(caller) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  SELECT * INTO o FROM public.payment_orders WHERE id = p_order_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'order not found'; END IF;
  -- Returns the path; the client signs it via supabase.storage.from(...).createSignedUrl.
  RETURN o.receipt_path;
END $$;
REVOKE ALL ON FUNCTION public.admin_receipt_url(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_receipt_url(UUID) TO authenticated;

-- Admin: adjust a user's credits (refund / comp / correction).
CREATE OR REPLACE FUNCTION public.admin_adjust_credits(p_user UUID, p_delta INTEGER, p_reason TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE caller UUID := auth.uid(); bal INTEGER;
BEGIN
  IF NOT public.is_admin(caller) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  IF p_delta = 0 OR p_delta < -100000 OR p_delta > 100000 THEN
    RAISE EXCEPTION 'invalid delta' USING ERRCODE = '22023';
  END IF;
  IF COALESCE(LENGTH(TRIM(p_reason)), 0) < 3 THEN
    RAISE EXCEPTION 'reason required' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.user_billing (user_id, plan_code) VALUES (p_user, 'free')
    ON CONFLICT (user_id) DO NOTHING;
  UPDATE public.user_billing
     SET credits = GREATEST(0, credits + p_delta), updated_at = NOW()
   WHERE user_id = p_user
   RETURNING credits INTO bal;
  INSERT INTO public.credit_ledger (user_id, delta, reason, balance_after)
    VALUES (p_user, p_delta, 'admin:' || p_reason, bal);
  RETURN jsonb_build_object('balance', bal);
END $$;
REVOKE ALL ON FUNCTION public.admin_adjust_credits(UUID, INTEGER, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_adjust_credits(UUID, INTEGER, TEXT) TO authenticated;

-- ════════════════ §16. Storage bucket: payment-receipts ════════════════════
INSERT INTO storage.buckets (id, name, public)
VALUES ('payment-receipts', 'payment-receipts', FALSE)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "receipts_owner_insert"  ON storage.objects;
DROP POLICY IF EXISTS "receipts_owner_read"    ON storage.objects;
DROP POLICY IF EXISTS "receipts_admin_read"    ON storage.objects;
DROP POLICY IF EXISTS "receipts_no_update"     ON storage.objects;
DROP POLICY IF EXISTS "receipts_no_delete"     ON storage.objects;

-- Path layout: <user_id>/<order_id_or_uuid>.<ext>
CREATE POLICY "receipts_owner_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'payment-receipts'
    AND split_part(name, '/', 1) = auth.uid()::TEXT
  );

CREATE POLICY "receipts_owner_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'payment-receipts'
    AND split_part(name, '/', 1) = auth.uid()::TEXT
  );

CREATE POLICY "receipts_admin_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'payment-receipts'
    AND public.is_admin(auth.uid())
  );

-- ════════════════════════════ §17. Realtime ════════════════════════════════
-- Push billing changes live to the dashboard.
DO $$ BEGIN
  PERFORM 1 FROM pg_publication_tables
   WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='user_billing';
  IF NOT FOUND THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.user_billing';
  END IF;
END $$;
DO $$ BEGIN
  PERFORM 1 FROM pg_publication_tables
   WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='payment_orders';
  IF NOT FOUND THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.payment_orders';
  END IF;
END $$;
