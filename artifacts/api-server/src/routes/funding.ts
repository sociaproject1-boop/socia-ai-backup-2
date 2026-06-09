/**
 * Community Funding — user-facing routes.
 *
 * GET  /api/funding/progress  — public, returns global funding stats
 * POST /api/funding/donate    — requires Supabase auth, submits support
 * GET  /api/funding/my        — requires auth, user's own submissions
 */

import { Router }  from "express";
import { createClient } from "../lib/dbCompat.js";
import { requireAuth, getAuthedUser, getRequestSupabase } from "../lib/replitAuth.js";
import { getServiceClient } from "../lib/adminAuth.js";

const router = Router();

const GLOBAL_ID = "00000000-0000-0000-0000-000000000001";

/** Anon client for public reads (no user session). Always reads env at call time. */
function anonClient() {
  const url  = process.env["VITE_SUPABASE_URL"]      ?? "";
  const anon = process.env["VITE_SUPABASE_ANON_KEY"] ?? "";
  return createClient(url, anon, { auth: { persistSession: false } });
}

/* ── GET /api/funding/progress ─────────────────────────────────────── */
router.get("/funding/progress", async (req, res): Promise<void> => {
  try {
    const { data, error } = await anonClient()
      .from("community_funding")
      .select("id,target_amount,current_amount,supporters_count,is_goal_reached,unlock_phase,updated_at")
      .eq("id", GLOBAL_ID)
      .maybeSingle();

    if (error) {
      req.log.warn({ err: error }, "funding/progress db error");
      /* Graceful fallback — table may not exist yet */
      res.json({ funding: null });
      return;
    }
    res.json({ funding: data });
  } catch (err) {
    req.log.error({ err }, "funding/progress failed");
    res.status(500).json({ code: "SERVER_ERROR" });
  }
});

/* ── GET /api/funding/recent-supporters ────────────────────────────── */
// Public, anonymized feed of the latest confirmed contributions. Used by
// the home Community Funding card to surface social proof. We mask the
// username to "first 2 chars + ***" so no user is identifiable by amount.
router.get("/funding/recent-supporters", async (req, res): Promise<void> => {
  try {
    // community_support RLS only allows owner-read; for the public feed we
    // use the service client and project only non-PII columns before masking.
    const sb = getServiceClient();
    if (!sb) { res.json({ supporters: [] }); return; }

    const { data, error } = await sb
      .from("community_support")
      .select("id, amount_centavos, paid_at, user_id")
      .eq("status", "paid")
      .order("paid_at", { ascending: false })
      .limit(20);

    if (error) {
      req.log.warn({ err: error }, "funding/recent-supporters db error");
      res.json({ supporters: [] });
      return;
    }
    const rows = (data ?? []) as Array<{ id: string; amount_centavos: number; paid_at: string; user_id: string }>;

    // Project ONLY the username (which we mask) — avatar_url is omitted on
    // purpose: a raw avatar combined with timestamp+amount is enough to
    // re-identify a contributor and defeats anonymization.
    const userIds = Array.from(new Set(rows.map((r) => r.user_id)));
    const usernames: Record<string, string | null> = {};
    if (userIds.length > 0) {
      const { data: udata } = await sb
        .from("users")
        .select("id, username")
        .in("id", userIds);
      for (const u of (udata ?? []) as Array<{ id: string; username: string | null }>) {
        usernames[u.id] = u.username;
      }
    }

    const mask = (name: string | null): string => {
      if (!name) return "Anonymous";
      const trimmed = name.trim();
      if (trimmed.length <= 2) return trimmed + "***";
      return trimmed.slice(0, 2) + "***";
    };

    res.json({
      supporters: rows.map((r) => ({
        id:       r.id,
        amount:   r.amount_centavos / 100,
        paid_at:  r.paid_at,
        username: mask(usernames[r.user_id] ?? null),
      })),
    });
  } catch (err) {
    req.log.error({ err }, "funding/recent-supporters failed");
    res.status(500).json({ code: "SERVER_ERROR" });
  }
});

/* ── POST /api/funding/donate ──────────────────────────────────────── */
// RETIRED: the manual reference-number + screenshot flow has been replaced
// by automated PayMongo Checkout. Returns 410 Gone so any stale client
// surfaces a clear error and falls back to the new UI on next refresh.
router.post("/funding/donate", requireAuth, async (_req, res): Promise<void> => {
  res.status(410).json({
    code: "GONE",
    message: "Manual donations are no longer accepted. Use the Support Socia button to contribute via secure PayMongo checkout.",
  });
});

/* ── (DEAD CODE — preserved for git history only, never reachable) ──── */
async function _legacyDonateForGitHistory(req: import("express").Request, res: import("express").Response): Promise<void> {
  const supabase = getRequestSupabase(req);
  const user     = getAuthedUser(req);

  const { amount, payment_method, reference_no, screenshot_url } = req.body ?? {};

  const amt = Number(amount);
  if (isNaN(amt) || amt < 50) {
    res.status(400).json({ code: "INVALID_AMOUNT", message: "Minimum support amount is ₱50." });
    return;
  }
  if (!["gcash", "maya"].includes(String(payment_method ?? ""))) {
    res.status(400).json({ code: "INVALID_METHOD", message: "Choose GCash or Maya." });
    return;
  }
  const ref = String(reference_no ?? "").trim();
  if (ref.length < 4) {
    res.status(400).json({ code: "REFERENCE_REQUIRED", message: "Enter your GCash / Maya reference number." });
    return;
  }

  /* Anti-spam: 1 pending donation per 24 h */
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count } = await supabase
    .from("funding_donations")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("status", "pending")
    .gte("created_at", since);

  if ((count ?? 0) >= 1) {
    res.status(429).json({
      code:    "COOLDOWN",
      message: "You already have a pending submission. Please wait for it to be reviewed.",
    });
    return;
  }

  const { data, error } = await supabase
    .from("funding_donations")
    .insert({
      user_id:        user.id,
      amount:         amt,
      payment_method: String(payment_method),
      reference_no:   ref,
      screenshot_url: screenshot_url ? String(screenshot_url).slice(0, 500) : null,
    })
    .select("id")
    .single();

  if (error) {
    req.log.error({ err: error }, "funding donate insert failed");
    res.status(500).json({ code: "DB_ERROR" });
    return;
  }

  res.json({ ok: true, id: data.id });
}
void _legacyDonateForGitHistory;

/* ── GET /api/funding/my ───────────────────────────────────────────── */
router.get("/funding/my", requireAuth, async (req, res): Promise<void> => {
  const supabase = getRequestSupabase(req);
  const user     = getAuthedUser(req);

  const { data, error } = await supabase
    .from("funding_donations")
    .select("id,amount,payment_method,reference_no,status,admin_notes,created_at,approved_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {
    res.status(500).json({ code: "DB_ERROR" });
    return;
  }

  res.json({ donations: data ?? [] });
});

export default router;
