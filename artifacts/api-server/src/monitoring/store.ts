/**
 * monitoring/store.ts — in-memory state + durable JSON snapshot + append-only
 * log. NO database schema changes: everything lives in process memory and two
 * files under `.monitoring/` (state JSON + payment-status.log).
 *
 * The store is the single owner of mutable status state. Readers get plain
 * copies; the monitor and the owner endpoints are the only writers.
 */
import { mkdirSync, readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { resolve } from "node:path";
import { logger } from "../lib/logger.js";
import type {
  AlertIncident,
  Incident,
  PaymentOverride,
  ProviderHealth,
  StatusLevel,
  StatusLogEntry,
} from "./types.js";

const DATA_DIR = resolve(process.cwd(), ".monitoring");
const STATE_FILE = resolve(DATA_DIR, "system-status-state.json");
const LOG_FILE = resolve(DATA_DIR, "payment-status.log");

const MAX_LOG_RING = 200;
/** Closed-incident timeline cap (per the JSON-file persistence pattern). */
const MAX_INCIDENTS = 100;

/** Severity ordering used to track the worst level reached in an incident. */
const INCIDENT_SEVERITY: Record<StatusLevel, number> = {
  ONLINE: 0,
  UNKNOWN: 1,
  DEGRADED: 2,
  MAINTENANCE: 3,
  OUTAGE: 4,
};

/** A "problem" level is anything that should open/keep an incident open. */
function isProblemLevel(l: StatusLevel): boolean {
  return l === "DEGRADED" || l === "MAINTENANCE" || l === "OUTAGE";
}

interface PersistedState {
  override: PaymentOverride;
  log: StatusLogEntry[];
  /** Open alert incidents, keyed by `${providerId}:${kind}`. */
  alertIncidents: Record<string, AlertIncident>;
  /** Closed outage/incident history (timeline), newest appended last. */
  incidentHistory: Incident[];
  /** Currently-open incidents, keyed by providerId. */
  openIncidents: Record<string, Incident>;
  /**
   * Owner toggle for alert delivery. `null` = follow the ALERTS_ENABLED env
   * default; `true`/`false` = explicit owner override (persists across
   * restarts so the dashboard switch is durable).
   */
  alertsEnabledOverride: boolean | null;
}

const DEFAULT_OVERRIDE: PaymentOverride = {
  active: false,
  level: "MAINTENANCE",
  message: "",
  setBy: null,
  setAt: null,
};

/** Live provider health, keyed by provider id. Hydrated by the monitor. */
const health = new Map<string, ProviderHealth>();
let override: PaymentOverride = { ...DEFAULT_OVERRIDE };
let logRing: StatusLogEntry[] = [];
/** Open alert incidents (de-dupe memory), keyed by `${providerId}:${kind}`. */
const alertIncidents = new Map<string, AlertIncident>();
/** Closed outage/incident timeline (ring, capped at MAX_INCIDENTS). */
let incidentHistory: Incident[] = [];
/** Currently-open incidents, keyed by providerId. */
const openIncidents = new Map<string, Incident>();
/** Owner alert-delivery toggle. null = follow ALERTS_ENABLED env default. */
let alertsEnabledOverride: boolean | null = null;

function ensureDir(): void {
  try {
    mkdirSync(DATA_DIR, { recursive: true });
  } catch (err) {
    logger.warn({ err: (err as Error).message }, "[monitor] could not create .monitoring dir");
  }
}

/** Load override + log ring from disk on boot. Failsafe: ignore errors. */
export function hydrateFromDisk(): void {
  ensureDir();
  try {
    const raw = readFileSync(STATE_FILE, "utf8");
    const parsed = JSON.parse(raw) as Partial<PersistedState>;
    if (parsed.override) override = { ...DEFAULT_OVERRIDE, ...parsed.override };
    if (Array.isArray(parsed.log)) logRing = parsed.log.slice(-MAX_LOG_RING);
    if (parsed.alertIncidents && typeof parsed.alertIncidents === "object") {
      alertIncidents.clear();
      for (const [key, inc] of Object.entries(parsed.alertIncidents)) {
        if (inc) alertIncidents.set(key, inc);
      }
    }
    if (Array.isArray(parsed.incidentHistory)) {
      incidentHistory = parsed.incidentHistory.slice(-MAX_INCIDENTS);
    }
    if (parsed.openIncidents && typeof parsed.openIncidents === "object") {
      openIncidents.clear();
      for (const [key, inc] of Object.entries(parsed.openIncidents)) {
        if (inc) openIncidents.set(key, inc);
      }
    }
    if (typeof parsed.alertsEnabledOverride === "boolean") {
      alertsEnabledOverride = parsed.alertsEnabledOverride;
    }
  } catch {
    // No prior state (first run) — start clean.
  }
}

function persistToDisk(): void {
  ensureDir();
  try {
    const payload: PersistedState = {
      override,
      log: logRing,
      alertIncidents: Object.fromEntries(alertIncidents),
      incidentHistory,
      openIncidents: Object.fromEntries(openIncidents),
      alertsEnabledOverride,
    };
    writeFileSync(STATE_FILE, JSON.stringify(payload, null, 2), "utf8");
  } catch (err) {
    logger.warn({ err: (err as Error).message }, "[monitor] failed to persist state");
  }
}

/** Upsert a provider's latest health snapshot. */
export function setHealth(h: ProviderHealth): void {
  health.set(h.id, h);
}

export function getHealth(id: string): ProviderHealth | undefined {
  return health.get(id);
}

export function getAllHealth(): ProviderHealth[] {
  return [...health.values()];
}

/**
 * Update the incident timeline from a single transition. Every status change
 * flows through `appendLog`, so this is the single choke point for opening,
 * escalating, and closing incidents — keeping probe-driven and owner-override
 * transitions consistent.
 *
 *   - to ONLINE      → close any open incident for the provider (record duration)
 *   - to a problem   → open a new incident, or escalate the worst level seen
 *   - to UNKNOWN     → leave any open incident untouched (status unconfirmed)
 */
function updateIncidentFromTransition(entry: StatusLogEntry): void {
  const { providerId, label, to, message, source, ts } = entry;
  const open = openIncidents.get(providerId);

  if (to === "ONLINE") {
    if (open) {
      open.endedAt = ts;
      open.durationMs = Math.max(0, new Date(ts).getTime() - new Date(open.startedAt).getTime());
      if (message) open.message = message;
      incidentHistory.push(open);
      if (incidentHistory.length > MAX_INCIDENTS) incidentHistory = incidentHistory.slice(-MAX_INCIDENTS);
      openIncidents.delete(providerId);
    }
    return;
  }

  if (isProblemLevel(to)) {
    if (open) {
      if (INCIDENT_SEVERITY[to] > INCIDENT_SEVERITY[open.level]) open.level = to;
      if (message) open.message = message;
    } else {
      openIncidents.set(providerId, {
        id: `${providerId}:${ts}`,
        providerId,
        label,
        level: to,
        startLevel: to,
        startedAt: ts,
        endedAt: null,
        durationMs: null,
        message,
        source,
      });
    }
  }
  // to === UNKNOWN: status is unconfirmed — leave any open incident as-is.
}

/** Append a transition to the ring + the human-readable log file. */
export function appendLog(entry: StatusLogEntry): void {
  logRing.push(entry);
  if (logRing.length > MAX_LOG_RING) logRing = logRing.slice(-MAX_LOG_RING);
  const line = `${entry.ts} [${entry.source.toUpperCase()}] ${entry.label} ${entry.from} → ${entry.to} :: ${entry.message}\n`;
  ensureDir();
  try {
    appendFileSync(LOG_FILE, line, "utf8");
  } catch (err) {
    logger.warn({ err: (err as Error).message }, "[monitor] failed to append log file");
  }
  updateIncidentFromTransition(entry);
  persistToDisk();
}

export function getLog(limit = 50): StatusLogEntry[] {
  return logRing.slice(-limit).reverse();
}

/**
 * The incident timeline: currently-open incidents first, then closed history,
 * sorted newest-first by start time. `durationMs`/`endedAt` are null for
 * ongoing incidents (the UI renders these as "ongoing"). Read-only copies.
 */
export function getIncidents(limit = 30): Incident[] {
  const all = [...openIncidents.values(), ...incidentHistory];
  all.sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
  return all.slice(0, limit).map((i) => ({ ...i }));
}

export function getOverride(): PaymentOverride {
  return { ...override };
}

/** Owner action: force / clear the payment-layer override. Persists + logs. */
export function setOverride(next: PaymentOverride): void {
  const prev = override;
  override = { ...next };
  persistToDisk();
  appendLog({
    ts: new Date().toISOString(),
    providerId: "paymongo",
    label: "PayMongo (manual)",
    from: prev.active ? prev.level : ("ONLINE" as StatusLevel),
    to: override.active ? override.level : ("ONLINE" as StatusLevel),
    message: override.active
      ? `Owner forced ${override.level}: ${override.message || "(no message)"}`
      : "Owner cleared manual override",
    source: "override",
  });
}

/* ── Owner alert-delivery toggle ───────────────────────────────────────────
 * `null` = follow the ALERTS_ENABLED env default; an explicit boolean is an
 * owner override that persists across restarts. Read by getAlertConfig().
 */
export function getAlertsEnabledOverride(): boolean | null {
  return alertsEnabledOverride;
}

export function setAlertsEnabledOverride(value: boolean | null): void {
  alertsEnabledOverride = value;
  persistToDisk();
}

/* ── Alert de-dupe memory ──────────────────────────────────────────────────
 * One incident per (provider, kind). The presence of an incident means we have
 * already notified the owner about it, so subsequent sweeps stay quiet until
 * the provider recovers (the incident is cleared). Persisted to disk so a
 * restart never re-fires an alert for an already-open incident.
 */

/** The currently-open alert incident for a key, if any. */
export function getAlertIncident(key: string): AlertIncident | undefined {
  const inc = alertIncidents.get(key);
  return inc ? { ...inc } : undefined;
}

/** All currently-open alert incidents (read-only copies). */
export function getAlertIncidents(): AlertIncident[] {
  return [...alertIncidents.values()].map((i) => ({ ...i }));
}

/** Open or update an alert incident, then persist. */
export function setAlertIncident(key: string, incident: AlertIncident): void {
  alertIncidents.set(key, { ...incident });
  persistToDisk();
}

/** Close an alert incident (provider recovered), then persist. */
export function clearAlertIncident(key: string): void {
  if (alertIncidents.delete(key)) persistToDisk();
}
