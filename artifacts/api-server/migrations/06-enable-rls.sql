-- ================================================================
-- SECTION 6 of 13 — Enable RLS on all tables
-- ENABLE ROW LEVEL SECURITY is idempotent — safe to re-run.
-- Depends on: Sections 1–4 (all tables must exist)
-- ================================================================
BEGIN;

ALTER TABLE public.messages           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.typing_status      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_reactions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nicknames          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_subscriptions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_usage_tracking  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_requests        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_billing_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.refund_requests    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.refund_decisions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.funding_donations  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_funding  ENABLE ROW LEVEL SECURITY;

COMMIT;
