/**
 * Admin Receipt Review Center routes.
 *
 * All routes require a valid admin JWT (requireAdmin middleware).
 * Uses service-role Supabase client (RLS bypassed).
 *
 * Routes:
 *   GET  /admin/receipts              — list receipts (filterable by status)
 *   GET  /admin/receipts/stats        — summary counts for dashboard
 *   GET  /admin/receipts/:id          — full receipt detail + user history + notes
 *   POST /admin/receipts/:id/decide   — approve / reject / mark suspicious
 *   POST /admin/receipts/:id/proof    — request additional proof from user
 *   POST /admin/receipts/:id/notes    — add internal admin note
 */

import { Router, type IRouter } from "express";
import {
  getServiceClient, requireAdmin, getAdminClaims, audit,
} from "../lib/adminAuth.js";
import { broadcastFraudEvent, broadcastAuditEvent } from "../lib/adminSocket.js";

const router: IRouter = Router();

/* ── GET /admin/receipts/stats ────────────────────────────────────────── */
router.get("/admin/receipts/stats", requireAdmin(), async (req, res) => {
  const sb = getServiceClient();
  if (!sb) return res.status(503).json({ code: "NO_SERVICE_CLIENT" });

  const { data, error } = await sb
    .from("payment_receipts")
    .select("verification_status, review_status, fraud_score");

  if (error) {
    if (error.message?.includes("does not exist") || (error as { code?: string }).code === "42703") {
      return res.json({ total: 0, pending_review: 0, suspicious: 0, blocked: 0, approved: 0, rejected: 0, proof_requested: 0, avg_fraud_score: 0, _schema_warning: true });
    }
    return res.status(500).json({ code: "DB_ERROR", message: error.message });
  }

  const rows = (data ?? []) as {
    verification_status: string;
    review_status:       string | null;
    fraud_score:         number | null;
  }[];

  const total           = rows.length;
  const pending_review  = rows.filter(
    (r) => r.fraud_score != null && r.fraud_score >= 50 && (!r.review_status || r.review_status === "pending"),
  ).length;
  const suspicious      = rows.filter((r) => r.verification_status === "suspicious").length;
  const blocked         = rows.filter((r) => r.verification_status === "blocked").length;
  const approved        = rows.filter((r) => r.review_status === "approved").length;
  const rejected        = rows.filter((r) => r.review_status === "rejected").length;
  const proof_requested = rows.filter((r) => r.review_status === "proof_requested").length;
  const scores          = rows.map((r) => r.fraud_score ?? 0);
  const avg_fraud_score = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;

  return res.json({
    total, pending_review, suspicious, blocked, approved, rejected, proof_requested, avg_fraud_score,
  });
});

/* ── GET /admin/receipts ──────────────────────────────────────────────── */
router.get("/admin/receipts", requireAdmin(), async (req, res) => {
  const sb     = getServiceClient();
  if (!sb) return res.status(503).json({ code: "NO_SERVICE_CLIENT" });

  const status = (req.query["status"] as string) || "needs_review";
  const search = (req.query["search"] as string) || "";
  const limit  = Math.min(Number(req.query["limit"] ?? 100), 500);

  let q = sb
    .from("payment_receipts")
    .select(`
      id, user_id, image_url, manual_reference, extracted_reference,
      verification_status, review_status, fraud_score, blur_score,
      tamper_score, tamper_detected, ai_detection_score, structure_score,
      receipt_field_count, extracted_amount, extracted_payment_method,
      extracted_date, ocr_engine, block_code, proof_requested,
      reviewed_by, reviewed_at, created_at, fraud_reasons
    `)
    .order("created_at", { ascending: false })
    .limit(limit);

  switch (status) {
    case "needs_review":
      q = q.gte("fraud_score", 50).or("review_status.is.null,review_status.eq.pending");
      break;
    case "suspicious":
      q = q.eq("verification_status", "suspicious");
      break;
    case "blocked":
      q = q.eq("verification_status", "blocked");
      break;
    case "approved":
      q = q.eq("review_status", "approved");
      break;
    case "rejected":
      q = q.eq("review_status", "rejected");
      break;
    case "proof_requested":
      q = q.eq("review_status", "proof_requested");
      break;
    // "all" — no extra filter
  }

  if (search) {
    q = q.or(
      `manual_reference.ilike.%${search}%,extracted_reference.ilike.%${search}%`,
    );
  }

  const { data: rows, error } = await q;
  if (error) {
    if (error.message?.includes("does not exist") || (error as { code?: string }).code === "42703") {
      return res.json({ receipts: [], _schema_warning: true });
    }
    return res.status(500).json({ code: "DB_ERROR", message: error.message });
  }

  // Batch-fetch user info
  const userIds = [...new Set((rows ?? []).map((r: { user_id: string }) => r.user_id))];
  let userMap: Record<string, { username: string; name: string; email: string }> = {};

  if (userIds.length > 0) {
    const { data: users } = await sb
      .from("users")
      .select("id, username, name, email")
      .in("id", userIds);
    for (const u of users ?? []) {
      userMap[u.id] = { username: u.username, name: u.name, email: u.email };
    }
  }

  const receipts = (rows ?? []).map((r: Record<string, unknown> & { user_id: string }) => ({
    ...r,
    user: userMap[r.user_id] ?? null,
  }));

  return res.json({ receipts });
});

/* ── GET /admin/receipts/:id ──────────────────────────────────────────── */
router.get("/admin/receipts/:id", requireAdmin(), async (req, res) => {
  const sb = getServiceClient();
  if (!sb) return res.status(503).json({ code: "NO_SERVICE_CLIENT" });

  const { id } = req.params as { id: string };

  const { data: receipt, error } = await sb
    .from("payment_receipts")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !receipt) {
    return res.status(404).json({ code: "NOT_FOUND", message: "Receipt not found." });
  }

  // Fetch user info
  const { data: user } = await sb
    .from("users")
    .select("id, username, name, email, avatar_url, followers, following, created_at")
    .eq("id", (receipt as { user_id: string }).user_id)
    .single();

  // Fetch admin notes for this receipt
  const { data: notes } = await sb
    .from("receipt_review_notes")
    .select("id, admin_id, admin_name, note, is_internal, created_at")
    .eq("receipt_id", id)
    .order("created_at", { ascending: true });

  // Fetch user's recent payment receipts (payment history)
  const { data: history } = await sb
    .from("payment_receipts")
    .select(`
      id, manual_reference, extracted_amount, extracted_payment_method,
      verification_status, review_status, fraud_score, created_at
    `)
    .eq("user_id", (receipt as { user_id: string }).user_id)
    .neq("id", id)
    .order("created_at", { ascending: false })
    .limit(10);

  return res.json({
    receipt: {
      ...receipt,
      user:               user ?? null,
      notes:              notes ?? [],
      user_receipt_history: history ?? [],
    },
  });
});

/* ── POST /admin/receipts/:id/decide ─────────────────────────────────── */
router.post("/admin/receipts/:id/decide", requireAdmin(), async (req, res) => {
  const sb = getServiceClient();
  if (!sb) return res.status(503).json({ code: "NO_SERVICE_CLIENT" });

  const { id }     = req.params as { id: string };
  const claims     = getAdminClaims(req);
  const { action, notes } = req.body as { action: string; notes?: string };

  const valid = ["approved", "rejected", "suspicious"] as const;
  if (!valid.includes(action as typeof valid[number])) {
    return res.status(400).json({ code: "INVALID_ACTION", message: "Action must be approved, rejected, or suspicious." });
  }

  const patch: Record<string, unknown> = {
    review_status: action,
    reviewed_by:   claims?.username ?? claims?.adminId,
    reviewed_at:   new Date().toISOString(),
  };
  if (notes) patch["review_notes"] = notes;

  const { error } = await sb
    .from("payment_receipts")
    .update(patch)
    .eq("id", id);

  if (error) return res.status(500).json({ code: "DB_ERROR", message: error.message });

  // Add a system note if notes provided
  if (notes) {
    await sb.from("receipt_review_notes").insert({
      receipt_id: id,
      admin_id:   claims?.adminId ?? "system",
      admin_name: claims?.username ?? "Admin",
      note:       `[${action.toUpperCase()}] ${notes}`,
      is_internal: true,
    });
  }

  await audit(claims, `receipt_${action}`, {
    req,
    targetType:  "payment_receipt",
    targetId:    id,
    meta:        { notes },
  });

  /* ── Auto-ban check: escalate after repeated rejections ── */
  if (action === "rejected") {
    try {
      const { data: rc } = await sb.from("payment_receipts").select("user_id").eq("id", id).single();
      if (rc?.user_id) {
        const { count } = await sb
          .from("payment_receipts")
          .select("id", { count: "exact", head: true })
          .eq("user_id", rc.user_id)
          .eq("review_status", "rejected");
        const n = count ?? 0;
        if (n >= 5) {
          await sb.from("users")
            .update({ is_banned: true, suspension_reason: `Auto-banned: ${n} rejected payment receipts detected` })
            .eq("id", rc.user_id);
          await audit(null, "user.auto_banned", {
            targetType: "user",
            targetId:   rc.user_id,
            meta:       { rejectedCount: n },
          });
          req.log.warn({ userId: rc.user_id, rejectedCount: n }, "[auto-ban] permanent ban triggered");
        } else if (n >= 3) {
          await sb.from("users")
            .update({ is_suspended: true, suspension_reason: `Auto-suspended: ${n} rejected receipts — fraud pattern detected` })
            .eq("id", rc.user_id);
          await audit(null, "user.auto_suspended", {
            targetType: "user",
            targetId:   rc.user_id,
            meta:       { rejectedCount: n },
          });
          req.log.warn({ userId: rc.user_id, rejectedCount: n }, "[auto-ban] auto-suspension triggered");
        }
      }
    } catch (autoErr) {
      req.log.warn({ err: autoErr }, "[auto-ban] non-critical check failed");
    }
  }

  /* Broadcast receipt decision to admin live feed */
  broadcastAuditEvent({
    type:          "admin_action",
    severity:      action === "approved" ? "info" : action === "rejected" ? "high" : "medium",
    message:       `Receipt ${action} by ${claims?.username ?? "admin"}`,
    adminUsername: claims?.username ?? "admin",
    details:       { receiptId: id, action, notes },
  });

  req.log.info({ id, action, admin: claims?.username }, "[admin-receipts] decided");
  return res.json({ ok: true, review_status: action });
});

/* ── POST /admin/receipts/:id/proof ──────────────────────────────────── */
router.post("/admin/receipts/:id/proof", requireAdmin(), async (req, res) => {
  const sb = getServiceClient();
  if (!sb) return res.status(503).json({ code: "NO_SERVICE_CLIENT" });

  const { id }   = req.params as { id: string };
  const claims   = getAdminClaims(req);
  const { note } = req.body as { note?: string };

  const { error } = await sb
    .from("payment_receipts")
    .update({
      proof_requested:    true,
      proof_requested_at: new Date().toISOString(),
      review_status:      "proof_requested",
    })
    .eq("id", id);

  if (error) return res.status(500).json({ code: "DB_ERROR", message: error.message });

  const systemNote =
    "Additional documentation has been requested. Please re-submit with a clearer, unedited screenshot of your payment confirmation. " +
    (note ? `Admin note: ${note}` : "");

  await sb.from("receipt_review_notes").insert({
    receipt_id:  id,
    admin_id:    claims?.adminId ?? "system",
    admin_name:  claims?.username ?? "Admin",
    note:        systemNote,
    is_internal: false,
  });

  await audit(claims, "receipt_proof_requested", {
    req,
    targetType:  "payment_receipt",
    targetId:    id,
    meta:        { notes: note },
  });

  broadcastAuditEvent({
    type:          "admin_action",
    severity:      "medium",
    message:       `Proof requested on receipt by ${claims?.username ?? "admin"}`,
    adminUsername: claims?.username ?? "admin",
    details:       { receiptId: id },
  });

  return res.json({ ok: true });
});

/* ── POST /admin/receipts/:id/notes ──────────────────────────────────── */
router.post("/admin/receipts/:id/notes", requireAdmin(), async (req, res) => {
  const sb = getServiceClient();
  if (!sb) return res.status(503).json({ code: "NO_SERVICE_CLIENT" });

  const { id }          = req.params as { id: string };
  const claims          = getAdminClaims(req);
  const { note, is_internal = true } = req.body as { note: string; is_internal?: boolean };

  if (!note?.trim()) {
    return res.status(400).json({ code: "EMPTY_NOTE", message: "Note text is required." });
  }

  const { data, error } = await sb
    .from("receipt_review_notes")
    .insert({
      receipt_id:  id,
      admin_id:    claims?.adminId ?? "system",
      admin_name:  claims?.username ?? "Admin",
      note:        note.trim(),
      is_internal,
    })
    .select("id, admin_id, admin_name, note, is_internal, created_at")
    .single();

  if (error) return res.status(500).json({ code: "DB_ERROR", message: error.message });

  return res.json({ ok: true, note: data });
});

export default router;
