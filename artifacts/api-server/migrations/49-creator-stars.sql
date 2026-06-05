-- ─────────────────────────────────────────────────────────────────────────────
-- 49-creator-stars.sql
-- Creator Stars — production fan support system
-- Tables:  creator_star_wallets, creator_star_transactions, creator_star_ledger
-- RPCs:    send_stars, admin_grant_stars
-- Extends: post_notifications → adds 'stars' type + nullable metadata column
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Creator Star Wallets ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.creator_star_wallets (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid        NOT NULL UNIQUE REFERENCES public.users(id) ON DELETE CASCADE,
  balance           integer     NOT NULL DEFAULT 0,
  lifetime_received integer     NOT NULL DEFAULT 0,
  lifetime_sent     integer     NOT NULL DEFAULT 0,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT star_wallet_balance_nonneg      CHECK (balance           >= 0),
  CONSTRAINT star_wallet_received_nonneg     CHECK (lifetime_received >= 0),
  CONSTRAINT star_wallet_sent_nonneg         CHECK (lifetime_sent     >= 0)
);

CREATE INDEX IF NOT EXISTS idx_star_wallets_user     ON public.creator_star_wallets(user_id);
CREATE INDEX IF NOT EXISTS idx_star_wallets_received ON public.creator_star_wallets(lifetime_received DESC);
CREATE INDEX IF NOT EXISTS idx_star_wallets_sent     ON public.creator_star_wallets(lifetime_sent     DESC);

-- ── 2. Creator Star Transactions ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.creator_star_transactions (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id    uuid        REFERENCES public.users(id) ON DELETE SET NULL,
  receiver_id  uuid        NOT NULL REFERENCES public.users(id) ON DELETE SET NULL,
  amount       integer     NOT NULL,
  status       text        NOT NULL DEFAULT 'processing',
  reference_id text,
  metadata     jsonb       NOT NULL DEFAULT '{}',
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT star_tx_amount_pos    CHECK (amount > 0),
  CONSTRAINT star_tx_status_valid  CHECK (status IN ('processing','completed','failed','refunded')),
  CONSTRAINT star_tx_ref_unique    UNIQUE (reference_id)
);

CREATE INDEX IF NOT EXISTS idx_star_tx_sender   ON public.creator_star_transactions(sender_id,   created_at DESC);
CREATE INDEX IF NOT EXISTS idx_star_tx_receiver ON public.creator_star_transactions(receiver_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_star_tx_status   ON public.creator_star_transactions(status);
CREATE INDEX IF NOT EXISTS idx_star_tx_created  ON public.creator_star_transactions(created_at DESC);

-- ── 3. Creator Star Ledger (double-entry, append-only) ───────────────────────
CREATE TABLE IF NOT EXISTS public.creator_star_ledger (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id uuid        REFERENCES public.creator_star_transactions(id) ON DELETE SET NULL,
  user_id        uuid        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  debit          integer     NOT NULL DEFAULT 0,
  credit         integer     NOT NULL DEFAULT 0,
  balance_after  integer     NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT star_ledger_debit_nonneg    CHECK (debit        >= 0),
  CONSTRAINT star_ledger_credit_nonneg   CHECK (credit       >= 0),
  CONSTRAINT star_ledger_balance_nonneg  CHECK (balance_after >= 0)
);

CREATE INDEX IF NOT EXISTS idx_star_ledger_user ON public.creator_star_ledger(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_star_ledger_tx   ON public.creator_star_ledger(transaction_id);

-- ── 4. Extend post_notifications: add metadata + 'stars' type ────────────────
ALTER TABLE public.post_notifications
  ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT NULL;

-- Drop the existing CHECK constraint on type (name may differ between environments)
DO $$
DECLARE
  v_cname text;
BEGIN
  SELECT constraint_name INTO v_cname
  FROM information_schema.table_constraints
  WHERE table_schema    = 'public'
    AND table_name      = 'post_notifications'
    AND constraint_type = 'CHECK'
    AND constraint_name LIKE '%type%'
  LIMIT 1;
  IF v_cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.post_notifications DROP CONSTRAINT %I', v_cname);
  END IF;
END$$;

ALTER TABLE public.post_notifications
  ADD CONSTRAINT post_notifications_type_check
  CHECK (type IN ('like','comment','reply','follow','mention','stars'));

-- ── 5. RLS ────────────────────────────────────────────────────────────────────
ALTER TABLE public.creator_star_wallets      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.creator_star_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.creator_star_ledger        ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS star_wallet_own ON public.creator_star_wallets;
CREATE POLICY star_wallet_own ON public.creator_star_wallets
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS star_tx_own ON public.creator_star_transactions;
CREATE POLICY star_tx_own ON public.creator_star_transactions
  FOR SELECT USING (auth.uid() = sender_id OR auth.uid() = receiver_id);

DROP POLICY IF EXISTS star_ledger_own ON public.creator_star_ledger;
CREATE POLICY star_ledger_own ON public.creator_star_ledger
  FOR SELECT USING (auth.uid() = user_id);

-- ── 6. RPC: send_stars ────────────────────────────────────────────────────────
-- Atomic, race-safe, SECURITY DEFINER (bypasses RLS for the transfer itself).
-- Called by the api-server via service-role client.
CREATE OR REPLACE FUNCTION public.send_stars(
  p_sender_id    uuid,
  p_receiver_id  uuid,
  p_amount       integer,
  p_reference_id text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sender_bal     integer;
  v_tx_id          uuid;
  v_sender_new_bal integer;
  v_recv_new_bal   integer;
BEGIN
  -- ── Guards ──────────────────────────────────────────────────────────────────
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_amount');
  END IF;
  IF p_amount > 10000 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'amount_too_large');
  END IF;
  IF p_sender_id = p_receiver_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'cannot_send_to_self');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = p_sender_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'sender_not_found');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = p_receiver_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'receiver_not_found');
  END IF;

  -- ── Idempotency ─────────────────────────────────────────────────────────────
  IF p_reference_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.creator_star_transactions
      WHERE reference_id = p_reference_id AND status = 'completed'
    ) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'duplicate_transaction');
    END IF;
  END IF;

  -- ── Ensure both wallets exist ────────────────────────────────────────────────
  INSERT INTO public.creator_star_wallets (user_id)
  VALUES (p_sender_id)   ON CONFLICT (user_id) DO NOTHING;
  INSERT INTO public.creator_star_wallets (user_id)
  VALUES (p_receiver_id) ON CONFLICT (user_id) DO NOTHING;

  -- ── Lock sender row (prevents concurrent over-spend) ─────────────────────────
  SELECT balance INTO v_sender_bal
  FROM public.creator_star_wallets
  WHERE user_id = p_sender_id
  FOR UPDATE;

  IF v_sender_bal < p_amount THEN
    RETURN jsonb_build_object(
      'ok',      false,
      'error',   'insufficient_balance',
      'balance', v_sender_bal
    );
  END IF;

  -- ── Create transaction record ─────────────────────────────────────────────────
  INSERT INTO public.creator_star_transactions
    (sender_id, receiver_id, amount, status, reference_id)
  VALUES
    (p_sender_id, p_receiver_id, p_amount, 'processing', p_reference_id)
  RETURNING id INTO v_tx_id;

  -- ── Debit sender ──────────────────────────────────────────────────────────────
  UPDATE public.creator_star_wallets
  SET
    balance       = balance       - p_amount,
    lifetime_sent = lifetime_sent + p_amount,
    updated_at    = now()
  WHERE user_id = p_sender_id
  RETURNING balance INTO v_sender_new_bal;

  -- ── Credit receiver ───────────────────────────────────────────────────────────
  UPDATE public.creator_star_wallets
  SET
    balance            = balance            + p_amount,
    lifetime_received  = lifetime_received  + p_amount,
    updated_at         = now()
  WHERE user_id = p_receiver_id
  RETURNING balance INTO v_recv_new_bal;

  -- ── Double-entry ledger ───────────────────────────────────────────────────────
  INSERT INTO public.creator_star_ledger
    (transaction_id, user_id,       debit,    credit,   balance_after)
  VALUES
    (v_tx_id,        p_sender_id,   p_amount, 0,        v_sender_new_bal),
    (v_tx_id,        p_receiver_id, 0,        p_amount, v_recv_new_bal);

  -- ── Complete ──────────────────────────────────────────────────────────────────
  UPDATE public.creator_star_transactions
  SET status = 'completed'
  WHERE id = v_tx_id;

  RETURN jsonb_build_object(
    'ok',             true,
    'transaction_id', v_tx_id,
    'sender_balance', v_sender_new_bal
  );
END;
$$;

-- ── 7. RPC: admin_grant_stars ─────────────────────────────────────────────────
-- Admin-only credit of stars to a user (no debit from another user).
CREATE OR REPLACE FUNCTION public.admin_grant_stars(
  p_user_id uuid,
  p_amount  integer,
  p_reason  text DEFAULT 'admin_grant'
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_balance integer;
  v_tx_id       uuid;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_amount');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = p_user_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'user_not_found');
  END IF;

  -- Ensure wallet exists
  INSERT INTO public.creator_star_wallets (user_id)
  VALUES (p_user_id) ON CONFLICT (user_id) DO NOTHING;

  -- Create grant transaction (NULL sender = system/admin)
  INSERT INTO public.creator_star_transactions
    (sender_id, receiver_id, amount, status, metadata)
  VALUES
    (NULL, p_user_id, p_amount, 'completed',
     jsonb_build_object('type', 'admin_grant', 'reason', p_reason))
  RETURNING id INTO v_tx_id;

  -- Credit user
  UPDATE public.creator_star_wallets
  SET
    balance           = balance           + p_amount,
    lifetime_received = lifetime_received + p_amount,
    updated_at        = now()
  WHERE user_id = p_user_id
  RETURNING balance INTO v_new_balance;

  -- Ledger entry
  INSERT INTO public.creator_star_ledger
    (transaction_id, user_id,   debit, credit,   balance_after)
  VALUES
    (v_tx_id,        p_user_id, 0,     p_amount, v_new_balance);

  RETURN jsonb_build_object('ok', true, 'new_balance', v_new_balance);
END;
$$;

-- ── 8. Permissions ────────────────────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION public.send_stars        TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_grant_stars TO service_role;
