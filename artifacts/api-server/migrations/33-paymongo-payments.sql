-- Migration 33: PayMongo automated payments
-- Idempotent. Safe to re-run.
--
-- Records every PayMongo checkout session created for a subscription
-- purchase. The webhook flips status to 'paid' atomically (UPDATE ...
-- WHERE status <> 'paid') so duplicate webhook deliveries cannot
-- double-grant credits. `processed_event_ids` retains delivered event IDs
-- as a secondary replay guard.

CREATE TABLE IF NOT EXISTS public.paymongo_payments (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              uuid NOT NULL,
  plan_code            text NOT NULL,
  paymongo_session_id  text,
  paymongo_payment_id  text,
  amount_centavos      integer NOT NULL,
  status               text NOT NULL DEFAULT 'pending'
                       CHECK (status IN ('pending','paid','failed','cancelled','expired')),
  credits_added        integer NOT NULL DEFAULT 0,
  paid_at              timestamptz,
  processed_event_ids  text[] NOT NULL DEFAULT '{}'::text[],
  raw_session          jsonb,
  raw_event            jsonb,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_paymongo_payments_session
  ON public.paymongo_payments(paymongo_session_id)
  WHERE paymongo_session_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_paymongo_payments_payment
  ON public.paymongo_payments(paymongo_payment_id)
  WHERE paymongo_payment_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_paymongo_payments_user_created
  ON public.paymongo_payments(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_paymongo_payments_status_created
  ON public.paymongo_payments(status, created_at DESC);

-- updated_at trigger (uses common helper if it exists, otherwise creates one).
CREATE OR REPLACE FUNCTION public.tg_paymongo_payments_touch()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS paymongo_payments_touch ON public.paymongo_payments;
CREATE TRIGGER paymongo_payments_touch
  BEFORE UPDATE ON public.paymongo_payments
  FOR EACH ROW EXECUTE FUNCTION public.tg_paymongo_payments_touch();
