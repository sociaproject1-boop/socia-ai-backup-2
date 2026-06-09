-- ============================================================
-- GROUP CHAT SCHEMA  (run in Supabase SQL editor)
-- ============================================================

-- 1. Groups
CREATE TABLE IF NOT EXISTS chat_groups (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  avatar_url  TEXT,
  owner_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Members
CREATE TABLE IF NOT EXISTS chat_group_members (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id   UUID NOT NULL REFERENCES chat_groups(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role       TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner','admin','member')),
  joined_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (group_id, user_id)
);

-- 3. Messages
CREATE TABLE IF NOT EXISTS chat_group_messages (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id     UUID NOT NULL REFERENCES chat_groups(id) ON DELETE CASCADE,
  sender_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content      TEXT,
  attachments  JSONB NOT NULL DEFAULT '[]',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. Read tracking
CREATE TABLE IF NOT EXISTS chat_group_reads (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id             UUID NOT NULL REFERENCES chat_groups(id) ON DELETE CASCADE,
  user_id              UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  last_read_message_id UUID REFERENCES chat_group_messages(id) ON DELETE SET NULL,
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (group_id, user_id)
);

-- 5. Indexes
CREATE INDEX IF NOT EXISTS idx_cgm_group  ON chat_group_members(group_id);
CREATE INDEX IF NOT EXISTS idx_cgm_user   ON chat_group_members(user_id);
CREATE INDEX IF NOT EXISTS idx_cgmsg_grp  ON chat_group_messages(group_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cgr_gu     ON chat_group_reads(group_id, user_id);

-- 6. Auto updated_at trigger
CREATE OR REPLACE FUNCTION update_chat_groups_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;
DROP TRIGGER IF EXISTS trg_chat_groups_ts ON chat_groups;
CREATE TRIGGER trg_chat_groups_ts
  BEFORE UPDATE ON chat_groups
  FOR EACH ROW EXECUTE FUNCTION update_chat_groups_updated_at();

-- 7. Realtime (graceful -- skips if publication missing)
DO $$ BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE chat_group_messages; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE chat_group_reads;    EXCEPTION WHEN OTHERS THEN NULL; END;
END $$;
