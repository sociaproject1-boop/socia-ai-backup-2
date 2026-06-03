---
name: Incident timeline / outage history
description: How provider outage incidents are recorded, escalated, closed, and persisted in the monitoring subsystem.
---

# Incident timeline (outage history)

`appendLog()` in `monitoring/store.ts` is the **single choke point** for incident
tracking. Every status transition — both automatic probes and owner overrides —
flows through it, so incident open/escalate/close logic lives there (in
`updateIncidentFromTransition`) and never needs to be duplicated at call sites.

Rules:
- transition **to ONLINE** → close the provider's open incident (set `endedAt` +
  `durationMs`, push to `incidentHistory`).
- transition **to a problem level** (DEGRADED/MAINTENANCE/OUTAGE) → open a new
  incident or escalate `level` to the worst severity seen.
- transition **to UNKNOWN** → leave any open incident untouched (status is
  unconfirmed; do NOT treat UNKNOWN as recovery or as a new incident).

**Why:** an incident is a *contiguous* problem window per provider, not one row
per transition. Treating UNKNOWN as recovery would prematurely close real
outages; treating it as a problem would spawn noise incidents on every probe
hiccup.

**How to apply:** persistence rides the existing JSON pattern — `incidentHistory`
(closed, capped at MAX_INCIDENTS=100) and `openIncidents` (keyed by providerId)
are added to `PersistedState` in `system-status-state.json`. No DB schema change.
First probe has no `prev`, so it never opens an incident from boot state — same
behavior as the transition log. `getIncidents(limit)` returns open-first then
closed, newest-first. Surfaced via `/api/system-status/full` (all providers) and
`/api/system-status/ai` (AI providers only). Rendered by the shared
`IncidentTimeline` component in `socia/src/components/status/statusUi.tsx`.
