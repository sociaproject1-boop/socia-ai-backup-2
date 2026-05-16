-- Migration 16: Fix user_id FK relationships
-- ============================================================
-- payment_orders.user_id and refund_requests.user_id were
-- originally created with REFERENCES auth.users(id).
-- Supabase's relational join syntax (used by admin queries like
--   .select("*, users:user_id(username, name, email)")
-- ) only follows FK relationships to tables in the *public* schema.
-- This migration re-points both FKs to public.users(id) so the
-- admin panel join queries work correctly.
--
-- Run this in the Supabase SQL editor.
-- Safe to run multiple times (DROP CONSTRAINT IF EXISTS).
-- ============================================================

-- 1. payment_orders
ALTER TABLE public.payment_orders
  DROP CONSTRAINT IF EXISTS payment_orders_user_id_fkey;

ALTER TABLE public.payment_orders
  ADD CONSTRAINT payment_orders_user_id_fkey
    FOREIGN KEY (user_id)
    REFERENCES public.users(id)
    ON DELETE CASCADE;

-- 2. refund_requests
ALTER TABLE public.refund_requests
  DROP CONSTRAINT IF EXISTS refund_requests_user_id_fkey;

ALTER TABLE public.refund_requests
  ADD CONSTRAINT refund_requests_user_id_fkey
    FOREIGN KEY (user_id)
    REFERENCES public.users(id)
    ON DELETE CASCADE;
