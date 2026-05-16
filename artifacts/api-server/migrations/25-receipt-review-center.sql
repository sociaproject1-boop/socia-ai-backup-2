-- Migration 25: Admin Receipt Review Center
-- Run in Supabase SQL editor after migration 24.
-- Adds review tracking to payment_receipts + admin notes table.

ALTER TABLE payment_receipts
  ADD COLUMN IF NOT EXISTS review_status        TEXT        DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS reviewed_by          TEXT,
  ADD COLUMN IF NOT EXISTS reviewed_at          TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS review_notes         TEXT,
  ADD COLUMN IF NOT EXISTS proof_requested      BOOLEAN     DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS proof_requested_at   TIMESTAMPTZ;

-- Admin internal notes on individual receipt submissions
CREATE TABLE IF NOT EXISTS receipt_review_notes (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_id  UUID        NOT NULL REFERENCES payment_receipts(id) ON DELETE CASCADE,
  admin_id    TEXT        NOT NULL,
  admin_name  TEXT,
  note        TEXT        NOT NULL,
  is_internal BOOLEAN     DEFAULT TRUE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS (admins bypass via service-role key)
ALTER TABLE receipt_review_notes ENABLE ROW LEVEL SECURITY;

-- Service role bypasses RLS — no explicit policy needed for admin access.
-- Block all direct user access (admins use service-role client only).
CREATE POLICY "No direct user access" ON receipt_review_notes
  FOR ALL USING (FALSE);

CREATE INDEX IF NOT EXISTS idx_receipt_review_notes_receipt_id
  ON receipt_review_notes(receipt_id);

CREATE INDEX IF NOT EXISTS idx_payment_receipts_review_status
  ON payment_receipts(review_status)
  WHERE review_status != 'pending';

CREATE INDEX IF NOT EXISTS idx_payment_receipts_fraud_score
  ON payment_receipts(fraud_score DESC);
