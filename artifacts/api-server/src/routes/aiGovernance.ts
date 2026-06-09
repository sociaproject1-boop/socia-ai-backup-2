/**
 * routes/aiGovernance.ts — owner-only AI governance & routing CONFIG API.
 *
 * This is the control plane for the AI Routing Platform. The owner reads the
 * current effective config + the editable topology here, and saves changes that
 * the live generation pipeline (sociaGpt / generateImage / generateVideo /
 * generateMultiframeVideo) consults on the very next request via aiGovernance.ts.
 *
 * AUTH: requireAuth + owner-email gate (same gate as /ai-ops and /system-status).
 * All persistence uses the service-role client. Saves are validated first and
 * rejected if they would break generation.
 *
 *   GET  /api/ai-governance/config       — effective + stored config + topology
 *   PUT  /api/ai-governance/config       — validate-then-save full config
 *   POST /api/ai-governance/kill-switch  — emergency on/off (merges into config)
 *   GET  /api/ai-governance/events       — enforcement / audit log
 */
import { Router, type IRouter, type RequestHandler } from "express";
import { requireAuth, getAuthedUser } from "../lib/replitAuth.js";
import { OWNER_EMAIL } from "../monitoring/index.js";
import { logger } from "../lib/logger.js";
import {
  PROVIDERS,
  FEATURES,
  isProviderConfigured,
  providerEnvLabels,
} from "../lib/aiTopology.js";
import { ENGINE_REGISTRY, buildAvailability } from "../lib/engineRegistry.js";
import {
  getConfig,
  getStoredConfig,
  validateConfig,
  saveConfig,
  GovernanceConflictError,
  listEvents,
  recordEvent,
  defaultConfig,
  type GovernanceConfig,
} from "../lib/aiGovernance.js";

const router: IRouter = Router();

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

/** The editable truth the UI needs to render provider/model/feature pickers. */
function buildTopology() {
  const falPresent = Boolean((process.env["FAL_KEY"] ?? "").trim());
  return {
    providers: PROVIDERS.map((p) => ({
      id: p.id,
      label: p.label,
      role: p.role,
      models: p.models,
      configured: isProviderConfigured(p),
      envVars: providerEnvLabels(p),
      tokenMetered: p.tokenMetered,
      dashboard: p.dashboard ?? null,
    })),
    features: FEATURES.map((f) => ({
      tool: f.tool,
      label: f.label,
      description: f.description,
      endpoint: f.endpoint,
      aliases: f.aliases,
      defaultProviders: f.providers,
      failover: f.failover,
    })),
    engines: buildAvailability(falPresent).map((e) => ({
      id: e.id,
      name: e.name,
      provider: e.provider,
      available: e.available,
      reason: e.reason ?? null,
    })),
    allEngines: ENGINE_REGISTRY.map((e) => ({ id: e.id, name: e.name, provider: e.provider })),
  };
}

/* ── GET /ai-governance/config ──────────────────────────────────────────── */
router.get("/ai-governance/config", requireAuth, requireOwner, async (_req, res) => {
  try {
    const [config, stored] = await Promise.all([getConfig(), getStoredConfig()]);
    return res.json({
      generatedAt: new Date().toISOString(),
      configured: stored !== null,
      config,
      topology: buildTopology(),
    });
  } catch (err) {
    logger.warn({ err: (err as Error).message }, "[governance] GET config failed");
    return res.status(500).json({ code: "CONFIG_ERROR", message: "Could not load governance config." });
  }
});

/* ── PUT /ai-governance/config ──────────────────────────────────────────── */
router.put("/ai-governance/config", requireAuth, requireOwner, async (req, res) => {
  const body = req.body as Partial<GovernanceConfig> | undefined;
  if (!body || typeof body !== "object") {
    return res.status(400).json({ code: "BAD_REQUEST", message: "Config body required." });
  }
  const validation = validateConfig(body);
  if (!validation.ok) {
    return res.status(422).json({ code: "INVALID_CONFIG", errors: validation.errors });
  }
  try {
    const owner = getAuthedUser(req).email ?? "owner";
    const { version } = await saveConfig(body, owner);
    const config = await getConfig();
    return res.json({ ok: true, version, config });
  } catch (err) {
    if (err instanceof GovernanceConflictError) {
      return res.status(409).json({ code: err.code, message: err.message });
    }
    logger.warn({ err: (err as Error).message }, "[governance] PUT config failed");
    return res.status(500).json({ code: "SAVE_ERROR", message: "Could not save governance config." });
  }
});

/* ── POST /ai-governance/kill-switch ────────────────────────────────────── */
router.post("/ai-governance/kill-switch", requireAuth, requireOwner, async (req, res) => {
  const on = (req.body as { on?: unknown } | undefined)?.on;
  if (typeof on !== "boolean") {
    return res.status(400).json({ code: "BAD_REQUEST", message: "Body { on: boolean } required." });
  }
  try {
    const stored = (await getStoredConfig()) ?? {};
    const merged = { ...(stored as Partial<GovernanceConfig>), killSwitch: on };
    const owner = getAuthedUser(req).email ?? "owner";
    const { version } = await saveConfig(merged, owner);
    await recordEvent({
      eventType: "kill_switch",
      reason: on ? "Emergency kill switch ENGAGED — all AI generation halted." : "Kill switch released — AI generation resumed.",
      scope: "global",
      actor: owner,
      meta: { on, version },
    });
    const config = await getConfig();
    return res.json({ ok: true, killSwitch: config.killSwitch, version });
  } catch (err) {
    if (err instanceof GovernanceConflictError) {
      return res.status(409).json({ code: err.code, message: err.message });
    }
    logger.warn({ err: (err as Error).message }, "[governance] kill-switch failed");
    return res.status(500).json({ code: "SAVE_ERROR", message: "Could not toggle kill switch." });
  }
});

/* ── GET /ai-governance/events ──────────────────────────────────────────── */
router.get("/ai-governance/events", requireAuth, requireOwner, async (req, res) => {
  const limit = Math.min(Math.max(Number(req.query["limit"] ?? 100), 1), 500);
  try {
    const events = await listEvents(limit);
    return res.json({ generatedAt: new Date().toISOString(), events });
  } catch (err) {
    logger.warn({ err: (err as Error).message }, "[governance] events failed");
    return res.status(500).json({ code: "EVENTS_ERROR", message: "Could not load events." });
  }
});

/* ── GET /ai-governance/defaults (reference for the UI "reset") ──────────── */
router.get("/ai-governance/defaults", requireAuth, requireOwner, (_req, res) => {
  return res.json({ config: defaultConfig() });
});

export default router;
