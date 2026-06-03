---
name: Payment monitor checkout failsafe
description: The rule governing when the Socia payment monitor may disable checkout, and why network failures must not.
---

# Payment Status Monitor — checkout gating failsafe

`checkoutDisabled` (BillingUpgrade Pay buttons + user banner) may be set true ONLY by:
- an owner manual override (MAINTENANCE/OUTAGE), or
- a CONFIRMED signal from PayMongo itself (its API returning 5xx → OUTAGE).

A network error / timeout / abort while OUR server probes PayMongo must map to
`UNKNOWN`, never `OUTAGE`. `UNKNOWN`/`DEGRADED` never disable checkout.

**Why:** the monitor is isolated and best-effort. If our own probe breaking could
flip checkout off, a monitoring outage would block paying customers — the single
hardest constraint of this feature ("never block checkout on monitor failure").
A code review caught the original probe mapping all catch-block errors to OUTAGE.

**How to apply:** the gate lives in `effectivePaymentStatus()` in
`artifacts/api-server/src/monitoring/monitor.ts` (only MAINTENANCE/OUTAGE/override
disable). Keep per-probe error handling permissive — see `probePaymongo` catch in
`healthChecks.ts`. The generic `errorResult()` returns OUTAGE for display of other
(non-payment) providers only; do not route the PayMongo probe through it.
Override enable AND disable must both `broadcast()` so clients recover in realtime.
