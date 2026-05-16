/**
 * Admin usage analytics routes.
 *
 * All routes require a valid admin JWT (requireAdmin middleware).
 * Uses service-role Supabase client (RLS bypassed).
 *
 * These routes return FULL data including estimated_cost and cost breakdowns.
 * NEVER expose these routes or their responses to regular users.
 *
 * Routes:
 *   GET /admin/usage                      — paginated usage log (all users)
 *   GET /admin/usage/stats                — aggregate stats + heavy-user list
 *   GET /admin/usage/user/:userId         — per-user usage with cost breakdown
 *   GET /admin/usage/refund-calc/:userId  — usage-based partial refund calculation
 *   GET /admin/usage/heavy-users          — list of heavy-use flagged users
 */

import { Router, type IRouter } from "express";
import { getServiceClient, requireAdmin } from "../lib/adminAuth.js";
import { computeUsageSummary, HEAVY_THRESHOLDS } from "../lib/usageTracker.js";
import { computePartialRefund } from "../lib/partialRefundEngine.js";

const router: IRouter = Router();

/* ── GET /admin/usage ─────────────────────────────────────────────────── */
router.get("/admin/usage", requireAdmin(), async (req, res) => {
  const sb     = getServiceClient()!;
  const limit  = Math.min(Number(req.query["limit"] ?? 100), 1000);
  const offset = Math.max(Number(req.query["offset"] ?? 0), 0);
  const tool   = req.query["tool"] as string | undefined;
  const userId = req.query["user_id"] as string | undefined;
  const status = req.query["status"] as string | undefined;

  let q = sb
    .from("usage_receipts")
    .select(`
      id, user_id, payment_order_id, tool_used, model_used, generation_type,
      request_id, estimated_cost, duration_ms, queue_time_ms, token_usage,
      status, metadata, created_at
    `)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (tool)   q = q.eq("tool_used", tool);
  if (userId) q = q.eq("user_id", userId);
  if (status) q = q.eq("status", status);

  const { data: rows, error } = await q;
  if (error) return res.status(500).json({ code: "DB_ERROR", message: error.message });

  // Batch-enrich with user info
  const userIds = [...new Set((rows ?? []).map((r: { user_id: string }) => r.user_id))];
  const userMap = new Map<string, { username: string; name: string; email: string }>();
  if (userIds.length > 0) {
    const { data: users } = await sb.from("users").select("id, username, name, email").in("id", userIds);
    for (const u of (users ?? []) as Array<{ id: string; username: string; name: string; email: string }>) {
      userMap.set(u.id, { username: u.username, name: u.name, email: u.email });
    }
  }

  const events = (rows ?? []).map((r: { user_id: string }) => ({ ...r, user: userMap.get(r.user_id) ?? null }));
  return res.json({ events, limit, offset });
});

/* ── GET /admin/usage/stats ───────────────────────────────────────────── */
router.get("/admin/usage/stats", requireAdmin(), async (req, res) => {
  const sb = getServiceClient()!;

  // Pull last 30 days
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();

  const { data: rows, error } = await sb
    .from("usage_receipts")
    .select("user_id, tool_used, estimated_cost, status, created_at")
    .gte("created_at", since);

  if (error) return res.status(500).json({ code: "DB_ERROR", message: error.message });

  const events = (rows ?? []) as Array<{
    user_id: string; tool_used: string; estimated_cost: number; status: string;
  }>;

  const successful = events.filter((e) => e.status === "success");
  const totalCost  = successful.reduce((s, e) => s + Number(e.estimated_cost), 0);

  // Per-tool breakdown
  const toolBreakdown: Record<string, { count: number; total_cost: number }> = {};
  for (const e of successful) {
    const t = toolBreakdown[e.tool_used] ?? { count: 0, total_cost: 0 };
    t.count++;
    t.total_cost += Number(e.estimated_cost);
    toolBreakdown[e.tool_used] = t;
  }

  // Per-user cost totals (for heavy-user detection)
  const userCosts = new Map<string, { count: number; cost: number }>();
  for (const e of successful) {
    const u = userCosts.get(e.user_id) ?? { count: 0, cost: 0 };
    u.count++;
    u.cost += Number(e.estimated_cost);
    userCosts.set(e.user_id, u);
  }

  // Heavy users: cost > ₱500 or count > HEAVY_THRESHOLDS.image_count + video_count
  const heavyUserIds = [...userCosts.entries()]
    .filter(([, v]) => v.cost > 500 || v.count > (HEAVY_THRESHOLDS.image_count + HEAVY_THRESHOLDS.video_count))
    .sort((a, b) => b[1].cost - a[1].cost)
    .slice(0, 20)
    .map(([id, v]) => ({ user_id: id, event_count: v.count, total_cost_php: Math.round(v.cost * 100) / 100 }));

  return res.json({
    period_days:          30,
    total_events:         events.length,
    successful_events:    successful.length,
    failed_events:        events.filter((e) => e.status === "failed").length,
    total_estimated_cost: Math.round(totalCost * 100) / 100,
    tool_breakdown:       toolBreakdown,
    top_cost_users:       heavyUserIds,
  });
});

/* ── GET /admin/usage/user/:userId ────────────────────────────────────── */
router.get("/admin/usage/user/:userId", requireAdmin(), async (req, res) => {
  const sb     = getServiceClient()!;
  const userId = String(req.params["userId"]);
  const days   = Math.min(Number(req.query["days"] ?? 30), 365);

  const periodEnd   = new Date();
  const periodStart = new Date(Date.now() - days * 86_400_000);

  // User info
  const { data: userRow } = await sb
    .from("users")
    .select("id, username, name, email, created_at")
    .eq("id", userId)
    .maybeSingle();

  if (!userRow) return res.status(404).json({ code: "USER_NOT_FOUND" });

  // Full usage summary (includes costs)
  const summary = await computeUsageSummary(sb, userId, periodStart, periodEnd);

  // Recent events
  const { data: recentEvents } = await sb
    .from("usage_receipts")
    .select(`
      id, tool_used, model_used, generation_type, estimated_cost,
      duration_ms, status, metadata, created_at
    `)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(100);

  return res.json({
    user:          userRow,
    period_days:   days,
    summary,
    recent_events: recentEvents ?? [],
  });
});

/* ── GET /admin/usage/refund-calc/:userId ─────────────────────────────── */
router.get("/admin/usage/refund-calc/:userId", requireAdmin(), async (req, res) => {
  const sb      = getServiceClient()!;
  const userId  = String(req.params["userId"]);
  const orderId = req.query["order_id"] as string | undefined;

  try {
    const result = await computePartialRefund(sb, userId, orderId ?? null);
    return res.json({ refund_analysis: result });
  } catch (err) {
    req.log.error({ err, userId }, "refund-calc failed");
    return res.status(500).json({ code: "CALC_ERROR", message: "Could not compute refund analysis." });
  }
});

/* ── GET /admin/usage/heavy-users ─────────────────────────────────────── */
router.get("/admin/usage/heavy-users", requireAdmin(), async (req, res) => {
  const sb   = getServiceClient()!;
  const days = Math.min(Number(req.query["days"] ?? 30), 90);

  const since = new Date(Date.now() - days * 86_400_000).toISOString();

  const { data: rows, error } = await sb
    .from("usage_receipts")
    .select("user_id, tool_used, estimated_cost, status")
    .gte("created_at", since)
    .eq("status", "success");

  if (error) return res.status(500).json({ code: "DB_ERROR", message: error.message });

  const events = (rows ?? []) as Array<{ user_id: string; tool_used: string; estimated_cost: number }>;

  // Aggregate per user
  const userAgg = new Map<string, {
    image_count: number; video_count: number; chat_count: number; total_cost: number;
  }>();

  for (const e of events) {
    const u = userAgg.get(e.user_id) ?? { image_count: 0, video_count: 0, chat_count: 0, total_cost: 0 };
    if (e.tool_used === "image_generation" || e.tool_used === "preset_studio") u.image_count++;
    else if (e.tool_used === "video_generation" || e.tool_used === "multiframe_video") u.video_count++;
    else if (e.tool_used === "ai_chat") u.chat_count++;
    u.total_cost += Number(e.estimated_cost);
    userAgg.set(e.user_id, u);
  }

  // Filter heavy users
  const heavyUserIds = [...userAgg.entries()]
    .filter(([, u]) =>
      u.image_count >= HEAVY_THRESHOLDS.image_count ||
      u.video_count >= HEAVY_THRESHOLDS.video_count ||
      u.chat_count  >= HEAVY_THRESHOLDS.chat_count  ||
      u.total_cost  > 500
    )
    .map(([id, u]) => ({ user_id: id, ...u, total_cost_php: Math.round(u.total_cost * 100) / 100 }))
    .sort((a, b) => b.total_cost_php - a.total_cost_php);

  if (heavyUserIds.length === 0) return res.json({ heavy_users: [], period_days: days });

  // Enrich with user info
  const ids = heavyUserIds.map((u) => u.user_id);
  const { data: users } = await sb.from("users").select("id, username, name, email").in("id", ids);
  const userMap = new Map((users ?? []).map((u: { id: string; username: string; name: string; email: string }) => [u.id, u]));

  const enriched = heavyUserIds.map((u) => ({
    ...u,
    user: userMap.get(u.user_id) ?? null,
  }));

  return res.json({ heavy_users: enriched, period_days: days });
});

export default router;
