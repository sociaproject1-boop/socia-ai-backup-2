-- ============================================================
-- PULSE SYSTEM — Supabase migration
-- Run this in the Supabase SQL editor (Project → SQL Editor)
-- ============================================================

-- 1. pulses — core story records
CREATE TABLE IF NOT EXISTS pulses (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type            text        NOT NULL CHECK (type IN ('image', 'video', 'text')),
  media_url       text,
  text_content    text,
  text_bg         text        DEFAULT '#0f0f23',
  text_color      text        DEFAULT '#ffffff',
  music_url       text,
  music_name      text,
  visibility      text        NOT NULL DEFAULT 'public'
                              CHECK (visibility IN ('public', 'followers', 'friends', 'private')),
  is_reported     boolean     DEFAULT false,
  created_at      timestamptz DEFAULT now(),
  expires_at      timestamptz DEFAULT (now() + interval '24 hours')
);

-- 2. pulse_views — who watched what
CREATE TABLE IF NOT EXISTS pulse_views (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  pulse_id    uuid        NOT NULL REFERENCES pulses(id) ON DELETE CASCADE,
  viewer_id   uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  viewed_at   timestamptz DEFAULT now(),
  UNIQUE (pulse_id, viewer_id)
);

-- 3. pulse_reactions — emoji reactions
CREATE TABLE IF NOT EXISTS pulse_reactions (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  pulse_id    uuid        NOT NULL REFERENCES pulses(id) ON DELETE CASCADE,
  user_id     uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  emoji       text        NOT NULL,
  created_at  timestamptz DEFAULT now(),
  UNIQUE (pulse_id, user_id)
);

-- 4. pulse_reports — moderation reports
CREATE TABLE IF NOT EXISTS pulse_reports (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  pulse_id    uuid        NOT NULL REFERENCES pulses(id) ON DELETE CASCADE,
  reporter_id uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason      text        NOT NULL DEFAULT 'Inappropriate content',
  created_at  timestamptz DEFAULT now(),
  UNIQUE (pulse_id, reporter_id)
);

-- ── Indexes ──────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS pulses_user_id_idx       ON pulses (user_id);
CREATE INDEX IF NOT EXISTS pulses_expires_at_idx    ON pulses (expires_at);
CREATE INDEX IF NOT EXISTS pulse_views_pulse_id_idx ON pulse_views (pulse_id);
CREATE INDEX IF NOT EXISTS pulse_views_viewer_idx   ON pulse_views (viewer_id);

-- ── Row Level Security ───────────────────────────────────────────────────
ALTER TABLE pulses          ENABLE ROW LEVEL SECURITY;
ALTER TABLE pulse_views     ENABLE ROW LEVEL SECURITY;
ALTER TABLE pulse_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE pulse_reports   ENABLE ROW LEVEL SECURITY;

-- pulses: read public/non-expired; full access to own
CREATE POLICY "Read active public pulses"
  ON pulses FOR SELECT
  USING (visibility = 'public' AND expires_at > now());

CREATE POLICY "Owner full access"
  ON pulses FOR ALL
  USING (auth.uid() = user_id);

-- pulse_views: insert own views; read own pulse's views
CREATE POLICY "Insert own views"
  ON pulse_views FOR INSERT
  WITH CHECK (auth.uid() = viewer_id);

CREATE POLICY "Read views of own pulses"
  ON pulse_views FOR SELECT
  USING (pulse_id IN (SELECT id FROM pulses WHERE user_id = auth.uid()));

-- pulse_reactions: full access to own reactions
CREATE POLICY "Own reactions"
  ON pulse_reactions FOR ALL
  USING (auth.uid() = user_id);

-- pulse_reports: insert own reports
CREATE POLICY "Insert reports"
  ON pulse_reports FOR INSERT
  WITH CHECK (auth.uid() = reporter_id);

-- ── Storage bucket ───────────────────────────────────────────────────────
-- Run in Storage dashboard: create a bucket named "pulses" with PUBLIC access enabled.
-- OR via SQL (requires pg_net extension):
-- INSERT INTO storage.buckets (id, name, public) VALUES ('pulses', 'pulses', true)
-- ON CONFLICT (id) DO NOTHING;
