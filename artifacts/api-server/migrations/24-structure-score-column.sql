-- Migration 24: Receipt structure analysis score
-- Run in Supabase SQL editor after migration 23.
-- Stores the output of analyzeReceiptStructure() (fake receipt layout detection).

ALTER TABLE payment_receipts
  ADD COLUMN IF NOT EXISTS structure_score      SMALLINT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS receipt_field_count  SMALLINT DEFAULT 0;

-- Index for admin analytics on suspicious structure
CREATE INDEX IF NOT EXISTS idx_payment_receipts_structure_score
  ON payment_receipts (structure_score)
  WHERE structure_score >= 40;
