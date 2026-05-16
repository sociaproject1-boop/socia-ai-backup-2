-- ══════════════════════════════════════════════════════════════════════
-- Migration 27: Render Jobs + Studio Projects (AI Film Director Studio)
-- Run in Supabase SQL editor ONCE.
-- ══════════════════════════════════════════════════════════════════════

-- ── Studio Projects: persist timelines, scenes, settings ──────────────
CREATE TABLE IF NOT EXISTS studio_projects (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title       TEXT NOT NULL DEFAULT 'Untitled Project',
  frames      JSONB NOT NULL DEFAULT '[]',
  config      JSONB NOT NULL DEFAULT '{}',
  version     INTEGER DEFAULT 1,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE studio_projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "studio_projects: owner read"
  ON studio_projects FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "studio_projects: owner write"
  ON studio_projects FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ── Render Jobs: persistent async render queue ──────────────────────
CREATE TABLE IF NOT EXISTS render_jobs (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id        UUID REFERENCES studio_projects(id) ON DELETE SET NULL,

  -- Core state machine
  status            TEXT NOT NULL DEFAULT 'queued' CHECK (status IN (
    'queued','preparing_assets','building_prompt_graph',
    'generating_motion','voice_synthesis','scene_blending',
    'audio_mixing','encoding','uploading',
    'completed','failed','cancelled'
  )),
  stage             TEXT NOT NULL DEFAULT 'queued',
  progress          NUMERIC(5,2) DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),

  -- Queue priority: 1=p30 (highest), 2=p15, 3=free (blocked at submit)
  priority          INTEGER NOT NULL DEFAULT 2,

  -- Retry / failure recovery
  retry_count       INTEGER DEFAULT 0,
  max_retries       INTEGER DEFAULT 3,
  failure_reason    TEXT,
  last_error        TEXT,

  -- Worker assignment
  worker_id         TEXT,
  worker_heartbeat  TIMESTAMPTZ,

  -- Rendering metadata
  render_engine     TEXT NOT NULL DEFAULT 'luma',
  plan_code         TEXT,

  -- Output assets
  output_url        TEXT,
  thumbnail_url     TEXT,
  preview_strip_url TEXT,
  duration_sec      NUMERIC(8,2),
  file_size_bytes   BIGINT,

  -- Resumable rendering: which stages are done
  completed_stages  TEXT[] DEFAULT '{}',

  -- Input payload (images, prompts, settings) — stored for retry
  input_payload     JSONB NOT NULL DEFAULT '{}',

  -- Segment-level metadata (per fal.ai segment results)
  segment_meta      JSONB DEFAULT '[]',

  -- Encoding state for resumable encode
  encoding_state    JSONB DEFAULT '{}',

  -- Timestamps
  queued_at         TIMESTAMPTZ DEFAULT NOW(),
  started_at        TIMESTAMPTZ,
  completed_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE render_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "render_jobs: owner read"
  ON render_jobs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "render_jobs: owner cancel"
  ON render_jobs FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id AND status = 'cancelled');

-- Indexes for efficient worker polling
CREATE INDEX IF NOT EXISTS render_jobs_queue_idx
  ON render_jobs (priority ASC, queued_at ASC)
  WHERE status = 'queued';

CREATE INDEX IF NOT EXISTS render_jobs_user_idx
  ON render_jobs (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS render_jobs_worker_idx
  ON render_jobs (worker_id, worker_heartbeat)
  WHERE status NOT IN ('completed', 'failed', 'cancelled');

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS render_jobs_updated_at ON render_jobs;
CREATE TRIGGER render_jobs_updated_at
  BEFORE UPDATE ON render_jobs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS studio_projects_updated_at ON studio_projects;
CREATE TRIGGER studio_projects_updated_at
  BEFORE UPDATE ON studio_projects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Add to realtime publication for live frontend updates
ALTER PUBLICATION supabase_realtime ADD TABLE render_jobs;

COMMENT ON TABLE render_jobs    IS 'Async render job queue for AI Film Director Studio';
COMMENT ON TABLE studio_projects IS 'Persisted timelines/scenes for Film Director Studio';
