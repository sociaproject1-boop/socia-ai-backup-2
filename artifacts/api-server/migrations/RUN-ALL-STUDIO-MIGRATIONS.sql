-- ══════════════════════════════════════════════════════════════════
-- AI FILM DIRECTOR STUDIO — Complete DB Setup (Single Run)
-- Run this ONCE in Supabase → SQL Editor.
-- Safe to re-run: all statements use IF NOT EXISTS / OR REPLACE.
-- ══════════════════════════════════════════════════════════════════

-- ── 1. Studio Projects ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.studio_projects (
  id          uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title       text          NOT NULL DEFAULT 'Untitled Project',
  frames      jsonb         NOT NULL DEFAULT '[]',
  config      jsonb         NOT NULL DEFAULT '{}',
  version     integer       NOT NULL DEFAULT 1,
  created_at  timestamptz   NOT NULL DEFAULT now(),
  updated_at  timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS studio_projects_user_id_updated_at
  ON public.studio_projects (user_id, updated_at DESC);

ALTER TABLE public.studio_projects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "studio_projects: owner read"  ON public.studio_projects;
DROP POLICY IF EXISTS "studio_projects: owner write" ON public.studio_projects;

CREATE POLICY "studio_projects: owner read"
  ON public.studio_projects FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "studio_projects: owner write"
  ON public.studio_projects FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.touch_studio_project_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_studio_projects_updated_at ON public.studio_projects;
CREATE TRIGGER trg_studio_projects_updated_at
  BEFORE UPDATE ON public.studio_projects
  FOR EACH ROW EXECUTE FUNCTION public.touch_studio_project_updated_at();

-- ── 2. Render Jobs ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.render_jobs (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id        uuid        REFERENCES public.studio_projects(id) ON DELETE SET NULL,

  status            text        NOT NULL DEFAULT 'queued',
  stage             text        NOT NULL DEFAULT 'queued',
  progress          numeric(5,2) DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),

  priority          integer     NOT NULL DEFAULT 2,

  retry_count       integer     DEFAULT 0,
  max_retries       integer     DEFAULT 3,
  failure_reason    text,
  last_error        text,

  worker_id         text,
  worker_heartbeat  timestamptz,

  render_engine     text        NOT NULL DEFAULT 'kling-standard',
  plan_code         text,

  output_url        text,
  thumbnail_url     text,
  preview_strip_url text,
  duration_sec      numeric(8,2),
  file_size_bytes   bigint,

  completed_stages  text[]      DEFAULT '{}',
  input_payload     jsonb       NOT NULL DEFAULT '{}',
  segment_meta      jsonb       DEFAULT '[]',
  encoding_state    jsonb       DEFAULT '{}',

  queued_at         timestamptz DEFAULT now(),
  started_at        timestamptz,
  completed_at      timestamptz,
  created_at        timestamptz DEFAULT now(),
  updated_at        timestamptz DEFAULT now()
);

-- Add the full status CHECK constraint (drop old one first if it exists)
DO $$
DECLARE c_name text;
BEGIN
  SELECT constraint_name INTO c_name
  FROM information_schema.table_constraints
  WHERE table_name = 'render_jobs'
    AND constraint_type = 'CHECK'
    AND constraint_name LIKE '%status%'
  LIMIT 1;
  IF c_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.render_jobs DROP CONSTRAINT %I', c_name);
  END IF;
END $$;

ALTER TABLE public.render_jobs
  ADD CONSTRAINT render_jobs_status_check CHECK (status IN (
    'queued', 'preparing_assets', 'building_prompt_graph',
    'generating_motion', 'voice_synthesis', 'transition_rendering',
    'scene_blending', 'color_grading', 'audio_mixing',
    'encoding', 'uploading',
    'completed', 'failed', 'cancelled'
  ));

ALTER TABLE public.render_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "render_jobs: owner read"   ON public.render_jobs;
DROP POLICY IF EXISTS "render_jobs: owner cancel" ON public.render_jobs;

CREATE POLICY "render_jobs: owner read"
  ON public.render_jobs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "render_jobs: owner cancel"
  ON public.render_jobs FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id AND status = 'cancelled');

CREATE INDEX IF NOT EXISTS render_jobs_queue_idx
  ON public.render_jobs (priority ASC, queued_at ASC)
  WHERE status = 'queued';

CREATE INDEX IF NOT EXISTS render_jobs_user_idx
  ON public.render_jobs (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS render_jobs_worker_idx
  ON public.render_jobs (worker_id, worker_heartbeat)
  WHERE status NOT IN ('completed', 'failed', 'cancelled');

CREATE OR REPLACE FUNCTION public.update_render_jobs_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS render_jobs_updated_at ON public.render_jobs;
CREATE TRIGGER render_jobs_updated_at
  BEFORE UPDATE ON public.render_jobs
  FOR EACH ROW EXECUTE FUNCTION public.update_render_jobs_updated_at();

-- ── 3. Voice Tracks ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.voice_tracks (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id         uuid        NOT NULL REFERENCES public.render_jobs(id) ON DELETE CASCADE,
  scene_index    integer     NOT NULL,
  dialogue_text  text        NOT NULL DEFAULT '',
  voice_type     text        NOT NULL DEFAULT 'cinematic-male',
  emotion        text        NOT NULL DEFAULT 'calm',
  language       text        NOT NULL DEFAULT 'en',
  speed          numeric     NOT NULL DEFAULT 1.0,
  audio_url      text,
  duration_sec   numeric,
  timing_map     jsonb       DEFAULT '[]',
  status         text        NOT NULL DEFAULT 'pending'
                             CHECK (status IN ('pending','generating','ready','failed')),
  error_message  text,
  provider       text        DEFAULT 'kokoro',
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_voice_tracks_job_id      ON public.voice_tracks(job_id);
CREATE INDEX IF NOT EXISTS idx_voice_tracks_job_scene   ON public.voice_tracks(job_id, scene_index);

ALTER TABLE public.voice_tracks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own voice tracks" ON public.voice_tracks;
CREATE POLICY "Users read own voice tracks"
  ON public.voice_tracks FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.render_jobs
      WHERE render_jobs.id = voice_tracks.job_id
        AND render_jobs.user_id = auth.uid()
    )
  );

CREATE OR REPLACE FUNCTION public.update_voice_tracks_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_voice_tracks_updated_at ON public.voice_tracks;
CREATE TRIGGER trg_voice_tracks_updated_at
  BEFORE UPDATE ON public.voice_tracks
  FOR EACH ROW EXECUTE FUNCTION public.update_voice_tracks_updated_at();

-- ── 4. Realtime (optional) ─────────────────────────────────────────
DO $$ BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.render_jobs; EXCEPTION WHEN others THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.voice_tracks; EXCEPTION WHEN others THEN NULL; END;
END $$;

-- ── Done ───────────────────────────────────────────────────────────
SELECT
  (SELECT count(*) FROM public.studio_projects) AS studio_projects_rows,
  (SELECT count(*) FROM public.render_jobs)     AS render_jobs_rows,
  (SELECT count(*) FROM public.voice_tracks)    AS voice_tracks_rows;
