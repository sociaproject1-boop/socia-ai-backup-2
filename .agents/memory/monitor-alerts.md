---
name: Monitor outage & low-balance alerts
description: Design decisions and constraints behind proactive owner alerts in the monitoring subsystem (not a code map).
---

# Monitor outage & low-balance alerts

Proactive owner notifications when a monitored provider goes down or runs low on
balance. Lives entirely inside the isolated `artifacts/api-server/src/monitoring/`
subsystem, hooked off the existing 5-min sweep.

## Decisions / constraints (the non-obvious parts)

- **De-dupe is incident-state-driven, not prior-status-driven.** The persisted
  incident record IS the memory: alert on enter, stay silent while open, recover
  on clear. This is why it behaves correctly across restarts (no reliance on the
  in-memory `prev`). **Why:** the sweep re-probes every 5 min; keying off "did
  the status change since last sweep" would re-fire on every restart.

- **Alerting set = {MAINTENANCE, OUTAGE} only.** DEGRADED is deliberately NOT an
  alerting state. UNKNOWN while an incident is open keeps it open *silently* —
  UNKNOWN means "monitor unsure", never a false recovery. Recovery fires ONLY on
  a confirmed return to ONLINE. **Why:** mirrors the payment-monitor failsafe —
  never act on a non-confirmed signal.

- **Owner-initiated overrides do NOT alert.** Alerts fire off the probed health
  map (`checkOne`); the manual payment override never touches that map, so the
  owner isn't notified about their own action.

- **Transient channel failure must not permanently suppress an alert.** An
  incident is opened regardless, but `notifiedAt` is only stamped when the send
  "settles" (≥1 channel delivered, OR zero channels configured = nothing to
  retry). An empty `notifiedAt` means a later sweep retries WITHOUT re-opening or
  duplicating. Recovery is the same: keep the incident open until the recovery
  notice actually settles. **Why:** a one-off webhook 500 shouldn't mean the
  owner never learns about an outage / recovery.

- **Low-balance alerting is real but opt-in, and honest about coverage.** Only
  providers with a queryable balance API get a real number — currently just
  Stability AI (`/v1/user/balance`). All others honestly report
  `balance.supported = false` and never alert. Balance alerting also requires an
  explicit threshold env (`ALERT_BALANCE_MIN` or per-provider
  `ALERT_BALANCE_MIN_<ID>`); with no threshold there is zero balance alerting (no
  false alarms). **Why:** adheres to the provider-honesty contract — never invent
  a balance number.

## Channels
Dependency-free HTTPS, all opt-in via env; a channel arms only when ALL its vars
are present. Email = Resend (`RESEND_API_KEY`), SMS = Twilio
(`TWILIO_ACCOUNT_SID`/`TWILIO_AUTH_TOKEN`/`TWILIO_SMS_FROM`/`ALERT_SMS_TO`),
generic webhook (`ALERT_WEBHOOK_URL`, sends `{text,content,...}` so Slack &
Discord both work). `ALERTS_ENABLED=false` mutes all without removing creds.
Owner can verify via `POST /api/system-status/test-alert`.

## Failsafe contract
`dispatchAlert` fans out via `Promise.allSettled` and never throws; status and
balance lifecycles are independently try/caught; the monitor hook is
fire-and-forget — a notification path can never delay the sweep or block checkout.
