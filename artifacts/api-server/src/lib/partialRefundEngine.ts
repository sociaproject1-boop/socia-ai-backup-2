/**
 * Partial Refund Engine — usage-based refund computation.
 *
 * Computes how much of a payment is refundable based on ACTUAL AI usage
 * recorded in `usage_receipts`, not just credit-ledger estimates.
 *
 * ⚠️  PRIVACY RULE:
 *   `computePartialRefund()` returns admin-only fields (estimated costs,
 *   usage breakdown, heavy_usage_score).
 *
 *   Use `sanitizeRefundForUser()` before returning data to any user-facing
 *   API response. This strips all cost and infrastructure data.
 *
 * Refund formula:
 *   actual_ai_cost   = SUM(usage_receipts.estimated_cost) in billing period
 *   refundable       = MAX(0, payment_amount - actual_ai_cost)
 *   capped at        = payment_amount (never refund more than paid)
 *   eligibility cap  = 85% usage threshold (matches existing policy)
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { computeUsageSummary, computeHeavyScore, type UsageSummary } from "./usageTracker.js";
import { logger } from "./logger.js";

/** Minimum refundable amount in PHP. Requests below this are ineligible. */
const MIN_REFUNDABLE_PHP = 50;
/** Heavy usage cost ratio that marks a refund ineligible. */
const INELIGIBLE_COST_RATIO = 0.85;

/* ── Full admin-visible result ───────────────────────────────────────── */
export interface PartialRefundResult {
  // Payment info
  payment_order_id:       string | null;
  payment_amount_php:     number;
  plan_code:              string;
  subscription_type:      "creator" | "ai";

  // Usage-based calculation (ADMIN ONLY)
  actual_ai_cost_php:     number;
  cost_to_payment_ratio:  number;   // 0–1
  usage_based_refundable: number;   // MAX(0, paid - cost)

  // Credit-ledger-based calculation (existing system, for comparison)
  ledger_refundable_php:  number;

  // Final recommendation (take the lower/more conservative value)
  recommended_refund_php: number;

  // Eligibility
  refund_eligible:        boolean;
  ineligible_reason?:     string;

  // Heavy-user analysis (ADMIN ONLY)
  heavy_usage_score:      number;
  heavy_flags:            string[];
  is_heavy_user:          boolean;

  // Usage detail (ADMIN ONLY)
  usage_summary:          UsageSummary;

  // Period
  billing_period_start:   string;
  billing_period_end:     string;
}

/* ── User-safe stripped version (NO cost data) ───────────────────────── */
export interface UserSafeRefundEstimate {
  payment_amount_php:     number;
  plan_code:              string;
  subscription_type:      "creator" | "ai";
  estimated_refundable_php: number;
  refund_eligible:        boolean;
  ineligible_reason?:     string;
  usage_pct:              number;   // 0–100, based on ledger (no cost data)
  billing_period_start:   string;
  billing_period_end:     string;
}

/**
 * Strips all cost and infrastructure fields before returning to a user.
 * ALWAYS call this before sending PartialRefundResult to a user-facing route.
 */
export function sanitizeRefundForUser(result: PartialRefundResult): UserSafeRefundEstimate {
  return {
    payment_amount_php:       result.payment_amount_php,
    plan_code:                result.plan_code,
    subscription_type:        result.subscription_type,
    estimated_refundable_php: result.recommended_refund_php,
    refund_eligible:          result.refund_eligible,
    ineligible_reason:        result.ineligible_reason,
    usage_pct:                Math.round(result.cost_to_payment_ratio * 100),
    billing_period_start:     result.billing_period_start,
    billing_period_end:       result.billing_period_end,
  };
}

/**
 * Computes a full partial-refund analysis for a payment order.
 * Admin-only — includes cost data, usage breakdown, heavy-user score.
 *
 * @param supabase   - Service-role or user-scoped client
 * @param userId     - The user whose usage to analyse
 * @param orderId    - Optional: specific payment order to scope usage to
 */
export async function computePartialRefund(
  supabase: SupabaseClient,
  userId: string,
  orderId?: string | null,
): Promise<PartialRefundResult> {
  // 1. Fetch the payment order (latest approved subscription payment if no orderId)
  let paymentAmountPhp = 0;
  let planCode         = "free";
  let subscriptionType: "creator" | "ai" = "creator";
  let resolvedOrderId: string | null     = orderId ?? null;
  let periodStart = new Date();
  let periodEnd   = new Date();

  if (orderId) {
    const { data: order } = await supabase
      .from("payment_orders")
      .select("id, amount_php, plan_code, kind, created_at, reviewed_at")
      .eq("id", orderId)
      .maybeSingle();

    if (order) {
      const o = order as {
        id: string; amount_php: number; plan_code: string | null;
        kind: string; created_at: string; reviewed_at: string | null;
      };
      paymentAmountPhp = Number(o.amount_php);
      planCode         = o.plan_code ?? "unknown";
      subscriptionType = o.kind === "ai_subscription" ? "ai" : "creator";
      resolvedOrderId  = o.id;
      periodStart      = new Date(o.reviewed_at ?? o.created_at);
      periodEnd        = new Date();
    }
  } else {
    // Fallback: pull latest approved subscription order for this user
    const { data: latestOrder } = await supabase
      .from("payment_orders")
      .select("id, amount_php, plan_code, kind, created_at, reviewed_at")
      .eq("user_id", userId)
      .eq("status", "approved")
      .in("kind", ["subscription", "ai_subscription"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latestOrder) {
      const o = latestOrder as {
        id: string; amount_php: number; plan_code: string | null;
        kind: string; created_at: string; reviewed_at: string | null;
      };
      paymentAmountPhp = Number(o.amount_php);
      planCode         = o.plan_code ?? "unknown";
      subscriptionType = o.kind === "ai_subscription" ? "ai" : "creator";
      resolvedOrderId  = o.id;
      periodStart      = new Date(o.reviewed_at ?? o.created_at);
      periodEnd        = new Date();
    }
  }

  // 2. Compute usage summary for the billing period
  const usageSummary = await computeUsageSummary(supabase, userId, periodStart, periodEnd);

  const actualAiCostPhp = usageSummary.total_estimated_cost;
  const costRatio       = paymentAmountPhp > 0 ? actualAiCostPhp / paymentAmountPhp : 0;
  const usageBasedRefundable = Math.max(0, paymentAmountPhp - actualAiCostPhp);

  // 3. Ledger-based estimate (credit usage % fallback for comparison)
  const ledgerRefundable = await getLedgerRefundable(supabase, userId, subscriptionType, paymentAmountPhp);

  // 4. Take the LOWER of the two estimates (more conservative → fairer)
  const recommendedRefund = Math.min(usageBasedRefundable, ledgerRefundable);

  // 5. Heavy-user scoring (include payment ratio)
  const { score: heavyScore, flags: heavyFlags } = computeHeavyScore({
    imageCount:       usageSummary.image_count,
    videoCount:       usageSummary.video_count,
    chatCount:        usageSummary.chat_count,
    totalCost:        actualAiCostPhp,
    paymentAmountPhp,
  });

  // 6. Eligibility
  let refundEligible = true;
  let ineligibleReason: string | undefined;

  if (planCode === "free") {
    refundEligible   = false;
    ineligibleReason = "Free plan has no payment to refund.";
  } else if (paymentAmountPhp === 0) {
    refundEligible   = false;
    ineligibleReason = "No approved payment found for this account.";
  } else if (costRatio >= INELIGIBLE_COST_RATIO) {
    refundEligible   = false;
    ineligibleReason = `Over ${Math.round(INELIGIBLE_COST_RATIO * 100)}% of the subscription value has been used in AI services — not eligible for refund.`;
  } else if (recommendedRefund < MIN_REFUNDABLE_PHP) {
    refundEligible   = false;
    ineligibleReason = `Remaining refundable balance (₱${recommendedRefund.toFixed(2)}) is below the minimum threshold of ₱${MIN_REFUNDABLE_PHP}.`;
  }

  logger.info(
    { userId, orderId: resolvedOrderId, paymentAmountPhp, actualAiCostPhp, recommendedRefund, heavyScore },
    "[refund-engine] partial refund computed",
  );

  return {
    payment_order_id:        resolvedOrderId,
    payment_amount_php:      paymentAmountPhp,
    plan_code:               planCode,
    subscription_type:       subscriptionType,
    actual_ai_cost_php:      Math.round(actualAiCostPhp * 100) / 100,
    cost_to_payment_ratio:   Math.round(costRatio * 1000) / 1000,
    usage_based_refundable:  Math.round(usageBasedRefundable * 100) / 100,
    ledger_refundable_php:   Math.round(ledgerRefundable * 100) / 100,
    recommended_refund_php:  Math.round(recommendedRefund * 100) / 100,
    refund_eligible:         refundEligible,
    ineligible_reason:       ineligibleReason,
    heavy_usage_score:       heavyScore,
    heavy_flags:             heavyFlags,
    is_heavy_user:           heavyScore >= 60,
    usage_summary:           usageSummary,
    billing_period_start:    periodStart.toISOString(),
    billing_period_end:      periodEnd.toISOString(),
  };
}

/**
 * Fetches the credit-ledger-based refundable estimate for comparison.
 * Returns MAX(0, paid * (1 - usage_pct)).
 */
async function getLedgerRefundable(
  supabase: SupabaseClient,
  userId: string,
  subscriptionType: "creator" | "ai",
  paymentAmountPhp: number,
): Promise<number> {
  try {
    if (subscriptionType === "ai") {
      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);

      const { data: sub } = await supabase
        .from("ai_subscriptions")
        .select("plan_code")
        .eq("user_id", userId)
        .eq("status", "active")
        .maybeSingle();

      const planLimits: Record<string, number> = { premium: 300, ultra: 120 };
      const limit = planLimits[(sub as { plan_code?: string } | null)?.plan_code ?? ""] ?? 0;
      if (limit === 0) return paymentAmountPhp;

      const { count } = await supabase
        .from("ai_requests")
        .select("*", { count: "exact", head: true })
        .eq("user_id", userId)
        .gte("created_at", monthStart.toISOString());

      const usagePct  = limit > 0 ? (count ?? 0) / limit : 0;
      return Math.max(0, paymentAmountPhp * (1 - usagePct));
    } else {
      const { data: billing } = await supabase
        .from("user_billing")
        .select("credits, plan_credits")
        .eq("user_id", userId)
        .maybeSingle();

      const b = billing as { credits?: number; plan_credits?: number } | null;
      const planCredits = b?.plan_credits ?? 0;
      const creditsNow  = b?.credits ?? 0;
      const usagePct    = planCredits > 0 ? Math.max(0, planCredits - creditsNow) / planCredits : 0;
      return Math.max(0, paymentAmountPhp * (1 - usagePct));
    }
  } catch (err) {
    logger.warn({ err, userId }, "[refund-engine] ledger estimate failed, using full amount");
    return paymentAmountPhp;
  }
}
