-- ══════════════════════════════════════════════════════════════════
-- STUDIO MIGRATION — PART 1 of 3: studio_projects
-- Paste into Supabase → SQL Editor and click Run.
-- Safe to re-run (uses IF NOT EXISTS / OR REPLACE).
-- ══════════════════════════════════════════════════════════════════

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

-- Confirm
SELECT count(*) AS studio_projects_rows FROM public.studio_projects;
