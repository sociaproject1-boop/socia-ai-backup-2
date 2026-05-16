/**
 * Community Funding — user-facing routes.
 *
 * GET  /api/funding/progress  — public, returns global funding stats
 * POST /api/funding/donate    — requires Supabase auth, submits support
 * GET  /api/funding/my        — requires auth, user's own submissions
 */

import { Router }  from "express";
import { createClient } from "@supabase/supabase-js";
import { requireAuth, getAuthedUser, getRequestSupabase } from "../lib/supabaseAuth.js";

const router = Router();

const GLOBAL_ID   = "00000000-0000-0000-0000-000000000001";
const SUPA_URL    = process.env["VITE_SUPABASE_URL"]  ?? "";
const SUPA_ANON   = process.env["VITE_SUPABASE_ANON_KEY"] ?? "";

/** Lazy anon client for public reads (no user session). */
let _anon: ReturnType<typeof createClient> | null = null;
function anonClient() {
  if (!_anon) _anon = createClient(SUPA_URL, SUPA_ANON, { auth: { persistSession: false } });
  return _anon;
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

/* ── POST /api/funding/donate ──────────────────────────────────────── */
router.post("/funding/donate", requireAuth, async (req, res): Promise<void> => {
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
});

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
