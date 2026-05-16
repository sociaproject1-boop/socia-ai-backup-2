-- ================================================================
-- SECTION 3 of 13 — Create refund_requests table
-- Safe to run multiple times (idempotent).
-- ================================================================
BEGIN;

CREATE TABLE IF NOT EXISTS public.refund_requests (
  id                       UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id                  UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subscription_type        TEXT        NOT NULL CHECK (subscription_type IN ('creator','ai')),
  plan_code                TEXT        NOT NULL,
  payment_reference        TEXT,
  payment_amount_php       NUMERIC     NOT NULL DEFAULT 0,
  estimated_used_php       NUMERIC     NOT NULL DEFAULT 0,
  estimated_refundable_php NUMERIC     NOT NULL DEFAULT 0,
  requested_amount_php     NUMERIC,
  credits_total            INTEGER     NOT NULL DEFAULT 0,
  credits_used             INTEGER     NOT NULL DEFAULT 0,
  credits_remaining        INTEGER     NOT NULL DEFAULT 0,
  ai_requests_used         INTEGER     NOT NULL DEFAULT 0,
  ai_requests_limit        INTEGER     NOT NULL DEFAULT 0,
  reason                   TEXT        NOT NULL
                           CHECK (reason IN ('unused','partial','technical','billing_error','other')),
  description              TEXT        NOT NULL,
  screenshot_url           TEXT,
  status                   TEXT        NOT NULL DEFAULT 'pending'
                           CHECK (status IN ('pending','reviewing','approved','partial','rejected')),
  approved_amount_php      NUMERIC,
  admin_notes              TEXT,
  reviewed_by              TEXT,
  reviewed_at              TIMESTAMPTZ,
  abuse_score              INTEGER     NOT NULL DEFAULT 0,
  is_flagged               BOOLEAN     NOT NULL DEFAULT FALSE,
  flag_reason              TEXT,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMIT;
