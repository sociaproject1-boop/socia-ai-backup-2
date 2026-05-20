/**
 * Anomaly history persistence.
 *
 * GET  /admin/anomaly/history  — recent anomaly events (paginated)
 * POST /admin/anomaly/record   — persist a behavioural anomaly cluster
 *
 * The AnomalyEngine frontend POSTs whenever a cluster crosses the
 * escalation threshold. Records are append-only.
 */
import { Router } from "express";
import { requireAdmin, getServiceClient } from "../lib/adminAuth.js";

const router = Router();

/* UUID v4 regex — lightweight server-side validation */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

router.get("/admin/anomaly/history", requireAdmin(), async (req, res) => {
  const sb = getServiceClient();
  if (!sb) return res.status(503).json({ code: "NO_SERVICE_CLIENT" });

  const limit = Math.min(100, Math.max(1, Number(req.query["limit"] ?? 30)));
  const onlyEscalated = req.query["escalated"] === "true";

  try {
    let q = sb.from("anomaly_events").select("*");
    if (onlyEscalated) q = q.eq("escalated", true);
    const { data, error } = await q
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) return res.status(500).json({ code: "DB_ERROR", message: error.message });
    return res.json({ events: data ?? [] });
  } catch (e) {
    return res.status(500).json({ code: "DB_ERROR", message: (e as Error).message });
  }
});

router.post("/admin/anomaly/record", requireAdmin(), async (req, res) => {
  const sb = getServiceClient();
  if (!sb) return res.status(503).json({ code: "NO_SERVICE_CLIENT" });

  const body = (req.body ?? {}) as {
    userId?: unknown; username?: unknown;
    eventCount?: unknown; criticalCount?: unknown; highCount?: unknown;
    avgScore?: unknown; maxScore?: unknown; riskScore?: unknown;
    escalated?: unknown;
    firstSeen?: unknown; lastSeen?: unknown;
  };

  /* Validation */
  if (typeof body.riskScore !== "number" || body.riskScore < 0 || body.riskScore > 100)
    return res.status(400).json({ code: "VALIDATION", message: "riskScore (0-100) required" });
  if (typeof body.eventCount !== "number" || body.eventCount < 1)
    return res.status(400).json({ code: "VALIDATION", message: "eventCount >= 1 required" });

  /* user_id is uuid in the schema; reject non-UUID strings */
  const userIdRaw = typeof body.userId === "string" ? body.userId : null;
  const userId = userIdRaw && UUID_RE.test(userIdRaw) ? userIdRaw : null;

  try {
    const { data, error } = await sb.from("anomaly_events").insert({
      user_id:        userId,
      username:       typeof body.username === "string" ? body.username : null,
      event_count:    Math.round(body.eventCount),
      critical_count: typeof body.criticalCount === "number" ? Math.round(body.criticalCount) : 0,
      high_count:     typeof body.highCount === "number" ? Math.round(body.highCount) : 0,
      avg_score:      typeof body.avgScore === "number" ? body.avgScore : 0,
      max_score:      typeof body.maxScore === "number" ? body.maxScore : 0,
      risk_score:     Math.round(body.riskScore),
      escalated:      body.escalated === true,
      first_seen:     typeof body.firstSeen === "string" ? body.firstSeen : new Date().toISOString(),
      last_seen:      typeof body.lastSeen === "string" ? body.lastSeen : new Date().toISOString(),
    }).select().single();
    if (error) return res.status(500).json({ code: "DB_ERROR", message: error.message });
    return res.json({ event: data });
  } catch (e) {
    return res.status(500).json({ code: "DB_ERROR", message: (e as Error).message });
  }
});

export default router;
