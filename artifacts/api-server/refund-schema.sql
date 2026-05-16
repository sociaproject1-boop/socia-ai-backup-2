-- ============================================================
-- Socia Refund System — Supabase SQL Migration
-- Run this in the Supabase SQL editor.
-- ============================================================

-- ── 1. refund_requests ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS refund_requests (
  id                     uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- What is being refunded
  subscription_type      text        NOT NULL CHECK (subscription_type IN ('creator', 'ai')),
  plan_code              text        NOT NULL,               -- e.g. 'p15', 'p30', 'premium', 'ultra'
  payment_reference      text,                              -- user's GCash / Maya ref number

  -- Financials (PHP)
  payment_amount_php     numeric     NOT NULL DEFAULT 0,    -- what they paid
  estimated_used_php     numeric     NOT NULL DEFAULT 0,    -- our estimate of consumption
  estimated_refundable_php numeric   NOT NULL DEFAULT 0,    -- payment - used
  requested_amount_php   numeric,                           -- what user is asking for (null = full remaining)

  -- Usage snapshot at the time of request
  credits_total          integer     NOT NULL DEFAULT 0,
  credits_used           integer     NOT NULL DEFAULT 0,
  credits_remaining      integer     NOT NULL DEFAULT 0,
  ai_requests_used       integer     NOT NULL DEFAULT 0,
  ai_requests_limit      integer     NOT NULL DEFAULT 0,

  -- User input
  reason                 text        NOT NULL CHECK (reason IN ('unused', 'partial', 'technical', 'billing_error', 'other')),
  description            text        NOT NULL,
  screenshot_url         text,

  -- Status & admin
  status                 text        NOT NULL DEFAULT 'pending'
                                     CHECK (status IN ('pending','reviewing','approved','partial','rejected')),
  approved_amount_php    numeric,                           -- set when approved / partial
  admin_notes            text,
  reviewed_by            text,                             -- admin username
  reviewed_at            timestamptz,

  -- Anti-abuse
  abuse_score            integer     NOT NULL DEFAULT 0,
  is_flagged             boolean     NOT NULL DEFAULT false,
  flag_reason            text,

  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

-- ── 2. refund_decisions — full admin audit trail ─────────────
CREATE TABLE IF NOT EXISTS refund_decisions (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id    uuid        NOT NULL REFERENCES refund_requests(id) ON DELETE CASCADE,
  admin_id      text        NOT NULL,
  action        text        NOT NULL CHECK (action IN ('approve','partial','reject','review','flag')),
  amount_php    numeric,
  notes         text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- ── 3. Row-level security ─────────────────────────────────────
ALTER TABLE refund_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE refund_decisions ENABLE ROW LEVEL SECURITY;

-- Users can read their own requests
CREATE POLICY "refunds_select_own" ON refund_requests
  FOR SELECT USING (auth.uid() = user_id);

-- Users can insert their own requests
CREATE POLICY "refunds_insert_own" ON refund_requests
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- No direct user UPDATE / DELETE — only service role (admin) can mutate
-- refund_decisions is admin-only; no user policies (service role bypasses RLS)

-- ── 4. Indexes ────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS refund_requests_user_id_idx    ON refund_requests(user_id);
CREATE INDEX IF NOT EXISTS refund_requests_status_idx     ON refund_requests(status);
CREATE INDEX IF NOT EXISTS refund_requests_created_at_idx ON refund_requests(created_at DESC);
CREATE INDEX IF NOT EXISTS refund_decisions_request_idx   ON refund_decisions(request_id);

-- ── 5. updated_at trigger ─────────────────────────────────────
CREATE OR REPLACE FUNCTION update_refund_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_refund_updated_at ON refund_requests;
CREATE TRIGGER trg_refund_updated_at
  BEFORE UPDATE ON refund_requests
  FOR EACH ROW EXECUTE FUNCTION update_refund_updated_at();
