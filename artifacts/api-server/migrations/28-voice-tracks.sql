-- Migration 28: Voice tracks for cinematic TTS pipeline
-- Run in Supabase SQL editor after migration 27.

-- ── voice_tracks table ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS voice_tracks (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id         UUID        NOT NULL REFERENCES render_jobs(id) ON DELETE CASCADE,
  scene_index    INTEGER     NOT NULL,
  dialogue_text  TEXT        NOT NULL DEFAULT '',
  voice_type     TEXT        NOT NULL DEFAULT 'cinematic-male',
  emotion        TEXT        NOT NULL DEFAULT 'calm',
  language       TEXT        NOT NULL DEFAULT 'en',
  speed          NUMERIC     NOT NULL DEFAULT 1.0,
  audio_url      TEXT,
  duration_sec   NUMERIC,
  timing_map     JSONB       DEFAULT '[]',
  status         TEXT        NOT NULL DEFAULT 'pending'
                             CHECK (status IN ('pending','generating','ready','failed')),
  error_message  TEXT,
  provider       TEXT        DEFAULT 'kokoro',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_voice_tracks_job_id
  ON voice_tracks(job_id);

CREATE INDEX IF NOT EXISTS idx_voice_tracks_job_scene
  ON voice_tracks(job_id, scene_index);

-- ── Row-level security ─────────────────────────────────────────────
ALTER TABLE voice_tracks ENABLE ROW LEVEL SECURITY;

-- Users can read their own voice tracks (via render_jobs ownership)
CREATE POLICY "Users read own voice tracks"
  ON voice_tracks
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM render_jobs
      WHERE render_jobs.id = voice_tracks.job_id
        AND render_jobs.user_id = auth.uid()
    )
  );

-- Service role (backend) has full access — inserts happen server-side only
-- (No INSERT policy for authenticated role — writes go through service-role only)

-- ── updated_at trigger ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_voice_tracks_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_voice_tracks_updated_at ON voice_tracks;
CREATE TRIGGER trg_voice_tracks_updated_at
  BEFORE UPDATE ON voice_tracks
  FOR EACH ROW EXECUTE FUNCTION update_voice_tracks_updated_at();

-- ── Realtime publication (optional — for live progress in future) ──
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'voice_tracks'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE voice_tracks;
  END IF;
END $$;
