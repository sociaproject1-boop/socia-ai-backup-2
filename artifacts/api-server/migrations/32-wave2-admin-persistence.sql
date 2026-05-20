-- Migration 32: Wave 2 admin persistence tables
--
-- Adds three additive tables for the Command Center:
--   1. studio_model_config — replaces admin localStorage for AI render engine config
--   2. admin_escalations   — replaces in-memory escalation queue
--   3. anomaly_events      — persists behavioural anomaly clusters
--
-- Fully idempotent (`IF NOT EXISTS`) and safe to re-run. No destructive ops.
-- Existing functionality is unaffected.

/* ── studio_model_config ─────────────────────────────────────────────── */
CREATE TABLE IF NOT EXISTS public.studio_model_config (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  enabled         BOOLEAN NOT NULL DEFAULT true,
  credits_per_seg INTEGER NOT NULL DEFAULT 10 CHECK (credits_per_seg BETWEEN 1 AND 500),
  min_plan        TEXT NOT NULL DEFAULT 'free' CHECK (min_plan IN ('free','p15','p30')),
  max_frames      INTEGER NOT NULL DEFAULT 10 CHECK (max_frames BETWEEN 2 AND 20),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by      TEXT
);

-- Seed defaults only when the table is empty (first run).
INSERT INTO public.studio_model_config (id, name, enabled, credits_per_seg, min_plan, max_frames)
SELECT * FROM (VALUES
  ('kling-standard',  'Kling Standard',  true,  10, 'free', 10),
  ('kling-cinematic', 'Kling Cinematic', true,  18, 'p15',  10),
  ('runway-gen4',     'Runway Gen-4',    true,  35, 'p15',  10),
  ('veo-ultra',       'Veo Ultra',       true,  60, 'p30',  10),
  ('anime-motion',    'Anime Motion',    true,  13, 'free', 10),
  ('hyper-real',      'Hyper Real',      true,  30, 'p15',  10)
) AS v(id, name, enabled, credits_per_seg, min_plan, max_frames)
WHERE NOT EXISTS (SELECT 1 FROM public.studio_model_config LIMIT 1);

COMMENT ON TABLE public.studio_model_config IS
  'Studio AI render engine config — DB-backed via /admin/studio/models. Wave 2 migration.';

/* ── admin_escalations ───────────────────────────────────────────────── */
CREATE TABLE IF NOT EXISTS public.admin_escalations (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type         TEXT NOT NULL CHECK (type IN (
                  'auto_freeze','auto_quarantine','auto_suspend',
                  'risk_escalation','velocity_alert','coordinated_attack')),
  status       TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','approved','dismissed')),
  user_id      UUID,
  username     TEXT,
  reason       TEXT NOT NULL,
  score        NUMERIC NOT NULL DEFAULT 0,
  evidence     JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_at   TIMESTAMPTZ,
  decided_by   TEXT
);

CREATE INDEX IF NOT EXISTS idx_admin_escalations_status_created
  ON public.admin_escalations (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_escalations_user
  ON public.admin_escalations (user_id);

-- Dedup: while still pending, the same (type, user_id) combo can't be re-added.
CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_escalations_dedup
  ON public.admin_escalations (type, user_id)
  WHERE status = 'pending' AND user_id IS NOT NULL;

COMMENT ON TABLE public.admin_escalations IS
  'DB-backed escalation queue (replaces in-memory queue). Wave 2 migration.';

/* ── anomaly_events ──────────────────────────────────────────────────── */
CREATE TABLE IF NOT EXISTS public.anomaly_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID,
  username        TEXT,
  event_count     INTEGER NOT NULL DEFAULT 0,
  critical_count  INTEGER NOT NULL DEFAULT 0,
  high_count      INTEGER NOT NULL DEFAULT 0,
  avg_score       NUMERIC NOT NULL DEFAULT 0,
  max_score       NUMERIC NOT NULL DEFAULT 0,
  risk_score      INTEGER NOT NULL DEFAULT 0
                  CHECK (risk_score BETWEEN 0 AND 100),
  escalated       BOOLEAN NOT NULL DEFAULT false,
  first_seen      TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen       TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_anomaly_events_created
  ON public.anomaly_events (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_anomaly_events_user
  ON public.anomaly_events (user_id, created_at DESC)
  WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_anomaly_events_escalated
  ON public.anomaly_events (created_at DESC)
  WHERE escalated = true;

COMMENT ON TABLE public.anomaly_events IS
  'Persisted behavioural anomaly clusters from AnomalyEngine. Wave 2 migration.';
