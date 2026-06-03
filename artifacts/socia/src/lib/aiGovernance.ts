/**
 * aiGovernance — client data layer for the AI Routing Platform (owner-only).
 *
 * Mirrors the contract of /api/ai-governance/*. The config it reads/writes is
 * the live governance overlay that the generation pipeline consults on every
 * request, so saving here changes production routing/spend immediately.
 *
 * Honesty contract: provider "connected" status comes from the server (real
 * env-var presence). The UI renders unknown/absent values as "—" and never
 * fabricates providers, models or balances.
 */
import { useCallback, useMemo, useState } from "react";
import { supabase } from "./supabase";

export type ProviderId = "xai" | "openai" | "fal" | "runway" | "veo" | "pika";

export interface ChainHop {
  provider: ProviderId;
  /** null = use the route's built-in default model for this provider. */
  model: string | null;
  enabled: boolean;
}

export interface FeatureConfig {
  enabled: boolean;
  failoverEnabled: boolean;
  chain: ChainHop[];
}

export interface BudgetCap {
  dailyPhp: number | null;
  monthlyPhp: number | null;
}

export interface GovernanceConfig {
  killSwitch: boolean;
  autoPause: boolean;
  autoThrottle: boolean;
  throttleRpm: number | null;
  providers: Record<string, { enabled: boolean }>;
  models: Record<string, { enabled: boolean }>;
  features: Record<string, FeatureConfig>;
  budgets: {
    global: BudgetCap;
    perFeature: Record<string, BudgetCap>;
    perProvider: Record<string, BudgetCap>;
  };
}

export interface TopologyProvider {
  id: ProviderId;
  label: string;
  role: string;
  models: string[];
  configured: boolean;
  envVars: string[];
  tokenMetered: boolean;
  dashboard: string | null;
}

export interface TopologyFeature {
  tool: string;
  label: string;
  description: string;
  endpoint: string;
  aliases: string[];
  defaultProviders: ProviderId[];
  failover?: { summary?: string; automatic?: boolean };
}

export interface TopologyEngine {
  id: string;
  name: string;
  provider: string;
  available: boolean;
  reason: string | null;
}

export interface GovernanceTopology {
  providers: TopologyProvider[];
  features: TopologyFeature[];
  engines: TopologyEngine[];
  allEngines: { id: string; name: string; provider: string }[];
}

export interface GovernancePayload {
  generatedAt: string;
  configured: boolean;
  config: GovernanceConfig;
  topology: GovernanceTopology;
}

export interface EnforcementEvent {
  id: number;
  createdAt: string;
  eventType: string;
  feature: string | null;
  fromProvider: string | null;
  toProvider: string | null;
  model: string | null;
  reason: string;
  scope: string | null;
  actor: string | null;
  meta: unknown;
}

/* ── Transport ──────────────────────────────────────────────────────────── */

async function authHeader(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export class ValidationError extends Error {
  errors: string[];
  constructor(errors: string[]) {
    super(errors[0] ?? "Configuration rejected.");
    this.name = "ValidationError";
    this.errors = errors;
  }
}

export async function fetchGovernance(): Promise<GovernancePayload> {
  const r = await fetch("/api/ai-governance/config", { headers: await authHeader() });
  if (!r.ok) throw new Error(`Governance config unavailable (${r.status})`);
  return (await r.json()) as GovernancePayload;
}

export async function saveGovernance(
  config: GovernanceConfig,
): Promise<{ version: number; config: GovernanceConfig }> {
  const r = await fetch("/api/ai-governance/config", {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...(await authHeader()) },
    body: JSON.stringify(config),
  });
  if (r.status === 422) {
    const j = (await r.json()) as { errors?: string[] };
    throw new ValidationError(j.errors ?? ["Configuration rejected."]);
  }
  if (r.status === 409) {
    const j = (await r.json().catch(() => ({}))) as { message?: string };
    throw new Error(
      j.message ?? "This configuration was changed in another session. Reload and reapply your changes.",
    );
  }
  if (!r.ok) throw new Error(`Could not save configuration (${r.status})`);
  return (await r.json()) as { version: number; config: GovernanceConfig };
}

export async function setKillSwitch(on: boolean): Promise<{ killSwitch: boolean; version: number }> {
  const r = await fetch("/api/ai-governance/kill-switch", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await authHeader()) },
    body: JSON.stringify({ on }),
  });
  if (r.status === 409) {
    const j = (await r.json().catch(() => ({}))) as { message?: string };
    throw new Error(
      j.message ?? "This configuration was changed in another session. Reload and try again.",
    );
  }
  if (!r.ok) throw new Error(`Could not toggle kill switch (${r.status})`);
  return (await r.json()) as { killSwitch: boolean; version: number };
}

export async function fetchEvents(limit = 100): Promise<EnforcementEvent[]> {
  const r = await fetch(`/api/ai-governance/events?limit=${limit}`, { headers: await authHeader() });
  if (!r.ok) throw new Error(`Enforcement log unavailable (${r.status})`);
  const j = (await r.json()) as { events: EnforcementEvent[] };
  return j.events;
}

/* ── Display helpers ──────────────────────────────────────────────────────── */

export const PROVIDER_LABELS: Record<ProviderId, string> = {
  xai: "xAI (Grok)", openai: "OpenAI", fal: "fal.ai",
  runway: "Runway", veo: "Google Veo", pika: "Pika",
};

export const PROVIDER_ACCENT: Record<ProviderId, string> = {
  xai: "#a78bfa", openai: "#34d399", fal: "#f472b6",
  runway: "#60a5fa", veo: "#fbbf24", pika: "#22d3ee",
};

export function modelKey(provider: string, model: string): string {
  return `${provider}:${model}`;
}

export function isModelEnabled(cfg: GovernanceConfig, provider: string, model: string): boolean {
  return cfg.models[modelKey(provider, model)]?.enabled !== false;
}

export function isProviderEnabled(cfg: GovernanceConfig, provider: string): boolean {
  return cfg.providers[provider]?.enabled !== false;
}

export function fmtPhp(n: number | null | undefined): string {
  if (n == null) return "—";
  return `₱${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const mn = Math.floor(s / 60);
  if (mn < 60) return `${mn}m ago`;
  const h = Math.floor(mn / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

/* ── State hook (shared by Routing + Connections tabs) ────────────────────── */

function clone<T>(v: T): T {
  return typeof structuredClone === "function"
    ? structuredClone(v)
    : (JSON.parse(JSON.stringify(v)) as T);
}

export interface UseGovernance {
  payload: GovernancePayload | null;
  draft: GovernanceConfig | null;
  setDraft: (updater: (prev: GovernanceConfig) => GovernanceConfig) => void;
  dirty: boolean;
  loading: boolean;
  saving: boolean;
  error: string | null;
  errors: string[];
  savedAt: number | null;
  load: () => Promise<void>;
  save: () => Promise<boolean>;
  reset: () => void;
  applyKillSwitch: (on: boolean) => Promise<void>;
}

export function useGovernance(): UseGovernance {
  const [payload, setPayload] = useState<GovernancePayload | null>(null);
  const [draft, setDraftState] = useState<GovernanceConfig | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const p = await fetchGovernance();
      setPayload(p);
      setDraftState(clone(p.config));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load governance config");
    } finally {
      setLoading(false);
    }
  }, []);

  const setDraft = useCallback((updater: (prev: GovernanceConfig) => GovernanceConfig) => {
    setDraftState((prev) => (prev ? updater(prev) : prev));
  }, []);

  const dirty = useMemo(
    () => !!payload && !!draft && JSON.stringify(payload.config) !== JSON.stringify(draft),
    [payload, draft],
  );

  const save = useCallback(async (): Promise<boolean> => {
    if (!draft) return false;
    setSaving(true);
    setErrors([]);
    setError(null);
    try {
      const res = await saveGovernance(draft);
      setPayload((p) => (p ? { ...p, configured: true, config: res.config } : p));
      setDraftState(clone(res.config));
      setSavedAt(Date.now());
      return true;
    } catch (e) {
      if (e instanceof ValidationError) setErrors(e.errors);
      else setError(e instanceof Error ? e.message : "Could not save configuration");
      return false;
    } finally {
      setSaving(false);
    }
  }, [draft]);

  const reset = useCallback(() => {
    if (payload) setDraftState(clone(payload.config));
    setErrors([]);
    setError(null);
  }, [payload]);

  const applyKillSwitch = useCallback(async (on: boolean) => {
    try {
      await setKillSwitch(on);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not toggle kill switch");
    }
  }, [load]);

  return {
    payload, draft, setDraft, dirty, loading, saving, error, errors, savedAt,
    load, save, reset, applyKillSwitch,
  };
}
