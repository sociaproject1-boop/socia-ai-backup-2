/**
 * aiGovernance — the owner-editable governance & routing ENGINE.
 *
 * `aiTopology.ts` describes the static truth (which providers/features exist,
 * their default flow, their failover). This module overlays an owner-editable,
 * DB-persisted configuration on top of that truth and answers the questions the
 * live generation pipeline asks on every request:
 *
 *   - Is the global kill switch on?
 *   - Is this feature / provider / model enabled right now?
 *   - What is the ordered routing chain (priority + failover) for a feature?
 *   - Has the relevant budget (global / feature / provider, daily / monthly)
 *     been exhausted? (computed success-only from usage_receipts — NEVER from
 *     credit_ledger, which does not exist; see provider-honesty-contract).
 *
 * Permissive by default: an ABSENT config row, or any unset field, resolves to
 * "allow / use existing behaviour", so the pipeline behaves exactly as it did
 * before governance existed until the owner changes something.
 *
 * Persistence + audit use the service-role Supabase client (owner-gated routes
 * only). recordEvent() is best-effort and never throws.
 */
import { getServiceClient } from "./adminAuth.js";
import { logger } from "./logger.js";
import {
  PROVIDERS,
  FEATURES,
  getProvider,
  getFeature,
  classifyProvider,
  isProviderConfigured,
  type ProviderId,
} from "./aiTopology.js";

/* ── Config shape ───────────────────────────────────────────────────────── */

export interface ChainHop {
  provider: ProviderId;
  /** null = use the route's built-in default model for this provider. */
  model: string | null;
  enabled: boolean;
}

export interface FeatureConfig {
  enabled: boolean;
  /** When false, only the first (priority #1) hop is ever used. */
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
  /** keyed `${provider}:${model}`. */
  models: Record<string, { enabled: boolean }>;
  features: Record<string, FeatureConfig>;
  budgets: {
    global: BudgetCap;
    perFeature: Record<string, BudgetCap>;
    perProvider: Record<string, BudgetCap>;
  };
}

/* ── Defaults derived from the static topology ──────────────────────────── */

function defaultChainFor(tool: string): ChainHop[] {
  const f = getFeature(tool);
  if (!f) return [];
  return f.providers.map((provider) => ({
    provider,
    model: null,
    enabled: true,
  }));
}

/** A fully-populated, permissive config (every feature/provider/model on). */
export function defaultConfig(): GovernanceConfig {
  const providers: GovernanceConfig["providers"] = {};
  for (const p of PROVIDERS) providers[p.id] = { enabled: true };

  const models: GovernanceConfig["models"] = {};
  for (const p of PROVIDERS) {
    for (const m of p.models) models[`${p.id}:${m}`] = { enabled: true };
  }

  const features: GovernanceConfig["features"] = {};
  for (const f of FEATURES) {
    features[f.tool] = {
      enabled: true,
      failoverEnabled: true,
      chain: defaultChainFor(f.tool),
    };
  }

  return {
    killSwitch: false,
    autoPause: false,
    autoThrottle: false,
    throttleRpm: null,
    providers,
    models,
    features,
    budgets: {
      global: { dailyPhp: null, monthlyPhp: null },
      perFeature: {},
      perProvider: {},
    },
  };
}

/* ── Merge stored (partial) config over defaults ────────────────────────── */

type DeepPartial<T> = { [K in keyof T]?: DeepPartial<T[K]> };

function mergeBudgetCap(d: BudgetCap, s?: DeepPartial<BudgetCap>): BudgetCap {
  return {
    dailyPhp: s?.dailyPhp === undefined ? d.dailyPhp : (s.dailyPhp as number | null),
    monthlyPhp:
      s?.monthlyPhp === undefined ? d.monthlyPhp : (s.monthlyPhp as number | null),
  };
}

/**
 * Build the effective config from a stored partial. Anything the owner has not
 * set falls back to the permissive default. Stored feature chains REPLACE the
 * default chain for that feature (so reordering/removal sticks), but a feature
 * the owner never touched keeps its topology default chain.
 */
export function resolveConfig(stored: DeepPartial<GovernanceConfig> | null): GovernanceConfig {
  const d = defaultConfig();
  if (!stored) return d;

  const providers = { ...d.providers };
  if (stored.providers) {
    for (const [id, v] of Object.entries(stored.providers)) {
      if (providers[id]) providers[id] = { enabled: v?.enabled !== false };
    }
  }

  const models = { ...d.models };
  if (stored.models) {
    for (const [key, v] of Object.entries(stored.models)) {
      models[key] = { enabled: (v as { enabled?: boolean })?.enabled !== false };
    }
  }

  const features = { ...d.features };
  if (stored.features) {
    for (const [tool, v] of Object.entries(stored.features)) {
      const base = features[tool] ?? {
        enabled: true,
        failoverEnabled: true,
        chain: defaultChainFor(tool),
      };
      const sv = v as DeepPartial<FeatureConfig> | undefined;
      features[tool] = {
        enabled: sv?.enabled !== false,
        failoverEnabled: sv?.failoverEnabled !== false,
        chain: Array.isArray(sv?.chain)
          ? (sv!.chain as ChainHop[]).map((h) => ({
              provider: h.provider,
              model: h.model ?? null,
              enabled: h.enabled !== false,
            }))
          : base.chain,
      };
    }
  }

  const budgets: GovernanceConfig["budgets"] = {
    global: mergeBudgetCap(d.budgets.global, stored.budgets?.global),
    perFeature: {},
    perProvider: {},
  };
  if (stored.budgets?.perFeature) {
    for (const [k, v] of Object.entries(stored.budgets.perFeature)) {
      budgets.perFeature[k] = mergeBudgetCap(
        { dailyPhp: null, monthlyPhp: null },
        v as DeepPartial<BudgetCap>,
      );
    }
  }
  if (stored.budgets?.perProvider) {
    for (const [k, v] of Object.entries(stored.budgets.perProvider)) {
      budgets.perProvider[k] = mergeBudgetCap(
        { dailyPhp: null, monthlyPhp: null },
        v as DeepPartial<BudgetCap>,
      );
    }
  }

  return {
    killSwitch: stored.killSwitch === true,
    autoPause: stored.autoPause === true,
    autoThrottle: stored.autoThrottle === true,
    throttleRpm:
      typeof stored.throttleRpm === "number" ? stored.throttleRpm : d.throttleRpm,
    providers,
    models,
    features,
    budgets,
  };
}

/* ── Load + cache ───────────────────────────────────────────────────────── */

const CONFIG_TTL_MS = 5_000;
let _cache: { cfg: GovernanceConfig; raw: DeepPartial<GovernanceConfig> | null; at: number } | null =
  null;

/** Force the next read to hit the DB (called after a save). */
export function invalidateConfigCache(): void {
  _cache = null;
}

async function loadStored(): Promise<DeepPartial<GovernanceConfig> | null> {
  const sb = getServiceClient();
  if (!sb) return null;
  const { data, error } = await sb
    .from("ai_governance_config")
    .select("config")
    .eq("id", "singleton")
    .maybeSingle();
  if (error) {
    logger.warn({ err: error.message }, "[governance] config read failed");
    return null;
  }
  return (data?.config as DeepPartial<GovernanceConfig>) ?? null;
}

/** Effective config (cached). Falls back to permissive defaults on any error. */
export async function getConfig(): Promise<GovernanceConfig> {
  const now = Date.now();
  if (_cache && now - _cache.at < CONFIG_TTL_MS) return _cache.cfg;
  let raw: DeepPartial<GovernanceConfig> | null = null;
  try {
    raw = await loadStored();
  } catch (e) {
    logger.warn({ err: (e as Error).message }, "[governance] load failed; using defaults");
  }
  const cfg = resolveConfig(raw);
  _cache = { cfg, raw, at: now };
  return cfg;
}

/** Raw stored partial (for the owner editor; null when never saved). */
export async function getStoredConfig(): Promise<DeepPartial<GovernanceConfig> | null> {
  if (_cache && Date.now() - _cache.at < CONFIG_TTL_MS) return _cache.raw;
  return loadStored();
}

/* ── Save (validate-then-persist) ───────────────────────────────────────── */

export interface ValidationResult {
  ok: boolean;
  errors: string[];
}

/**
 * Reject any config that would BREAK generation. A feature that is enabled must
 * have at least one usable hop: provider known + enabled + credential present +
 * (model null OR a model known to that provider). Unknown providers/models in a
 * chain are rejected outright.
 */
export function validateConfig(input: DeepPartial<GovernanceConfig>): ValidationResult {
  const errors: string[] = [];
  const cfg = resolveConfig(input);

  if (cfg.autoThrottle) {
    if (cfg.throttleRpm == null || !Number.isFinite(cfg.throttleRpm) || cfg.throttleRpm <= 0) {
      errors.push("Auto-throttle is on but throttleRpm is not a positive number.");
    }
  }

  const checkCap = (label: string, cap: BudgetCap) => {
    for (const [k, v] of [["dailyPhp", cap.dailyPhp], ["monthlyPhp", cap.monthlyPhp]] as const) {
      if (v != null && (!Number.isFinite(v) || v < 0)) {
        errors.push(`${label} ${k} must be a non-negative number.`);
      }
    }
  };
  checkCap("Global budget", cfg.budgets.global);
  for (const [tool, cap] of Object.entries(cfg.budgets.perFeature)) checkCap(`Feature "${tool}" budget`, cap);
  for (const [pid, cap] of Object.entries(cfg.budgets.perProvider)) checkCap(`Provider "${pid}" budget`, cap);

  for (const [tool, fc] of Object.entries(cfg.features)) {
    const feat = getFeature(tool);
    if (!feat) {
      errors.push(`Unknown feature "${tool}".`);
      continue;
    }
    for (const hop of fc.chain) {
      const prov = getProvider(hop.provider);
      if (!prov) {
        errors.push(`Feature "${tool}" references unknown provider "${hop.provider}".`);
        continue;
      }
      if (hop.model != null && hop.model !== "" && !prov.models.includes(hop.model)) {
        errors.push(`Feature "${tool}": model "${hop.model}" is not a known ${prov.label} model.`);
      }
    }
    if (fc.enabled) {
      const usable = fc.chain.some((hop) => {
        if (!hop.enabled) return false;
        const prov = getProvider(hop.provider);
        if (!prov) return false;
        if (cfg.providers[hop.provider]?.enabled === false) return false;
        if (!isProviderConfigured(prov)) return false;
        if (hop.model && cfg.models[`${hop.provider}:${hop.model}`]?.enabled === false) return false;
        return true;
      });
      if (!usable) {
        errors.push(
          `Feature "${feat.label}" is enabled but has no usable provider (every option is disabled, missing its API key, or invalid). Disable the feature or fix its routing.`,
        );
      }
    }
  }

  return { ok: errors.length === 0, errors };
}

/** Thrown when an optimistic-concurrency check fails (another session saved first). */
export class GovernanceConflictError extends Error {
  readonly code = "CONFIG_CONFLICT" as const;
  constructor(message: string) {
    super(message);
    this.name = "GovernanceConflictError";
  }
}

/** Persist a validated config. Returns the new version, or throws on failure. */
export async function saveConfig(
  input: DeepPartial<GovernanceConfig>,
  actor: string,
): Promise<{ version: number }> {
  const sb = getServiceClient();
  if (!sb) throw new Error("Service-role client unavailable.");

  const { data: existing } = await sb
    .from("ai_governance_config")
    .select("version")
    .eq("id", "singleton")
    .maybeSingle();
  const prevVersion = existing?.version ?? 0;
  const version = prevVersion + 1;
  const row = {
    id: "singleton",
    config: input,
    version,
    updated_at: new Date().toISOString(),
    updated_by: actor,
  };

  if (existing) {
    // Optimistic concurrency: only overwrite if the row still has the version
    // we read. A concurrent save bumps it first and this update matches no row,
    // so we surface a conflict instead of silently clobbering their change.
    const { data: updated, error } = await sb
      .from("ai_governance_config")
      .update(row)
      .eq("id", "singleton")
      .eq("version", prevVersion)
      .select("version");
    if (error) throw new Error(error.message);
    if (!updated || updated.length === 0) {
      throw new GovernanceConflictError(
        "This configuration was changed by another session. Reload and reapply your changes.",
      );
    }
  } else {
    const { error } = await sb.from("ai_governance_config").insert(row);
    if (error) throw new Error(error.message);
  }

  invalidateConfigCache();
  void recordEvent({
    eventType: "config_change",
    reason: "Governance configuration updated.",
    actor,
    scope: "global",
    meta: { version },
  });
  return { version };
}

/* ── Runtime resolution helpers ─────────────────────────────────────────── */

export function isModelEnabled(cfg: GovernanceConfig, provider: string, model: string | null): boolean {
  if (!model) return true;
  return cfg.models[`${provider}:${model}`]?.enabled !== false;
}

export function isProviderEnabled(cfg: GovernanceConfig, provider: string): boolean {
  return cfg.providers[provider]?.enabled !== false;
}

export function isFeatureEnabled(cfg: GovernanceConfig, tool: string): boolean {
  return cfg.features[tool]?.enabled !== false;
}

/**
 * The ordered, usable routing chain for a feature: priority order, with
 * disabled providers/models removed and failover collapsed to the first hop
 * when failoverEnabled is false. Empty array => nothing can serve the feature.
 */
export function getRoutingChain(cfg: GovernanceConfig, tool: string): ChainHop[] {
  const fc = cfg.features[tool];
  const chain = fc?.chain ?? defaultChainFor(tool);
  const usable = chain.filter(
    (h) =>
      h.enabled &&
      isProviderEnabled(cfg, h.provider) &&
      isModelEnabled(cfg, h.provider, h.model),
  );
  if (fc && !fc.failoverEnabled) return usable.slice(0, 1);
  return usable;
}

/* ── Budget computation (success-only, from usage_receipts) ─────────────── */

interface SpendSnapshot {
  at: number;
  global: { daily: number; monthly: number };
  perFeature: Map<string, { daily: number; monthly: number }>;
  perProvider: Map<string, { daily: number; monthly: number }>;
}
const SPEND_TTL_MS = 30_000;
let _spend: SpendSnapshot | null = null;

function startOfUtcDay(now: number): number {
  const d = new Date(now);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}
function startOfUtcMonth(now: number): number {
  const d = new Date(now);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
}

async function loadSpend(): Promise<SpendSnapshot> {
  const now = Date.now();
  if (_spend && now - _spend.at < SPEND_TTL_MS) return _spend;

  const empty: SpendSnapshot = {
    at: now,
    global: { daily: 0, monthly: 0 },
    perFeature: new Map(),
    perProvider: new Map(),
  };
  const sb = getServiceClient();
  if (!sb) {
    _spend = empty;
    return empty;
  }

  const monthStart = new Date(startOfUtcMonth(now)).toISOString();
  const dayStart = startOfUtcDay(now);
  try {
    const { data, error } = await sb
      .from("usage_receipts")
      .select("tool_used, model_used, estimated_cost, created_at, status")
      .eq("status", "success")
      .gte("created_at", monthStart)
      .limit(50_000);
    if (error) throw new Error(error.message);
    for (const r of (data ?? []) as Array<{
      tool_used: string;
      model_used: string | null;
      estimated_cost: number | string | null;
      created_at: string;
    }>) {
      const cost = Number(r.estimated_cost ?? 0) || 0;
      if (cost <= 0) continue;
      const isToday = new Date(r.created_at).getTime() >= dayStart;
      empty.global.monthly += cost;
      if (isToday) empty.global.daily += cost;

      const f = empty.perFeature.get(r.tool_used) ?? { daily: 0, monthly: 0 };
      f.monthly += cost;
      if (isToday) f.daily += cost;
      empty.perFeature.set(r.tool_used, f);

      const prov = classifyProvider(r.model_used);
      if (prov) {
        const p = empty.perProvider.get(prov) ?? { daily: 0, monthly: 0 };
        p.monthly += cost;
        if (isToday) p.daily += cost;
        empty.perProvider.set(prov, p);
      }
    }
  } catch (e) {
    logger.warn({ err: (e as Error).message }, "[governance] spend load failed; treating as 0");
  }
  _spend = empty;
  return empty;
}

/** Invalidate the cached spend snapshot (e.g. right after a generation). */
export function invalidateSpendCache(): void {
  _spend = null;
}

export interface BudgetStatus {
  exhausted: boolean;
  scope: "global" | "feature" | "provider" | null;
  limitPhp: number | null;
  spentPhp: number;
  period: "daily" | "monthly" | null;
}

/** Whether spend has hit any cap that applies to this (feature, provider). */
export async function getBudgetStatus(
  cfg: GovernanceConfig,
  tool: string,
  provider: ProviderId | null,
): Promise<BudgetStatus> {
  const spend = await loadSpend();
  const checks: Array<{ scope: BudgetStatus["scope"]; cap: BudgetCap; spent: { daily: number; monthly: number } }> = [
    { scope: "global", cap: cfg.budgets.global, spent: spend.global },
  ];
  const fc = cfg.budgets.perFeature[tool];
  if (fc) checks.push({ scope: "feature", cap: fc, spent: spend.perFeature.get(tool) ?? { daily: 0, monthly: 0 } });
  if (provider) {
    const pc = cfg.budgets.perProvider[provider];
    if (pc) checks.push({ scope: "provider", cap: pc, spent: spend.perProvider.get(provider) ?? { daily: 0, monthly: 0 } });
  }

  for (const c of checks) {
    if (c.cap.dailyPhp != null && c.spent.daily >= c.cap.dailyPhp) {
      return { exhausted: true, scope: c.scope, limitPhp: c.cap.dailyPhp, spentPhp: c.spent.daily, period: "daily" };
    }
    if (c.cap.monthlyPhp != null && c.spent.monthly >= c.cap.monthlyPhp) {
      return { exhausted: true, scope: c.scope, limitPhp: c.cap.monthlyPhp, spentPhp: c.spent.monthly, period: "monthly" };
    }
  }
  return { exhausted: false, scope: null, limitPhp: null, spentPhp: 0, period: null };
}

/* ── Request evaluation (the single pipeline entry point) ───────────────── */

export interface GateDecision {
  allowed: boolean;
  code?: "KILL_SWITCH" | "FEATURE_DISABLED" | "BUDGET_EXHAUSTED" | "NO_PROVIDER";
  message?: string;
  /** Ordered usable chain (only meaningful when allowed). */
  chain: ChainHop[];
  budget?: BudgetStatus;
}

export interface EvaluateOptions {
  /**
   * The provider this route will ACTUALLY call. Routes that are hard-wired to a
   * single provider (e.g. image→openai, single-clip & multiframe video→fal)
   * must declare it: the gate then confirms that exact provider is enabled +
   * configured (present in the usable chain) and keys the budget to it. Without
   * this, disabling a provider would be silently ignored whenever a *different*
   * provider keeps the feature chain non-empty — the route would still run the
   * disabled one. Chat omits this because it consults `chain` directly.
   */
  requireProvider?: ProviderId;
}

/**
 * The single check the generation routes call BEFORE doing billable work.
 * Returns allowed + the routing chain to use, or a block decision with a clear
 * user-facing message. Permissive by default — when nothing is configured the
 * chain is the topology default and allowed is true.
 */
export async function evaluateRequest(
  tool: string,
  opts: EvaluateOptions = {},
): Promise<GateDecision> {
  const cfg = await getConfig();

  if (cfg.killSwitch) {
    return {
      allowed: false,
      code: "KILL_SWITCH",
      message: "AI generation is temporarily paused by the operator.",
      chain: [],
    };
  }
  if (!isFeatureEnabled(cfg, tool)) {
    return {
      allowed: false,
      code: "FEATURE_DISABLED",
      message: "This AI feature is currently turned off by the operator.",
      chain: [],
    };
  }

  const chain = getRoutingChain(cfg, tool);
  if (chain.length === 0) {
    return {
      allowed: false,
      code: "NO_PROVIDER",
      message: "No AI provider is currently available for this feature.",
      chain: [],
    };
  }

  // A route hard-wired to one provider must not run if that exact provider has
  // been disabled, even when other providers keep the chain non-empty.
  if (opts.requireProvider && !chain.some((h) => h.provider === opts.requireProvider)) {
    return {
      allowed: false,
      code: "NO_PROVIDER",
      message: "The provider for this feature has been turned off by the operator.",
      chain: [],
    };
  }

  // Budget is keyed by the provider this request will actually bill against:
  // the declared provider when set, otherwise the priority #1 hop.
  const primary = opts.requireProvider ?? chain[0]!.provider;
  const budget = await getBudgetStatus(cfg, tool, primary);
  if (budget.exhausted && cfg.autoPause) {
    return {
      allowed: false,
      code: "BUDGET_EXHAUSTED",
      message: "The AI budget for this feature has been reached. Generation is paused.",
      chain: [],
      budget,
    };
  }

  return { allowed: true, chain, budget };
}

/* ── Enforcement / audit logging (best-effort, never throws) ─────────────── */

export interface EnforcementEventInput {
  eventType: "block" | "kill_switch" | "budget_pause" | "throttle" | "failover" | "config_change";
  feature?: string | null;
  fromProvider?: string | null;
  toProvider?: string | null;
  model?: string | null;
  reason: string;
  scope?: "global" | "feature" | "provider" | "model" | null;
  actor?: string | null;
  meta?: unknown;
}

export async function recordEvent(ev: EnforcementEventInput): Promise<void> {
  const sb = getServiceClient();
  if (!sb) return;
  try {
    const { error } = await sb.from("ai_enforcement_events").insert({
      event_type: ev.eventType,
      feature: ev.feature ?? null,
      from_provider: ev.fromProvider ?? null,
      to_provider: ev.toProvider ?? null,
      model: ev.model ?? null,
      reason: ev.reason,
      scope: ev.scope ?? null,
      actor: ev.actor ?? "system",
      meta: ev.meta ? (ev.meta as object) : null,
    });
    if (error) logger.warn({ err: error.message }, "[governance] event insert failed");
  } catch (e) {
    logger.warn({ err: (e as Error).message }, "[governance] event insert threw");
  }
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

export async function listEvents(limit = 100): Promise<EnforcementEvent[]> {
  const sb = getServiceClient();
  if (!sb) return [];
  const { data, error } = await sb
    .from("ai_enforcement_events")
    .select("id, created_at, event_type, feature, from_provider, to_provider, model, reason, scope, actor, meta")
    .order("created_at", { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 500));
  if (error) {
    logger.warn({ err: error.message }, "[governance] events read failed");
    return [];
  }
  return (data ?? []).map((r: {
    id: number; created_at: string; event_type: string; feature: string | null;
    from_provider: string | null; to_provider: string | null; model: string | null;
    reason: string; scope: string | null; actor: string | null; meta: unknown;
  }) => ({
    id: r.id,
    createdAt: r.created_at,
    eventType: r.event_type,
    feature: r.feature,
    fromProvider: r.from_provider,
    toProvider: r.to_provider,
    model: r.model,
    reason: r.reason,
    scope: r.scope,
    actor: r.actor,
    meta: r.meta,
  }));
}
