-- ============================================================
-- Persistent Rate Limit Schema
-- Run this in your Supabase SQL editor.
-- ============================================================
-- Adds last_request_at to ai_usage_tracking so AI cooldowns
-- survive server restarts. The API server seeds the in-memory
-- cooldown Map from this column on first request after restart.
-- ============================================================

ALTER TABLE ai_usage_tracking
  ADD COLUMN IF NOT EXISTS last_request_at TIMESTAMPTZ;

-- Index for fast per-user cooldown lookups
CREATE INDEX IF NOT EXISTS idx_ai_usage_tracking_user_period
  ON ai_usage_tracking (user_id, plan_code, period_key);
