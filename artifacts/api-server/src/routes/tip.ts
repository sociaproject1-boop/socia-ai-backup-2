/**
 * tip.ts — POST /api/tip
 *
 * Credit-based creator tips. Transfers credits from the tipper to the
 * creator via two credit_ledger inserts (debit + credit).
 * Uses a lazy db() getter so no Supabase client is created at module
 * load time (avoids "supabaseKey is required" during build).
 */
import { Router } from "express";
import { requireAuth } from "../lib/replitAuth.js";
import { createClient } from "../lib/dbCompat.js";
import { logger } from "../lib/logger.js";

function db() {
  const url = process.env["VITE_SUPABASE_URL"] ?? process.env["SUPABASE_URL"] ?? "";
  const key = process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? "";
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

const router = Router();

const ALLOWED_AMOUNTS = [1, 5, 10, 25, 50] as const;
type TipAmount = (typeof ALLOWED_AMOUNTS)[number];

/* ── POST /api/tip ───────────────────────────────────────────────────── */
router.post("/tip", requireAuth, async (req, res): Promise<void> => {
  const user = (req as any).user as { id: string; email?: string };

  const { creator_id, post_id, amount } = (req.body ?? {}) as {
    creator_id?: unknown;
    post_id?:    unknown;
    amount?:     unknown;
  };

  if (!creator_id || typeof creator_id !== "string") {
    res.status(400).json({ error: "creator_id is required", code: "MISSING_CREATOR" });
    return;
  }
  if (creator_id === user.id) {
    res.status(400).json({ error: "Cannot tip yourself", code: "SELF_TIP" });
    return;
  }
  if (!ALLOWED_AMOUNTS.includes(amount as TipAmount)) {
    res.status(400).json({
      error: `Amount must be one of: ${ALLOWED_AMOUNTS.join(", ")}`,
      code:  "INVALID_AMOUNT",
    });
    return;
  }
  const tipAmount = Number(amount) as TipAmount;
  const supabase  = db();

  /* Verify the creator exists */
  const { data: creator, error: creatorErr } = await supabase
    .from("users")
    .select("id, name")
    .eq("id", creator_id)
    .maybeSingle();

  if (creatorErr || !creator) {
    res.status(404).json({ error: "Creator not found", code: "CREATOR_NOT_FOUND" });
    return;
  }

  /* Check tipper's current balance */
  const { data: ledger, error: ledgerErr } = await supabase
    .from("credit_ledger")
    .select("amount")
    .eq("user_id", user.id);

  if (ledgerErr) {
    logger.error({ err: ledgerErr }, "tip: ledger fetch failed");
    res.status(500).json({ error: "Could not verify your balance", code: "BALANCE_ERROR" });
    return;
  }

  const balance = (ledger ?? []).reduce((s: number, r: { amount: number }) => s + r.amount, 0);
  if (balance < tipAmount) {
    res.status(402).json({
      error:   `Insufficient credits. You have ${balance} but need ${tipAmount}.`,
      code:    "INSUFFICIENT_CREDITS",
      balance,
    });
    return;
  }

  /* Deduct from tipper */
  const { error: deductErr } = await supabase
    .from("credit_ledger")
    .insert({
      user_id:     user.id,
      amount:      -tipAmount,
      description: `Tip sent to ${creator.name}`,
      source:      "tip_sent",
      reference:   post_id ? String(post_id) : null,
    });

  if (deductErr) {
    logger.error({ err: deductErr }, "tip: deduct insert failed");
    res.status(500).json({ error: "Failed to process tip", code: "DEDUCT_ERROR" });
    return;
  }

  /* Credit the creator */
  const { error: creditErr } = await supabase
    .from("credit_ledger")
    .insert({
      user_id:     creator_id,
      amount:      tipAmount,
      description: "Tip received",
      source:      "tip_received",
      reference:   post_id ? String(post_id) : null,
    });

  if (creditErr) {
    /* Best-effort refund the sender */
    await supabase.from("credit_ledger").insert({
      user_id:     user.id,
      amount:      tipAmount,
      description: "Tip refund (delivery failed)",
      source:      "tip_refund",
      reference:   post_id ? String(post_id) : null,
    });
    logger.error({ err: creditErr }, "tip: credit insert failed — refunded sender");
    res.status(500).json({ error: "Tip could not be delivered; you were refunded.", code: "CREDIT_ERROR" });
    return;
  }

  logger.info({ from: user.id, to: creator_id, amount: tipAmount, post_id }, "tip sent");

  res.json({
    ok:         true,
    amount:     tipAmount,
    creator:    creator.name,
    newBalance: balance - tipAmount,
  });
});

export default router;
