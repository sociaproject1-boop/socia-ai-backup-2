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
  PaymentOverride,
  ProviderHealth,
  StatusLevel,
  StatusLogEntry,
} from "./types.js";

const DATA_DIR = resolve(process.cwd(), ".monitoring");
const STATE_FILE = resolve(DATA_DIR, "system-status-state.json");
const LOG_FILE = resolve(DATA_DIR, "payment-status.log");

const MAX_LOG_RING = 200;

interface PersistedState {
  override: PaymentOverride;
  log: StatusLogEntry[];
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
  } catch {
    // No prior state (first run) — start clean.
  }
}

function persistToDisk(): void {
  ensureDir();
  try {
    const payload: PersistedState = { override, log: logRing };
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
  persistToDisk();
}

export function getLog(limit = 50): StatusLogEntry[] {
  return logRing.slice(-limit).reverse();
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
