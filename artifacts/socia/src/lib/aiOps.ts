/**
 * aiOps — client data layer for the AI Operations Center (owner-only).
 *
 * Mirrors the response shape of GET /api/ai-ops/overview. All numbers are
 * aggregated server-side from real usage_receipts rows. The UI must render
 * absent values as "—" and never invent metrics.
 */
import { supabase } from "./supabase";

export type WindowKey = "24h" | "7d" | "30d";
export type ProviderId = "xai" | "openai" | "fal" | "runway" | "veo" | "pika";

export interface Tokens { input: number; output: number; total: number }

export interface MetricWindow {
  requests:      number;
  success:       number;
  failed:        number;
  refunded:      number;
  moderated:     number;
  successRate:   number | null;
  errorRate:     number | null;
  costPhp:       number;
  costUsd:       number;
  tokens:        Tokens;
  avgDurationMs: number | null;
}

export type WindowMap = Record<WindowKey, MetricWindow>;

export interface FlowStep {
  provider: ProviderId;
  model?:   string;
  action:   string;
  kind:     "primary" | "fallback" | "selectable";
}

export interface FailoverInfo { summary: string; automatic: boolean }

export interface FeatureModel {
  model:    string;
  provider: ProviderId | null;
  windows:  WindowMap;
}

export interface FeatureOps {
  tool:         string;
  label:        string;
  description:  string;
  endpoint:     string;
  aliases:      string[];
  providers:    ProviderId[];
  tokenTracked: boolean;
  flow:         FlowStep[];
  failover:     FailoverInfo;
  windows:      WindowMap;
  models:       FeatureModel[];
}

export interface ProviderOps {
  id:           ProviderId;
  label:        string;
  role:         string;
  configured:   boolean;
  envVars:      string[];
  models:       string[];
  tokenMetered: boolean;
  dashboard:    string | null;
  featuresUsing: string[];
  windows:      WindowMap;
}

export interface ActivityItem {
  id:         string;
  createdAt:  string;
  tool:       string;
  label:      string;
  model:      string | null;
  provider:   ProviderId | null;
  status:     string;
  durationMs: number | null;
  costPhp:    number;
  tokens:     number | null;
  userRef:    string;
}

export interface DailyPoint {
  date:     string;
  requests: number;
  success:  number;
  failed:   number;
  costPhp:  number;
  tokens:   number;
}

export interface AiOpsOverview {
  generatedAt:   string;
  environment:   string;
  phpPerUsd:     number;
  dataAvailable: boolean;
  truncated:     boolean;
  rowsRead:      number;
  windowKeys:    WindowKey[];
  totals:        WindowMap;
  series:        DailyPoint[];
  features:      FeatureOps[];
  providers:     ProviderOps[];
  unclassified:  { windows: WindowMap } | null;
  activity:      ActivityItem[];
}

async function authHeader(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function fetchAiOpsOverview(): Promise<AiOpsOverview> {
  const r = await fetch("/api/ai-ops/overview", { headers: await authHeader() });
  if (!r.ok) throw new Error(`AI ops feed unavailable (${r.status})`);
  return (await r.json()) as AiOpsOverview;
}

export async function fetchAiOpsActivity(limit = 60): Promise<ActivityItem[]> {
  const r = await fetch(`/api/ai-ops/activity?limit=${limit}`, { headers: await authHeader() });
  if (!r.ok) throw new Error(`Activity feed unavailable (${r.status})`);
  const j = (await r.json()) as { activity: ActivityItem[] };
  return j.activity;
}

/* ── Display helpers ──────────────────────────────────────────────────── */

export const PROVIDER_LABELS: Record<ProviderId, string> = {
  xai: "xAI (Grok)", openai: "OpenAI", fal: "fal.ai",
  runway: "Runway", veo: "Google Veo", pika: "Pika",
};

/** Accent color per provider — purely cosmetic. */
export const PROVIDER_ACCENT: Record<ProviderId, string> = {
  xai:    "#a78bfa",
  openai: "#34d399",
  fal:    "#f472b6",
  runway: "#60a5fa",
  veo:    "#fbbf24",
  pika:   "#22d3ee",
};

export function fmtPhp(n: number | null | undefined): string {
  if (n == null) return "—";
  return `₱${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function fmtUsd(n: number | null | undefined): string {
  if (n == null) return "—";
  return `≈$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function fmtInt(n: number | null | undefined): string {
  if (n == null) return "—";
  return n.toLocaleString();
}

export function fmtTokens(n: number | null | undefined): string {
  if (n == null) return "—";
  if (n === 0) return "0";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

export function fmtDuration(ms: number | null | undefined): string {
  if (ms == null) return "—";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export function fmtPct(r: number | null | undefined): string {
  if (r == null) return "—";
  return `${(r * 100).toFixed(1)}%`;
}

export function windowLabel(k: WindowKey): string {
  return k === "24h" ? "Last 24h" : k === "7d" ? "Last 7 days" : "Last 30 days";
}

export function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
