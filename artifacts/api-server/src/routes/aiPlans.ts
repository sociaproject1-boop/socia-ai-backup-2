/**
 * AI Plan REST endpoints — 4-tier subscription system.
 *
 * GET  /api/ai/plans     — list all available AI plans (public)
 * GET  /api/ai/plan      — current user's AI plan (authed)
 * GET  /api/ai/usage     — current user's usage stats (authed)
 * POST /api/ai/subscribe — activate a plan (requires admin approval / payment verification)
 * POST /api/ai/cancel    — cancel current subscription
 */
import { Router } from "express";
import { requireAuth, getAuthedUser, getRequestSupabase } from "../lib/supabaseAuth.js";
import { AI_PLANS, fetchAIPlan } from "../lib/aiSubscription.js";
import { getUsageStats } from "../lib/aiRateLimit.js";
import { logger } from "../lib/logger.js";

const router = Router();

/* ── Public plan catalog ──────────────────────────────────────────── */

router.get("/ai/plans", (_req, res) => {
  const plans = [
    {
      code:         "free",
      label:        "Free",
      brandedModel: "Standard AI",
      price_php:    0,
      price_usd:    0,
      period:       null,
      dailyLimit:   30,
      monthlyLimit: null,
      cooldownSec:  15,
      maxWords:     300,
      features: [
        "30 messages per day",
        "Standard AI model",
        "15-second cooldown",
        "Up to 300 words per message",
        "Image attachments",
        "Basic conversations",
      ],
    },
    {
      code:         "premium",
      label:        "Premium",
      brandedModel: "Advanced AI",
      price_php:    499,
      price_usd:    9.99,
      period:       "month",
      dailyLimit:   150,
      monthlyLimit: null,
      cooldownSec:  3,
      maxWords:     4000,
      features: [
        "150 messages per day",
        "Advanced AI model",
        "3-second soft cooldown",
        "Up to 4,000 words per message",
        "Image, audio & video attachments",
        "5 AI videos per day",
        "20 AI images per day",
        "Faster responses",
        "Higher queue priority",
      ],
    },
    {
      code:         "elite",
      label:        "Elite",
      brandedModel: "Elite AI",
      price_php:    1499,
      price_usd:    24.99,
      period:       "month",
      dailyLimit:   300,
      monthlyLimit: null,
      cooldownSec:  1,
      maxWords:     8000,
      features: [
        "300 messages per day",
        "Elite AI — advanced reasoning",
        "Near-zero cooldown",
        "Up to 8,000 words per message",
        "All attachment types",
        "15 AI videos per day",
        "50 AI images per day",
        "Deep analysis & coding",
        "Extended memory & context",
        "High queue priority",
      ],
    },
    {
      code:         "super-elite",
      label:        "Super Elite",
      brandedModel: "Pro Reasoning",
      price_php:    3999,
      price_usd:    69,
      period:       "month",
      dailyLimit:   500,
      monthlyLimit: null,
      cooldownSec:  0,
      maxWords:     16000,
      features: [
        "500 messages per day",
        "Pro Reasoning — most powerful AI",
        "Instant response, no cooldown",
        "Up to 16,000 words per message",
        "All attachment types",
        "5 cinematic HD videos per day",
        "10 premium images per day",
        "Ultra-deep reasoning & coding",
        "Longest AI memory & context",
        "Top queue priority — always first",
        "Fair-use protected access",
      ],
    },
  ];
  res.json({ plans });
});

/* ── Current user's AI plan ──────────────────────────────────────── */

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

/* ── Current user's usage stats ──────────────────────────────────── */

router.get("/ai/usage", requireAuth, async (req, res): Promise<void> => {
  try {
    const user     = getAuthedUser(req);
    const supabase = getRequestSupabase(req);
    const plan     = await fetchAIPlan(supabase, user.id);
    const usage    = await getUsageStats(supabase, user.id, plan);
    res.json({
      plan: {
        code:         plan.code,
        label:        plan.label,
        brandedModel: plan.brandedModel,
        model:        plan.model,
      },
      usage,
    });
  } catch (err) {
    logger.error({ err }, "GET /ai/usage error");
    res.status(500).json({ error: "Failed to fetch usage", code: "INTERNAL" });
  }
});

/* ── Subscribe / upgrade ────────────────────────────────────────────
 *
 * SECURITY: This route requires a payment reference for verification.
 * Plans are set to status='pending' and require admin approval or
 * webhook confirmation before becoming 'active'.
 *
 * For development/testing: admins can manually set status='active'
 * directly in Supabase.
 * ───────────────────────────────────────────────────────────────── */

router.post("/ai/subscribe", requireAuth, async (req, res): Promise<void> => {
  const user     = getAuthedUser(req);
  const supabase = getRequestSupabase(req);

  const body      = req.body as Record<string, unknown>;
  const planCode  = body.plan_code as string;
  const payRef    = body.payment_reference as string | undefined;

  const VALID_PAID_PLANS = ["premium", "elite", "super-elite"];
  if (!VALID_PAID_PLANS.includes(planCode)) {
    res.status(400).json({ error: "Invalid plan code", code: "INVALID_PLAN" });
    return;
  }

  if (!payRef) {
    // No payment reference — return instructions (not an error, just pending flow)
    res.status(202).json({
      status:  "pending_payment",
      message: "Submit your GCash / Maya / bank reference number to activate your plan.",
      code:    "PAYMENT_REFERENCE_REQUIRED",
      instructions: {
        gcash:    "Send to 09XX-XXX-XXXX then reply with your reference number.",
        maya:     "Send to 09XX-XXX-XXXX then reply with your reference number.",
        bank:     "BDO Account: XXXX-XXXX-XXXX. Include your username in remarks.",
        support:  "Message @SociaSupport on the app for assisted activation.",
      },
    });
    return;
  }

  try {
    // Insert as 'pending' — requires admin approval to activate
    const { error } = await supabase
      .from("ai_subscriptions")
      .insert({
        user_id:           user.id,
        plan_code:         planCode,
        status:            "pending",
        payment_reference: payRef,
        expires_at:        null,
        created_at:        new Date().toISOString(),
      });

    if (error) {
      logger.error({ err: error, userId: user.id, planCode }, "POST /ai/subscribe insert error");
      res.status(500).json({ error: "Failed to submit subscription request.", code: "INTERNAL" });
      return;
    }

    logger.info({ userId: user.id, planCode, payRef }, "AI subscription request submitted");
    res.json({
      status:  "pending",
      message: `Your ${planCode} subscription request has been submitted. Our team will verify your payment and activate your plan within 24 hours.`,
    });
  } catch (err) {
    logger.error({ err }, "POST /ai/subscribe error");
    res.status(500).json({ error: "Subscription failed. Please try again.", code: "INTERNAL" });
  }
});

/* ── Cancel AI subscription ──────────────────────────────────────── */

router.post("/ai/cancel", requireAuth, async (req, res): Promise<void> => {
  try {
    const user     = getAuthedUser(req);
    const supabase = getRequestSupabase(req);

    await supabase
      .from("ai_subscriptions")
      .update({ status: "cancelled", updated_at: new Date().toISOString() })
      .eq("user_id", user.id)
      .in("status", ["active", "pending"]);

    logger.info({ userId: user.id }, "AI subscription cancelled");
    res.json({ message: "Your AI subscription has been cancelled." });
  } catch (err) {
    logger.error({ err }, "POST /ai/cancel error");
    res.status(500).json({ error: "Cancellation failed", code: "INTERNAL" });
  }
});

export default router;
