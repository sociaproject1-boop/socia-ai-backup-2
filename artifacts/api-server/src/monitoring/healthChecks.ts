/**
 * monitoring/healthChecks.ts — pure, FAILSAFE probes.
 *
 * Every function here is wrapped so it can NEVER throw and NEVER hang past
 * PROBE_TIMEOUT_MS. On any error the result is UNKNOWN (or, for PayMongo,
 * the most permissive interpretation) so a monitor failure can never cascade
 * into blocking a user's checkout.
 */
import { logger } from "../lib/logger.js";
import {
  PROBE_TIMEOUT_MS,
  SLOW_RESPONSE_MS,
  type ProviderDefinition,
} from "./registry.js";
import type { StatusLevel } from "./types.js";

export interface ProbeResult {
  status: StatusLevel;
  message: string;
  responseMs: number | null;
}

/** fetch() with a hard timeout that resolves to a thrown AbortError. */
async function timedFetch(url: string, init?: RequestInit): Promise<{ res: Response; ms: number }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), PROBE_TIMEOUT_MS);
  const t0 = Date.now();
  try {
    const res = await fetch(url, {
      ...init,
      signal: ctrl.signal,
      headers: { "User-Agent": "Socia-StatusMonitor/1.0", ...(init?.headers ?? {}) },
    });
    return { res, ms: Date.now() - t0 };
  } finally {
    clearTimeout(timer);
  }
}

/** Map any caught error to a sensible non-throwing probe result. */
function errorResult(label: string, err: unknown): ProbeResult {
  const msg = err instanceof Error ? err.message : "unknown error";
  const isAbort = err instanceof Error && err.name === "AbortError";
  return {
    status: "OUTAGE",
    message: isAbort ? `${label} did not respond within timeout` : `${label} unreachable: ${msg}`,
    responseMs: null,
  };
}

/** Classify a reachable HTTP response. ANY response means the host is up. */
function classifyHttp(label: string, statusCode: number, ms: number): ProbeResult {
  if (statusCode >= 500) {
    return { status: "DEGRADED", message: `${label} returning ${statusCode}`, responseMs: ms };
  }
  if (ms > SLOW_RESPONSE_MS) {
    return { status: "DEGRADED", message: `${label} reachable but slow (${ms}ms)`, responseMs: ms };
  }
  // 1xx–4xx (incl. 401/403 from unauthenticated probes) ⇒ the API is serving.
  return { status: "ONLINE", message: `${label} operational`, responseMs: ms };
}

/** Plain reachability probe of an API base URL. */
export async function probeReachability(label: string, url: string): Promise<ProbeResult> {
  try {
    const { res, ms } = await timedFetch(url, { method: "GET" });
    return classifyHttp(label, res.status, ms);
  } catch (err) {
    return errorResult(label, err);
  }
}

/** Atlassian Statuspage summary.json → StatusLevel. Detects maintenance too. */
export async function probeStatuspage(label: string, url: string): Promise<ProbeResult> {
  try {
    const { res, ms } = await timedFetch(url, { method: "GET" });
    if (!res.ok) {
      // Statuspage itself failing tells us nothing about the provider — soft.
      return { status: "UNKNOWN", message: `${label} status page returned ${res.status}`, responseMs: ms };
    }
    const data = (await res.json()) as {
      status?: { indicator?: string; description?: string };
      scheduled_maintenances?: Array<{ status?: string; name?: string }>;
    };

    const activeMaint = (data.scheduled_maintenances ?? []).find(
      (m) => m.status === "in_progress",
    );
    if (activeMaint) {
      return {
        status: "MAINTENANCE",
        message: activeMaint.name ? `${label}: ${activeMaint.name}` : `${label} under maintenance`,
        responseMs: ms,
      };
    }

    const indicator = (data.status?.indicator ?? "none").toLowerCase();
    const desc = data.status?.description ?? "";
    switch (indicator) {
      case "none":
        return { status: "ONLINE", message: `${label}: ${desc || "all systems operational"}`, responseMs: ms };
      case "minor":
        return { status: "DEGRADED", message: `${label}: ${desc || "minor service issues"}`, responseMs: ms };
      case "major":
      case "critical":
        return { status: "OUTAGE", message: `${label}: ${desc || "service disruption"}`, responseMs: ms };
      default:
        return { status: "UNKNOWN", message: `${label}: status ${indicator}`, responseMs: ms };
    }
  } catch (err) {
    // Status-page fetch failed — we genuinely don't know. UNKNOWN, not OUTAGE.
    return { status: "UNKNOWN", message: `${label} status unavailable`, responseMs: null };
  }
}

/**
 * Authenticated, READ-ONLY PayMongo probe. Listing webhooks creates nothing
 * and confirms the API is serving. Interpretation is deliberately permissive:
 * any HTTP response (even 401) means PayMongo is UP for availability purposes.
 * Only a network failure / timeout / 5xx is treated as an outage so we never
 * wrongly block checkout because OUR probe broke.
 */
export async function probePaymongo(secretKey: string | undefined): Promise<ProbeResult> {
  if (!secretKey) {
    return { status: "UNKNOWN", message: "PayMongo key not configured", responseMs: null };
  }
  try {
    const auth = Buffer.from(`${secretKey}:`).toString("base64");
    const { res, ms } = await timedFetch("https://api.paymongo.com/v1/webhooks", {
      method: "GET",
      headers: { Authorization: `Basic ${auth}`, Accept: "application/json" },
    });
    if (res.status >= 500) {
      return { status: "OUTAGE", message: `PayMongo API error (${res.status})`, responseMs: ms };
    }
    if (ms > SLOW_RESPONSE_MS) {
      return { status: "DEGRADED", message: `PayMongo reachable but slow (${ms}ms)`, responseMs: ms };
    }
    return { status: "ONLINE", message: "PayMongo operational", responseMs: ms };
  } catch (err) {
    // CRITICAL FAILSAFE: a network error / timeout reaching PayMongo from OUR
    // server is a MONITOR failure, NOT a confirmed PayMongo outage. Mapping it
    // to UNKNOWN keeps checkout ENABLED — only a trusted 5xx from PayMongo
    // itself (handled above) or an owner override may disable checkout.
    logger.warn({ err: (err as Error).message }, "[monitor] PayMongo probe failed (checkout stays enabled)");
    const isAbort = err instanceof Error && err.name === "AbortError";
    return {
      status: "UNKNOWN",
      message: isAbort
        ? "PayMongo status check timed out — checkout remains available."
        : "PayMongo status check failed — checkout remains available.",
      responseMs: null,
    };
  }
}

/** Dispatch a provider to its configured probe strategy. Never throws. */
export async function runProbe(
  def: ProviderDefinition,
  configured: boolean,
): Promise<ProbeResult> {
  try {
    if (!configured) {
      return { status: "UNKNOWN", message: `${def.label} not configured`, responseMs: null };
    }
    switch (def.probe) {
      case "paymongo":
        return await probePaymongo(process.env["PAYMONGO_SECRET_KEY"]);
      case "statuspage": {
        const sp = def.statusUrl
          ? await probeStatuspage(def.label, def.statusUrl)
          : { status: "UNKNOWN" as StatusLevel, message: `${def.label}: no status source`, responseMs: null };
        // If the status page is inconclusive, fall back to reachability.
        if (sp.status === "UNKNOWN" && def.reachUrl) {
          return await probeReachability(def.label, def.reachUrl);
        }
        return sp;
      }
      case "reachability":
        return def.reachUrl
          ? await probeReachability(def.label, def.reachUrl)
          : { status: "UNKNOWN", message: `${def.label}: no probe URL`, responseMs: null };
      case "config":
      default:
        return { status: "ONLINE", message: `${def.label} configured`, responseMs: null };
    }
  } catch (err) {
    // Absolute backstop — a probe must never bubble an exception.
    logger.warn({ err: (err as Error).message, provider: def.id }, "[monitor] probe threw");
    return { status: "UNKNOWN", message: `${def.label} check failed`, responseMs: null };
  }
}
