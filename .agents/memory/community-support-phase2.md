---
name: Community Support Phase 2
description: Architecture decisions and gotchas for the PayMongo community support checkout flow.
---

## Atomic resume RPC
`create_or_resume_pending_community_support` (migration 38) is the single source of truth for creating or resuming a pending `community_support` row. It runs under a per-user advisory lock.

Returns TABLE: `{ support_id uuid, was_created bool, armed bool }`.
- `was_created=true, armed=false` → new row, must call PayMongo
- `was_created=false, armed=true` → resume: fetch checkout_url from `raw_session`
- `was_created=false, armed=false` → racing twin (mid-flight), return 409 CHECKOUT_IN_PROGRESS

**Why:** The previous two-step approach (re-tap DB check then separate `create_pending_community_support` RPC) had a TOCTOU race where two concurrent taps could both miss the existing row and both create new PayMongo sessions. The atomic function serializes all branches under one lock.

## Frontend UX dead-end fix
When `busy=true` AND `fallbackUrl` is set (in-app browser redirect stalled), close/backdrop/ESC must be re-enabled. The guard is `disabled={busy && !fallbackUrl}`.

## Loading stages
Three stages: 1 → 2 at 1.5s → 3 at 3.5s. Copy keys: `securing`, `securingStage2`, `securingStage3` in all three locales (en, tl, ceb).

## SupportSuccess skip-ahead
After `SKIP_TRIES * POLL_MS` (8 × 1.5s ≈ 12s) of polling, show a ghost "Back to Socia" button so users are never permanently trapped on the success page if the webhook is slow.
