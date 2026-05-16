/**
 * AI Plan REST endpoints — completely separate from creator billing.
 *
 * GET  /api/ai/plans     — list all available AI plans (public)
 * GET  /api/ai/plan      — current user's AI plan (authed)
 * GET  /api/ai/usage     — current user's usage stats (authed)
 * POST /api/ai/subscribe — mock subscribe (placeholder for PayMongo/Stripe)
 */
import { Router } from "express";
import { requireAuth, getAuthedUser, getRequestSupabase } from "../lib/supabaseAuth.js";
import { AI_PLANS, fetchAIPlan } from "../lib/aiSubscription.js";
import { getUsageStats } from "../lib/aiRateLimit.js";
import { logger } from "../lib/logger.js";

const router = Router();

/* ── Public plan catalog ──────────────────────────────────────────────── */

router.get("/ai/plans", (_req, res) => {
  const plans = [
    {
      code:         "free",
      label:        "Free AI",
      price_php:    0,
      period:       null,
      model:        "GPT-4o Mini",
      dailyLimit:   15,
      monthlyLimit: null,
      cooldownSec:  20,
      maxWords:     300,
      features: [
        "15 messages per day",
        "GPT-4o Mini model",
        "20-second cooldown",
        "Max 300 words per message",
        "Basic conversations",
        "Multimodal (image, audio, video)",
      ],
      limitations: [
        "No advanced reasoning",
        "No long-term memory",
        "Low queue priority",
      ],
    },
    {
      code:         "premium",
      label:        "Premium AI",
      price_php:    299,
      period:       "month",
      model:        "GPT-4o",
      dailyLimit:   null,
      monthlyLimit: 300,
      cooldownSec:  8,
      maxWords:     4000,
      features: [
        "300 AI requests / month",
        "GPT-4o model",
        "8-second cooldown",
        "Max 4,000 words per message",
        "Faster responses",
        "Multimodal (image, audio, video)",
        "Moderate memory & context",
        "Medium queue priority",
      ],
      limitations: [],
    },
    {
      code:         "ultra",
      label:        "Ultra Pro",
      price_php:    999,
      period:       "month",
      model:        "o1-mini",
      dailyLimit:   null,
      monthlyLimit: 120,
      cooldownSec:  20,
      maxWords:     8000,
      features: [
        "120 ultra requests / month",
        "o1-mini reasoning model",
        "Advanced reasoning & analysis",
        "Max 8,000 words per message",
        "Top queue priority",
        "Business & coding workflows",
        "Multimodal (image, audio, video)",
        "Expert-level AI outputs",
      ],
      limitations: [],
    },
  ];
  res.json({ plans });
});

/* ── Current user's AI plan ───────────────────────────────────────────── */

router.get("/ai/plan", requireAuth, async (req, res): Promise<void> => {
  try {
    const user     = getAuthedUser(req);
    const supabase = getRequestSupabase(req);
    const plan     = await fetchAIPlan(supabase, user.id);
    res.json({ plan });
  } catch (err) {
    logger.error({ err }, "GET /ai/plan error");
    res.status(500).json({ error: "Failed to fetch AI plan", code: "INTERNAL" });
  }
});

/* ── Current user's usage stats ──────────────────────────────────────── */

router.get("/ai/usage", requireAuth, async (req, res): Promise<void> => {
  try {
    const user     = getAuthedUser(req);
    const supabase = getRequestSupabase(req);
    const plan     = await fetchAIPlan(supabase, user.id);
    const usage    = await getUsageStats(supabase, user.id, plan);
    res.json({ plan: { code: plan.code, label: plan.label, model: plan.model }, usage });
  } catch (err) {
    logger.error({ err }, "GET /ai/usage error");
    res.status(500).json({ error: "Failed to fetch usage", code: "INTERNAL" });
  }
});

/* ── Subscribe / upgrade ─────────────────────────────────────────────────
 *
 * SECURITY: This route is DISABLED until a real payment gateway (GCash /
 * Maya / PayMongo) is integrated and payment verification is complete.
 *
 * The previous implementation activated subscriptions immediately without
 * any payment proof, allowing any authenticated user to obtain Premium AI
 * or Ultra Pro for free.
 *
 * DO NOT re-enable without:
 *   1. A verified payment webhook or reference check
 *   2. Setting status = 'pending' (not 'active') on insert
 *   3. A separate admin-approval or webhook-confirmation step
 * ─────────────────────────────────────────────────────────────────────── */

router.post("/ai/subscribe", requireAuth, (_req, res): void => {
  res.status(503).json({
    error: "AI plan upgrades are not yet available. Online payment verification is pending integration. Please contact support to manually activate a plan.",
    code: "PAYMENT_NOT_IMPLEMENTED",
  });
});

/* ── Cancel AI subscription ───────────────────────────────────────────── */

router.post("/ai/cancel", requireAuth, async (req, res): Promise<void> => {
  try {
    const user     = getAuthedUser(req);
    const supabase = getRequestSupabase(req);

    await supabase
      .from("ai_subscriptions")
      .update({ status: "cancelled", updated_at: new Date().toISOString() })
      .eq("user_id", user.id)
      .eq("status", "active");

    logger.info({ userId: user.id }, "AI subscription cancelled");
    res.json({ message: "AI subscription cancelled." });
  } catch (err) {
    logger.error({ err }, "POST /ai/cancel error");
    res.status(500).json({ error: "Cancellation failed", code: "INTERNAL" });
  }
});

export default router;
