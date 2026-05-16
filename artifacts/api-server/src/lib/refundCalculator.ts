/**
 * Refund Calculator — estimates how much of a subscription is refundable
 * based on actual usage recorded in Supabase.
 *
 * Rules:
 *   • Creator: refund proportion = credits_remaining / credits_granted
 *   • AI: refund proportion = (limit - used) / limit  (monthly)
 *   • Hard cap: never refund more than the original payment
 *   • Anti-abuse: if credits_used > 80% of plan, refundable = 0
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export interface CreatorRefundEstimate {
  type:                "creator";
  plan_code:           string;
  payment_amount_php:  number;
  credits_total:       number;
  credits_used:        number;
  credits_remaining:   number;
  usage_pct:           number;
  estimated_used_php:  number;
  estimated_refundable_php: number;
  refund_eligible:     boolean;
  ineligible_reason?:  string;
  payment_reference?:  string;
}

export interface AIRefundEstimate {
  type:                "ai";
  plan_code:           string;
  payment_amount_php:  number;
  ai_requests_used:    number;
  ai_requests_limit:   number;
  usage_pct:           number;
  estimated_used_php:  number;
  estimated_refundable_php: number;
  refund_eligible:     boolean;
  ineligible_reason?:  string;
}

export type RefundEstimate = CreatorRefundEstimate | AIRefundEstimate;

const AI_PLAN_PRICES: Record<string, { price: number; limit: number }> = {
  premium: { price: 299, limit: 300 },
  ultra:   { price: 999, limit: 120 },
};

const CREATOR_PLAN_PRICES: Record<string, number> = {
  p15: 1200,
  p30: 1700,
};

/** Abuse threshold — if user consumed more than this fraction, no refund. */
const ABUSE_THRESHOLD = 0.85;

export async function estimateCreatorRefund(
  supabase: SupabaseClient,
  userId: string,
): Promise<CreatorRefundEstimate> {
  // 1. Get current billing snapshot
  const { data: billing } = await supabase
    .from("user_billing")
    .select("credits, plan_code, plan_credits, plan_started_at, plan_expires_at")
    .eq("user_id", userId)
    .maybeSingle();

  const planCode      = (billing?.plan_code as string) ?? "free";
  const planCredits   = (billing?.plan_credits as number) ?? 0;
  const creditsNow    = (billing?.credits as number) ?? 0;

  // 2. Get the latest approved payment for this plan
  const { data: lastOrder } = await supabase
    .from("payment_orders")
    .select("amount_php, reference_no, created_at")
    .eq("user_id", userId)
    .eq("status", "approved")
    .eq("kind", "subscription")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const paymentAmountPhp = (lastOrder?.amount_php as number)
    ?? CREATOR_PLAN_PRICES[planCode]
    ?? 0;

  const creditsUsed      = Math.max(0, planCredits - creditsNow);
  const usagePct         = planCredits > 0 ? creditsUsed / planCredits : 0;

  const estimatedUsedPhp      = Math.round(usagePct * paymentAmountPhp);
  const estimatedRefundablePhp = Math.max(0, paymentAmountPhp - estimatedUsedPhp);

  let refundEligible = true;
  let ineligibleReason: string | undefined;

  if (planCode === "free") {
    refundEligible   = false;
    ineligibleReason = "Free plan has no payment to refund.";
  } else if (usagePct >= ABUSE_THRESHOLD) {
    refundEligible   = false;
    ineligibleReason = `Over ${Math.round(ABUSE_THRESHOLD * 100)}% of plan credits were used — not eligible for refund.`;
  } else if (estimatedRefundablePhp < 50) {
    refundEligible   = false;
    ineligibleReason = "Remaining balance is below minimum refundable threshold (₱50).";
  }

  return {
    type:                "creator",
    plan_code:           planCode,
    payment_amount_php:  paymentAmountPhp,
    credits_total:       planCredits,
    credits_used:        creditsUsed,
    credits_remaining:   creditsNow,
    usage_pct:           Math.round(usagePct * 100),
    estimated_used_php:  estimatedUsedPhp,
    estimated_refundable_php: estimatedRefundablePhp,
    refund_eligible:     refundEligible,
    ineligible_reason:   ineligibleReason,
    payment_reference:   lastOrder?.reference_no as string | undefined,
  };
}

export async function estimateAIRefund(
  supabase: SupabaseClient,
  userId: string,
): Promise<AIRefundEstimate> {
  // 1. Get current AI subscription
  const { data: sub } = await supabase
    .from("ai_subscriptions")
    .select("plan_code, amount_paid_php, started_at")
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();

  const planCode   = (sub?.plan_code as string) ?? "free";
  const planConfig = AI_PLAN_PRICES[planCode];

  if (!planConfig || planCode === "free") {
    return {
      type: "ai", plan_code: "free",
      payment_amount_php: 0, ai_requests_used: 0, ai_requests_limit: 0,
      usage_pct: 0, estimated_used_php: 0, estimated_refundable_php: 0,
      refund_eligible: false, ineligible_reason: "Free AI plan has no payment to refund.",
    };
  }

  const paymentAmountPhp = (sub?.amount_paid_php as number) ?? planConfig.price;
  const monthlyLimit     = planConfig.limit;

  // 2. Get monthly usage count
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const { count: requestsUsed } = await supabase
    .from("ai_requests")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", monthStart.toISOString());

  const used    = requestsUsed ?? 0;
  const usagePct = monthlyLimit > 0 ? used / monthlyLimit : 0;

  const estimatedUsedPhp       = Math.round(usagePct * paymentAmountPhp);
  const estimatedRefundablePhp = Math.max(0, paymentAmountPhp - estimatedUsedPhp);

  let refundEligible = true;
  let ineligibleReason: string | undefined;

  if (usagePct >= ABUSE_THRESHOLD) {
    refundEligible   = false;
    ineligibleReason = `Over ${Math.round(ABUSE_THRESHOLD * 100)}% of AI requests were used — not eligible for refund.`;
  } else if (estimatedRefundablePhp < 50) {
    refundEligible   = false;
    ineligibleReason = "Remaining balance is below minimum refundable threshold (₱50).";
  }

  return {
    type:                "ai",
    plan_code:           planCode,
    payment_amount_php:  paymentAmountPhp,
    ai_requests_used:    used,
    ai_requests_limit:   monthlyLimit,
    usage_pct:           Math.round(usagePct * 100),
    estimated_used_php:  estimatedUsedPhp,
    estimated_refundable_php: estimatedRefundablePhp,
    refund_eligible:     refundEligible,
    ineligible_reason:   ineligibleReason,
  };
}

/**
 * Anti-abuse: checks if the user has submitted too many refund requests recently.
 * Returns an abuse score (0 = clean, 100 = maximum abuse).
 */
export async function computeRefundAbuseScore(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ score: number; reason: string | null }> {
  const since30d = new Date(Date.now() - 30 * 86400_000).toISOString();

  const { data: recent } = await supabase
    .from("refund_requests")
    .select("id, status, created_at")
    .eq("user_id", userId)
    .gte("created_at", since30d);

  const requests = (recent ?? []) as { id: string; status: string }[];

  if (requests.length === 0) return { score: 0, reason: null };

  let score = 0;
  let reason: string | null = null;

  // 3+ requests in 30 days → high abuse risk
  if (requests.length >= 3) {
    score = 90;
    reason = `${requests.length} refund requests in the last 30 days.`;
  } else if (requests.length === 2) {
    score = 50;
    reason = "2 refund requests in the last 30 days.";
  } else {
    score = 10;
  }

  // Any prior approval that was then followed by another request → flag
  const approved = requests.filter((r) => r.status === "approved" || r.status === "partial");
  if (approved.length >= 1 && requests.length >= 2) {
    score = Math.min(100, score + 30);
    reason = (reason ? reason + " " : "") + "Prior approved refund found.";
  }

  return { score, reason };
}
