-- Migration 26: Add manual_reference + live-analytics performance indexes
-- Fixes: "column payment_receipts.manual_reference does not exist"
--
-- manual_reference = the reference number the USER typed when submitting
-- extracted_reference = what OCR detected in the image
-- Both are stored; a mismatch is a fraud signal.
--
-- Safe to re-run (IF NOT EXISTS / WHERE guards throughout).

-- ── 1. Add missing column ─────────────────────────────────────────────
ALTER TABLE payment_receipts
  ADD COLUMN IF NOT EXISTS manual_reference TEXT;

-- ── 2. Backfill existing rows with OCR-detected reference ─────────────
UPDATE payment_receipts
SET    manual_reference = extracted_reference
WHERE  manual_reference IS NULL
  AND  extracted_reference IS NOT NULL;

-- ── 3. Ensure review_status has a sane value for pre-existing rows ────
UPDATE payment_receipts
SET    review_status = 'pending'
WHERE  review_status IS NULL;

-- ── 4. Indexes for admin receipt-list queries ─────────────────────────

-- Manual reference search (admin search box)
CREATE INDEX IF NOT EXISTS idx_payment_receipts_manual_ref
  ON payment_receipts (manual_reference)
  WHERE manual_reference IS NOT NULL;

-- Admin list ordered by newest, filter by verification_status
CREATE INDEX IF NOT EXISTS idx_payment_receipts_vs_date
  ON payment_receipts (verification_status, created_at DESC);

-- Admin list filter by review_status
CREATE INDEX IF NOT EXISTS idx_payment_receipts_rs_date
  ON payment_receipts (review_status, created_at DESC)
  WHERE review_status IS NOT NULL;

-- 30-day rolling window queries (fraud analytics endpoint)
CREATE INDEX IF NOT EXISTS idx_payment_receipts_created_desc
  ON payment_receipts (created_at DESC);

-- High-fraud-score alert queries
CREATE INDEX IF NOT EXISTS idx_payment_receipts_high_fraud
  ON payment_receipts (fraud_score DESC, created_at DESC)
  WHERE fraud_score >= 50;
