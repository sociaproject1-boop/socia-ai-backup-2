/**
 * Auto-escalation workflow engine.
 *
 * Maintains an in-memory escalation queue (no DB migration needed).
 * Rules run whenever broadcastFraudEvent fires, or on manual scan.
 *
 * GET  /admin/escalations              — pending queue
 * POST /admin/escalations/scan         — trigger rule scan against DB
 * POST /admin/escalations/:id/approve  — execute the recommended action
 * POST /admin/escalations/:id/dismiss  — dismiss without action
 * GET  /admin/escalations/stats        — queue summary
 */
import { Router } from "express";
import { getServiceClient, requireAdmin, type AdminClaims } from "../lib/adminAuth.js";
import { broadcastAuditEvent } from "../lib/adminSocket.js";
import { logger } from "../lib/logger.js";
import crypto from "crypto";

const router = Router();

/* ── Escalation types ─────────────────────────────────────────────────── */
type EscalationType =
  | "auto_freeze"
  | "auto_quarantine"
  | "auto_suspend"
  | "risk_escalation"
  | "velocity_alert"
  | "coordinated_attack";

type EscalationStatus = "pending" | "approved" | "dismissed";

interface Escalation {
  id:          string;
  type:        EscalationType;
  status:      EscalationStatus;
  userId?:     string;
  username?:   string;
  reason:      string;
  score:       number;
  evidence:    Record<string, unknown>;
  createdAt:   string;
  decidedAt?:  string;
  decidedBy?:  string;
}

/* ── In-memory queue (max 500 entries) ───────────────────────────────── */
const MAX_QUEUE = 500;
const queue: Escalation[] = [];
const seenUsers = new Set<string>(); // prevent duplicate escalations per user

function addEscalation(esc: Omit<Escalation, "id" | "createdAt" | "status">): void {
  const id = crypto.randomUUID();
  queue.unshift({ ...esc, id, createdAt: new Date().toISOString(), status: "pending" });
  if (queue.length > MAX_QUEUE) queue.pop();
}

/* ── Escalation rules ─────────────────────────────────────────────────── */
function evaluateRules(event: {
  userId?: string; username?: string; score?: number; type?: string;
  details?: Record<string, unknown>;
}): void {
  if (!event.userId) return;
  const score = event.score ?? 0;

  /* Rule 1: Extreme fraud score → auto-freeze */
  if (score >= 95 && !seenUsers.has(`freeze:${event.userId}`)) {
    seenUsers.add(`freeze:${event.userId}`);
    addEscalation({
      type:     "auto_freeze",
      userId:   event.userId,
      username: event.username,
      reason:   `Fraud score ${score} ≥ 95 — automatic account freeze recommended`,
      score,
      evidence: { score, trigger: event.type, threshold: 95 },
    });
  }

  /* Rule 2: High score → auto-quarantine (review hold) */
  if (score >= 85 && score < 95 && !seenUsers.has(`quarantine:${event.userId}`)) {
    seenUsers.add(`quarantine:${event.userId}`);
    addEscalation({
      type:     "auto_quarantine",
      userId:   event.userId,
      username: event.username,
      reason:   `Fraud score ${score} ≥ 85 — account quarantine for manual review`,
      score,
      evidence: { score, trigger: event.type, threshold: 85 },
    });
  }
}

/* Export for use by broadcastFraudEvent integration */
export { evaluateRules };

/* ── GET /admin/escalations ──────────────────────────────────────────── */
router.get("/admin/escalations", requireAdmin(), (req, res) => {
  const status = (req.query.status as string) ?? "pending";
  const page   = Math.max(1, Number(req.query.page ?? 1));
  const limit  = Math.min(50, Math.max(1, Number(req.query.limit ?? 20)));

  const filtered = queue.filter((e) => status === "all" ? true : e.status === status);
  const paginated = filtered.slice((page - 1) * limit, page * limit);

  return res.json({
    escalations: paginated,
    total:       filtered.length,
    pending:     queue.filter((e) => e.status === "pending").length,
    approved:    queue.filter((e) => e.status === "approved").length,
    dismissed:   queue.filter((e) => e.status === "dismissed").length,
  });
});

/* ── GET /admin/escalations/stats ────────────────────────────────────── */
router.get("/admin/escalations/stats", requireAdmin(), (req, res) => {
  const byType: Record<string, number> = {};
  for (const e of queue.filter((e) => e.status === "pending")) {
    byType[e.type] = (byType[e.type] ?? 0) + 1;
  }
  return res.json({
    total:   queue.length,
    pending: queue.filter((e) => e.status === "pending").length,
    by_type: byType,
    queue_full: queue.length >= MAX_QUEUE * 0.9,
  });
});

/* ── POST /admin/escalations/scan ────────────────────────────────────── */
router.post("/admin/escalations/scan", requireAdmin(), async (req, res) => {
  const sb = getServiceClient();
  if (!sb) return res.status(503).json({ code: "NO_SERVICE_CLIENT" });

  try {
    /* Find users with extreme fraud scores in last 7 days */
    const { data: extremeRows } = await sb
      .from("payment_receipts")
      .select("user_id, fraud_score, verification_status, created_at")
      .gte("fraud_score", 85)
      .gte("created_at", new Date(Date.now() - 7 * 86_400_000).toISOString())
      .order("fraud_score", { ascending: false })
      .limit(200);

    let added = 0;
    for (const r of extremeRows ?? []) {
      evaluateRules({
        userId: r.user_id as string,
        score:  r.fraud_score as number,
        type:   "receipt_scan",
      });
      added++;
    }

    /* Find velocity attackers */
    const { data: velRows } = await sb
      .from("payment_receipts")
      .select("user_id, fraud_score, created_at")
      .gte("created_at", new Date(Date.now() - 24 * 3_600_000).toISOString())
      .order("created_at", { ascending: false })
      .limit(3000);

    const userCounts = new Map<string, { count: number; maxScore: number }>();
    for (const r of velRows ?? []) {
      const uid = r.user_id as string;
      if (!userCounts.has(uid)) userCounts.set(uid, { count: 0, maxScore: 0 });
      const e = userCounts.get(uid)!;
      e.count++;
      if ((r.fraud_score as number) > e.maxScore) e.maxScore = r.fraud_score as number;
    }

    for (const [uid, stats] of userCounts) {
      if (stats.count >= 5 && !seenUsers.has(`velocity:${uid}`)) {
        seenUsers.add(`velocity:${uid}`);
        addEscalation({
          type:   "velocity_alert",
          userId: uid,
          reason: `${stats.count} submissions in 24 h — velocity attack pattern`,
          score:  stats.maxScore,
          evidence: { submissions_24h: stats.count, max_score: stats.maxScore },
        });
        added++;
      }
    }

    const claims = (req as typeof req & { adminClaims: AdminClaims }).adminClaims;
    broadcastAuditEvent({
      type:          "admin_action",
      severity:      "info",
      message:       `Escalation scan completed — ${queue.filter((e) => e.status === "pending").length} items pending`,
      adminUsername: claims.username,
    });

    return res.json({ scanned: added, pending: queue.filter((e) => e.status === "pending").length });
  } catch (err) {
    logger.error({ err }, "escalation scan failed");
    return res.status(500).json({ code: "DB_ERROR", message: (err as Error).message });
  }
});

/* ── POST /admin/escalations/:id/approve ─────────────────────────────── */
router.post("/admin/escalations/:id/approve", requireAdmin(), async (req, res) => {
  const sb = getServiceClient();
  if (!sb) return res.status(503).json({ code: "NO_SERVICE_CLIENT" });

  const esc = queue.find((e) => e.id === req.params.id);
  if (!esc) return res.status(404).json({ code: "NOT_FOUND" });
  if (esc.status !== "pending") return res.status(400).json({ code: "ALREADY_DECIDED" });

  const claims = (req as typeof req & { adminClaims: AdminClaims }).adminClaims;

  try {
    /* Execute the recommended action on the user */
    if (esc.userId && (esc.type === "auto_freeze" || esc.type === "auto_quarantine")) {
      const freeze = esc.type === "auto_freeze";
      await sb.from("users").update({
        is_frozen:    freeze,
        freeze_until: freeze ? new Date(Date.now() + 30 * 86_400_000).toISOString() : null,
        freeze_reason: esc.reason,
      }).eq("id", esc.userId);
    }

    esc.status    = "approved";
    esc.decidedAt = new Date().toISOString();
    esc.decidedBy = claims.username;

    broadcastAuditEvent({
      type:          "admin_action",
      severity:      "high",
      message:       `Escalation approved: ${esc.type} for ${esc.username ?? esc.userId}`,
      adminUsername: claims.username,
      userId:        esc.userId,
      username:      esc.username,
    });

    return res.json({ ok: true, escalation: esc });
  } catch (err) {
    logger.error({ err }, "escalation approve failed");
    return res.status(500).json({ code: "EXECUTE_ERROR", message: (err as Error).message });
  }
});

/* ── POST /admin/escalations/:id/dismiss ─────────────────────────────── */
router.post("/admin/escalations/:id/dismiss", requireAdmin(), (req, res) => {
  const esc = queue.find((e) => e.id === req.params.id);
  if (!esc) return res.status(404).json({ code: "NOT_FOUND" });
  if (esc.status !== "pending") return res.status(400).json({ code: "ALREADY_DECIDED" });

  const claims = (req as typeof req & { adminClaims: AdminClaims }).adminClaims;
  esc.status    = "dismissed";
  esc.decidedAt = new Date().toISOString();
  esc.decidedBy = claims.username;

  broadcastAuditEvent({
    type:          "admin_action",
    severity:      "info",
    message:       `Escalation dismissed: ${esc.type} for ${esc.username ?? esc.userId}`,
    adminUsername: claims.username,
  });

  return res.json({ ok: true, escalation: esc });
});

export default router;
