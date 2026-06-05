-- Migration 47: Message delivery tracking
-- Adds delivered_at timestamp so we can show ✓ Sent / ✓✓ Delivered / ✓✓ Seen receipts.

ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ DEFAULT NULL;

COMMENT ON COLUMN messages.delivered_at IS
  'Set server-side when the receiver opens the thread. NULL = not yet delivered.';

CREATE INDEX IF NOT EXISTS idx_messages_delivered_at
  ON messages (delivered_at)
  WHERE delivered_at IS NULL;
