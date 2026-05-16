-- ================================================================
-- SECTION 9 of 13 — Policies: users + privilege escalation trigger
-- Depends on: Section 6 (RLS must be enabled)
-- Safe to run multiple times (idempotent).
--
-- Two-layer protection:
--   Layer 1 — RLS: SELECT public; UPDATE own row only
--   Layer 2 — Trigger: is_owner / is_verified / is_banned /
--             is_suspended cannot be changed by 'authenticated'
--             or 'anon' — only service_role / postgres can.
-- ================================================================
BEGIN;

DROP POLICY IF EXISTS "users_select_public"  ON public.users;
DROP POLICY IF EXISTS "users_update_own_row" ON public.users;
DROP POLICY IF EXISTS "users_update_own"     ON public.users;

CREATE POLICY "users_select_public" ON public.users
  FOR SELECT USING (true);

CREATE POLICY "users_update_own_row" ON public.users
  FOR UPDATE
  USING  (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE OR REPLACE FUNCTION public.prevent_privilege_escalation()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF current_user NOT IN ('service_role','postgres','supabase_admin') THEN
    IF NEW.is_owner     IS DISTINCT FROM OLD.is_owner     OR
       NEW.is_verified  IS DISTINCT FROM OLD.is_verified  OR
       NEW.is_banned    IS DISTINCT FROM OLD.is_banned    OR
       NEW.is_suspended IS DISTINCT FROM OLD.is_suspended THEN
      RAISE EXCEPTION
        'privilege_escalation_blocked: admin-only columns';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_privilege_escalation ON public.users;
CREATE TRIGGER trg_prevent_privilege_escalation
  BEFORE UPDATE ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_privilege_escalation();

COMMIT;
