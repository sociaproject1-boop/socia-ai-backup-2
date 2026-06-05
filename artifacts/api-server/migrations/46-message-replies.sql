-- Migration 46: Message reply threading
-- Adds reply_to_id so messages can quote a parent message.
-- ON DELETE SET NULL: deleting the original doesn't break the reply bubble.

ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS reply_to_id UUID
    REFERENCES messages(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_messages_reply_to
  ON messages (reply_to_id)
  WHERE reply_to_id IS NOT NULL;

COMMENT ON COLUMN messages.reply_to_id IS
  'Optional FK to the message this row is replying to. NULL = not a reply.';
