-- ══════════════════════════════════════════════════════════════════
-- STUDIO MIGRATION — PART 2 of 3: render_jobs
-- Run AFTER Part 1 (studio_projects must exist first).
-- Paste into Supabase → SQL Editor and click Run.
-- Safe to re-run (uses IF NOT EXISTS / OR REPLACE).
-- ══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.render_jobs (
  id                uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id        uuid         REFERENCES public.studio_projects(id) ON DELETE SET NULL,

  status            text         NOT NULL DEFAULT 'queued',
  stage             text         NOT NULL DEFAULT 'queued',
  progress          numeric(5,2) DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),

  priority          integer      NOT NULL DEFAULT 2,

  retry_count       integer      DEFAULT 0,
  max_retries       integer      DEFAULT 3,
  failure_reason    text,
  last_error        text,

  worker_id         text,
  worker_heartbeat  timestamptz,

  render_engine     text         NOT NULL DEFAULT 'kling-standard',
  plan_code         text,

  output_url        text,
  thumbnail_url     text,
  preview_strip_url text,
  duration_sec      numeric(8,2),
  file_size_bytes   bigint,

  completed_stages  text[]       DEFAULT '{}',
  input_payload     jsonb        NOT NULL DEFAULT '{}',
  segment_meta      jsonb        DEFAULT '[]',
  encoding_state    jsonb        DEFAULT '{}',

  queued_at         timestamptz  DEFAULT now(),
  started_at        timestamptz,
  completed_at      timestamptz,
  created_at        timestamptz  DEFAULT now(),
  updated_at        timestamptz  DEFAULT now()
);

-- Drop any existing status CHECK so we can replace it with the full list
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
    'queued',
    'preparing_assets',
    'building_prompt_graph',
    'generating_motion',
    'voice_synthesis',
    'transition_rendering',
    'scene_blending',
    'color_grading',
    'audio_mixing',
    'encoding',
    'uploading',
    'completed',
    'failed',
    'cancelled'
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

-- Confirm
SELECT count(*) AS render_jobs_rows FROM public.render_jobs;
