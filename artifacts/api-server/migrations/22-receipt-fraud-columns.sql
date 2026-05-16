-- Migration 22: Advanced fraud detection columns for payment_receipts
--
-- Run in Supabase SQL editor AFTER migration 21.
-- All alterations use IF NOT EXISTS guards and are safe to re-run.

-- Fraud reasons JSON array (one entry per FraudFlag)
ALTER TABLE payment_receipts
  ADD COLUMN IF NOT EXISTS fraud_reasons          JSONB    NOT NULL DEFAULT '[]'::jsonb;

-- Blur score 0–100 (higher = more blurry)
ALTER TABLE payment_receipts
  ADD COLUMN IF NOT EXISTS blur_score             SMALLINT NOT NULL DEFAULT 0
  CONSTRAINT payment_receipts_blur_score_check CHECK (blur_score BETWEEN 0 AND 100);

-- Tamper detection
ALTER TABLE payment_receipts
  ADD COLUMN IF NOT EXISTS tamper_detected        BOOLEAN  NOT NULL DEFAULT false;
ALTER TABLE payment_receipts
  ADD COLUMN IF NOT EXISTS tamper_score           SMALLINT NOT NULL DEFAULT 0
  CONSTRAINT payment_receipts_tamper_score_check CHECK (tamper_score BETWEEN 0 AND 100);
ALTER TABLE payment_receipts
  ADD COLUMN IF NOT EXISTS tamper_software        TEXT;      -- e.g. "photoshop"

-- Heuristic score (suspicious text patterns)
ALTER TABLE payment_receipts
  ADD COLUMN IF NOT EXISTS heuristic_score        SMALLINT NOT NULL DEFAULT 0;

-- Manual review flag (set when fraud action = "review")
ALTER TABLE payment_receipts
  ADD COLUMN IF NOT EXISTS manual_review_required BOOLEAN  NOT NULL DEFAULT false;

-- Composite "AI detection" score visible in admin (0–100)
-- Weighted combination of blur + tamper + heuristic signals
ALTER TABLE payment_receipts
  ADD COLUMN IF NOT EXISTS ai_detection_score     SMALLINT NOT NULL DEFAULT 0
  CONSTRAINT payment_receipts_ai_score_check CHECK (ai_detection_score BETWEEN 0 AND 100);

-- ── Indexes ───────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_payment_receipts_tamper_detected
  ON payment_receipts (tamper_detected) WHERE tamper_detected = true;

CREATE INDEX IF NOT EXISTS idx_payment_receipts_manual_review
  ON payment_receipts (manual_review_required) WHERE manual_review_required = true;

CREATE INDEX IF NOT EXISTS idx_payment_receipts_blur_score
  ON payment_receipts (blur_score);

-- ── Backfill existing rows ────────────────────────────────────────────────

-- Mark existing high-fraud-score rows as needing manual review
UPDATE payment_receipts
SET    manual_review_required = true
WHERE  fraud_score >= 50
  AND  manual_review_required = false;

-- Derive ai_detection_score for pre-existing rows based on fraud_score
UPDATE payment_receipts
SET    ai_detection_score = LEAST(100, ROUND(fraud_score * 0.8))
WHERE  ai_detection_score = 0
  AND  fraud_score > 0;
