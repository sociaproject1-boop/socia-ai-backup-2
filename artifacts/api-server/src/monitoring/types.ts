/**
 * monitoring/types.ts — shared types for the System Status + AI Command Center.
 *
 * This module is fully ISOLATED from payment/subscription/checkout/auth/AI-gen
 * logic. It only OBSERVES. Nothing here can ever throw into a checkout path.
 */

/** Operational state of a single provider or the platform as a whole. */
export type StatusLevel = "ONLINE" | "DEGRADED" | "MAINTENANCE" | "OUTAGE" | "UNKNOWN";

/** What a provider does, used to group it in the dashboards. */
export type ProviderCategory = "payment" | "ai" | "internal";

/** How the monitor probes a provider's health. */
export type ProbeKind =
  | "paymongo"      // authenticated read-only PayMongo API probe
  | "statuspage"    // official Atlassian Statuspage summary.json
  | "reachability"  // plain HTTPS reachability of an API base
  | "config";       // no external probe — status derived from key presence

/** Result of estimating/looking up a provider balance. */
export interface ProviderBalance {
  /** True only when the provider exposes a real, queryable balance. */
  supported: boolean;
  /** Numeric balance when supported (in `currency`). */
  amount?: number;
  currency?: string;
  /** "real" = from provider API; "estimated" = derived from usage. */
  source?: "real" | "estimated";
  /** Human note shown when balance is not exposed by the provider API. */
  note?: string;
}

/** Live health snapshot for one provider. */
export interface ProviderHealth {
  id: string;
  label: string;
  category: ProviderCategory;
  /** True if the required API key/integration is present in the environment. */
  configured: boolean;
  /** Detected status from the most recent probe (before any owner override). */
  status: StatusLevel;
  /** Human-readable one-liner for the dashboards. */
  message: string;
  /** Round-trip time of the last successful probe, ms. */
  responseMs: number | null;
  /** ISO timestamp of the last completed check. */
  lastChecked: string | null;
  /** Optional balance/credit info for AI providers. */
  balance?: ProviderBalance;
  /** External links for the owner (open dashboard / top up / view usage). */
  links?: { dashboard?: string; topUp?: string; usage?: string; status?: string };
}

/** A single transition entry written to the in-memory ring + the log file. */
export interface StatusLogEntry {
  ts: string;
  providerId: string;
  label: string;
  from: StatusLevel;
  to: StatusLevel;
  message: string;
  /** "probe" = automatic detection, "override" = owner action. */
  source: "probe" | "override";
}

/**
 * A recorded outage/incident: one contiguous period a provider spent in a
 * problem state (DEGRADED / MAINTENANCE / OUTAGE). It opens on the first
 * transition away from ONLINE into a problem level, escalates to the worst
 * level seen, and closes when the provider returns to ONLINE. Persisted so
 * the timeline survives server restarts.
 */
export interface Incident {
  /** Stable id: `${providerId}:${startedAt}`. */
  id: string;
  providerId: string;
  label: string;
  /** Worst (highest-severity) level reached during the incident. */
  level: StatusLevel;
  /** The level the incident opened at. */
  startLevel: StatusLevel;
  /** ISO timestamp the incident opened. */
  startedAt: string;
  /** ISO end time; null while the incident is still ongoing. */
  endedAt: string | null;
  /** Duration in ms; null while ongoing. */
  durationMs: number | null;
  /** Most recent transition message during the incident. */
  message: string;
  /** Whether opened by an automatic probe or an owner override. */
  source: "probe" | "override";
}

/** What kind of condition opened an alert incident. */
export type AlertKind = "status" | "balance";

/**
 * A currently-open alert incident — the de-dupe memory for proactive owner
 * notifications. While an incident exists for a (provider, kind) the monitor
 * stays quiet on later sweeps; the incident is cleared (and a recovery notice
 * sent) only when the provider returns to ONLINE.
 */
export interface AlertIncident {
  providerId: string;
  label: string;
  kind: AlertKind;
  /** The status that opened/escalated the incident (MAINTENANCE/OUTAGE for status). */
  level: StatusLevel;
  message: string;
  /** ISO timestamp the incident was first opened. */
  openedAt: string;
  /** ISO timestamp of the most recent notification sent for this incident. */
  notifiedAt: string;
}

/** Owner-applied manual override for the PAYMENT layer. */
export interface PaymentOverride {
  active: boolean;
  /** Forced level while active. Only MAINTENANCE or OUTAGE are meaningful. */
  level: "MAINTENANCE" | "OUTAGE";
  message: string;
  setBy: string | null;
  setAt: string | null;
}

/** Public, safe-to-expose snapshot consumed by every signed-in client. */
export interface PublicStatusSnapshot {
  /** Effective payment status (override wins, then probe; failsafe ONLINE). */
  payment: {
    status: StatusLevel;
    message: string;
    /** True when checkout should be blocked (MAINTENANCE or OUTAGE only). */
    checkoutDisabled: boolean;
    provider: string;
  };
  /** Coarse status of user-facing AI features for inline notices. */
  services: Array<{ id: string; label: string; status: StatusLevel }>;
  updatedAt: string;
}
