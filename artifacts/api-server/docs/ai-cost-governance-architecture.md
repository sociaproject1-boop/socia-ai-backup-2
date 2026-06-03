# SOCIA AI Command Center — Phase 2 Architecture: Enforcing Controls

> **Status:** Design proposal (not yet implemented). Phase 1 shipped the read-only
> observability layer (`/api/ai-ops/*` + the owner AI Operations Center). Phase 2
> turns those *observations* into *enforcement*: budget governance, auto-throttle,
> failover / provider switching, and cost protection.
>
> **Honesty contract still applies.** Every control below acts on real signals
> already recorded in `usage_receipts` and the engine registry. Nothing here
> invents data or hides a failure from the owner. When a control blocks or
> degrades a request, the user gets an honest error or an honestly-labelled
> downgrade — never a silent fake result.

---

## 1. What Phase 1 already gives us

These are the real foundations Phase 2 builds on (no new data sources required):

| Capability | Source of truth | Notes |
|---|---|---|
| Per-request ledger | `usage_receipts` (`tool_used`, `model_used`, `estimated_cost` ₱, `status`, `duration_ms`, `token_usage`, `created_at`) | Written by `trackUsage()` on every generate/chat call. |
| Provider ↔ feature wiring | `aiTopology.ts` + `engineRegistry.ts` | Config truth: which provider/model answers each feature, and the real failover chains. |
| Provider readiness | required env-key presence (`isProviderConfigured`) | Already surfaced as Configured / No key. |
| Live provider health | `/api/system-status/ai` | Status, latency, and balances where the provider exposes them. |
| Cost basis | `PHP_PER_USD = 56`, per-receipt ₱ estimate | Modelled pricing, success-only spend. |

**Constraint carried over from Phase 1:** `credit_ledger` is *not* in migrations, so it
must not be queried. Budget state in Phase 2 is derived from `usage_receipts` spend
plus live provider balances — never from a table that does not exist.

---

## 2. Control surfaces (where enforcement hooks in)

There is exactly one choke point worth instrumenting: the moment a feature is about
to call a provider. Today the flow is:

```
request → auth/rate-limit → feature handler → engineRegistry pick → provider call → trackUsage()
```

Phase 2 inserts a **policy gate** immediately before the provider call, and an
**outcome hook** that already exists (`trackUsage()`) feeding a rolling budget state:

```
request → auth/rate-limit → feature handler
        → [POLICY GATE] ── allow ─────────────→ provider call → trackUsage() ─┐
              │  throttle → queue / 429                                         │
              │  downgrade → cheaper model / provider                          │
              │  block → honest 402/503 + refund-safe path                     │
              └──────────────────────────────────────────────────────────────┘
                                     ▲ rolling budget + health state ◀─────────┘
```

The gate is a single pure function `evaluatePolicy(ctx) → Decision` so it is
testable in isolation and cannot fabricate: it only reads budget/health state and
returns one of `ALLOW | THROTTLE | DOWNGRADE | BLOCK` with a machine-readable reason.

---

## 3. Budget governance

### 3.1 Budget model
Budgets are expressed in ₱ (the unit the ledger already records) over the same
windows the dashboard uses, so the owner sees exactly what the enforcer sees:

- **Global**: ₱ per 24h / 7d / 30d.
- **Per feature** (`tool_used`): e.g. cap video generation independently of chat.
- **Per provider**: e.g. cap fal.ai spend even across features.

Stored in a new `ai_budgets` table (owner-managed), *not* in `credit_ledger`:

```
ai_budgets(id, scope_type ENUM('global','feature','provider'),
           scope_key TEXT NULL, window ENUM('24h','7d','30d'),
           limit_php NUMERIC, soft_pct NUMERIC DEFAULT 0.8,
           action ENUM('warn','throttle','downgrade','block') DEFAULT 'warn',
           enabled BOOL, updated_by, updated_at)
```

### 3.2 Spend computation
Current spend = the same success-only ₱ aggregation Phase 1 already runs
(`SUM(estimated_cost) WHERE status='success'` within the window, grouped by scope).
To avoid a full table scan on every request, maintain a **rolling counter** in
memory (and a short-TTL cache) that `trackUsage()` increments on each success, with
a periodic reconciliation against `usage_receipts` (the receipts table stays the
source of truth; the counter is a fast, correctable cache).

### 3.3 Thresholds
- `spend < soft_pct * limit` → **ALLOW**.
- `soft_pct * limit ≤ spend < limit` → apply the budget's *soft* `action`
  (default `warn`: serve normally but raise an owner alert + dashboard banner).
- `spend ≥ limit` → apply the budget's *hard* `action` (`throttle` / `downgrade` /
  `block`). The most restrictive matching budget wins.

---

## 4. Auto-throttle

When a scope is over a throttle threshold, instead of hard-failing we slow the
intake:

- **Token-bucket per scope** (feature/provider/global). Refill rate is derived from
  the remaining budget over the remaining window, so spend lands smoothly instead
  of front-loading.
- **Queue, don't drop**: excess requests get a bounded wait (reusing the existing
  render-worker queue for image/video; a lightweight in-process queue for chat).
  If the wait would exceed a ceiling, return an honest `429` with `Retry-After`.
- **Priority**: owner/admin and already-paid in-flight jobs bypass throttle; free
  anonymous traffic is shed first. This reuses the existing rate-limit identity.

Throttling is always *visible*: the dashboard shows which scopes are throttled and
why, and the API returns a `code: "AI_THROTTLED"` the client can render honestly.

---

## 5. Failover & provider switching

Phase 1 already documents the **real** chains (config truth) in `aiTopology.ts`:

- **Chat**: xAI Grok → OpenAI fallback (first-byte timeout). *Automatic.*
- **Image**: OpenAI `gpt-image-1`. *No cross-provider failover today.*
- **Video (default)**: fal.ai (Kling/Luma); fal mock only in dev. *Automatic within fal.*
- **Video (selectable)**: Runway / Veo / Pika — **no failover**; on failure the
  request fails and is auto-refunded.

Phase 2 makes switching a *policy* decision in addition to a *failure* decision:

1. **Health-aware routing**: if `/system-status/ai` reports a provider DOWN or
   latency over an SLA, the gate pre-emptively routes to the configured fallback
   *before* wasting a timeout — only along chains that already exist. It never
   invents a fallback where the registry says there is none (Runway/Veo/Pika stay
   no-failover; the honest outcome is failure + refund).
2. **Cost-aware switching (opt-in, owner-controlled)**: when a provider budget is
   exhausted but a *cheaper, registry-valid* alternative exists for that feature,
   the gate may `DOWNGRADE` (e.g. a smaller model). Downgrades are:
   - only ever between models the registry already lists for that feature;
   - surfaced to the user as an honest "served with <model>" note, never disguised
     as the premium result;
   - recorded in `usage_receipts` with the model actually used (so cost/observability
     stay truthful).
3. **Manual provider override**: owner can pin or disable a provider from the
   dashboard (e.g. "pause fal.ai"). This writes to a `provider_overrides` table the
   gate consults first. Disabling a provider with no fallback honestly disables the
   dependent feature rather than silently erroring per request.

---

## 6. Cost protection (hard stops)

The last line of defence, independent of budgets, to prevent runaway spend from a
bug or abuse:

- **Circuit breaker per provider**: if error-rate or spend-rate spikes beyond N×
  the trailing baseline (computed from `usage_receipts`), trip the breaker → BLOCK
  with `code: "AI_CIRCUIT_OPEN"` and an owner alert. Half-open probe restores it.
- **Per-user / per-IP spend ceiling**: reuse the existing identity from rate-limiting
  to cap ₱ per user per window, stopping a single account from draining the budget.
- **Refund safety**: any request blocked *after* a charge/hold must follow the
  existing auto-refund path (the same one Runway/Veo/Pika failures already use), so
  cost protection never silently keeps a user's credit.
- **Kill switch**: a single owner toggle (`ai_kill_switch`) that BLOCKs all
  non-essential AI calls with an honest maintenance message — the enforcement-side
  analogue of the existing payment maintenance override.

---

## 7. Owner experience (closing the loop with Phase 1)

Every Phase 2 control is configured and observed from the same AI Operations Center:

- **Budgets tab**: set/limit/soft-% per scope; live ₱ spend vs limit bars (reusing
  the Phase 1 cost aggregation).
- **Controls tab**: provider pause/pin toggles, kill switch, circuit-breaker status.
- **Activity feed**: already shows per-request outcome; Phase 2 adds the policy
  decision (`ALLOW/THROTTLE/DOWNGRADE/BLOCK` + reason) so enforcement is auditable.
- **Alerts**: soft-threshold, breaker-trip, and low-balance events reuse the
  existing monitor/alert channel.

---

## 8. Rollout plan

1. **Observe-only budgets** — add `ai_budgets`, compute spend, render vs-limit bars.
   No enforcement. Validates the spend math against the ledger in production.
2. **Soft actions** — enable `warn` (alerts/banners) at soft thresholds.
3. **Throttle** — token-bucket + queue, owner-gated per scope, with full dashboard
   visibility and `AI_THROTTLED` responses.
4. **Switching/downgrade** — health- and cost-aware routing, strictly within
   registry-valid chains; honest "served with <model>" labelling.
5. **Hard stops** — circuit breakers, per-user ceilings, kill switch.

Each stage is independently shippable and reversible, and each preserves the
honesty contract: **the owner always sees the truth, and the user is never handed a
fabricated result in place of a blocked or degraded one.**

---

## 9. Explicitly out of scope / honesty guardrails

- Do **not** introduce or query `credit_ledger` (not in migrations).
- Do **not** invent providers or failover paths not present in `engineRegistry.ts`
  (e.g. no Replicate; Runway/Veo/Pika remain no-failover).
- Do **not** expose ₱ cost to non-owner users — cost stays owner-only, exactly as
  Phase 1 enforces.
- Do **not** mask a downgrade as the premium output; always label the model used.
