-- Migration 23: Payment method, transaction date, and OCR engine tracking
-- Run in Supabase SQL editor after migration 22.

ALTER TABLE payment_receipts
  ADD COLUMN IF NOT EXISTS extracted_payment_method VARCHAR(50),
  ADD COLUMN IF NOT EXISTS extracted_date           TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ocr_engine               VARCHAR(20) DEFAULT 'none';

-- Index for payment method analytics
CREATE INDEX IF NOT EXISTS idx_payment_receipts_payment_method
  ON payment_receipts (extracted_payment_method)
  WHERE extracted_payment_method IS NOT NULL;

-- Index for date-range queries on verified receipts
CREATE INDEX IF NOT EXISTS idx_payment_receipts_extracted_date
  ON payment_receipts (extracted_date)
  WHERE extracted_date IS NOT NULL;

-- Index on OCR engine for analytics
CREATE INDEX IF NOT EXISTS idx_payment_receipts_ocr_engine
  ON payment_receipts (ocr_engine)
  WHERE ocr_engine IS NOT NULL AND ocr_engine <> 'none';
