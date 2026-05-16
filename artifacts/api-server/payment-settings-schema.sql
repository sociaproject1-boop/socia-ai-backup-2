-- Payment Settings table
-- Replaces the legacy payment_methods_config singleton.
-- Single row (id = 1). Admin edits via /sys-admin → Methods tab.
-- Public read enabled so the checkout page can load it without auth.
-- All writes go through the service-role client (admin panel only).

CREATE TABLE IF NOT EXISTS payment_settings (
  id                int PRIMARY KEY DEFAULT 1,

  -- GCash
  gcash_enabled     boolean NOT NULL DEFAULT true,
  gcash_name        text,
  gcash_number      text,
  gcash_qr_url      text,

  -- Maya
  maya_enabled      boolean NOT NULL DEFAULT true,
  maya_name         text,
  maya_number       text,
  maya_qr_url       text,

  -- Bank / Visa
  bank_enabled      boolean NOT NULL DEFAULT true,
  bank_name         text,
  bank_account_name text,
  bank_account_no   text,
  bank_qr_url       text,

  -- Global
  notes             text,
  updated_at        timestamptz DEFAULT now(),
  updated_by        text
);

-- Seed the singleton row so the admin can edit it without an INSERT
INSERT INTO payment_settings (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

-- Row-level security
ALTER TABLE payment_settings ENABLE ROW LEVEL SECURITY;

-- Anyone can read (checkout page needs it without auth)
DROP POLICY IF EXISTS "public_read_payment_settings" ON payment_settings;
CREATE POLICY "public_read_payment_settings"
  ON payment_settings FOR SELECT
  USING (true);

-- No direct write from client tokens — all writes use the service-role key
-- (enforced by the api-server which uses getServiceClient())
