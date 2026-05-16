-- ================================================================
-- SECTION 1 of 13 — Create AI tables (part 1)
-- Creates: ai_subscriptions, ai_usage_tracking
-- Safe to run multiple times (idempotent).
-- ================================================================
BEGIN;

CREATE TABLE IF NOT EXISTS public.ai_subscriptions (
  id             UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id        UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_code      TEXT        NOT NULL CHECK (plan_code IN ('free','premium','ultra')),
  status         TEXT        NOT NULL DEFAULT 'active'
                             CHECK (status IN ('active','cancelled','expired')),
  price_php      NUMERIC(10,2),
  period_days    INT,
  expires_at     TIMESTAMPTZ,
  payment_ref    TEXT,
  payment_method TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.ai_usage_tracking (
  id              UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id         UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_code       TEXT        NOT NULL,
  period_type     TEXT        NOT NULL CHECK (period_type IN ('daily','monthly')),
  period_key      TEXT        NOT NULL,
  request_count   INT         NOT NULL DEFAULT 0,
  limit_count     INT         NOT NULL DEFAULT 15,
  reset_at        TIMESTAMPTZ NOT NULL,
  last_request_at TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, plan_code, period_key)
);

COMMIT;
