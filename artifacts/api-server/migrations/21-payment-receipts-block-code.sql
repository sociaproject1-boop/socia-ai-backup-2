-- Migration 21: Add verification_status and block_code columns to payment_receipts
--
-- Run in Supabase SQL editor BEFORE deploying the updated receipts.ts / refunds.ts.
-- Uses IF NOT EXISTS guards so it is safe to run multiple times.

ALTER TABLE payment_receipts
  ADD COLUMN IF NOT EXISTS verification_status TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS block_code          TEXT;

-- Backfill existing rows: anything with fraud_score >= 80 gets "blocked",
-- score 40-79 gets "suspicious", the rest stay "pending".
UPDATE payment_receipts
SET verification_status = CASE
  WHEN fraud_score >= 80 THEN 'blocked'
  WHEN fraud_score >= 40 THEN 'suspicious'
  ELSE 'pending'
END
WHERE verification_status = 'pending';

-- Index for admin queries filtering by verification status
CREATE INDEX IF NOT EXISTS idx_payment_receipts_verification_status
  ON payment_receipts (verification_status);

-- Constraint: only allow known status values
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'payment_receipts_verification_status_check'
  ) THEN
    ALTER TABLE payment_receipts
      ADD CONSTRAINT payment_receipts_verification_status_check
      CHECK (verification_status IN ('pending', 'verified', 'suspicious', 'blocked'));
  END IF;
END;
$$;

-- Constraint: only allow known block codes (NULL is allowed for non-blocked rows)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'payment_receipts_block_code_check'
  ) THEN
    ALTER TABLE payment_receipts
      ADD CONSTRAINT payment_receipts_block_code_check
      CHECK (block_code IS NULL OR block_code IN (
        'mismatch', 'duplicate_receipt', 'duplicate_reference',
        'blurred_image', 'invalid_receipt'
      ));
  END IF;
END;
$$;
