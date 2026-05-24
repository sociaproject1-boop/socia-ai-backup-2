-- =====================================================================
-- Migration 40 — Socia GPT per-profile persistent memory
-- =====================================================================
-- One row per (user, profile). Stores a compact text summary that the
-- chat route injects into the system prompt so the AI "remembers" the
-- user across sessions for a given persona profile. Snapshots are
-- written by the server (service role) on a periodic cadence — NOT
-- every message — to keep cost and write volume small.
--
-- Profile isolation: a user has up to 5 rows (one per profile). Clearing
-- one profile's memory does NOT affect the others.
--
-- RLS:
--   • SELECT: owner only (so the client UI can display the current
--     memory text for that profile).
--   • DELETE: owner only (so users can reset their own memory).
--   • INSERT/UPDATE: service-role only (no client policy) — writes
--     happen through the server's snapshot endpoint.
-- =====================================================================

create table if not exists public.socia_gpt_memory (
  user_id           uuid        not null references auth.users(id) on delete cascade,
  profile           text        not null,
  summary           text        not null default '',
  turn_count        int         not null default 0,
  snapshot_at_turn  int         not null default 0,
  updated_at        timestamptz not null default now(),
  primary key (user_id, profile),
  constraint socia_gpt_memory_profile_valid
    check (profile in ('assistant','creative','coding','cinematic','business')),
  constraint socia_gpt_memory_summary_size
    check (char_length(summary) <= 4000)
);

create index if not exists socia_gpt_memory_updated_at_idx
  on public.socia_gpt_memory (user_id, updated_at desc);

alter table public.socia_gpt_memory enable row level security;

drop policy if exists "users read own memory"   on public.socia_gpt_memory;
drop policy if exists "users delete own memory" on public.socia_gpt_memory;

create policy "users read own memory"
  on public.socia_gpt_memory
  for select
  using (auth.uid() = user_id);

create policy "users delete own memory"
  on public.socia_gpt_memory
  for delete
  using (auth.uid() = user_id);
