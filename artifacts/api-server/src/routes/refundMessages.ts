/**
 * Refund thread message routes.
 *
 * User routes (requireAuth — own refunds only, no internal notes):
 *   GET  /api/refunds/my/:id            — single refund detail
 *   GET  /api/refunds/:id/messages      — thread messages (no internal notes)
 *   POST /api/refunds/:id/messages      — send user message (open refunds only)
 *
 * Admin routes (requireAdmin — full visibility, incl. internal notes):
 *   GET   /admin/refunds/:id/messages      — all messages + internal notes
 *   POST  /admin/refunds/:id/messages      — send message or internal note
 *   POST  /admin/refunds/:id/proof-request — send system proof-request message
 *   PATCH /admin/refunds/:id/payout        — update payout status
 */

import { Router, type IRouter } from "express";
import { requireAuth, getAuthedUser, getRequestSupabase } from "../lib/supabaseAuth.js";
import { requireAdmin, getServiceClient } from "../lib/adminAuth.js";

const router: IRouter = Router();

/* ── Helper: auto-notify user ────────────────────────────────────────── */
async function insertNotification(opts: {
  refundId:   string;
  userId:     string;
  type:       "status_update" | "new_message" | "decision" | "proof_requested" | "info";
  title:      string;
  message:    string;
}) {
  const sb = getServiceClient();
  if (!sb) return;
  try {
    await sb.from("refund_notifications").insert({
      user_id:            opts.userId,
      refund_request_id:  opts.refundId,
      type:               opts.type,
      title:              opts.title,
      message:            opts.message,
    });
  } catch { /* non-fatal */ }
}

/* ══════════ USER ROUTES ══════════════════════════════════════════════ */

/* GET /api/refunds/my/:id — single refund detail */
router.get("/refunds/my/:id", requireAuth, async (req, res) => {
  const supabase = getRequestSupabase(req);
  const user     = getAuthedUser(req);
  const id       = String(req.params["id"]);

  const { data, error } = await supabase
    .from("refund_requests")
    .select("id, subscription_type, plan_code, payment_amount_php, estimated_refundable_php, approved_amount_php, reason, status, payout_status, payout_at, admin_notes, payment_reference, created_at, updated_at")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) return res.status(500).json({ code: "DB_ERROR" });
  if (!data)  return res.status(404).json({ code: "NOT_FOUND" });
  return res.json({ refund: data });
});

/* GET /api/refunds/:id/messages */
router.get("/refunds/:id/messages", requireAuth, async (req, res) => {
  const supabase = getRequestSupabase(req);
  const user     = getAuthedUser(req);
  const id       = String(req.params["id"]);

  // Verify ownership
  const { data: rr } = await supabase
    .from("refund_requests")
    .select("id, user_id, status")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!rr) return res.status(404).json({ code: "NOT_FOUND" });

  const { data, error } = await supabase
    .from("refund_messages")
    .select("id, sender_id, sender_role, message, attachment_url, created_at")
    .eq("refund_request_id", id)
    .eq("is_internal_note", false)
    .order("created_at", { ascending: true });

  if (error) return res.status(500).json({ code: "DB_ERROR" });
  return res.json({ messages: data ?? [], refund_status: (rr as { status: string }).status });
});

/* POST /api/refunds/:id/messages */
router.post("/refunds/:id/messages", requireAuth, async (req, res) => {
  const supabase = getRequestSupabase(req);
  const user     = getAuthedUser(req);
  const id       = String(req.params["id"]);
  const { message, attachment_url } = req.body as { message?: string; attachment_url?: string };

  if (!message?.trim()) return res.status(400).json({ code: "MESSAGE_REQUIRED" });
  if (message.trim().length > 2000) return res.status(400).json({ code: "MESSAGE_TOO_LONG" });

  // Verify ownership + refund is still open
  const { data: rr } = await supabase
    .from("refund_requests")
    .select("id, user_id, status")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!rr) return res.status(404).json({ code: "NOT_FOUND" });
  const r = rr as { id: string; user_id: string; status: string };
  if (!["pending", "reviewing"].includes(r.status)) {
    return res.status(409).json({ code: "THREAD_CLOSED", message: "This refund request has been resolved." });
  }

  const { data: msg, error } = await supabase
    .from("refund_messages")
    .insert({
      refund_request_id: id,
      sender_id:         user.id,
      sender_role:       "user",
      message:           message.trim(),
      attachment_url:    attachment_url ?? null,
      is_internal_note:  false,
    })
    .select("id, sender_id, sender_role, message, attachment_url, created_at")
    .single();

  if (error) return res.status(500).json({ code: "DB_ERROR", message: error.message });

  req.log.info({ userId: user.id, refundId: id }, "User sent refund message");
  return res.status(201).json({ message: msg });
});

/* ══════════ ADMIN ROUTES ═════════════════════════════════════════════ */

/* GET /admin/refunds/:id/messages */
router.get("/admin/refunds/:id/messages", requireAdmin(), async (req, res) => {
  const sb = getServiceClient()!;
  const id = String(req.params["id"]);

  const { data, error } = await sb
    .from("refund_messages")
    .select("id, sender_id, sender_role, message, attachment_url, is_internal_note, created_at")
    .eq("refund_request_id", id)
    .order("created_at", { ascending: true });

  if (error) return res.status(500).json({ code: "DB_ERROR", message: error.message });
  return res.json({ messages: data ?? [] });
});

/* POST /admin/refunds/:id/messages */
router.post("/admin/refunds/:id/messages", requireAdmin(), async (req, res) => {
  const sb  = getServiceClient()!;
  const id  = String(req.params["id"]);
  const { message, is_internal_note = false, attachment_url } =
    req.body as { message?: string; is_internal_note?: boolean; attachment_url?: string };

  if (!message?.trim()) return res.status(400).json({ code: "MESSAGE_REQUIRED" });

  // Fetch refund to get user_id for notification
  const { data: rr } = await sb
    .from("refund_requests")
    .select("id, user_id, status")
    .eq("id", id)
    .maybeSingle();
  if (!rr) return res.status(404).json({ code: "NOT_FOUND" });
  const r = rr as { id: string; user_id: string; status: string };

  const { data: msg, error } = await sb
    .from("refund_messages")
    .insert({
      refund_request_id: id,
      sender_id:         null,
      sender_role:       "admin",
      message:           message.trim(),
      attachment_url:    attachment_url ?? null,
      is_internal_note:  Boolean(is_internal_note),
    })
    .select("id, sender_id, sender_role, message, attachment_url, is_internal_note, created_at")
    .single();

  if (error) return res.status(500).json({ code: "DB_ERROR", message: error.message });

  // Notify user if not an internal note
  if (!is_internal_note && r.user_id) {
    await insertNotification({
      refundId: id, userId: r.user_id,
      type: "new_message", title: "New reply on your refund",
      message: message.trim().slice(0, 120) + (message.trim().length > 120 ? "…" : ""),
    });
  }

  req.log.info({ refundId: id, isInternal: is_internal_note }, "Admin sent refund message");
  return res.status(201).json({ message: msg });
});

/* POST /admin/refunds/:id/proof-request */
router.post("/admin/refunds/:id/proof-request", requireAdmin(), async (req, res) => {
  const sb = getServiceClient()!;
  const id = String(req.params["id"]);
  const { note } = req.body as { note?: string };

  const { data: rr } = await sb
    .from("refund_requests")
    .select("id, user_id, status")
    .eq("id", id)
    .maybeSingle();
  if (!rr) return res.status(404).json({ code: "NOT_FOUND" });
  const r = rr as { id: string; user_id: string; status: string };

  const sysMsg = note?.trim()
    ? `Additional documentation required: ${note.trim()}`
    : "Our team requires additional documentation to process your refund. Please upload a clear screenshot of your payment confirmation and reply in this thread.";

  await sb.from("refund_messages").insert({
    refund_request_id: id, sender_id: null,
    sender_role: "system", message: sysMsg, is_internal_note: false,
  });

  if (r.user_id) {
    await insertNotification({
      refundId: id, userId: r.user_id,
      type: "proof_requested", title: "Action required — documentation needed",
      message: sysMsg.slice(0, 120),
    });
  }

  return res.json({ ok: true });
});

/* PATCH /admin/refunds/:id/payout */
router.patch("/admin/refunds/:id/payout", requireAdmin(), async (req, res) => {
  const sb = getServiceClient()!;
  const id = String(req.params["id"]);
  const { payout_status, payout_ref } =
    req.body as { payout_status?: string; payout_ref?: string };

  const VALID = ["queued", "processing", "sent", "failed"];
  if (!payout_status || !VALID.includes(payout_status)) {
    return res.status(400).json({ code: "INVALID_PAYOUT_STATUS" });
  }

  const { data: rr } = await sb
    .from("refund_requests")
    .select("id, user_id, approved_amount_php")
    .eq("id", id)
    .maybeSingle();
  if (!rr) return res.status(404).json({ code: "NOT_FOUND" });
  const r = rr as { id: string; user_id: string; approved_amount_php: number | null };

  await sb.from("refund_requests").update({
    payout_status,
    payout_ref:  payout_ref ?? null,
    payout_at:   payout_status === "sent" ? new Date().toISOString() : null,
  }).eq("id", id);

  if (payout_status === "sent" && r.user_id) {
    const amt = r.approved_amount_php ? `₱${Number(r.approved_amount_php).toLocaleString()}` : "your approved amount";
    await sb.from("refund_messages").insert({
      refund_request_id: id, sender_id: null,
      sender_role: "system",
      message: `Your refund of ${amt} has been sent${payout_ref ? ` (Ref: ${payout_ref})` : ""}. Please allow 1–3 business days for the funds to appear in your account.`,
      is_internal_note: false,
    });
    await insertNotification({
      refundId: id, userId: r.user_id,
      type: "status_update", title: `Refund of ${amt} sent`,
      message: `Your refund has been processed and sent to your account.`,
    });
  }

  req.log.info({ refundId: id, payout_status, payout_ref }, "Payout status updated");
  return res.json({ ok: true, payout_status });
});

export default router;
