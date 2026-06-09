/**
 * routes/aiOps.ts — AI Operations Center (owner-only) live aggregation.
 *
 * Powers the AI Command Center v2 monitoring dashboard. Every number here is
 * aggregated from REAL rows in usage_receipts (written by trackUsage on every
 * generation/chat) and merged onto the config-truth topology in aiTopology.ts.
 * Nothing is fabricated; absent data is returned as 0 / null and rendered as
 * "—" by the client.
 *
 * AUTH: requireAuth + owner-email gate (same gate as /system-status/ai).
 * Reads use the service-role client so the owner sees full internal ₱ cost.
 * estimated_cost remains owner-only — it is never exposed to regular users.
 *
 *   GET /api/ai-ops/overview   — full snapshot (24h / 7d / 30d windows)
 *   GET /api/ai-ops/activity   — recent live activity feed (lightweight)
 */
import { Router, type IRouter, type RequestHandler } from "express";
import { requireAuth, getAuthedUser } from "../lib/replitAuth.js";
import { getServiceClient } from "../lib/adminAuth.js";
import { OWNER_EMAIL } from "../monitoring/index.js";
import { logger } from "../lib/logger.js";
import {
  PROVIDERS, FEATURES, PHP_PER_USD,
  classifyProvider, isProviderConfigured, providerEnvLabels,
  type ProviderId,
} from "../lib/aiTopology.js";

const router: IRouter = Router();

/* ── Owner gate (mirrors systemStatus.ts) ─────────────────────────────── */
const requireOwner: RequestHandler = (req, res, next) => {
  try {
    const user = getAuthedUser(req);
    if ((user.email ?? "").toLowerCase() !== OWNER_EMAIL.toLowerCase()) {
      res.status(403).json({ error: "Owner access required", code: "FORBIDDEN" });
      return;
    }
    next();
  } catch {
    res.status(401).json({ error: "Unauthenticated", code: "UNAUTHENTICATED" });
  }
};

/* ── Types ────────────────────────────────────────────────────────────── */
type WindowKey = "24h" | "7d" | "30d";
const WINDOWS: { key: WindowKey; ms: number }[] = [
  { key: "24h", ms: 86_400_000 },
  { key: "7d",  ms: 7 * 86_400_000 },
  { key: "30d", ms: 30 * 86_400_000 },
];

interface ReceiptRow {
  tool_used:       string;
  model_used:      string | null;
  generation_type: string | null;
  estimated_cost:  number | string | null;
  duration_ms:     number | null;
  queue_time_ms:   number | null;
  token_usage:     { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } | null;
  status:          string;
  created_at:      string;
}

interface Tokens { input: number; output: number; total: number }

interface MetricBucket {
  requests:    number;
  success:     number;
  failed:      number;
  refunded:    number;
  moderated:   number;
  costPhp:     number;     // success-only (matches /admin/usage/stats convention)
  tokens:      Tokens;
  durSum:      number;     // for avg
  durCount:    number;
}

function emptyBucket(): MetricBucket {
  return {
    requests: 0, success: 0, failed: 0, refunded: 0, moderated: 0,
    costPhp: 0, tokens: { input: 0, output: 0, total: 0 }, durSum: 0, durCount: 0,
  };
}

function addRow(b: MetricBucket, r: ReceiptRow): void {
  b.requests++;
  if (r.status === "success")        b.success++;
  else if (r.status === "failed")    b.failed++;
  else if (r.status === "refunded")  b.refunded++;
  else if (r.status === "moderated") b.moderated++;

  if (r.status === "success") {
    b.costPhp += Number(r.estimated_cost ?? 0) || 0;
    if (typeof r.duration_ms === "number" && r.duration_ms > 0) {
      b.durSum += r.duration_ms;
      b.durCount++;
    }
  }

  const tu = r.token_usage;
  if (tu) {
    const input  = Number(tu.prompt_tokens ?? 0) || 0;
    const output = Number(tu.completion_tokens ?? 0) || 0;
    const total  = Number(tu.total_tokens ?? (input + output)) || 0;
    b.tokens.input  += input;
    b.tokens.output += output;
    b.tokens.total  += total;
  }
}

function serializeBucket(b: MetricBucket) {
  const denom = b.success + b.failed;
  return {
    requests:    b.requests,
    success:     b.success,
    failed:      b.failed,
    refunded:    b.refunded,
    moderated:   b.moderated,
    successRate: denom > 0 ? b.success / denom : null,
    errorRate:   denom > 0 ? b.failed / denom  : null,
    costPhp:     Math.round(b.costPhp * 100) / 100,
    costUsd:     Math.round((b.costPhp / PHP_PER_USD) * 100) / 100,
    tokens:      b.tokens,
    avgDurationMs: b.durCount > 0 ? Math.round(b.durSum / b.durCount) : null,
  };
}

/** Fetch all usage_receipts since `sinceIso`, paginating past PostgREST's cap. */
async function fetchReceiptsSince(
  sb: ReturnType<typeof getServiceClient>,
  sinceIso: string,
  maxRows = 50_000,
): Promise<{ rows: ReceiptRow[]; truncated: boolean }> {
  if (!sb) return { rows: [], truncated: false };
  const page = 1000;
  const out: ReceiptRow[] = [];
  let truncated = false;
  for (let offset = 0; offset < maxRows; offset += page) {
    const { data, error } = await sb
      .from("usage_receipts")
      .select("tool_used, model_used, generation_type, estimated_cost, duration_ms, queue_time_ms, token_usage, status, created_at")
      .gte("created_at", sinceIso)
      .order("created_at", { ascending: false })
      .range(offset, offset + page - 1);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as ReceiptRow[];
    out.push(...rows);
    if (rows.length < page) break;
    // We filled a full page and are about to exceed the cap → there may be more.
    if (offset + page >= maxRows) truncated = true;
  }
  return { rows: out, truncated };
}

/* ── GET /ai-ops/overview ─────────────────────────────────────────────── */
router.get("/ai-ops/overview", requireAuth, requireOwner, async (_req, res) => {
  const sb = getServiceClient();
  if (!sb) {
    return res.status(503).json({ code: "ADMIN_NOT_READY", message: "Service-role client unavailable." });
  }

  const now = Date.now();
  const since30 = new Date(now - 30 * 86_400_000).toISOString();

  let rows: ReceiptRow[];
  let truncated: boolean;
  try {
    ({ rows, truncated } = await fetchReceiptsSince(sb, since30));
  } catch (err) {
    logger.warn({ err: (err as Error).message }, "[ai-ops] receipts query failed");
    return res.status(500).json({ code: "DB_ERROR", message: "Could not load usage data." });
  }

  // ── Accumulators ──────────────────────────────────────────────────────
  const totals: Record<WindowKey, MetricBucket> = { "24h": emptyBucket(), "7d": emptyBucket(), "30d": emptyBucket() };
  const byFeature: Record<string, Record<WindowKey, MetricBucket>> = {};
  const byProvider: Record<string, Record<WindowKey, MetricBucket>> = {};
  // Per (feature, model), window-scoped — so each feature's model breakdown
  // only reflects that feature's own requests in the selected window.
  const byFeatureModel = new Map<string, {
    tool: string; model: string; provider: ProviderId | null; windows: Record<WindowKey, MetricBucket>;
  }>();
  // Daily series (UTC date → totals) for trend charts.
  const dailyMap = new Map<string, { requests: number; success: number; failed: number; costPhp: number; tokens: number }>();

  const windowFor = (createdAt: string): WindowKey[] => {
    const age = now - new Date(createdAt).getTime();
    const keys: WindowKey[] = [];
    if (age <= 86_400_000) keys.push("24h");
    if (age <= 7 * 86_400_000) keys.push("7d");
    keys.push("30d");
    return keys;
  };

  for (const r of rows) {
    const wins = windowFor(r.created_at);
    const provider = classifyProvider(r.model_used);
    const provKey = provider ?? "unknown";

    if (!byFeature[r.tool_used]) byFeature[r.tool_used] = { "24h": emptyBucket(), "7d": emptyBucket(), "30d": emptyBucket() };
    if (!byProvider[provKey])    byProvider[provKey]    = { "24h": emptyBucket(), "7d": emptyBucket(), "30d": emptyBucket() };

    for (const w of wins) {
      addRow(totals[w], r);
      addRow(byFeature[r.tool_used]![w], r);
      addRow(byProvider[provKey]![w], r);
    }

    const modelKey = r.model_used ?? "(unspecified)";
    const fmKey = `${r.tool_used}\u0000${modelKey}`;
    let mm = byFeatureModel.get(fmKey);
    if (!mm) {
      mm = { tool: r.tool_used, model: modelKey, provider, windows: { "24h": emptyBucket(), "7d": emptyBucket(), "30d": emptyBucket() } };
      byFeatureModel.set(fmKey, mm);
    }
    for (const w of wins) addRow(mm.windows[w], r);

    // Daily series accumulation (UTC calendar day).
    const dateKey = r.created_at.slice(0, 10);
    const d = dailyMap.get(dateKey) ?? { requests: 0, success: 0, failed: 0, costPhp: 0, tokens: 0 };
    d.requests++;
    if (r.status === "success") {
      d.success++;
      d.costPhp += Number(r.estimated_cost ?? 0) || 0;
    } else if (r.status === "failed") {
      d.failed++;
    }
    const tu = r.token_usage;
    if (tu) {
      d.tokens += Number(tu.total_tokens ?? ((tu.prompt_tokens ?? 0) + (tu.completion_tokens ?? 0))) || 0;
    }
    dailyMap.set(dateKey, d);
  }

  // Build a continuous 30-day series (oldest → newest), filling gaps with zeros.
  const series: Array<{ date: string; requests: number; success: number; failed: number; costPhp: number; tokens: number }> = [];
  for (let i = 29; i >= 0; i--) {
    const dateKey = new Date(now - i * 86_400_000).toISOString().slice(0, 10);
    const d = dailyMap.get(dateKey) ?? { requests: 0, success: 0, failed: 0, costPhp: 0, tokens: 0 };
    series.push({
      date: dateKey,
      requests: d.requests,
      success: d.success,
      failed: d.failed,
      costPhp: Math.round(d.costPhp * 100) / 100,
      tokens: d.tokens,
    });
  }

  // ── Shape: features (topology + live metrics) ─────────────────────────
  const features = FEATURES.map((f) => {
    const w = byFeature[f.tool];
    const models = [...byFeatureModel.values()]
      .filter((m) => m.tool === f.tool)
      .map((m) => ({
        model: m.model,
        provider: m.provider,
        windows: {
          "24h": serializeBucket(m.windows["24h"]),
          "7d":  serializeBucket(m.windows["7d"]),
          "30d": serializeBucket(m.windows["30d"]),
        },
      }))
      .sort((a, b) => b.windows["30d"].requests - a.windows["30d"].requests);

    return {
      tool: f.tool,
      label: f.label,
      description: f.description,
      endpoint: f.endpoint,
      aliases: f.aliases,
      providers: f.providers,
      tokenTracked: f.tokenTracked,
      flow: f.flow,
      failover: f.failover,
      windows: {
        "24h": serializeBucket(w?.["24h"] ?? emptyBucket()),
        "7d":  serializeBucket(w?.["7d"]  ?? emptyBucket()),
        "30d": serializeBucket(w?.["30d"] ?? emptyBucket()),
      },
      models,
    };
  });

  // ── Shape: providers (topology + config status + live metrics) ────────
  const providers = PROVIDERS.map((p) => {
    const w = byProvider[p.id];
    const featuresUsing = FEATURES.filter((f) => f.providers.includes(p.id)).map((f) => f.tool);
    return {
      id: p.id,
      label: p.label,
      role: p.role,
      configured: isProviderConfigured(p),
      envVars: providerEnvLabels(p),
      models: p.models,
      tokenMetered: p.tokenMetered,
      dashboard: p.dashboard ?? null,
      featuresUsing,
      windows: {
        "24h": serializeBucket(w?.["24h"] ?? emptyBucket()),
        "7d":  serializeBucket(w?.["7d"]  ?? emptyBucket()),
        "30d": serializeBucket(w?.["30d"] ?? emptyBucket()),
      },
    };
  });

  // Any usage attributed to a model we couldn't classify — surfaced honestly.
  const unclassified = byProvider["unknown"]
    ? {
        windows: {
          "24h": serializeBucket(byProvider["unknown"]["24h"]),
          "7d":  serializeBucket(byProvider["unknown"]["7d"]),
          "30d": serializeBucket(byProvider["unknown"]["30d"]),
        },
      }
    : null;

  // ── Activity feed (recent, redacted user ref) ─────────────────────────
  const activity = await fetchActivity(sb, 60);

  return res.json({
    generatedAt: new Date().toISOString(),
    environment: process.env["NODE_ENV"] === "production" ? "Production" : "Development",
    phpPerUsd: PHP_PER_USD,
    dataAvailable: rows.length > 0,
    truncated,
    rowsRead: rows.length,
    windowKeys: WINDOWS.map((w) => w.key),
    totals: {
      "24h": serializeBucket(totals["24h"]),
      "7d":  serializeBucket(totals["7d"]),
      "30d": serializeBucket(totals["30d"]),
    },
    series,
    features,
    providers,
    unclassified,
    activity,
  });
});

/* ── Activity feed helper ─────────────────────────────────────────────── */
interface ActivityItem {
  id: string; createdAt: string; tool: string; label: string;
  model: string | null; provider: ProviderId | null; status: string;
  durationMs: number | null; costPhp: number; tokens: number | null;
  userRef: string;
}

async function fetchActivity(
  sb: NonNullable<ReturnType<typeof getServiceClient>>,
  limit: number,
): Promise<ActivityItem[]> {
  const { data, error } = await sb
    .from("usage_receipts")
    .select("id, user_id, tool_used, model_used, estimated_cost, duration_ms, token_usage, status, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    logger.warn({ err: error.message }, "[ai-ops] activity query failed");
    return [];
  }
  const featLabel = new Map(FEATURES.map((f) => [f.tool, f.label]));
  return (data ?? []).map((r: {
    id: string; user_id: string; tool_used: string; model_used: string | null;
    estimated_cost: number | string | null; duration_ms: number | null;
    token_usage: { total_tokens?: number; prompt_tokens?: number; completion_tokens?: number } | null;
    status: string; created_at: string;
  }) => {
    const tu = r.token_usage;
    const tokens = tu
      ? (Number(tu.total_tokens ?? ((tu.prompt_tokens ?? 0) + (tu.completion_tokens ?? 0))) || 0)
      : null;
    return {
      id: r.id,
      createdAt: r.created_at,
      tool: r.tool_used,
      label: featLabel.get(r.tool_used) ?? r.tool_used,
      model: r.model_used,
      provider: classifyProvider(r.model_used),
      status: r.status,
      durationMs: r.duration_ms,
      // Success-only cost convention (matches the aggregate ledger): failed /
      // refunded / moderated events carry no spend in the dashboard.
      costPhp: r.status === "success" ? Math.round((Number(r.estimated_cost ?? 0) || 0) * 100) / 100 : 0,
      tokens,
      userRef: (r.user_id ?? "").slice(0, 8),
    };
  });
}

/* ── GET /ai-ops/activity (lightweight live feed) ─────────────────────── */
router.get("/ai-ops/activity", requireAuth, requireOwner, async (req, res) => {
  const sb = getServiceClient();
  if (!sb) return res.status(503).json({ code: "ADMIN_NOT_READY" });
  const limit = Math.min(Math.max(Number(req.query["limit"] ?? 60), 1), 200);
  const activity = await fetchActivity(sb, limit);
  return res.json({ generatedAt: new Date().toISOString(), activity });
});

export default router;
