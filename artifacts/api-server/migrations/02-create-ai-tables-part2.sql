-- ================================================================
-- SECTION 2 of 13 — Create AI tables (part 2)
-- Creates: ai_requests, ai_cooldowns, ai_abuse_flags,
--          ai_billing_history
-- Safe to run multiple times (idempotent).
-- ================================================================
BEGIN;

CREATE TABLE IF NOT EXISTS public.ai_requests (
  id               UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id          UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_code        TEXT        NOT NULL,
  model            TEXT        NOT NULL,
  mode             TEXT,
  input_chars      INT,
  output_chars     INT,
  attachment_count INT         DEFAULT 0,
  status           TEXT        DEFAULT 'completed'
                               CHECK (status IN ('completed','error','aborted','rate_limited')),
  error_code       TEXT,
  abuse_score      INT         DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.ai_cooldowns (
  user_id      UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  locked_until TIMESTAMPTZ,
  reason       TEXT,
  created_by   TEXT        DEFAULT 'system',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.ai_abuse_flags (
  id          UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reason      TEXT        NOT NULL,
  abuse_score INT         DEFAULT 0,
  resolved    BOOLEAN     DEFAULT FALSE,
  resolved_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.ai_billing_history (
  id             UUID          NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id        UUID          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_code      TEXT          NOT NULL,
  amount_php     NUMERIC(10,2) NOT NULL,
  payment_method TEXT,
  payment_ref    TEXT,
  status         TEXT          DEFAULT 'pending'
                               CHECK (status IN ('pending','completed','failed','refunded')),
  notes          TEXT,
  created_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

COMMIT;
