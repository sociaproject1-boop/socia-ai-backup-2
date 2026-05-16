-- Migration 29: Studio Projects
-- Persistent storage for AI Film Director Studio timelines
-- Run in Supabase SQL editor

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

-- Index for fast user project listing
CREATE INDEX IF NOT EXISTS studio_projects_user_id_updated_at
  ON public.studio_projects (user_id, updated_at DESC);

-- Auto-update updated_at on row change
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

-- Row-level security: users can only see/edit their own projects
ALTER TABLE public.studio_projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner read"   ON public.studio_projects FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "owner insert" ON public.studio_projects FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "owner update" ON public.studio_projects FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "owner delete" ON public.studio_projects FOR DELETE USING (auth.uid() = user_id);
