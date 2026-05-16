-- ============================================================
-- Community Funding System — SQL Migration
-- Run this in the Supabase SQL editor.
-- ============================================================

-- Global funding goal (single row)
CREATE TABLE IF NOT EXISTS community_funding (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_amount    numeric(12,2) NOT NULL DEFAULT 50000,
  current_amount   numeric(12,2) NOT NULL DEFAULT 0,
  supporters_count integer       NOT NULL DEFAULT 0,
  is_goal_reached  boolean       NOT NULL DEFAULT false,
  unlock_phase     integer       NOT NULL DEFAULT 1,
  updated_at       timestamptz   NOT NULL DEFAULT now()
);

-- Seed the single global row
INSERT INTO community_funding (id, target_amount)
VALUES ('00000000-0000-0000-0000-000000000001', 50000)
ON CONFLICT (id) DO NOTHING;

-- Individual support submissions
CREATE TABLE IF NOT EXISTS funding_donations (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount           numeric(10,2) NOT NULL CHECK (amount >= 50),
  payment_method   text NOT NULL CHECK (payment_method IN ('gcash', 'maya')),
  reference_no     text,
  screenshot_url   text,
  status           text NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending', 'approved', 'rejected')),
  admin_notes      text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  approved_at      timestamptz
);

-- Updated_at trigger for community_funding
CREATE OR REPLACE FUNCTION update_community_funding_ts()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;
DROP TRIGGER IF EXISTS trg_community_funding_ts ON community_funding;
CREATE TRIGGER trg_community_funding_ts
  BEFORE UPDATE ON community_funding
  FOR EACH ROW EXECUTE FUNCTION update_community_funding_ts();

-- RLS
ALTER TABLE community_funding  ENABLE ROW LEVEL SECURITY;
ALTER TABLE funding_donations  ENABLE ROW LEVEL SECURITY;

-- community_funding: anyone can read, only service role writes
DROP POLICY IF EXISTS "public_read_funding"        ON community_funding;
CREATE POLICY "public_read_funding" ON community_funding
  FOR SELECT USING (true);

-- funding_donations: users see/insert their own rows
DROP POLICY IF EXISTS "users_read_own_donations"   ON funding_donations;
DROP POLICY IF EXISTS "users_insert_own_donations" ON funding_donations;
CREATE POLICY "users_read_own_donations" ON funding_donations
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "users_insert_own_donations" ON funding_donations
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_fd_user    ON funding_donations(user_id);
CREATE INDEX IF NOT EXISTS idx_fd_status  ON funding_donations(status);
CREATE INDEX IF NOT EXISTS idx_fd_created ON funding_donations(created_at DESC);

-- Verify
SELECT 'community_funding' AS tbl, count(*) FROM community_funding
UNION ALL
SELECT 'funding_donations',        count(*) FROM funding_donations;
