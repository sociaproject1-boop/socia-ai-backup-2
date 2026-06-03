/**
 * monitoring/monitor.ts — the background loop. Probes every provider on a
 * 5-minute cadence, records transitions, writes the log, and broadcasts the
 * PUBLIC snapshot over Socket.IO so banners/buttons update in realtime.
 *
 * Isolation guarantees:
 *   - Reads provider metadata + env presence only.
 *   - Never imports checkout/subscription/auth/AI-gen modules.
 *   - Every probe is failsafe; a thrown error in one provider never aborts
 *     the loop or affects the others.
 */
import { logger } from "../lib/logger.js";
import { getIo } from "../lib/ioInstance.js";
import {
  MONITOR_INTERVAL_MS,
  PROVIDERS,
  SERVICES,
  isConfigured,
} from "./registry.js";
import { runProbe } from "./healthChecks.js";
import {
  appendLog,
  getAllHealth,
  getHealth,
  getOverride,
  hydrateFromDisk,
  setHealth,
} from "./store.js";
import type {
  ProviderBalance,
  ProviderHealth,
  PublicStatusSnapshot,
  StatusLevel,
} from "./types.js";

/** Socket.IO event name shared with the client (SYSTEM_STATUS_CHANNEL). */
export const SYSTEM_STATUS_CHANNEL = "system:status";

const SEVERITY: Record<StatusLevel, number> = {
  ONLINE: 0,
  UNKNOWN: 1,
  DEGRADED: 2,
  MAINTENANCE: 3,
  OUTAGE: 4,
};

/** Worst (highest-severity) status among a set. UNKNOWN never beats ONLINE
 *  for user-facing copy unless everything is unknown. */
function worst(levels: StatusLevel[]): StatusLevel {
  if (levels.length === 0) return "UNKNOWN";
  return levels.reduce((acc, l) => (SEVERITY[l] > SEVERITY[acc] ? l : acc), "ONLINE" as StatusLevel);
}

/** AI providers do not expose a queryable balance via simple API — be honest. */
function balanceFor(configured: boolean): ProviderBalance {
  return configured
    ? { supported: false, note: "Balance not exposed by provider API — open the provider dashboard to view/top up." }
    : { supported: false, note: "Not configured." };
}

let started = false;
let timer: ReturnType<typeof setInterval> | null = null;

/** Probe a single provider and persist its health, logging any transition. */
async function checkOne(defIndex: number): Promise<void> {
  const def = PROVIDERS[defIndex];
  if (!def) return;
  const configured = isConfigured(def);
  const prev = getHealth(def.id);
  const probe = await runProbe(def, configured);

  const next: ProviderHealth = {
    id: def.id,
    label: def.label,
    category: def.category,
    configured,
    status: probe.status,
    message: probe.message,
    responseMs: probe.responseMs,
    lastChecked: new Date().toISOString(),
    ...(def.category === "ai" ? { balance: balanceFor(configured) } : {}),
    links: def.links,
  };
  setHealth(next);

  if (prev && prev.status !== next.status) {
    appendLog({
      ts: next.lastChecked!,
      providerId: def.id,
      label: def.label,
      from: prev.status,
      to: next.status,
      message: next.message,
      source: "probe",
    });
  }
}

/** Effective PAYMENT status: owner override wins; otherwise the probe.
 *  FAILSAFE: a non-confirmed status (UNKNOWN) never disables checkout. */
export function effectivePaymentStatus(): {
  status: StatusLevel;
  message: string;
  checkoutDisabled: boolean;
} {
  const override = getOverride();
  if (override.active) {
    return {
      status: override.level,
      message: override.message || (override.level === "OUTAGE"
        ? "Payments are temporarily unavailable."
        : "Payments are under scheduled maintenance."),
      checkoutDisabled: true,
    };
  }
  const pm = getHealth("paymongo");
  const status = pm?.status ?? "UNKNOWN";
  // Only a CONFIRMED maintenance/outage disables checkout.
  const checkoutDisabled = status === "MAINTENANCE" || status === "OUTAGE";
  let message = pm?.message ?? "Payment status unknown — checkout remains available.";
  if (status === "OUTAGE") message = "Payments are temporarily unavailable. Please try again shortly.";
  else if (status === "MAINTENANCE") message = "Payments are under maintenance. Please check back soon.";
  else if (status === "DEGRADED") message = "Payments may be slower than usual.";
  return { status, message, checkoutDisabled };
}

/** Derive a user-facing service's status from its upstream providers. */
function serviceStatus(providerIds: string[]): StatusLevel {
  const levels = providerIds
    .map((id) => getHealth(id))
    .filter((h): h is ProviderHealth => Boolean(h) && h!.configured)
    .map((h) => h.status);
  return worst(levels);
}

/** The public, safe snapshot every signed-in client receives. */
export function buildPublicSnapshot(): PublicStatusSnapshot {
  const pay = effectivePaymentStatus();
  return {
    payment: {
      status: pay.status,
      message: pay.message,
      checkoutDisabled: pay.checkoutDisabled,
      provider: "PayMongo",
    },
    services: SERVICES.filter((s) => s.id !== "billing").map((s) => ({
      id: s.id,
      label: s.label,
      status: serviceStatus(s.providerIds),
    })),
    updatedAt: new Date().toISOString(),
  };
}

/** Push the public snapshot to all connected clients. Never throws. */
export function broadcast(): void {
  try {
    getIo()?.emit(SYSTEM_STATUS_CHANNEL, buildPublicSnapshot());
  } catch (err) {
    logger.warn({ err: (err as Error).message }, "[monitor] broadcast failed");
  }
}

/** Run a full sweep across all providers, then broadcast. Never throws. */
export async function runAllChecks(): Promise<void> {
  try {
    await Promise.all(PROVIDERS.map((_, i) => checkOne(i)));
  } catch (err) {
    logger.warn({ err: (err as Error).message }, "[monitor] sweep error (ignored)");
  }
  broadcast();
}

/** Idempotent bootstrap — call once after the HTTP server is listening. */
export function startMonitoring(): void {
  if (started) return;
  started = true;
  hydrateFromDisk();
  // Initial sweep in the background; failures are self-contained.
  runAllChecks().catch((err) =>
    logger.warn({ err: (err as Error).message }, "[monitor] initial sweep failed"),
  );
  timer = setInterval(() => {
    runAllChecks().catch((err) =>
      logger.warn({ err: (err as Error).message }, "[monitor] scheduled sweep failed"),
    );
  }, MONITOR_INTERVAL_MS);
  if (typeof timer.unref === "function") timer.unref();
  logger.info({ intervalMs: MONITOR_INTERVAL_MS, providers: PROVIDERS.length }, "[monitor] started");
}

/** Force an immediate re-check (owner "Refresh now" action). */
export async function refreshNow(): Promise<void> {
  await runAllChecks();
}

export { getAllHealth };
