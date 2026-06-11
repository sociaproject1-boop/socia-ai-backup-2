---
name: Socia public.users sync invariant
description: ensureUserRow must be called in requireAuth or public.users stays empty, breaking author display.
---

## Rule
`ensureUserRow()` must be called fire-and-forget inside `requireAuth` (in `replitAuth.ts`) after every successful JWT verification — both Supabase JWT and legacy SESSION_SECRET JWT paths.

**Why:** `POST /api/auth/callback` is the only place `ensureUserRow` was previously called, but Supabase OAuth flows never hit that endpoint on normal login. Result: `public.users` stayed empty, so `enrichPosts` found no author rows and all feed cards showed "User" with a fallback avatar.

**How to apply:** Any time auth middleware is touched, verify `void ensureUserRow(id, {email, name, avatarUrl})` is still present in both the Supabase and legacy JWT branches of `requireAuth`. It is idempotent (upsert with `ON CONFLICT DO NOTHING`), so calling it on every request is safe.

## Backfill note
In June 2026, 3 existing post authors were backfilled manually into `public.users` using data from `auth.users`. Future users are covered by the `requireAuth` fix above.
