-- Migration 18: Receipt fingerprinting + fraud detection infrastructure
-- Run AFTER migration 17.
-- Safe to re-run (all IF NOT EXISTS / IF EXISTS guards).

-- ── 1. payment_receipts ───────────────────────────────────────────────────
-- One row per uploaded receipt image. Captures OCR output + SHA-256 hash
-- so we can detect reused or duplicate receipts.

CREATE TABLE IF NOT EXISTS public.payment_receipts (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  refund_request_id    UUID        REFERENCES public.refund_requests(id) ON DELETE SET NULL,
  image_url            TEXT        NOT NULL,
  image_hash           TEXT,                   -- SHA-256 hex of image bytes
  extracted_reference  TEXT,                   -- OCR-detected reference number
  extracted_amount     NUMERIC,                -- OCR-detected payment amount
  ocr_confidence       NUMERIC,                -- 0–100 confidence score
  ocr_raw_text         TEXT,                   -- full OCR output (audit log)
  fraud_score          INTEGER     NOT NULL DEFAULT 0,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 2. fraud_flags ────────────────────────────────────────────────────────
-- One row per fraud signal detected during a receipt verification or refund
-- submission. Written server-side only.

CREATE TABLE IF NOT EXISTS public.fraud_flags (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  refund_request_id    UUID        REFERENCES public.refund_requests(id) ON DELETE CASCADE,
  type                 TEXT        NOT NULL,
  severity             TEXT        NOT NULL CHECK (severity IN ('low','medium','high','critical')),
  points               INTEGER     NOT NULL DEFAULT 0,
  metadata             JSONB,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 3. New columns on refund_requests ────────────────────────────────────

ALTER TABLE public.refund_requests
  ADD COLUMN IF NOT EXISTS receipt_id
    UUID REFERENCES public.payment_receipts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS payout_method
    TEXT CHECK (payout_method IN ('gcash','maya','bank','other')),
  ADD COLUMN IF NOT EXISTS payout_account_number TEXT,
  ADD COLUMN IF NOT EXISTS payout_account_name   TEXT,
  ADD COLUMN IF NOT EXISTS detected_reference    TEXT,
  ADD COLUMN IF NOT EXISTS refund_risk_score     INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS verification_status   TEXT NOT NULL DEFAULT 'pending'
    CHECK (verification_status IN ('pending','verified','suspicious','blocked'));

-- ── 4. Performance indexes ────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS payment_receipts_user_idx
  ON public.payment_receipts(user_id);

CREATE INDEX IF NOT EXISTS payment_receipts_hash_idx
  ON public.payment_receipts(image_hash)
  WHERE image_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS payment_receipts_ref_idx
  ON public.payment_receipts(extracted_reference)
  WHERE extracted_reference IS NOT NULL;

CREATE INDEX IF NOT EXISTS fraud_flags_user_idx
  ON public.fraud_flags(user_id);

CREATE INDEX IF NOT EXISTS fraud_flags_request_idx
  ON public.fraud_flags(refund_request_id)
  WHERE refund_request_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS refund_requests_risk_score_idx
  ON public.refund_requests(refund_risk_score);

CREATE INDEX IF NOT EXISTS refund_requests_receipt_idx
  ON public.refund_requests(receipt_id)
  WHERE receipt_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS refund_requests_verification_idx
  ON public.refund_requests(verification_status);

-- ── 5. RLS — payment_receipts ─────────────────────────────────────────────

ALTER TABLE public.payment_receipts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "receipts_own_select" ON public.payment_receipts;
CREATE POLICY "receipts_own_select"
  ON public.payment_receipts FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "receipts_own_insert" ON public.payment_receipts;
CREATE POLICY "receipts_own_insert"
  ON public.payment_receipts FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "receipts_own_update" ON public.payment_receipts;
CREATE POLICY "receipts_own_update"
  ON public.payment_receipts FOR UPDATE
  USING (auth.uid() = user_id);

-- ── 6. RLS — fraud_flags (users can only read their own; writes via server) ─

ALTER TABLE public.fraud_flags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fraud_flags_own_select" ON public.fraud_flags;
CREATE POLICY "fraud_flags_own_select"
  ON public.fraud_flags FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "fraud_flags_own_insert" ON public.fraud_flags;
CREATE POLICY "fraud_flags_own_insert"
  ON public.fraud_flags FOR INSERT
  WITH CHECK (auth.uid() = user_id);
