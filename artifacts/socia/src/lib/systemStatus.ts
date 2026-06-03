/**
 * lib/systemStatus.ts — client for the System Status Monitor + AI Command
 * Center. ISOLATED from billing/checkout logic: it only READS status and,
 * for the owner, flips the manual override.
 *
 * FAILSAFE: the public snapshot defaults to a permissive state (checkout
 * enabled) whenever the network/socket is unavailable, so a monitoring
 * outage can never block a paying user.
 */
import { io, type Socket } from "socket.io-client";
import { supabase } from "./supabase";

export type StatusLevel = "ONLINE" | "DEGRADED" | "MAINTENANCE" | "OUTAGE" | "UNKNOWN";

export interface PublicStatusSnapshot {
  payment: {
    status: StatusLevel;
    message: string;
    checkoutDisabled: boolean;
    provider: string;
  };
  services: Array<{ id: string; label: string; status: StatusLevel }>;
  updatedAt: string;
}

export interface ProviderBalance {
  supported: boolean;
  amount?: number;
  currency?: string;
  source?: "real" | "estimated";
  note?: string;
}

export interface ProviderHealth {
  id: string;
  label: string;
  category: "payment" | "ai" | "internal";
  configured: boolean;
  status: StatusLevel;
  message: string;
  responseMs: number | null;
  lastChecked: string | null;
  balance?: ProviderBalance;
  links?: { dashboard?: string; topUp?: string; usage?: string; status?: string };
}

export interface PaymentOverride {
  active: boolean;
  level: "MAINTENANCE" | "OUTAGE";
  message: string;
  setBy: string | null;
  setAt: string | null;
}

export interface StatusLogEntry {
  ts: string;
  providerId: string;
  label: string;
  from: StatusLevel;
  to: StatusLevel;
  message: string;
  source: "probe" | "override";
}

export interface Incident {
  id: string;
  providerId: string;
  label: string;
  level: StatusLevel;
  startLevel: StatusLevel;
  startedAt: string;
  endedAt: string | null;
  durationMs: number | null;
  message: string;
  source: "probe" | "override";
}

export interface FullStatus {
  payment: { status: StatusLevel; message: string; checkoutDisabled: boolean };
  override: PaymentOverride;
  providers: ProviderHealth[];
  services: Array<{ id: string; label: string; providerIds: string[] }>;
  log: StatusLogEntry[];
  incidents: Incident[];
  updatedAt: string;
}

export interface GenerationMetrics {
  renderJobs24h: number | null;
  renderSucceeded24h: number | null;
  renderFailed24h: number | null;
  renderActive: number | null;
  successRate: number | null;
  computedAt: string;
}

export interface AIStatus {
  providers: ProviderHealth[];
  services: Array<{ id: string; label: string; providerIds: string[] }>;
  serviceHealth: ProviderHealth[];
  metrics: GenerationMetrics | null;
  incidents: Incident[];
  updatedAt: string;
}

/** The Socket.IO event the server broadcasts the public snapshot on. */
export const SYSTEM_STATUS_CHANNEL = "system:status";

/** A permissive default used before the first fetch resolves / on failure. */
export const SAFE_DEFAULT: PublicStatusSnapshot = {
  payment: {
    status: "UNKNOWN",
    message: "",
    checkoutDisabled: false,
    provider: "PayMongo",
  },
  services: [],
  updatedAt: new Date(0).toISOString(),
};

async function authHeader(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** Public banner/button feed. Never throws — returns SAFE_DEFAULT on failure. */
export async function fetchPublicStatus(): Promise<PublicStatusSnapshot> {
  try {
    const r = await fetch("/api/system-status", { headers: await authHeader() });
    if (!r.ok) return SAFE_DEFAULT;
    return (await r.json()) as PublicStatusSnapshot;
  } catch {
    return SAFE_DEFAULT;
  }
}

/** Owner: full provider matrix + override + log. */
export async function fetchFullStatus(): Promise<FullStatus> {
  const r = await fetch("/api/system-status/full", { headers: await authHeader() });
  if (!r.ok) throw new Error(`Status feed unavailable (${r.status})`);
  return (await r.json()) as FullStatus;
}

/** Owner: AI Command Center detail. */
export async function fetchAIStatus(): Promise<AIStatus> {
  const r = await fetch("/api/system-status/ai", { headers: await authHeader() });
  if (!r.ok) throw new Error(`AI status unavailable (${r.status})`);
  return (await r.json()) as AIStatus;
}

/** Owner: enable a manual maintenance/outage override on the payment layer. */
export async function setMaintenanceOverride(
  level: "MAINTENANCE" | "OUTAGE",
  message: string,
): Promise<void> {
  const r = await fetch("/api/system-status/override", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await authHeader()) },
    body: JSON.stringify({ action: "enable", level, message }),
  });
  if (!r.ok) throw new Error(`Override failed (${r.status})`);
}

/** Owner: clear any active manual override. */
export async function clearMaintenanceOverride(): Promise<void> {
  const r = await fetch("/api/system-status/override", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await authHeader()) },
    body: JSON.stringify({ action: "disable" }),
  });
  if (!r.ok) throw new Error(`Clear override failed (${r.status})`);
}

/** Owner: trigger an immediate re-check of every provider. */
export async function refreshStatusNow(): Promise<void> {
  const r = await fetch("/api/system-status/refresh", {
    method: "POST",
    headers: await authHeader(),
  });
  if (!r.ok) throw new Error(`Refresh failed (${r.status})`);
}

/* ── Shared Socket.IO singleton (same pattern as useRenderJob) ─────────── */
let _socket: Socket | null = null;

export function getStatusSocket(): Socket {
  if (_socket) return _socket;
  _socket = io(undefined, {
    path: "/api/socket.io/",
    transports: ["websocket", "polling"],
    autoConnect: true,
  });
  return _socket;
}

/* ── Presentation helpers shared by banner + dashboards ───────────────── */
export function statusColor(level: StatusLevel): { dot: string; text: string; bg: string; border: string } {
  switch (level) {
    case "ONLINE":
      return { dot: "#34d399", text: "#a7f3d0", bg: "rgba(16,185,129,0.10)", border: "rgba(16,185,129,0.30)" };
    case "DEGRADED":
      return { dot: "#fbbf24", text: "#fde68a", bg: "rgba(245,158,11,0.10)", border: "rgba(245,158,11,0.30)" };
    case "MAINTENANCE":
      return { dot: "#fb923c", text: "#fed7aa", bg: "rgba(249,115,22,0.12)", border: "rgba(249,115,22,0.35)" };
    case "OUTAGE":
      return { dot: "#f87171", text: "#fecaca", bg: "rgba(239,68,68,0.12)", border: "rgba(239,68,68,0.35)" };
    default:
      return { dot: "#94a3b8", text: "#cbd5e1", bg: "rgba(148,163,184,0.10)", border: "rgba(148,163,184,0.25)" };
  }
}

export function statusLabel(level: StatusLevel): string {
  switch (level) {
    case "ONLINE": return "Operational";
    case "DEGRADED": return "Degraded";
    case "MAINTENANCE": return "Maintenance";
    case "OUTAGE": return "Outage";
    default: return "Unknown";
  }
}
