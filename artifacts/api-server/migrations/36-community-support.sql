-- Migration 36: Community Support — PayMongo-powered contributions.
--
-- Replaces the manual donation flow (reference number + screenshot upload +
-- admin verification) with fully automated PayMongo Checkout. A contribution
-- is recorded as pending when the user starts checkout, and atomically
-- promoted to paid + the global community_funding totals incremented when
-- the signed webhook event arrives.
--
-- Idempotency follows the same pattern as paymongo_payments (mig. 33/35):
--   * SELECT FOR UPDATE inside the finalize function
--   * processed_event_ids[] secondary guard
--   * status='paid' guard so duplicates can't double-increment totals
--   * unique constraint on paymongo_session_id
--
-- Safe to re-run.

BEGIN;

-- 1. community_support table -------------------------------------------------
CREATE TABLE IF NOT EXISTS public.community_support (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount_centavos       integer NOT NULL CHECK (amount_centavos >= 5000),  -- ₱50 min
  currency              text    NOT NULL DEFAULT 'PHP',
  payment_method        text,   -- recorded from PayMongo event: gcash|paymaya|card
  paymongo_session_id   text,
  paymongo_payment_id   text,
  status                text    NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending','paid','failed')),
  raw_session           jsonb,
  raw_event             jsonb,
  processed_event_ids   text[]  NOT NULL DEFAULT '{}',
  paid_at               timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_cs_session_unique
  ON public.community_support (paymongo_session_id)
  WHERE paymongo_session_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_cs_payment_unique
  ON public.community_support (paymongo_payment_id)
  WHERE paymongo_payment_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_cs_user_created ON public.community_support (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cs_paid_created ON public.community_support (created_at DESC) WHERE status = 'paid';

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.touch_community_support_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;
DROP TRIGGER IF EXISTS trg_community_support_touch ON public.community_support;
CREATE TRIGGER trg_community_support_touch
  BEFORE UPDATE ON public.community_support
  FOR EACH ROW EXECUTE FUNCTION public.touch_community_support_updated_at();

-- RLS: users see their own contributions; service role does everything.
ALTER TABLE public.community_support ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_read_own_support"   ON public.community_support;
DROP POLICY IF EXISTS "users_insert_own_support" ON public.community_support;
CREATE POLICY "users_read_own_support" ON public.community_support
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "users_insert_own_support" ON public.community_support
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- 2. Atomic finalize function -----------------------------------------------
-- One transaction: flip status to paid + record event + increment global totals.
-- Returns:
--   {"result":"finalized","amount":<int>}  on first successful processing
--   {"result":"duplicate"}                  on a replayed event id
--   {"result":"already_paid"}               on a separate event for an already-paid row
DROP FUNCTION IF EXISTS public.paymongo_finalize_support(uuid, text, text, jsonb);

CREATE OR REPLACE FUNCTION public.paymongo_finalize_support(
  p_payment_id           uuid,
  p_paymongo_payment_id  text,
  p_event_id             text,
  p_event                jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row     public.community_support;
  v_amount  numeric(12,2);
  v_method  text;
  v_count   integer;
  v_goal    numeric(12,2);
  v_current numeric(12,2);
BEGIN
  -- Lock the support row for the duration of this transaction.
  SELECT * INTO v_row FROM public.community_support
   WHERE id = p_payment_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'community_support row % not found', p_payment_id
      USING ERRCODE = 'no_data_found';
  END IF;

  -- Replay guard: this exact event id was already processed.
  IF p_event_id IS NOT NULL AND v_row.processed_event_ids @> ARRAY[p_event_id] THEN
    RETURN jsonb_build_object('result','duplicate');
  END IF;

  -- Idempotency: row is already paid (e.g. checkout.paid arrived before
  -- payment.paid for the same session). Record the event for audit but
  -- DO NOT increment totals again.
  IF v_row.status = 'paid' THEN
    UPDATE public.community_support
       SET processed_event_ids = array_append(processed_event_ids, COALESCE(p_event_id, '')),
           raw_event = p_event
     WHERE id = p_payment_id;
    RETURN jsonb_build_object('result','already_paid');
  END IF;

  -- Extract method from the event payload if present (best-effort).
  v_method := COALESCE(
    p_event #>> '{data,attributes,data,attributes,payment_method_used}',
    p_event #>> '{data,attributes,data,attributes,source,type}',
    v_row.payment_method
  );

  -- Promote to paid.
  UPDATE public.community_support
     SET status              = 'paid',
         paid_at             = now(),
         paymongo_payment_id = COALESCE(v_row.paymongo_payment_id, p_paymongo_payment_id),
         payment_method      = v_method,
         raw_event           = p_event,
         processed_event_ids = array_append(processed_event_ids, COALESCE(p_event_id, ''))
   WHERE id = p_payment_id;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'paymongo_finalize_support: failed to mark % paid (rows=%)', p_payment_id, v_count;
  END IF;

  -- Increment global totals atomically — same TX, so a failure here rolls
  -- back the status flip and PayMongo retries cleanly.
  v_amount := v_row.amount_centavos::numeric / 100.0;

  UPDATE public.community_funding
     SET current_amount   = current_amount + v_amount,
         supporters_count = supporters_count + 1,
         is_goal_reached  = (current_amount + v_amount) >= target_amount
   WHERE id = '00000000-0000-0000-0000-000000000001'
   RETURNING target_amount, current_amount INTO v_goal, v_current;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'paymongo_finalize_support: community_funding global row missing';
  END IF;

  RETURN jsonb_build_object(
    'result','finalized',
    'amount', v_amount,
    'current', v_current,
    'goal',    v_goal
  );
END $$;

COMMIT;
