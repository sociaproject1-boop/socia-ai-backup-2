/**
 * Admin Audit Log routes
 *
 * GET  /admin/audit-log          – paginated log from admin_audit_log table
 * GET  /admin/audit-log/live     – in-memory live events (last 200)
 * GET  /admin/audit-log/stats    – summary counts
 */
import { Router } from "express";
import { requireAdmin, getAdminClaims, getServiceClient } from "../lib/adminAuth.js";
import { getRecentEvents } from "../lib/adminSocket.js";
import { logger } from "../lib/logger.js";

const router = Router();

/* ── GET /admin/audit-log ─────────────────────────────────────────────── */
router.get(
  "/admin/audit-log",
  requireAdmin(),
  async (req, res): Promise<void> => {
    const sb = getServiceClient();

    /* Params */
    const limit  = Math.min(Number(req.query["limit"]  ?? 100), 500);
    const offset = Number(req.query["offset"] ?? 0);
    const action = typeof req.query["action"] === "string" ? req.query["action"] : undefined;
    const admin  = typeof req.query["admin"]  === "string" ? req.query["admin"]  : undefined;
    const since  = typeof req.query["since"]  === "string" ? req.query["since"]  : undefined;

    if (!sb) {
      /* Fallback to in-memory live events */
      const mem = getRecentEvents().slice(-limit);
      res.json({ entries: mem, total: mem.length, _fallback: true });
      return;
    }

    try {
      let q = sb
        .from("admin_audit_log")
        .select("*", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);

      if (action) q = q.eq("action", action);
      if (admin)  q = q.eq("username", admin);
      if (since)  q = q.gte("created_at", since);

      const { data, error, count } = await q;

      if (error) {
        if (
          (error as { code?: string }).code === "42P01" ||
          error.message?.includes("does not exist")
        ) {
          /* Table not yet created */
          const mem = getRecentEvents().slice(-limit);
          res.json({ entries: mem, total: mem.length, _schema_warning: true });
          return;
        }
        throw error;
      }

      res.json({ entries: data ?? [], total: count ?? 0 });
    } catch (err) {
      logger.error({ err }, "audit-log fetch failed");
      const mem = getRecentEvents().slice(-limit);
      res.json({ entries: mem, total: mem.length, _fallback: true });
    }
  },
);

/* ── GET /admin/audit-log/live ────────────────────────────────────────── */
router.get(
  "/admin/audit-log/live",
  requireAdmin(),
  (_req, res): void => {
    const claims = getAdminClaims(_req);
    void claims;
    res.json({ events: getRecentEvents() });
  },
);

/* ── GET /admin/audit-log/stats ───────────────────────────────────────── */
router.get(
  "/admin/audit-log/stats",
  requireAdmin(),
  async (_req, res): Promise<void> => {
    const sb = getServiceClient();

    if (!sb) {
      const events = getRecentEvents();
      res.json({
        total:       events.length,
        logins:      events.filter((e) => e.type === "admin_login").length,
        actions:     events.filter((e) => e.type === "admin_action").length,
        fraud_flags: events.filter((e) =>
          ["fraud_detected", "receipt_blocked", "tamper_detected"].includes(e.type),
        ).length,
        _fallback: true,
      });
      return;
    }

    try {
      const [total, logins, fraud] = await Promise.all([
        sb.from("admin_audit_log").select("*", { count: "exact", head: true }),
        sb.from("admin_audit_log").select("*", { count: "exact", head: true }).eq("action", "login"),
        sb.from("admin_audit_log").select("*", { count: "exact", head: true }).like("action", "fraud%"),
      ]);

      res.json({
        total:  total.count  ?? 0,
        logins: logins.count ?? 0,
        fraud:  fraud.count  ?? 0,
      });
    } catch (err) {
      logger.error({ err }, "audit-log stats failed");
      res.json({ total: 0, logins: 0, fraud: 0, _fallback: true });
    }
  },
);

export default router;
