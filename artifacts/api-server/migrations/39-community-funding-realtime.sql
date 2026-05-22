-- =====================================================================
-- Migration 39 — Supabase Realtime for community_funding
-- =====================================================================
-- Adds community_funding to the supabase_realtime publication so the
-- frontend can receive live funding progress updates via
-- postgres_changes UPDATE events.
--
-- community_support is intentionally NOT added to this publication:
-- its rows contain user_id (RLS-gated, owner-read only). Progress
-- totals are fully captured by community_funding UPDATE events, which
-- are fired atomically by paymongo_finalize_support() on each confirmed
-- payment (migration 36). No per-user data is ever broadcast.
-- =====================================================================

ALTER PUBLICATION supabase_realtime ADD TABLE public.community_funding;
