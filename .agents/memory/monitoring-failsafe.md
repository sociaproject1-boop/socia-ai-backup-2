---
name: Monitoring failsafe invariant
description: The safety rule that monitoring failures must never block checkout in the SOCIA api-server status monitor.
---

# Monitoring failsafe invariant

A monitoring failure can NEVER disable checkout. `checkoutDisabled` may only
become true from one of:
- a CONFIRMED PayMongo probe result of MAINTENANCE or OUTAGE (a trusted 5xx
  FROM PayMongo itself), or
- an explicit owner override.

A network error / timeout / probe exception reaching PayMongo from our server
is a MONITOR failure, not a confirmed outage, and must map to UNKNOWN (which
keeps checkout open). UNKNOWN/DEGRADED/ONLINE never disable checkout.

**Why:** an earlier code review found a bug where probe failures could block
real payments. The whole status-monitor subsystem only OBSERVES and must never
throw into / gate the checkout path on its own failure.

**How to apply:** any change to `effectivePaymentStatus()` (monitor.ts),
`probePaymongo()` error mapping (healthChecks.ts), or the override route
(systemStatus.ts) must preserve this. Coverage lives in the `*.test.ts` files
beside those modules — run them after touching the monitor.
