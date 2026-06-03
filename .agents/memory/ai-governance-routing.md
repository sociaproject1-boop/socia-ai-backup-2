---
name: AI Governance Routing Platform
description: How SOCIA's owner-only AI routing/governance overlay works and the invariants its enforcement must preserve.
---

# AI Governance Routing Platform

Owner-only, DB-persisted config that overlays the static `aiTopology.ts` (which stays the
default/truth layer). The live generation pipeline consults it before any billable work.

## Core invariants

- **Permissive default is sacred.** `defaultConfig()` enables every provider/model/feature and
  `resolveConfig(null)` must deep-equal it. An empty/absent stored config == current behavior.
  **Why:** the overlay must never change production routing until an owner deliberately edits it.

- **A route must never run a provider the owner disabled.** The feature-level gate only checks
  that *some* provider keeps the chain non-empty. Routes hard-wired to one provider
  (image→openai, single-clip & multiframe video→fal) MUST pass `evaluateRequest(tool, {
  requireProvider })`. Without it, disabling fal while runway stays enabled would silently still
  run fal. Chat (`sociaGpt`) instead consumes `gov.chain` directly (reorders/filters its attempt
  array by provider), so it omits `requireProvider`.
  **How to apply:** when adding a generation route, declare the exact provider it bills against,
  or (for multi-engine routes) intersect the user's selected engine with `gov.chain`.

- **Budget is success-only from `usage_receipts`; never query `credit_ledger`.** Spend snapshot
  has a 30s TTL. Each successful generation chains `.then(() => invalidateSpendCache())` onto its
  fire-and-forget `trackUsage(...)` so the next budget check (and auto-pause) reflects new spend
  without waiting out the TTL.
  **Why:** without invalidation, auto-pause lags up to 30s and budgets overshoot under load.

- **Budget pause only fires when `autoPause` is on.** `evaluateRequest` returns BUDGET_EXHAUSTED
  only if `cfg.autoPause` is true; otherwise an exhausted budget is informational, not blocking.

## Validation contract (`validateConfig`)

Rejects any config that would BREAK generation: an enabled feature with no usable hop (every
option disabled, missing its API key per `isProviderConfigured`, or an invalid model), unknown
provider/model in a chain, `autoThrottle` without positive `throttleRpm`, negative budget caps.
Save is validate-then-persist; a feature can be disabled to legally drop its only provider.

## Concurrency

`saveConfig` is optimistic-locked (read version N → update WHERE version=N; zero rows == concurrent
change → throw `GovernanceConflictError`). The owner API must map that to **HTTP 409**, not a
generic 500 — callers need to distinguish a concurrent-edit conflict (reload & retry) from a real
server fault. The frontend save lib surfaces the 409 message verbatim.
**Why:** without distinct 409 handling the conflict is masked and the owner silently clobbers their
own other-tab change.
