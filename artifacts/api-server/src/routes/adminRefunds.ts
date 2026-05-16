/**
 * Admin refund management routes.
 *
 * All routes require a valid admin JWT (requireAdmin middleware).
 * Uses service-role Supabase client (RLS bypassed).
 * Every decision is recorded in refund_decisions + admin_audit_log.
 *
 * Routes:
 *   GET  /admin/refunds              — list refund requests (filterable)
 *   GET  /admin/refunds/stats        — summary counts for the overview tab
 *   GET  /admin/refunds/:id          — single request detail
 *   POST /admin/refunds/:id/decide   — approve / partial / reject
 *   POST /admin/refunds/:id/flag     — mark as suspicious
 */

import { Router, type IRouter } from "express";
import {
  getServiceClient, requireAdmin, getAdminClaims, audit,
} from "../lib/adminAuth.js";
import { broadcastAuditEvent } from "../lib/adminSocket.js";
import { computePartialRefund } from "../lib/partialRefundEngine.js";

const router: IRouter = Router();

/* ── GET /admin/refunds ───────────────────────────────────────────────── */
router.get("/admin/refunds", requireAdmin(), async (req, res) => {
  const sb     = getServiceClient()!;
  const status = (req.query["status"] as string) || "pending";
  const type   = req.query["type"] as string | undefined;
  const limit  = Math.min(Number(req.query["limit"] ?? 100), 500);
  const valid  = ["pending","reviewing","approved","partial","rejected","all"] as const;

  if (!valid.includes(status as typeof valid[number])) {
    return res.status(400).json({ code: "INVALID_STATUS" });
  }

  let q = sb
    .from("refund_requests")
    .select(`
      id, user_id, order_id, receipt_id, subscription_type, plan_code, payment_amount_php,
      estimated_used_php, estimated_refundable_php, requested_amount_php,
      approved_amount_php, credits_total, credits_used, credits_remaining,
      ai_requests_used, ai_requests_limit, reason, description,
      screenshot_url, payment_reference, status, abuse_score, is_flagged,
      flag_reason, admin_notes, reviewed_by, reviewed_at, created_at, updated_at,
      refund_risk_score, verification_status, detected_reference,
      payout_method, payout_account_number, payout_account_name
    `)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (status !== "all") q = q.eq("status", status);
  if (type && type !== "all") q = q.eq("subscription_type", type);

  const { data: rows, error } = await q;
  if (error) return res.status(500).json({ code: "DB_ERROR", message: error.message });

  // Two-step user enrichment — refund_requests.user_id originally FK'd to
  // auth.users (not public.users), so Supabase's join syntax fails. Batch-
  // fetch from public.users instead.
  const userIds = [...new Set((rows ?? []).map((r: { user_id: string }) => r.user_id))];
  const userMap = new Map<string, { username: string; name: string; email: string }>();
  if (userIds.length > 0) {
    const { data: users } = await sb.from("users").select("id, username, name, email").in("id", userIds);
    for (const u of (users ?? []) as Array<{ id: string; username: string; name: string; email: string }>) {
      userMap.set(u.id, { username: u.username, name: u.name, email: u.email });
    }
  }
  const requests = (rows ?? []).map((r: { user_id: string }) => ({ ...r, users: userMap.get(r.user_id) ?? null }));
  return res.json({ requests });
});

/* ── GET /admin/refunds/stats ─────────────────────────────────────────── */
router.get("/admin/refunds/stats", requireAdmin(), async (req, res) => {
  const sb = getServiceClient()!;

  const { data, error } = await sb
    .from("refund_requests")
    .select("status, subscription_type, estimated_refundable_php, approved_amount_php");

  if (error) return res.status(500).json({ code: "DB_ERROR", message: error.message });

  const rows = (data ?? []) as Array<{
    status: string;
    subscription_type: string;
    estimated_refundable_php: number;
    approved_amount_php: number | null;
  }>;

  const stats = {
    total:            rows.length,
    pending:          rows.filter((r) => r.status === "pending").length,
    reviewing:        rows.filter((r) => r.status === "reviewing").length,
    approved:         rows.filter((r) => r.status === "approved").length,
    partial:          rows.filter((r) => r.status === "partial").length,
    rejected:         rows.filter((r) => r.status === "rejected").length,
    total_approved_php: rows
      .filter((r) => r.status === "approved" || r.status === "partial")
      .reduce((sum, r) => sum + (r.approved_amount_php ?? 0), 0),
    creator_pending:  rows.filter((r) => r.status === "pending" && r.subscription_type === "creator").length,
    ai_pending:       rows.filter((r) => r.status === "pending" && r.subscription_type === "ai").length,
  };

  return res.json({ stats });
});

/* ── GET /admin/refunds/:id ───────────────────────────────────────────── */
router.get("/admin/refunds/:id", requireAdmin(), async (req, res) => {
  const sb = getServiceClient()!;
  const id = String(req.params["id"]);

  const { data: request, error } = await sb
    .from("refund_requests")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) return res.status(500).json({ code: "DB_ERROR", message: error.message });
  if (!request) return res.status(404).json({ code: "NOT_FOUND" });

  const req_ = request as {
    user_id: string; order_id: string | null;
    payment_amount_php: number; subscription_type: string;
  };

  // Two-step user enrichment (same FK issue as the list route above)
  const { data: userRow } = await sb
    .from("users")
    .select("id, username, name, email, created_at")
    .eq("id", req_.user_id)
    .maybeSingle();
  const enrichedRequest = { ...request, users: userRow ?? null };

  // Also fetch decision history
  const { data: decisions } = await sb
    .from("refund_decisions")
    .select("*")
    .eq("request_id", id)
    .order("created_at", { ascending: true });

  // Usage-based partial refund analysis (admin-only — includes cost data)
  let usageAnalysis = null;
  try {
    usageAnalysis = await computePartialRefund(sb, req_.user_id, req_.order_id ?? null);
  } catch {
    // Non-fatal — admin still sees the request without usage data
  }

  return res.json({
    request:        enrichedRequest,
    decisions:      decisions ?? [],
    usage_analysis: usageAnalysis,  // ADMIN ONLY — includes estimated_cost data
  });
});

/* ── POST /admin/refunds/:id/decide ──────────────────────────────────── */
router.post("/admin/refunds/:id/decide", requireAdmin(), async (req, res) => {
  const c  = getAdminClaims(req);
  const sb = getServiceClient()!;
  const id = String(req.params["id"]);

  const { action, amount_php, notes } = req.body ?? {};
  const validActions = ["approve","partial","reject","review"] as const;
  if (!validActions.includes(action as typeof validActions[number])) {
    return res.status(400).json({ code: "INVALID_ACTION", message: `action must be one of: ${validActions.join(", ")}` });
  }

  if (action === "reject" && (!notes || notes.trim().length < 5)) {
    return res.status(400).json({ code: "NOTES_REQUIRED", message: "A rejection reason (notes) is required." });
  }
  if (action === "partial" && (!amount_php || Number(amount_php) <= 0)) {
    return res.status(400).json({ code: "AMOUNT_REQUIRED", message: "A positive amount_php is required for partial approval." });
  }

  // Fetch the request first
  const { data: existing, error: fetchErr } = await sb
    .from("refund_requests")
    .select("id, status, user_id, payment_amount_php, estimated_refundable_php, order_id")
    .eq("id", id)
    .maybeSingle();

  if (fetchErr || !existing) return res.status(404).json({ code: "NOT_FOUND" });
  if (["approved","rejected","partial"].includes(existing.status)) {
    return res.status(409).json({ code: "ALREADY_DECIDED", message: "This request has already been decided." });
  }

  const finalStatus  = action === "review" ? "reviewing" : action;

  // For approve: use usage-based recommended amount if available, else ledger estimate
  let defaultApproveAmt = existing.estimated_refundable_php;
  try {
    const analysis = await computePartialRefund(sb, existing.user_id, existing.order_id ?? null);
    if (analysis.refund_eligible) {
      defaultApproveAmt = analysis.recommended_refund_php;
      // Persist usage snapshot for audit trail
      await sb.from("refund_requests").update({
        actual_ai_cost_php:    analysis.actual_ai_cost_php,
        usage_based_refundable: analysis.usage_based_refundable,
        heavy_usage_score:     analysis.heavy_usage_score,
        usage_snapshot: {
          image_count:   analysis.usage_summary.image_count,
          video_count:   analysis.usage_summary.video_count,
          chat_count:    analysis.usage_summary.chat_count,
          total_cost:    analysis.actual_ai_cost_php,
          breakdown:     analysis.usage_summary.breakdown,
          heavy_flags:   analysis.heavy_flags,
        },
      }).eq("id", id);
    }
  } catch {
    // Non-fatal — fall back to ledger estimate
  }

  const approvedAmt  = action === "approve"
    ? defaultApproveAmt
    : action === "partial"
    ? Number(amount_php)
    : null;

  // Update the request
  const updatePayload: Record<string, unknown> = {
    status:             finalStatus,
    admin_notes:        notes ?? null,
    reviewed_by:        c.username ?? c.adminId,
    reviewed_at:        new Date().toISOString(),
  };
  if (approvedAmt !== null) updatePayload["approved_amount_php"] = approvedAmt;

  const { error: updateErr } = await sb
    .from("refund_requests")
    .update(updatePayload)
    .eq("id", id);

  if (updateErr) return res.status(500).json({ code: "UPDATE_ERROR", message: updateErr.message });

  // Record in refund_decisions
  await sb.from("refund_decisions").insert({
    request_id: id,
    admin_id:   c.adminId,
    action,
    amount_php: approvedAmt,
    notes:      notes ?? null,
  });

  // Audit log
  await audit(c, `refund.${action}`, {
    req,
    targetType: "refund_request",
    targetId:   id,
    meta:       { action, amount_php: approvedAmt, notes },
  });

  // Auto-create thread message + user notification for the decision
  const decisionMsgs: Record<string, string> = {
    approve: `Your refund request has been approved for ₱${approvedAmt?.toLocaleString() ?? "?"}. Our team will process the payout within 1–5 business days.`,
    partial: `Your refund request has been partially approved for ₱${approvedAmt?.toLocaleString() ?? "?"}. ${notes?.trim() ?? ""}`.trim(),
    reject:  `Your refund request has been reviewed and could not be approved at this time.${notes?.trim() ? ` Reason: ${notes.trim()}` : ""}`,
    review:  "Your refund request is now under investigation. Our team may reach out for additional information.",
  };
  const sysMsg = decisionMsgs[action] ?? "Your refund request status has been updated.";
  try {
    await sb.from("refund_messages").insert({
      refund_request_id: id, sender_id: null, sender_role: "system",
      message: sysMsg, is_internal_note: false,
    });
  } catch { /* non-fatal — thread table may not exist yet */ }
  if (existing.user_id) {
    try {
      await sb.from("refund_notifications").insert({
        user_id: existing.user_id, refund_request_id: id,
        type: ["approve","partial"].includes(action) ? "decision" : "status_update",
        title: action === "approve" ? "Refund approved ✓"
             : action === "partial" ? "Partial refund approved"
             : action === "reject"  ? "Refund request resolved"
             : "Refund under review",
        message: sysMsg.slice(0, 120),
      });
    } catch { /* non-fatal */ }
  }

  broadcastAuditEvent({
    type:          "refund_decision",
    severity:      ["approve", "partial"].includes(action) ? "info" : action === "reject" ? "medium" : "low",
    message:       `Refund ${action === "approve" ? "approved" : action === "partial" ? "partially approved" : action === "reject" ? "rejected" : "under review"}${approvedAmt ? ` — ₱${approvedAmt.toLocaleString()}` : ""}`,
    adminUsername: getAdminClaims(req)?.username ?? "admin",
    details:       { refundId: id, action, amount_php: approvedAmt, notes },
  });

  return res.json({ ok: true, status: finalStatus, approved_amount_php: approvedAmt });
});

/* ── POST /admin/refunds/:id/flag ────────────────────────────────────── */
router.post("/admin/refunds/:id/flag", requireAdmin(), async (req, res) => {
  const c  = getAdminClaims(req);
  const sb = getServiceClient()!;
  const id = String(req.params["id"]);

  const { reason } = req.body ?? {};
  if (!reason || String(reason).trim().length < 3) {
    return res.status(400).json({ code: "REASON_REQUIRED" });
  }

  const { error } = await sb
    .from("refund_requests")
    .update({ is_flagged: true, flag_reason: String(reason).trim(), abuse_score: 100 })
    .eq("id", id);

  if (error) return res.status(500).json({ code: "UPDATE_ERROR", message: error.message });

  await sb.from("refund_decisions").insert({
    request_id: id, admin_id: c.adminId, action: "flag", notes: String(reason).trim(),
  });
  await audit(c, "refund.flag", { req, targetType: "refund_request", targetId: id, meta: { reason } });

  return res.json({ ok: true });
});

export default router;
