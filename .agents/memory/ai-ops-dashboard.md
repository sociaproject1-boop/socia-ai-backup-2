---
name: AI Ops / Command Center observability
description: Durable conventions for SOCIA's owner-only AI monitoring dashboard and its backend aggregation
---

# AI Operations Center — conventions & constraints

Owner-only live observability for every AI provider/feature. Built **only** from
real signals; the honesty contract (`provider-honesty-contract.md`) governs it.

## Data sources (the only ones allowed)
- `usage_receipts` — per-request ledger (requests, ₱ cost, tokens, latency, status).
- `engineRegistry` / `aiTopology` — provider↔feature wiring + real failover chains (config truth).
- `/api/system-status/ai` — live provider health/latency/balances.

**Why:** these are the only places that reflect what actually happened. Inventing
numbers or pulling from tables that don't exist breaks the honesty contract.

**How to apply:**
- Do **NOT** query `credit_ledger` — its CREATE is not in migrations. Derive credit/cost
  from `usage_receipts` ₱ spend + live provider balances instead.
- Do **NOT** invent providers or failover paths absent from the engine registry
  (no Replicate; Runway/Veo/Pika are no-failover → failure + auto-refund).

## Honesty conventions baked into the aggregation
- **Success-only cost** everywhere — aggregates *and* the activity feed. Failed/refunded/
  moderated rows carry ₱0. **Why:** matches `/admin/usage/stats`; charging for failures would
  overstate spend. A past review caught the activity feed showing cost for non-success rows.
- **Tokens are chat-only.** Image/video are per-job billed and report no tokens — show them as
  "not token-metered", never 0 or an estimate.
- **Cost is owner-only** (₱ primary, ≈$ secondary at `PHP_PER_USD = 56`). Never expose ₱ to
  regular users.
- Missing values render as `—`; un-metered dimensions are labelled, not zeroed.

## Aggregation gotchas
- Per-model breakdown must be keyed by **(feature, model)** and window-scoped. Do **not** build a
  single global model map and attribute it to every feature — that leaks other features' counts.
- One 30d query is bucketed into 24h/7d/30d in memory, plus a continuous 30-day daily series for
  trend charts. The row fetch is capped (paginated); when the cap is hit, return `truncated:true`
  + `rowsRead` and surface an honest banner rather than silently underreporting.

## Phase 2 (not yet built)
Architecture for enforcing controls (budget governance, auto-throttle, failover/provider
switching, cost protection) is documented at
`artifacts/api-server/docs/ai-cost-governance-architecture.md`.
