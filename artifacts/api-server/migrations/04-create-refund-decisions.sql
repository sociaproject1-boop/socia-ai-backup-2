-- ================================================================
-- SECTION 4 of 13 — Create refund_decisions + updated_at trigger
-- Depends on: Section 3 (refund_requests must exist)
-- Safe to run multiple times (idempotent).
-- ================================================================
BEGIN;

CREATE TABLE IF NOT EXISTS public.refund_decisions (
  id         UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  request_id UUID        NOT NULL REFERENCES public.refund_requests(id) ON DELETE CASCADE,
  admin_id   TEXT        NOT NULL,
  action     TEXT        NOT NULL
             CHECK (action IN ('approve','partial','reject','review','flag')),
  amount_php NUMERIC,
  notes      TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION public.update_refund_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_refund_updated_at ON public.refund_requests;
CREATE TRIGGER trg_refund_updated_at
  BEFORE UPDATE ON public.refund_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_refund_updated_at();

COMMIT;
