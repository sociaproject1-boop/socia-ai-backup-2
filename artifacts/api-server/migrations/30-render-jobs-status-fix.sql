-- Migration 30: Fix render_jobs status CHECK constraint
-- Adds missing intermediate stage values: 'transition_rendering', 'color_grading'
-- The render worker sets these but they were omitted from migration 27.
-- Run ONCE in the Supabase SQL editor.

-- Drop the old constraint (name may vary — use the Supabase-assigned name)
DO $$
DECLARE
  c_name TEXT;
BEGIN
  SELECT constraint_name INTO c_name
  FROM information_schema.table_constraints
  WHERE table_name = 'render_jobs'
    AND constraint_type = 'CHECK'
    AND constraint_name LIKE '%status%'
  LIMIT 1;

  IF c_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE render_jobs DROP CONSTRAINT %I', c_name);
  END IF;
END $$;

-- Re-add with the full set of status values the worker actually uses
ALTER TABLE render_jobs
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
