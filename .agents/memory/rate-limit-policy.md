---
name: Per-IP rate-limit policy for sensitive endpoints
description: How and where rate limiting is applied, what is intentionally NOT limited, and what to swap when the deploy goes multi-instance.
---

**Rule:** Mutation/credit-spend endpoints must sit behind a per-IP sliding-window limiter; webhook delivery endpoints and refund endpoints must NOT be limited.

**Why:** Credit spend + auth attempts are the only realistic burst-abuse vectors. Webhook bursts come from the upstream provider (PayMongo) and blocking them mints failed payments — the HMAC signature + replay window already gates them. Refund endpoints must always succeed because they unwind a charge, and blocking them creates billing integrity bugs worse than any spam they enable.

**How to apply:**
- Use `createRateLimiter({ name, windowSec, max, keyOf? })` from `lib/rateLimit.ts`. Mount it BEFORE `requireAuth` so unauthenticated abuse can't even reach the auth check.
- Default key is IP via `getClientIp(req)` (preference order: `cf-connecting-ip` → `x-forwarded-for[0]` → `x-real-ip` → `req.ip`). For auth routes, override `keyOf` to combine IP + username so a single IP can't amortize a password attack across many usernames.
- The limiter is in-process: a multi-instance deploy must swap the internal `Map` for Redis/KV with the same `take(key)` semantics. Single-instance is fine on Replit Reserved VM / Autoscale (1 pod).
- Do NOT limit: `/paymongo/webhook`, any future `/.../webhook` endpoints, any refund/reconciliation route, internal health probes.
