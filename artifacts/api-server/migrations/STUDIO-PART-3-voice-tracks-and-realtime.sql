-- ══════════════════════════════════════════════════════════════════
-- STUDIO MIGRATION — PART 3 of 3: voice_tracks + Realtime
-- Run AFTER Part 2 (render_jobs must exist first).
-- Paste into Supabase → SQL Editor and click Run.
-- Safe to re-run (uses IF NOT EXISTS / OR REPLACE).
-- ══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.voice_tracks (
  id             uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id         uuid         NOT NULL REFERENCES public.render_jobs(id) ON DELETE CASCADE,
  scene_index    integer      NOT NULL,
  dialogue_text  text         NOT NULL DEFAULT '',
  voice_type     text         NOT NULL DEFAULT 'cinematic-male',
  emotion        text         NOT NULL DEFAULT 'calm',
  language       text         NOT NULL DEFAULT 'en',
  speed          numeric      NOT NULL DEFAULT 1.0,
  audio_url      text,
  duration_sec   numeric,
  timing_map     jsonb        DEFAULT '[]',
  status         text         NOT NULL DEFAULT 'pending'
                              CHECK (status IN ('pending','generating','ready','failed')),
  error_message  text,
  provider       text         DEFAULT 'kokoro',
  created_at     timestamptz  NOT NULL DEFAULT now(),
  updated_at     timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_voice_tracks_job_id
  ON public.voice_tracks (job_id);

CREATE INDEX IF NOT EXISTS idx_voice_tracks_job_scene
  ON public.voice_tracks (job_id, scene_index);

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

-- Enable Realtime on render_jobs and voice_tracks
-- (errors are silently swallowed if already added)
DO $$ BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.render_jobs;
  EXCEPTION WHEN others THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.voice_tracks;
  EXCEPTION WHEN others THEN NULL;
  END;
END $$;

-- ── Final confirmation ─────────────────────────────────────────────
-- You should see three rows with count = 0. That means all tables
-- were created successfully and are ready to receive data.
SELECT
  (SELECT count(*) FROM public.studio_projects) AS studio_projects_rows,
  (SELECT count(*) FROM public.render_jobs)     AS render_jobs_rows,
  (SELECT count(*) FROM public.voice_tracks)    AS voice_tracks_rows;
