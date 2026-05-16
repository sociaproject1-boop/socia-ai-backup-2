-- ==========================================================================
-- SociaGPT AI Subscription Schema
-- Run this in your Supabase SQL editor.
-- SEPARATE from creator subscriptions — do NOT merge these tables.
-- ==========================================================================

-- ── 1. AI Subscriptions ────────────────────────────────────────────────────
-- Tracks which AI plan a user has purchased. One active row per user.
CREATE TABLE IF NOT EXISTS public.ai_subscriptions (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_code    TEXT NOT NULL CHECK (plan_code IN ('free', 'premium', 'ultra')),
  status       TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'cancelled', 'expired')),
  price_php    NUMERIC(10,2),
  period_days  INT,
  expires_at   TIMESTAMPTZ,
  payment_ref  TEXT,
  payment_method TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at   TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS ai_subscriptions_user_status_idx
  ON public.ai_subscriptions(user_id, status);

-- ── 2. AI Usage Tracking ──────────────────────────────────────────────────
-- Per-user per-period usage counters. Period = YYYY-MM-DD (daily) or YYYY-MM (monthly).
CREATE TABLE IF NOT EXISTS public.ai_usage_tracking (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_code     TEXT NOT NULL,
  period_type   TEXT NOT NULL CHECK (period_type IN ('daily', 'monthly')),
  period_key    TEXT NOT NULL,   -- e.g. '2025-05-12' or '2025-05'
  request_count INT  NOT NULL DEFAULT 0,
  limit_count   INT  NOT NULL DEFAULT 15,
  reset_at      TIMESTAMPTZ NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at    TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE (user_id, plan_code, period_key)
);

CREATE INDEX IF NOT EXISTS ai_usage_tracking_user_period_idx
  ON public.ai_usage_tracking(user_id, period_key);

-- ── 3. AI Requests Log ────────────────────────────────────────────────────
-- Audit log of every AI chat request (for analytics + anti-abuse review).
CREATE TABLE IF NOT EXISTS public.ai_requests (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_code       TEXT NOT NULL,
  model           TEXT NOT NULL,
  mode            TEXT,
  input_chars     INT,
  output_chars    INT,
  attachment_count INT DEFAULT 0,
  status          TEXT DEFAULT 'completed' CHECK (status IN ('completed','error','aborted','rate_limited')),
  error_code      TEXT,
  abuse_score     INT DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS ai_requests_user_created_idx
  ON public.ai_requests(user_id, created_at DESC);

-- ── 4. AI Cooldowns ───────────────────────────────────────────────────────
-- Persistent cooldown overrides (e.g. admin-imposed blocks). In-memory
-- cooldowns are handled in the API server; this table is for manual overrides.
CREATE TABLE IF NOT EXISTS public.ai_cooldowns (
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  locked_until TIMESTAMPTZ,
  reason       TEXT,
  created_by   TEXT DEFAULT 'system',
  created_at   TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- ── 5. AI Abuse Flags ─────────────────────────────────────────────────────
-- Flagged users for manual review.
CREATE TABLE IF NOT EXISTS public.ai_abuse_flags (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reason       TEXT NOT NULL,
  abuse_score  INT  DEFAULT 0,
  resolved     BOOLEAN DEFAULT FALSE,
  resolved_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS ai_abuse_flags_user_idx
  ON public.ai_abuse_flags(user_id, resolved);

-- ── 6. AI Billing History ─────────────────────────────────────────────────
-- Payment records for AI plan purchases (separate from creator payment_orders).
CREATE TABLE IF NOT EXISTS public.ai_billing_history (
  id             UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_code      TEXT NOT NULL,
  amount_php     NUMERIC(10,2) NOT NULL,
  payment_method TEXT,
  payment_ref    TEXT,
  status         TEXT DEFAULT 'pending' CHECK (status IN ('pending','completed','failed','refunded')),
  notes          TEXT,
  created_at     TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at     TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS ai_billing_history_user_idx
  ON public.ai_billing_history(user_id, created_at DESC);

-- ── 7. RLS Policies ───────────────────────────────────────────────────────
ALTER TABLE public.ai_subscriptions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_usage_tracking  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_requests        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_cooldowns       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_abuse_flags     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_billing_history ENABLE ROW LEVEL SECURITY;

-- Users can only see their own rows
CREATE POLICY ai_subscriptions_self   ON public.ai_subscriptions
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY ai_usage_tracking_self  ON public.ai_usage_tracking
  FOR ALL USING (auth.uid() = user_id);
CREATE POLICY ai_requests_self        ON public.ai_requests
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY ai_billing_history_self ON public.ai_billing_history
  FOR SELECT USING (auth.uid() = user_id);

-- ── 8. Auto-expire subscriptions function ────────────────────────────────
CREATE OR REPLACE FUNCTION public.expire_ai_subscriptions()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE public.ai_subscriptions
  SET status = 'expired', updated_at = NOW()
  WHERE status = 'active'
    AND expires_at IS NOT NULL
    AND expires_at < NOW();
END;
$$;

-- Schedule via pg_cron (if available):
-- SELECT cron.schedule('expire-ai-subs', '0 * * * *', 'SELECT public.expire_ai_subscriptions()');
