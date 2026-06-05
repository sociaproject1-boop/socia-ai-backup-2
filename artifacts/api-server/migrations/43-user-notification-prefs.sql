-- Migration 43: User notification preferences + webhook_headers on alert_settings
-- Run: copy into Supabase SQL Editor and execute

-- ─── User notification preferences ───────────────────────────────────────
-- Adds opt-in notification columns to the users table.
-- Users may subscribe to email/SMS/push notifications independently.
-- cover_photo_url: owner profile cover photo (stored in cover-photos bucket).
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS phone_number          text,
  ADD COLUMN IF NOT EXISTS email_notifications   boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sms_notifications     boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS push_notifications    boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS push_token            text,
  ADD COLUMN IF NOT EXISTS cover_photo_url       text;

-- ─── webhook_headers on alert_settings (if migration 42 was already applied) ─
ALTER TABLE public.alert_settings
  ADD COLUMN IF NOT EXISTS webhook_headers jsonb;

-- ─── User notification prefs API helper ──────────────────────────────────
-- Lets users read and update their own notification preferences.
-- No extra RLS policy needed: users already have a "Users manage own row" policy
-- on the users table (created in an earlier migration).
-- If that policy doesn't cover UPDATE on the new columns, add it:
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'users'
      AND policyname = 'Users update own notification prefs'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "Users update own notification prefs"
        ON public.users
        FOR UPDATE
        USING (id = auth.uid())
        WITH CHECK (id = auth.uid())
    $policy$;
  END IF;
END $$;

-- ─── Index: find users opted-in to SMS notifications ─────────────────────
CREATE INDEX IF NOT EXISTS users_sms_notifications_idx
  ON public.users(sms_notifications)
  WHERE sms_notifications = true;

CREATE INDEX IF NOT EXISTS users_email_notifications_idx
  ON public.users(email_notifications)
  WHERE email_notifications = true;
