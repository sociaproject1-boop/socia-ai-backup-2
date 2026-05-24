-- Migration 41 — refund_credits_admin
--
-- WHY THIS EXISTS
--   The existing public.refund_credits RPC uses auth.uid() and raises
--   'not authenticated' (errcode 42501) when called with the service-role
--   key. That works fine for synchronous routes where gate.refund() runs
--   inside the user's request context, but the cinematic renderWorker is
--   an async background worker — it has no user JWT and must use the
--   service client. Before this migration the worker had no refund path
--   at all: any worker-side render failure silently kept the user's
--   credits. With this migration the worker can refund the EXACT amount
--   stashed in render_jobs.input_payload.charged_credits on terminal
--   failure of a refundable error code.
--
-- SECURITY
--   - SECURITY DEFINER so it runs as the function owner.
--   - REVOKE from PUBLIC, GRANT only to service_role. Authenticated users
--     cannot call this — they still go through public.refund_credits
--     which is bound to their own auth.uid().
--   - Same 1..200 amount bounds as public.refund_credits to prevent
--     accidental whale refunds from a buggy worker.
--   - Owner accounts short-circuit (return refunded=0) identical to the
--     user-facing RPC.

CREATE OR REPLACE FUNCTION public.refund_credits_admin(
  p_user_id UUID,
  p_amount  INTEGER,
  p_reason  TEXT,
  p_ref     TEXT DEFAULT NULL
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  bal INTEGER;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'p_user_id is required' USING ERRCODE = '22023';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 OR p_amount > 200 THEN
    RAISE EXCEPTION 'invalid refund amount' USING ERRCODE = '22023';
  END IF;

  -- Owner: ignore (mirrors public.refund_credits behavior).
  IF EXISTS (SELECT 1 FROM public.users WHERE id = p_user_id AND is_owner = TRUE) THEN
    RETURN jsonb_build_object('refunded', 0, 'balance', 2147483647);
  END IF;

  INSERT INTO public.user_billing (user_id, plan_code) VALUES (p_user_id, 'free')
    ON CONFLICT (user_id) DO NOTHING;

  UPDATE public.user_billing
     SET credits = credits + p_amount,
         updated_at = NOW()
   WHERE user_id = p_user_id
  RETURNING credits INTO bal;

  -- Best-effort ledger entry. If credit_ledger doesn't exist or insertion
  -- fails, we still return the refund result; ops can reconcile from logs.
  BEGIN
    INSERT INTO public.credit_ledger (user_id, delta, reason, ref, created_at)
      VALUES (p_user_id, p_amount, p_reason, p_ref, NOW());
  EXCEPTION WHEN undefined_table OR undefined_column THEN
    -- ledger table not present in this schema variant; skip silently
    NULL;
  END;

  RETURN jsonb_build_object('refunded', p_amount, 'balance', COALESCE(bal, 0));
END;
$$;

REVOKE ALL    ON FUNCTION public.refund_credits_admin(UUID, INTEGER, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL    ON FUNCTION public.refund_credits_admin(UUID, INTEGER, TEXT, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.refund_credits_admin(UUID, INTEGER, TEXT, TEXT) TO service_role;
