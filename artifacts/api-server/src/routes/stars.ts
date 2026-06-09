/**
 * stars.ts — Creator Stars API
 *
 * POST   /api/stars/send                  — send stars to a creator
 * GET    /api/stars/balance               — current user's star wallet
 * GET    /api/stars/history               — paginated transaction history
 * GET    /api/stars/creator-summary/:uid  — public wallet + top supporters for a creator
 * GET    /api/admin/stars/overview        — admin monitoring (top creators, supporters, suspicious)
 * POST   /api/admin/stars/grant           — admin grant stars to a user
 */

import { Router, type IRouter } from "express";
import pino from "pino";
import { requireAuth, getAuthedUser } from "../lib/replitAuth.js";
import { getServiceClient, requireAdmin } from "../lib/adminAuth.js";

const logger = pino({ name: "stars" });
const router: IRouter = Router();

/* ─────────────────────────────────────────────────────────────────────────────
   Helpers
───────────────────────────────────────────────────────────────────────────── */

/** Insert a "stars" notification for the receiver — fire-and-forget, never throws. */
async function fireStarNotification(opts: {
  receiver_id:    string;
  sender_id:      string;
  amount:         number;
  transaction_id: string;
}) {
  if (opts.receiver_id === opts.sender_id) return;
  const svc = getServiceClient();
  if (!svc) return;
  try {
    await svc.from("post_notifications").insert({
      user_id:  opts.receiver_id,
      actor_id: opts.sender_id,
      type:     "stars",
      metadata: { amount: opts.amount, transaction_id: opts.transaction_id },
    });
  } catch (err) {
    logger.warn({ err }, "[stars] notification insert failed (non-critical)");
  }
}

/* ─────────────────────────────────────────────────────────────────────────────
   POST /api/stars/send
───────────────────────────────────────────────────────────────────────────── */
router.post("/stars/send", requireAuth as any, async (req, res) => {
  try {
    const user = getAuthedUser(req as any);
    const { receiver_id, amount, reference_id } = req.body as {
      receiver_id?:  string;
      amount?:       unknown;
      reference_id?: string;
    };

    if (!receiver_id || typeof receiver_id !== "string") {
      return res.status(400).json({ error: "receiver_id is required" });
    }

    const amt = Math.floor(Number(amount));
    if (!Number.isFinite(amt) || amt <= 0 || amt > 10_000) {
      return res.status(400).json({ error: "amount must be 1–10000" });
    }

    const svc = getServiceClient();
    if (!svc) return res.status(503).json({ error: "service_unavailable" });

    const { data, error } = await svc.rpc("send_stars", {
      p_sender_id:    user.id,
      p_receiver_id:  receiver_id,
      p_amount:       amt,
      p_reference_id: reference_id ?? null,
    });

    if (error) {
      logger.error({ error }, "[stars] send_stars RPC error");
      return res.status(500).json({ error: (error as any).message ?? String(error) });
    }

    type RPCResult = {
      ok:             boolean;
      error?:         string;
      balance?:       number;
      transaction_id?: string;
      sender_balance?: number;
    };
    const result = data as RPCResult;

    if (!result.ok) {
      const statusMap: Record<string, number> = {
        invalid_amount:        400,
        amount_too_large:      400,
        cannot_send_to_self:   400,
        sender_not_found:      404,
        receiver_not_found:    404,
        insufficient_balance:  402,
        duplicate_transaction: 409,
      };
      const httpStatus = statusMap[result.error ?? ""] ?? 400;
      return res.status(httpStatus).json({ error: result.error });
    }

    void fireStarNotification({
      receiver_id,
      sender_id:      user.id,
      amount:         amt,
      transaction_id: result.transaction_id!,
    });

    return res.json({
      ok:             true,
      transaction_id: result.transaction_id,
      sender_balance: result.sender_balance,
    });
  } catch (err) {
    logger.error({ err }, "[stars/send] unhandled error");
    return res.status(500).json({ error: "internal_error" });
  }
});

/* ─────────────────────────────────────────────────────────────────────────────
   GET /api/stars/balance
───────────────────────────────────────────────────────────────────────────── */
router.get("/stars/balance", requireAuth as any, async (req, res) => {
  try {
    const user = getAuthedUser(req as any);
    const svc  = getServiceClient();
    if (!svc) return res.status(503).json({ error: "service_unavailable" });

    const { data, error } = await svc
      .from("creator_star_wallets")
      .select("balance, lifetime_received, lifetime_sent, updated_at")
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) return res.status(500).json({ error: error.message });

    return res.json({
      wallet: data ?? { balance: 0, lifetime_received: 0, lifetime_sent: 0 },
    });
  } catch (err) {
    logger.error({ err }, "[stars/balance] unhandled error");
    return res.status(500).json({ error: "internal_error" });
  }
});

/* ─────────────────────────────────────────────────────────────────────────────
   GET /api/stars/history?limit=20&offset=0&direction=sent|received|all
───────────────────────────────────────────────────────────────────────────── */
router.get("/stars/history", requireAuth as any, async (req, res) => {
  try {
    const user   = getAuthedUser(req as any);
    const limit  = Math.min(Number(req.query["limit"]  ?? 20), 50);
    const offset = Number(req.query["offset"] ?? 0);
    const dir    = (req.query["direction"] as string) || "all";

    const svc = getServiceClient();
    if (!svc) return res.status(503).json({ error: "service_unavailable" });

    const SELECT_TX = `
      id, sender_id, receiver_id, amount, status,
      reference_id, metadata, created_at,
      sender:users!creator_star_transactions_sender_id_fkey(id, name, username, avatar_url),
      receiver:users!creator_star_transactions_receiver_id_fkey(id, name, username, avatar_url)
    `;

    let q = svc
      .from("creator_star_transactions")
      .select(SELECT_TX)
      .eq("status", "completed")
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (dir === "sent")     q = q.eq("sender_id",   user.id);
    else if (dir === "received") q = q.eq("receiver_id", user.id);
    else                   q = q.or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`);

    const { data, error } = await q;
    if (error) return res.status(500).json({ error: error.message });

    return res.json({ transactions: data ?? [] });
  } catch (err) {
    logger.error({ err }, "[stars/history] unhandled error");
    return res.status(500).json({ error: "internal_error" });
  }
});

/* ─────────────────────────────────────────────────────────────────────────────
   GET /api/stars/creator-summary/:userId
   Public endpoint — shows a creator's received lifetime + top supporters.
───────────────────────────────────────────────────────────────────────────── */
router.get("/stars/creator-summary/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const svc = getServiceClient();
    if (!svc) return res.status(503).json({ error: "service_unavailable" });

    const [walletRes, topRes] = await Promise.all([
      svc
        .from("creator_star_wallets")
        .select("balance, lifetime_received, lifetime_sent")
        .eq("user_id", userId)
        .maybeSingle(),
      svc
        .from("creator_star_transactions")
        .select(`
          sender_id, amount,
          sender:users!creator_star_transactions_sender_id_fkey(id, name, username, avatar_url)
        `)
        .eq("receiver_id", userId)
        .eq("status", "completed")
        .not("sender_id", "is", null)
        .order("amount", { ascending: false })
        .limit(10),
    ]);

    return res.json({
      wallet:         walletRes.data ?? { balance: 0, lifetime_received: 0, lifetime_sent: 0 },
      top_supporters: topRes.data ?? [],
    });
  } catch (err) {
    logger.error({ err }, "[stars/creator-summary] unhandled error");
    return res.status(500).json({ error: "internal_error" });
  }
});

/* ─────────────────────────────────────────────────────────────────────────────
   GET /api/admin/stars/overview
───────────────────────────────────────────────────────────────────────────── */
router.get("/admin/stars/overview", requireAdmin(), async (_req, res) => {
  try {
    const svc = getServiceClient();
    if (!svc) return res.status(503).json({ error: "service_unavailable" });

    const [totalsRes, topCreatorsRes, topSupportersRes, recentRes] = await Promise.all([
      svc
        .from("creator_star_transactions")
        .select("amount", { count: "exact" })
        .eq("status", "completed"),
      svc
        .from("creator_star_wallets")
        .select("user_id, lifetime_received, users(id, name, username, avatar_url)")
        .order("lifetime_received", { ascending: false })
        .limit(10),
      svc
        .from("creator_star_wallets")
        .select("user_id, lifetime_sent, users(id, name, username, avatar_url)")
        .order("lifetime_sent", { ascending: false })
        .limit(10),
      svc
        .from("creator_star_transactions")
        .select(`
          id, amount, status, created_at, reference_id, metadata,
          sender:users!creator_star_transactions_sender_id_fkey(id, name, username),
          receiver:users!creator_star_transactions_receiver_id_fkey(id, name, username)
        `)
        .order("created_at", { ascending: false })
        .limit(100),
    ]);

    const rows           = (totalsRes.data ?? []) as Array<{ amount: number }>;
    const totalStarsSent = rows.reduce((s, r) => s + (r.amount ?? 0), 0);
    const totalTxCount   = totalsRes.count ?? 0;

    // Suspicious: any sender with ≥5 transactions in the last 100 rows
    const senderHits: Record<string, number> = {};
    for (const tx of recentRes.data ?? []) {
      const sid = (tx.sender as any)?.id;
      if (sid) senderHits[sid] = (senderHits[sid] ?? 0) + 1;
    }
    const suspiciousSenderIds = Object.entries(senderHits)
      .filter(([, c]) => c >= 5)
      .map(([id]) => id);

    return res.json({
      stats: {
        total_stars_sent:  totalStarsSent,
        total_transactions: totalTxCount,
      },
      top_creators:         topCreatorsRes.data   ?? [],
      top_supporters:       topSupportersRes.data ?? [],
      recent_transactions:  recentRes.data        ?? [],
      suspicious_sender_ids: suspiciousSenderIds,
    });
  } catch (err) {
    logger.error({ err }, "[admin/stars/overview] unhandled error");
    return res.status(500).json({ error: "internal_error" });
  }
});

/* ─────────────────────────────────────────────────────────────────────────────
   POST /api/admin/stars/grant
───────────────────────────────────────────────────────────────────────────── */
router.post("/admin/stars/grant", requireAdmin(), async (req, res) => {
  try {
    const { user_id, amount, reason } = req.body as {
      user_id?: string;
      amount?:  unknown;
      reason?:  string;
    };

    if (!user_id || typeof user_id !== "string") {
      return res.status(400).json({ error: "user_id is required" });
    }
    const amt = Math.floor(Number(amount));
    if (!Number.isFinite(amt) || amt <= 0) {
      return res.status(400).json({ error: "amount must be positive" });
    }

    const svc = getServiceClient();
    if (!svc) return res.status(503).json({ error: "service_unavailable" });

    const { data, error } = await svc.rpc("admin_grant_stars", {
      p_user_id: user_id,
      p_amount:  amt,
      p_reason:  reason ?? "admin_grant",
    });

    if (error) {
      logger.error({ error }, "[admin/stars/grant] RPC error");
      return res.status(500).json({ error: (error as any).message ?? String(error) });
    }

    return res.json(data);
  } catch (err) {
    logger.error({ err }, "[admin/stars/grant] unhandled error");
    return res.status(500).json({ error: "internal_error" });
  }
});

export default router;
