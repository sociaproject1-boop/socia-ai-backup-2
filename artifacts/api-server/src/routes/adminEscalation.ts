/**
 * Auto-escalation workflow engine — DB-backed (Wave 2).
 *
 * Replaces the in-memory queue with the `admin_escalations` table.
 * Deduplication is handled by a unique partial index on (type, user_id)
 * WHERE status = 'pending'.
 *
 * GET  /admin/escalations              — pending queue (paginated)
 * GET  /admin/escalations/stats        — queue summary
 * POST /admin/escalations/scan         — trigger rule scan against DB
 * POST /admin/escalations/:id/approve  — execute the recommended action
 * POST /admin/escalations/:id/dismiss  — dismiss without action
 *
 * `evaluateRules` is also exported so other modules (e.g. broadcastFraudEvent)
 * can opportunistically run the rule set against new events.
 */
import { Router } from "express";
import { getServiceClient, requireAdmin, type AdminClaims } from "../lib/adminAuth.js";
import { broadcastAuditEvent } from "../lib/adminSocket.js";
import { logger } from "../lib/logger.js";

const router = Router();

type EscalationType =
  | "auto_freeze" | "auto_quarantine" | "auto_suspend"
  | "risk_escalation" | "velocity_alert" | "coordinated_attack";
type EscalationStatus = "pending" | "approved" | "dismissed";

interface EscalationRow {
  id:          string;
  type:        EscalationType;
  status:      EscalationStatus;
  user_id:     string | null;
  username:    string | null;
  reason:      string;
  score:       number;
  evidence:    Record<string, unknown>;
  created_at:  string;
  decided_at:  string | null;
  decided_by:  string | null;
}

/* Frontend shape — match the camelCase contract used by EscalationQueue.tsx */
function toResponse(r: EscalationRow) {
  return {
    id:        r.id,
    type:      r.type,
    status:    r.status,
    userId:    r.user_id ?? undefined,
    username:  r.username ?? undefined,
    reason:    r.reason,
    score:     Number(r.score),
    evidence:  r.evidence,
    createdAt: r.created_at,
    decidedAt: r.decided_at ?? undefined,
    decidedBy: r.decided_by ?? undefined,
  };
}

/* Insert with dedup. Returns true if a new row was created, false if
   a duplicate already existed (unique constraint hit). */
async function insertEscalation(args: {
  type:      EscalationType;
  userId?:   string;
  username?: string;
  reason:    string;
  score:     number;
  evidence:  Record<string, unknown>;
}): Promise<boolean> {
  const sb = getServiceClient();
  if (!sb) return false;
  const { error } = await sb.from("admin_escalations").insert({
    type:     args.type,
    user_id:  args.userId ?? null,
    username: args.username ?? null,
    reason:   args.reason,
    score:    args.score,
    evidence: args.evidence,
  });
  if (!error) return true;
  /* 23505 = unique_violation — silent success (already pending) */
  if (error.code === "23505") return false;
  logger.warn({ err: error }, "[escalation] insert failed");
  return false;
}

/**
 * Evaluate auto-escalation rules against a fraud event. Idempotent —
 * the partial unique index ensures the same user can't be re-escalated
 * while still pending.
 */
export async function evaluateRules(event: {
  userId?: string; username?: string; score?: number; type?: string;
  details?: Record<string, unknown>;
}): Promise<void> {
  if (!event.userId) return;
  const score = event.score ?? 0;

  /* Rule 1: Extreme score → auto-freeze */
  if (score >= 95) {
    await insertEscalation({
      type:     "auto_freeze",
      userId:   event.userId,
      username: event.username,
      reason:   `Fraud score ${score} ≥ 95 — automatic account freeze recommended`,
      score,
      evidence: { score, trigger: event.type ?? "unknown", threshold: 95 },
    });
  }

  /* Rule 2: High score → auto-quarantine */
  if (score >= 85 && score < 95) {
    await insertEscalation({
      type:     "auto_quarantine",
      userId:   event.userId,
      username: event.username,
      reason:   `Fraud score ${score} ≥ 85 — account quarantine for manual review`,
      score,
      evidence: { score, trigger: event.type ?? "unknown", threshold: 85 },
    });
  }
}

/* ── GET /admin/escalations ──────────────────────────────────────────── */
router.get("/admin/escalations", requireAdmin(), async (req, res) => {
  const sb = getServiceClient();
  if (!sb) return res.status(503).json({ code: "NO_SERVICE_CLIENT" });

  const status = (req.query["status"] as string) ?? "pending";
  const page   = Math.max(1, Number(req.query["page"]  ?? 1));
  const limit  = Math.min(50, Math.max(1, Number(req.query["limit"] ?? 20)));

  try {
    let q = sb.from("admin_escalations").select("*", { count: "exact" });
    if (status !== "all") q = q.eq("status", status);
    const { data, error, count } = await q
      .order("created_at", { ascending: false })
      .range((page - 1) * limit, page * limit - 1);
    if (error) return res.status(500).json({ code: "DB_ERROR", message: error.message });

    const [pendingRes, approvedRes, dismissedRes] = await Promise.all([
      sb.from("admin_escalations").select("id", { count: "exact", head: true }).eq("status", "pending"),
      sb.from("admin_escalations").select("id", { count: "exact", head: true }).eq("status", "approved"),
      sb.from("admin_escalations").select("id", { count: "exact", head: true }).eq("status", "dismissed"),
    ]);

    return res.json({
      escalations: ((data ?? []) as EscalationRow[]).map(toResponse),
      total:       count ?? 0,
      pending:     pendingRes.count ?? 0,
      approved:    approvedRes.count ?? 0,
      dismissed:   dismissedRes.count ?? 0,
    });
  } catch (e) {
    logger.error({ err: e }, "[escalation] list failed");
    return res.status(500).json({ code: "DB_ERROR", message: (e as Error).message });
  }
});

/* ── GET /admin/escalations/stats ────────────────────────────────────── */
router.get("/admin/escalations/stats", requireAdmin(), async (_req, res) => {
  const sb = getServiceClient();
  if (!sb) return res.status(503).json({ code: "NO_SERVICE_CLIENT" });

  try {
    const { data: pendRows } = await sb
      .from("admin_escalations")
      .select("type")
      .eq("status", "pending")
      .limit(1000);

    const byType: Record<string, number> = {};
    for (const r of (pendRows ?? []) as { type: string }[]) {
      byType[r.type] = (byType[r.type] ?? 0) + 1;
    }

    const [{ count: totalCount }, { count: pendingCount }] = await Promise.all([
      sb.from("admin_escalations").select("id", { count: "exact", head: true }),
      sb.from("admin_escalations").select("id", { count: "exact", head: true }).eq("status", "pending"),
    ]);

    return res.json({
      total:      totalCount   ?? 0,
      pending:    pendingCount ?? 0,
      by_type:    byType,
      queue_full: (pendingCount ?? 0) >= 450,
    });
  } catch (e) {
    return res.status(500).json({ code: "DB_ERROR", message: (e as Error).message });
  }
});

/* ── POST /admin/escalations/scan ────────────────────────────────────── */
router.post("/admin/escalations/scan", requireAdmin(), async (req, res) => {
  const sb = getServiceClient();
  if (!sb) return res.status(503).json({ code: "NO_SERVICE_CLIENT" });
  const claims = (req as typeof req & { adminClaims: AdminClaims }).adminClaims;

  try {
    /* Extreme fraud scores in last 7 days */
    const { data: extremeRows } = await sb
      .from("payment_receipts")
      .select("user_id, fraud_score, created_at")
      .gte("fraud_score", 85)
      .gte("created_at", new Date(Date.now() - 7 * 86_400_000).toISOString())
      .order("fraud_score", { ascending: false })
      .limit(200);

    let added = 0;
    for (const r of extremeRows ?? []) {
      await evaluateRules({
        userId: r.user_id as string,
        score:  r.fraud_score as number,
        type:   "receipt_scan",
      });
      added++;
    }

    /* Velocity attackers — 5+ submissions in 24h */
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
      const entry = userCounts.get(uid)!;
      entry.count++;
      if ((r.fraud_score as number) > entry.maxScore) entry.maxScore = r.fraud_score as number;
    }
    for (const [uid, stats] of userCounts) {
      if (stats.count >= 5) {
        const ok = await insertEscalation({
          type:     "velocity_alert",
          userId:   uid,
          reason:   `${stats.count} submissions in 24h — velocity attack pattern`,
          score:    stats.maxScore,
          evidence: { submissions_24h: stats.count, max_score: stats.maxScore },
        });
        if (ok) added++;
      }
    }

    const { count: pendingCount } = await sb
      .from("admin_escalations")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending");

    broadcastAuditEvent({
      type:          "admin_action",
      severity:      "info",
      message:       `Escalation scan completed — ${pendingCount ?? 0} items pending`,
      adminUsername: claims.username,
    });

    return res.json({ scanned: added, pending: pendingCount ?? 0 });
  } catch (e) {
    logger.error({ err: e }, "[escalation] scan failed");
    return res.status(500).json({ code: "DB_ERROR", message: (e as Error).message });
  }
});

/* ── POST /admin/escalations/:id/approve ─────────────────────────────── */
router.post("/admin/escalations/:id/approve", requireAdmin(), async (req, res) => {
  const sb = getServiceClient();
  if (!sb) return res.status(503).json({ code: "NO_SERVICE_CLIENT" });
  const claims = (req as typeof req & { adminClaims: AdminClaims }).adminClaims;

  try {
    const { data: esc, error: fetchErr } = await sb
      .from("admin_escalations").select("*").eq("id", req.params.id).single();
    if (fetchErr || !esc) return res.status(404).json({ code: "NOT_FOUND" });

    const escRow = esc as EscalationRow;
    if (escRow.status !== "pending") return res.status(400).json({ code: "ALREADY_DECIDED" });

    /* Execute the recommended action against the user */
    if (escRow.user_id && (escRow.type === "auto_freeze" || escRow.type === "auto_quarantine")) {
      const freeze = escRow.type === "auto_freeze";
      const { error: userErr } = await sb.from("users").update({
        is_frozen:     freeze,
        freeze_until:  freeze ? new Date(Date.now() + 30 * 86_400_000).toISOString() : null,
        freeze_reason: escRow.reason,
      }).eq("id", escRow.user_id);
      if (userErr) logger.warn({ err: userErr }, "[escalation] user update failed");
    }

    const { data: updated, error: updateErr } = await sb
      .from("admin_escalations")
      .update({
        status:     "approved",
        decided_at: new Date().toISOString(),
        decided_by: claims.username,
      })
      .eq("id", req.params.id)
      .select()
      .single();
    if (updateErr || !updated) {
      return res.status(500).json({ code: "DB_ERROR", message: updateErr?.message ?? "update failed" });
    }

    broadcastAuditEvent({
      type:          "admin_action",
      severity:      "high",
      message:       `Escalation approved: ${escRow.type} for ${escRow.username ?? escRow.user_id ?? "unknown"}`,
      adminUsername: claims.username,
      userId:        escRow.user_id ?? undefined,
      username:      escRow.username ?? undefined,
    });

    return res.json({ ok: true, escalation: toResponse(updated as EscalationRow) });
  } catch (e) {
    logger.error({ err: e }, "[escalation] approve failed");
    return res.status(500).json({ code: "EXECUTE_ERROR", message: (e as Error).message });
  }
});

/* ── POST /admin/escalations/:id/dismiss ─────────────────────────────── */
router.post("/admin/escalations/:id/dismiss", requireAdmin(), async (req, res) => {
  const sb = getServiceClient();
  if (!sb) return res.status(503).json({ code: "NO_SERVICE_CLIENT" });
  const claims = (req as typeof req & { adminClaims: AdminClaims }).adminClaims;

  try {
    const { data: esc, error: fetchErr } = await sb
      .from("admin_escalations").select("*").eq("id", req.params.id).single();
    if (fetchErr || !esc) return res.status(404).json({ code: "NOT_FOUND" });

    const escRow = esc as EscalationRow;
    if (escRow.status !== "pending") return res.status(400).json({ code: "ALREADY_DECIDED" });

    const { data: updated, error: updateErr } = await sb
      .from("admin_escalations")
      .update({
        status:     "dismissed",
        decided_at: new Date().toISOString(),
        decided_by: claims.username,
      })
      .eq("id", req.params.id)
      .select()
      .single();
    if (updateErr || !updated) {
      return res.status(500).json({ code: "DB_ERROR", message: updateErr?.message ?? "update failed" });
    }

    broadcastAuditEvent({
      type:          "admin_action",
      severity:      "info",
      message:       `Escalation dismissed: ${escRow.type} for ${escRow.username ?? escRow.user_id ?? "unknown"}`,
      adminUsername: claims.username,
    });

    return res.json({ ok: true, escalation: toResponse(updated as EscalationRow) });
  } catch (e) {
    return res.status(500).json({ code: "DB_ERROR", message: (e as Error).message });
  }
});

export default router;
