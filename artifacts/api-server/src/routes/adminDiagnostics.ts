/**
 * Admin Diagnostics — live system health snapshot.
 *
 * GET /admin/diagnostics/system  — full health snapshot (DB, render, AI, presence, errors)
 * GET /admin/diagnostics/logs    — recent admin_audit_log entries
 *
 * Every value is queried from real sources. There is no simulation here.
 * Each subsystem is wrapped in try/catch so one failure can't take down the snapshot.
 */
import { Router } from "express";
import { requireAdmin, getServiceClient } from "../lib/adminAuth.js";
import { getAdminQueueStats } from "../lib/renderJobsDb.js";
import { logger } from "../lib/logger.js";

const router = Router();
const SERVER_STARTED_AT = Date.now();

router.get("/admin/diagnostics/system", requireAdmin(), async (_req, res) => {
  const startAll = Date.now();
  const sb = getServiceClient();

  /* ── Database ping ───────────────────────────────────────────────── */
  let database = { ok: false, latency_ms: 0, error: null as string | null };
  if (sb) {
    const t0 = Date.now();
    try {
      const { error } = await sb.from("users").select("id", { count: "exact", head: true });
      database = { ok: !error, latency_ms: Date.now() - t0, error: error?.message ?? null };
    } catch (e) {
      database = { ok: false, latency_ms: Date.now() - t0, error: (e as Error).message };
    }
  } else {
    database.error = "service client unavailable";
  }

  /* ── Render queue ───────────────────────────────────────────────── */
  let render = {
    ok: false,
    queued: 0, active: 0, completed: 0, failed: 0, cancelled: 0,
    avg_render_sec: 0,
    failure_rate_pct: 0,
  };
  try {
    const stats = await getAdminQueueStats();
    render = { ...render, ...stats, ok: true };
    if (sb) {
      const since = new Date(Date.now() - 24 * 3_600_000).toISOString();
      const { data } = await sb
        .from("render_jobs")
        .select("status,duration_sec,completed_at")
        .gte("completed_at", since)
        .limit(500);
      const rows = (data ?? []) as { status: string; duration_sec: number | null }[];
      const completed = rows.filter(r => r.status === "completed" && r.duration_sec);
      const failed = rows.filter(r => r.status === "failed");
      render.avg_render_sec = completed.length > 0
        ? Math.round(completed.reduce((s, r) => s + (r.duration_sec ?? 0), 0) / completed.length)
        : 0;
      const denom = completed.length + failed.length;
      render.failure_rate_pct = denom > 0 ? Math.round((failed.length / denom) * 1000) / 10 : 0;
    }
  } catch (e) {
    logger.error({ err: e }, "diagnostics render snapshot failed");
  }

  /* ── Realtime / presence ────────────────────────────────────────── */
  let realtime = { ok: false, online_now: 0, total_users: 0 };
  if (sb) {
    try {
      const cutoff = new Date(Date.now() - 90_000).toISOString();
      const [onlineRes, totalRes] = await Promise.all([
        sb.from("users").select("id", { count: "exact", head: true })
          .eq("is_online", true).gte("last_seen", cutoff),
        sb.from("users").select("id", { count: "exact", head: true }),
      ]);
      realtime = {
        ok: true,
        online_now: onlineRes.count ?? 0,
        total_users: totalRes.count ?? 0,
      };
    } catch (e) {
      logger.warn({ err: e }, "diagnostics presence query failed");
    }
  }

  /* ── AI activity ────────────────────────────────────────────────── */
  let ai = { ok: false, replies_1h: 0, replies_24h: 0 };
  if (sb) {
    try {
      const h1 = new Date(Date.now() - 3_600_000).toISOString();
      const d1 = new Date(Date.now() - 86_400_000).toISOString();
      const [c1h, c24h] = await Promise.all([
        sb.from("messages").select("id", { count: "exact", head: true })
          .eq("ai_generated", true).gte("created_at", h1),
        sb.from("messages").select("id", { count: "exact", head: true })
          .eq("ai_generated", true).gte("created_at", d1),
      ]);
      ai = { ok: true, replies_1h: c1h.count ?? 0, replies_24h: c24h.count ?? 0 };
    } catch {
      /* ai_generated column may not exist on older schemas — leave defaults */
    }
  }

  /* ── Recent audit activity (last 1h) ────────────────────────────── */
  let errors: {
    count_1h: number;
    recent: Array<{ ts: string; severity: string; message: string; username?: string }>;
  } = { count_1h: 0, recent: [] };
  if (sb) {
    try {
      const h1 = new Date(Date.now() - 3_600_000).toISOString();
      const { data, count } = await sb
        .from("admin_audit_log")
        .select("created_at,action,target_type,username,ip", { count: "exact" })
        .gte("created_at", h1)
        .order("created_at", { ascending: false })
        .limit(20);
      errors = {
        count_1h: count ?? 0,
        recent: ((data ?? []) as Array<{
          created_at: string; action: string; target_type: string | null;
          username: string | null; ip: string | null;
        }>).map(r => ({
          ts: r.created_at,
          severity: /error|fail|denied|reject/i.test(r.action) ? "error" : "info",
          message: `${r.action}${r.target_type ? ` ${r.target_type}` : ""}`,
          username: r.username ?? undefined,
        })),
      };
    } catch (e) {
      logger.warn({ err: e }, "diagnostics audit query failed");
    }
  }

  /* ── Auth / service-role health ─────────────────────────────────── */
  const serviceRoleKey =
    !!process.env["SUPABASE_SERVICE_ROLE_KEY"] ||
    !!process.env["SOCIA_SUPABASE_SERVICE_ROLE_KEY"];

  return res.json({
    ok: true,
    generated_at: new Date().toISOString(),
    duration_ms: Date.now() - startAll,
    services: {
      database,
      auth: { ok: serviceRoleKey, service_role_key: serviceRoleKey },
      render,
      realtime,
      ai,
    },
    process: {
      uptime_s: Math.round((Date.now() - SERVER_STARTED_AT) / 1000),
      memory_mb: Math.round(process.memoryUsage().rss / 1024 / 1024),
      node_version: process.version,
    },
    errors,
  });
});

router.get("/admin/diagnostics/logs", requireAdmin(), async (req, res) => {
  const sb = getServiceClient();
  if (!sb) return res.status(503).json({ code: "NO_SERVICE_CLIENT" });

  const limit = Math.min(200, Math.max(1, Number(req.query["limit"] ?? 50)));
  try {
    const { data, error } = await sb
      .from("admin_audit_log")
      .select("id,created_at,action,target_type,target_id,username,ip,user_agent,extra")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) return res.status(500).json({ code: "DB_ERROR", message: error.message });
    return res.json({ logs: data ?? [] });
  } catch (e) {
    return res.status(500).json({ code: "DB_ERROR", message: (e as Error).message });
  }
});

export default router;
