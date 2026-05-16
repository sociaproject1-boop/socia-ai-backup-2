-- Migration 19: Usage receipts + partial refund infrastructure
-- Run AFTER migration 18.
-- Safe to re-run (all IF NOT EXISTS / DROP POLICY IF EXISTS guards).
--
-- PRIVACY NOTE:
--   estimated_cost is INTERNAL only. RLS on usage_receipts deliberately
--   excludes it from user-visible SELECT policies. Admin reads via the
--   service-role client (bypasses RLS entirely).

-- ── 1. usage_receipts ────────────────────────────────────────────────────
-- One row per AI generation or chat event.
-- estimated_cost is stored in PHP (₱) and is NEVER returned to regular users.

CREATE TABLE IF NOT EXISTS public.usage_receipts (
  id                UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  payment_order_id  UUID          REFERENCES public.payment_orders(id) ON DELETE SET NULL,
  tool_used         TEXT          NOT NULL,
    -- 'image_generation' | 'video_generation' | 'multiframe_video'
    -- | 'ai_chat' | 'preset_studio' | 'image_upscale'
  model_used        TEXT,
    -- 'gpt-image-1' | 'kling-1.6-pro' | 'luma' | 'gpt-4o-mini' | 'gpt-4o' | 'o1-mini'
  generation_type   TEXT,
    -- mirrors CreditAction: 'std_image' | 'hd_image' | 'std_video_5s' | etc.
  request_id        TEXT,          -- external provider trace/request ID
  estimated_cost    NUMERIC(10,4)  NOT NULL DEFAULT 0,
    -- Internal PHP cost estimate. ADMIN-ONLY. Never expose to users.
  duration_ms       INTEGER,       -- wall-clock generation time
  queue_time_ms     INTEGER,       -- time waiting in semaphore queue
  token_usage       JSONB,
    -- {prompt_tokens, completion_tokens, total_tokens} — AI chat only
  status            TEXT           NOT NULL DEFAULT 'success'
    CHECK (status IN ('success','failed','refunded','moderated')),
  metadata          JSONB,         -- extra provider-specific data (aspect, quality, etc.)
  created_at        TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

-- ── 2. Indexes ────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS usage_receipts_user_idx
  ON public.usage_receipts(user_id);

CREATE INDEX IF NOT EXISTS usage_receipts_order_idx
  ON public.usage_receipts(payment_order_id)
  WHERE payment_order_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS usage_receipts_created_idx
  ON public.usage_receipts(created_at DESC);

CREATE INDEX IF NOT EXISTS usage_receipts_user_created_idx
  ON public.usage_receipts(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS usage_receipts_tool_idx
  ON public.usage_receipts(tool_used);

CREATE INDEX IF NOT EXISTS usage_receipts_request_id_idx
  ON public.usage_receipts(request_id)
  WHERE request_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS usage_receipts_status_idx
  ON public.usage_receipts(status);

-- ── 3. RLS ────────────────────────────────────────────────────────────────
-- Users may read their own rows but ONLY the safe (non-cost) columns.
-- The estimated_cost column is excluded from user-visible queries in
-- application code; RLS here just gates row access, not column access.
-- Column-level privacy is enforced in the API layer.

ALTER TABLE public.usage_receipts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "usage_receipts_own_select" ON public.usage_receipts;
CREATE POLICY "usage_receipts_own_select"
  ON public.usage_receipts FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "usage_receipts_own_insert" ON public.usage_receipts;
CREATE POLICY "usage_receipts_own_insert"
  ON public.usage_receipts FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- ── 4. Partial-refund helper columns on refund_requests ──────────────────
-- Stores the result of the partial-refund engine so decisions persist.

ALTER TABLE public.refund_requests
  ADD COLUMN IF NOT EXISTS actual_ai_cost_php    NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS usage_based_refundable NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS heavy_usage_score      INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS usage_snapshot         JSONB;
    -- Admin-only snapshot: {image_count, video_count, chat_count, total_cost, breakdown[]}

CREATE INDEX IF NOT EXISTS refund_requests_heavy_idx
  ON public.refund_requests(heavy_usage_score)
  WHERE heavy_usage_score > 0;
