-- ================================================================
-- SECTION 5 of 13 — Indexes + schema patch
-- Adds last_request_at column if it is missing from
-- ai_usage_tracking (covers the case where the table was created
-- without it by an earlier run of ai-subscription-schema.sql).
-- Depends on: Sections 1–4 (all tables must exist)
-- Safe to run multiple times (idempotent).
-- ================================================================
BEGIN;

-- Schema patch: add persistent cooldown column
ALTER TABLE public.ai_usage_tracking
  ADD COLUMN IF NOT EXISTS last_request_at TIMESTAMPTZ;

-- AI table indexes
CREATE INDEX IF NOT EXISTS ai_subscriptions_user_status_idx
  ON public.ai_subscriptions (user_id, status);

CREATE INDEX IF NOT EXISTS idx_ai_usage_tracking_user_period
  ON public.ai_usage_tracking (user_id, plan_code, period_key);

CREATE INDEX IF NOT EXISTS ai_requests_user_created_idx
  ON public.ai_requests (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS ai_abuse_flags_user_idx
  ON public.ai_abuse_flags (user_id, resolved);

CREATE INDEX IF NOT EXISTS ai_billing_history_user_idx
  ON public.ai_billing_history (user_id, created_at DESC);

-- Refund table indexes
CREATE INDEX IF NOT EXISTS refund_requests_user_id_idx
  ON public.refund_requests (user_id);

CREATE INDEX IF NOT EXISTS refund_requests_status_idx
  ON public.refund_requests (status);

CREATE INDEX IF NOT EXISTS refund_requests_created_at_idx
  ON public.refund_requests (created_at DESC);

CREATE INDEX IF NOT EXISTS refund_decisions_request_idx
  ON public.refund_decisions (request_id);

COMMIT;
