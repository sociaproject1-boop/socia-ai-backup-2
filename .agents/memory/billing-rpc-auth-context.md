---
name: Billing refund must match the auth context that did the charge
description: Sync routes refund through user-JWT RPCs; background workers need an admin-context refund RPC and must mark the charge as refunded to stay idempotent across user-triggered retries.
---

**Rule:** A refund path must match the auth context that performed the charge, and must be idempotent against retries.

**Why:** User-context refund RPCs typically gate on `auth.uid()` and reject service-role callers. Background workers that don't carry the user JWT therefore need an admin variant that takes `p_user_id` explicitly and is GRANTed only to `service_role`. Separately, retry endpoints for async jobs often do *not* re-charge — so a refund record on the job row is required, otherwise a second terminal failure mints free credits.

**How to apply:**
- Sync request handlers: refund inside the request, using the user-context Supabase client captured at charge time.
- Async/queued workers: refund through an admin RPC and immediately mark the job as refunded (e.g. zero the stashed charged-amount + write a `refunded_at` field on the job row) so the user can't replay the refund by retrying.
- Refund failure must never throw — it must log loudly and let the original failure propagate. Operators reconcile from the log.
