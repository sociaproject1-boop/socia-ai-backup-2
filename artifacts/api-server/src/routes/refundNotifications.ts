/**
 * Refund notification routes (user-facing).
 *
 *   GET   /api/refund-notifications          — list user's notifications
 *   PATCH /api/refund-notifications/:id      — mark single as read
 *   POST  /api/refund-notifications/read-all — mark all as read
 */

import { Router } from "express";
import { requireAuth, getAuthedUser, getRequestSupabase } from "../lib/supabaseAuth.js";

const router = Router();

/* GET /api/refund-notifications */
router.get("/refund-notifications", requireAuth, async (req, res) => {
  const supabase  = getRequestSupabase(req);
  const user      = getAuthedUser(req);
  const limit     = Math.min(Number(req.query["limit"] ?? 40), 100);
  const unreadOnly = req.query["unread"] === "true";

  let q = supabase
    .from("refund_notifications")
    .select("id, refund_request_id, type, title, message, is_read, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (unreadOnly) q = q.eq("is_read", false);

  const { data, error } = await q;
  if (error) return res.status(500).json({ code: "DB_ERROR" });

  const rows = (data ?? []) as Array<{ is_read: boolean }>;
  const unread_count = rows.filter((n) => !n.is_read).length;

  return res.json({ notifications: rows, unread_count });
});

/* PATCH /api/refund-notifications/:id — mark single as read */
router.patch("/refund-notifications/:id", requireAuth, async (req, res) => {
  const supabase = getRequestSupabase(req);
  const user     = getAuthedUser(req);
  const id       = String(req.params["id"]);

  const { error } = await supabase
    .from("refund_notifications")
    .update({ is_read: true })
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return res.status(500).json({ code: "DB_ERROR" });
  return res.json({ ok: true });
});

/* POST /api/refund-notifications/read-all */
router.post("/refund-notifications/read-all", requireAuth, async (req, res) => {
  const supabase = getRequestSupabase(req);
  const user     = getAuthedUser(req);

  const { error } = await supabase
    .from("refund_notifications")
    .update({ is_read: true })
    .eq("user_id", user.id)
    .eq("is_read", false);

  if (error) return res.status(500).json({ code: "DB_ERROR" });
  return res.json({ ok: true });
});

export default router;
