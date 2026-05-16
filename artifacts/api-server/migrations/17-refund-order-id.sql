-- Migration 17: Add order_id to refund_requests + expand reason values
-- Run this in the Supabase SQL editor.
-- Safe to re-run (all IF NOT EXISTS / IF EXISTS guards).

-- 1. Add order_id column (nullable FK to payment_orders)
ALTER TABLE public.refund_requests
  ADD COLUMN IF NOT EXISTS order_id uuid
    REFERENCES public.payment_orders(id) ON DELETE SET NULL;

-- 2. Expand the reason CHECK constraint to include order-dispute reasons.
--    DROP + ADD is the only way to change a CHECK in Postgres.
ALTER TABLE public.refund_requests
  DROP CONSTRAINT IF EXISTS refund_requests_reason_check;

ALTER TABLE public.refund_requests
  ADD CONSTRAINT refund_requests_reason_check CHECK (
    reason IN (
      'unused', 'partial', 'technical', 'billing_error', 'other',
      'accidental_payment', 'duplicate_payment', 'wrong_amount',
      'unauthorized', 'service_issue'
    )
  );

-- 3. Unique partial index: only one active (pending/reviewing) refund per order
CREATE UNIQUE INDEX IF NOT EXISTS refund_requests_order_active_uniq
  ON public.refund_requests(order_id)
  WHERE order_id IS NOT NULL AND status IN ('pending', 'reviewing');

-- 4. Plain index for fast lookups by order_id
CREATE INDEX IF NOT EXISTS refund_requests_order_id_idx
  ON public.refund_requests(order_id);
