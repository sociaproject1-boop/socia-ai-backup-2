/**
 * routes/systemStatus.ts — HTTP surface for the System Status Monitor and
 * the AI Command Center. ISOLATED from existing routers.
 *
 * Endpoints:
 *   GET  /api/system-status            (public, signed-in) — banner/button feed
 *   GET  /api/system-status/full       (owner) — every provider + recent log
 *   GET  /api/system-status/ai         (owner) — AI Command Center detail
 *   POST /api/system-status/override   (owner) — force/clear maintenance
 *   POST /api/system-status/refresh    (owner) — trigger an immediate sweep
 *
 * FAILSAFE: the public endpoint can never 500 the client into a broken state —
 * on any internal error it returns a permissive ONLINE snapshot so checkout
 * stays available.
 */
import { Router, type IRouter, type RequestHandler } from "express";
import { requireAuth, getAuthedUser } from "../lib/supabaseAuth.js";
import { logger } from "../lib/logger.js";
import {
  OWNER_EMAIL,
  broadcast,
  buildPublicSnapshot,
  effectivePaymentStatus,
  getAllHealth,
  getGenerationMetrics,
  getLog,
  getOverride,
  setOverride,
  refreshNow,
  SERVICES,
} from "../monitoring/index.js";
import type { StatusLevel } from "../monitoring/index.js";

const router: IRouter = Router();

/** Owner-only gate. Runs AFTER requireAuth so authedUser is present. */
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

/* ── Public (signed-in) feed for banners + checkout gating ─────────────── */
router.get("/system-status", requireAuth, (_req, res) => {
  try {
    res.json(buildPublicSnapshot());
  } catch (err) {
    logger.warn({ err: (err as Error).message }, "[system-status] public snapshot failed");
    // Permissive fallback — never let a monitor bug block the storefront.
    res.json({
      payment: {
        status: "UNKNOWN" as StatusLevel,
        message: "Payment status unavailable — checkout remains available.",
        checkoutDisabled: false,
        provider: "PayMongo",
      },
      services: [],
      updatedAt: new Date().toISOString(),
    });
  }
});

/* ── Owner: full provider matrix + log ─────────────────────────────────── */
router.get("/system-status/full", requireAuth, requireOwner, (_req, res) => {
  const providers = getAllHealth();
  res.json({
    payment: effectivePaymentStatus(),
    override: getOverride(),
    providers,
    services: SERVICES.map((s) => ({
      id: s.id,
      label: s.label,
      providerIds: s.providerIds,
    })),
    log: getLog(50),
    updatedAt: new Date().toISOString(),
  });
});

/* ── Owner: AI Command Center detail ───────────────────────────────────── */
router.get("/system-status/ai", requireAuth, requireOwner, async (_req, res) => {
  const providers = getAllHealth().filter((p) => p.category === "ai");
  let metrics;
  try {
    metrics = await getGenerationMetrics();
  } catch (err) {
    logger.warn({ err: (err as Error).message }, "[system-status] metrics failed");
    metrics = null;
  }
  res.json({
    providers,
    services: SERVICES.filter((s) => s.id !== "billing"),
    serviceHealth: getAllHealth(),
    metrics,
    updatedAt: new Date().toISOString(),
  });
});

/* ── Owner: enable/disable manual override ─────────────────────────────── */
router.post("/system-status/override", requireAuth, requireOwner, (req, res) => {
  const user = getAuthedUser(req);
  const body = (req.body ?? {}) as {
    action?: string;
    level?: string;
    message?: string;
  };
  const action = String(body.action ?? "").toLowerCase();

  if (action === "disable") {
    setOverride({ active: false, level: "MAINTENANCE", message: "", setBy: user.email, setAt: new Date().toISOString() });
    // Push the cleared state to all clients immediately so banners/buttons
    // recover in realtime instead of waiting for the next scheduled sweep.
    broadcast();
    return res.json({ ok: true, override: getOverride(), payment: effectivePaymentStatus() });
  }

  if (action === "enable") {
    const level = body.level === "OUTAGE" ? "OUTAGE" : "MAINTENANCE";
    setOverride({
      active: true,
      level,
      message: (body.message ?? "").toString().slice(0, 300),
      setBy: user.email,
      setAt: new Date().toISOString(),
    });
    // Push the new state to all clients immediately (the override is reflected
    // by effectivePaymentStatus without re-probing, so broadcast is instant).
    broadcast();
    return res.json({ ok: true, override: getOverride(), payment: effectivePaymentStatus() });
  }

  return res.status(400).json({ error: "action must be 'enable' or 'disable'", code: "BAD_REQUEST" });
});

/* ── Owner: trigger an immediate re-check ──────────────────────────────── */
router.post("/system-status/refresh", requireAuth, requireOwner, async (_req, res) => {
  await refreshNow();
  res.json({ ok: true, providers: getAllHealth(), updatedAt: new Date().toISOString() });
});

export default router;
