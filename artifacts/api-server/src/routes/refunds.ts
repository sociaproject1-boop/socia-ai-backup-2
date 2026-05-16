/**
 * User-facing refund routes.
 *
 * All routes require a valid Supabase JWT (requireAuth middleware).
 *
 * Routes:
 *   GET  /api/refunds/estimate  — usage-based estimate (subscription-level)
 *   GET  /api/refunds/my        — list user's own requests
 *   POST /api/refunds/request   — submit a request (order-level or subscription-level)
 *
 * Abuse guards (order-level path):
 *   • 72-hour window from approval date
 *   • per-order: blocked if a previous request was rejected
 *   • general: 48-hour cooldown after ≥2 rejections in 30 days
 *   • global abuse score threshold (from computeRefundAbuseScore)
 */

import { Router } from "express";
import { requireAuth, getAuthedUser, getRequestSupabase } from "../lib/supabaseAuth.js";
import {
  estimateCreatorRefund, estimateAIRefund, computeRefundAbuseScore,
} from "../lib/refundCalculator.js";

const router = Router();

/** Configurable refund window in hours. Requests outside this window are blocked. */
const REFUND_WINDOW_HOURS = 72;
/** Cooldown in hours applied after ≥2 rejections within 30 days. */
const REJECTION_COOLDOWN_HOURS = 48;

const ALL_VALID_REASONS = [
  "unused", "partial", "technical", "billing_error", "other",
  "accidental_payment", "duplicate_payment", "wrong_amount",
  "unauthorized", "service_issue",
];

/* ── GET /api/refunds/estimate ───────────────────────────────────────── */
router.get("/refunds/estimate", requireAuth, async (req, res): Promise<void> => {
  const supabase = getRequestSupabase(req);
  const user     = getAuthedUser(req);
  const type     = (req.query["type"] as string) ?? "creator";

  try {
    const estimate = type === "ai"
      ? await estimateAIRefund(supabase, user.id)
      : await estimateCreatorRefund(supabase, user.id);
    res.json({ estimate });
  } catch (err) {
    req.log.error({ err }, "refund estimate failed");
    res.status(500).json({ code: "ESTIMATE_ERROR", message: "Could not compute estimate." });
  }
});

/* ── GET /api/refunds/my ─────────────────────────────────────────────── */
router.get("/refunds/my", requireAuth, async (req, res): Promise<void> => {
  const supabase = getRequestSupabase(req);

  const { data, error } = await supabase
    .from("refund_requests")
    .select("id,order_id,receipt_id,subscription_type,plan_code,payment_amount_php,estimated_refundable_php,approved_amount_php,reason,status,is_flagged,verification_status,refund_risk_score,payout_method,payout_account_name,created_at,updated_at,admin_notes")
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    res.status(500).json({ code: "DB_ERROR", message: error.message });
    return;
  }
  res.json({ requests: data ?? [] });
});

/* ── POST /api/refunds/request ───────────────────────────────────────── */
router.post("/refunds/request", requireAuth, async (req, res): Promise<void> => {
  const supabase = getRequestSupabase(req);
  const user     = getAuthedUser(req);

  const {
    subscription_type,
    order_id,
    reason,
    description,
    payment_reference,
    screenshot_url,
    requested_amount_php,
    receipt_id,
    payout_method,
    payout_account_number,
    payout_account_name,
  } = req.body ?? {};

  /* ── Payout method validation (order-level only — applied below) ───── */
  const VALID_PAYOUT_METHODS = ["gcash", "maya", "bank", "other"];
  if (payout_method && !VALID_PAYOUT_METHODS.includes(String(payout_method))) {
    res.status(400).json({ code: "INVALID_PAYOUT_METHOD", message: `payout_method must be one of: ${VALID_PAYOUT_METHODS.join(", ")}` });
    return;
  }

  /* ── Validate common inputs ──────────────────────────────────────── */
  if (!ALL_VALID_REASONS.includes(reason as string)) {
    res.status(400).json({ code: "INVALID_REASON", message: `reason must be one of: ${ALL_VALID_REASONS.join(", ")}` });
    return;
  }
  if (!description || typeof description !== "string" || description.trim().length < 10) {
    res.status(400).json({ code: "DESCRIPTION_REQUIRED", message: "Please provide at least 10 characters." });
    return;
  }

  /* ══════════════════════════════════════════════════════════════════
   *  ORDER-LEVEL billing support (specific payment order)
   * ══════════════════════════════════════════════════════════════════ */
  if (order_id) {
    // 1. Fetch the order + verify ownership
    const { data: orderRow, error: orderErr } = await supabase
      .from("payment_orders")
      .select("id, amount_php, kind, plan_code, topup_code, status, user_id, reviewed_at, created_at")
      .eq("id", String(order_id))
      .maybeSingle();

    if (orderErr) {
      req.log.error({ err: orderErr, order_id }, "payment_orders lookup failed");
      res.status(500).json({ code: "DB_ERROR", message: orderErr.message });
      return;
    }
    if (!orderRow) {
      res.status(404).json({ code: "ORDER_NOT_FOUND", message: "Payment order not found." });
      return;
    }
    const order = orderRow as {
      id: string; amount_php: number; kind: string;
      plan_code: string | null; topup_code: string | null;
      status: string; user_id: string;
      reviewed_at: string | null; created_at: string;
    };
    if (order.user_id !== user.id) {
      res.status(403).json({ code: "FORBIDDEN", message: "This order does not belong to your account." });
      return;
    }
    if (order.status !== "approved") {
      res.status(422).json({ code: "ORDER_NOT_APPROVED", message: "Only approved payments can have a billing issue filed." });
      return;
    }

    // 2. Refund window check — measure from approval date (reviewed_at) or
    //    order creation date (created_at) if the admin timestamp is absent.
    const approvedAt = order.reviewed_at ?? order.created_at;
    const ageMs      = Date.now() - new Date(approvedAt).getTime();
    if (ageMs > REFUND_WINDOW_HOURS * 3_600_000) {
      res.status(422).json({
        code: "WINDOW_EXPIRED",
        message: `Billing support requests must be submitted within ${REFUND_WINDOW_HOURS} hours of payment approval. Please contact support directly for older payments.`,
      });
      return;
    }

    // 3. Per-order rejected guard — once rejected, direct to support
    const { data: rejectedForOrder } = await supabase
      .from("refund_requests")
      .select("id")
      .eq("order_id", order.id)
      .eq("status", "rejected")
      .maybeSingle();
    if (rejectedForOrder) {
      res.status(422).json({
        code: "PREVIOUSLY_REJECTED",
        message: "A previous billing issue for this payment was reviewed and closed. Please contact our support team directly for further assistance.",
      });
      return;
    }

    // 4. Global abuse score
    const { score: abuseScore, reason: abuseReason } = await computeRefundAbuseScore(supabase, user.id);
    if (abuseScore >= 90) {
      res.status(429).json({ code: "REFUND_ABUSE", message: "Please contact support directly." });
      return;
    }

    // 5. General rejection cooldown — ≥2 rejections in 30 days, last < REJECTION_COOLDOWN_HOURS ago
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 3_600_000).toISOString();
    const { data: recentRejections } = await supabase
      .from("refund_requests")
      .select("id, updated_at")
      .eq("user_id", user.id)
      .eq("status", "rejected")
      .gte("updated_at", thirtyDaysAgo)
      .order("updated_at", { ascending: false });

    if (recentRejections && recentRejections.length >= 2) {
      const lastMs    = new Date((recentRejections[0] as { updated_at: string }).updated_at).getTime();
      const remaining = REJECTION_COOLDOWN_HOURS * 3_600_000 - (Date.now() - lastMs);
      if (remaining > 0) {
        const hoursLeft = Math.ceil(remaining / 3_600_000);
        res.status(429).json({
          code: "COOLDOWN_ACTIVE",
          message: `Multiple recent requests have been reviewed and declined. Please wait ${hoursLeft} hour${hoursLeft !== 1 ? "s" : ""} before submitting a new request, or contact support directly.`,
        });
        return;
      }
    }

    // 6. Duplicate guard — one active (pending/reviewing) per order
    const { data: existing } = await supabase
      .from("refund_requests")
      .select("id, status")
      .eq("order_id", order.id)
      .in("status", ["pending", "reviewing"])
      .maybeSingle();
    if (existing) {
      res.status(409).json({ code: "ALREADY_REQUESTED", message: "A billing issue for this payment is already under review." });
      return;
    }

    // 7. Receipt verification check
    let receiptData: {
      extracted_reference: string | null;
      fraud_score: number;
      block_code: string | null;
    } | null = null;

    if (receipt_id && typeof receipt_id === "string") {
      // Select block_code (added in migration 21); fall back gracefully if column is absent
      let receiptRow: Record<string, unknown> | null = null;
      let rErr: unknown = null;

      const attempt1 = await supabase
        .from("payment_receipts")
        .select("id, extracted_reference, fraud_score, block_code")
        .eq("id", receipt_id)
        .eq("user_id", user.id)
        .maybeSingle();

      if (attempt1.error) {
        // Column may not exist yet — retry without block_code
        const attempt2 = await supabase
          .from("payment_receipts")
          .select("id, extracted_reference, fraud_score")
          .eq("id", receipt_id)
          .eq("user_id", user.id)
          .maybeSingle();
        receiptRow = attempt2.data as Record<string, unknown> | null;
        rErr       = attempt2.error;
      } else {
        receiptRow = attempt1.data as Record<string, unknown> | null;
      }

      if (rErr || !receiptRow) {
        res.status(400).json({ code: "INVALID_RECEIPT", message: "Receipt not found. Please re-upload your receipt and try again." });
        return;
      }

      const r = {
        extracted_reference: receiptRow["extracted_reference"] as string | null,
        fraud_score:         Number(receiptRow["fraud_score"] ?? 0),
        block_code:          (receiptRow["block_code"] as string | null) ?? null,
      };

      // Hard-block codes that prevent submission.
      // NOTE: "blurred_image" is intentionally excluded — blurry receipts
      // are accepted and routed to manual review per fraud prevention spec.
      const HARD_BLOCK_CODES = new Set([
        "mismatch", "duplicate_receipt", "duplicate_reference",
        "tampered_receipt", "invalid_receipt",
      ]);
      const BLOCK_MESSAGES: Record<string, string> = {
        mismatch:
          "The reference number on your receipt doesn't match what you entered. Please re-upload a screenshot with the correct reference number.",
        duplicate_receipt:
          "This receipt image has already been used in a previous refund request. Please upload a different payment screenshot.",
        duplicate_reference:
          "This payment reference number is already linked to another account or request. Contact support if you believe this is an error.",
        tampered_receipt:
          "Your receipt image appears to have been modified or edited. Please upload an unaltered screenshot directly from your GCash/Maya/bank app.",
        invalid_receipt:
          "Your receipt could not be verified. Please upload a clear screenshot where the payment reference number is visible.",
      };

      if (r.block_code && HARD_BLOCK_CODES.has(r.block_code)) {
        res.status(422).json({
          code:      "RECEIPT_BLOCKED",
          block_code: r.block_code,
          message:   BLOCK_MESSAGES[r.block_code] ?? "Your receipt could not be verified. Please upload your receipt again.",
        });
        return;
      }

      // Fallback for pre-migration receipts: use fraud_score
      if (!r.block_code && r.fraud_score >= 80) {
        res.status(422).json({
          code:      "RECEIPT_BLOCKED",
          block_code: "invalid_receipt",
          message:   BLOCK_MESSAGES["invalid_receipt"]!,
        });
        return;
      }

      receiptData = r;
    }

    // 8. Insert
    const row: Record<string, unknown> = {
      user_id:                  user.id,
      order_id:                 order.id,
      subscription_type:        "creator",
      plan_code:                order.plan_code ?? order.topup_code ?? "order",
      payment_amount_php:       Number(order.amount_php),
      estimated_used_php:       0,
      estimated_refundable_php: Number(order.amount_php),
      reason,
      description:              description.trim().slice(0, 2000),
      screenshot_url:           screenshot_url ?? null,
      payment_reference:        payment_reference ? String(payment_reference).trim().slice(0, 100) : null,
      requested_amount_php:     requested_amount_php ?? null,
      abuse_score:              abuseScore,
      is_flagged:               abuseScore >= 50,
      flag_reason:              abuseScore >= 50 ? abuseReason : null,
      status:                   "pending",
      credits_total:            0, credits_used: 0, credits_remaining: 0,
      ai_requests_used:         0, ai_requests_limit: 0,
      receipt_id:               (receipt_id && typeof receipt_id === "string") ? receipt_id : null,
      payout_method:            payout_method ? String(payout_method) : null,
      payout_account_number:    payout_account_number ? String(payout_account_number).trim().slice(0, 50) : null,
      payout_account_name:      payout_account_name   ? String(payout_account_name).trim().slice(0, 100)  : null,
      detected_reference:       receiptData?.extracted_reference ?? null,
      refund_risk_score:        receiptData?.fraud_score ?? 0,
      verification_status:      receiptData
        ? (receiptData.block_code ? "blocked" : receiptData.fraud_score >= 40 ? "suspicious" : "verified")
        : "pending",
    };

    const { data: inserted, error: insertError } = await supabase
      .from("refund_requests")
      .insert(row)
      .select("id, status, payment_amount_php")
      .single();

    if (insertError) {
      req.log.error({ err: insertError }, "order billing-issue insert failed");
      res.status(500).json({ code: "INSERT_ERROR", message: insertError.message });
      return;
    }

    const insertedId = (inserted as { id: string }).id;

    // Link the receipt row back to this refund request
    if (receipt_id && typeof receipt_id === "string") {
      await supabase
        .from("payment_receipts")
        .update({ refund_request_id: insertedId })
        .eq("id", receipt_id)
        .eq("user_id", user.id);
    }

    req.log.info({ userId: user.id, order_id: order.id, id: insertedId, hasReceipt: !!receipt_id }, "billing issue submitted");
    res.status(201).json({
      ok: true,
      request: inserted,
      message: "Your billing issue has been submitted. Our team will review it within 1–3 business days.",
    });
    return;
  }

  /* ══════════════════════════════════════════════════════════════════
   *  SUBSCRIPTION-LEVEL refund (usage-based)
   * ══════════════════════════════════════════════════════════════════ */
  if (!["creator", "ai"].includes(subscription_type as string)) {
    res.status(400).json({ code: "INVALID_TYPE", message: "subscription_type must be 'creator' or 'ai'." });
    return;
  }

  const { score: abuseScore, reason: abuseReason } = await computeRefundAbuseScore(supabase, user.id);
  if (abuseScore >= 90) {
    res.status(429).json({ code: "REFUND_ABUSE", message: "Please contact support directly." });
    return;
  }

  let estimate: Awaited<ReturnType<typeof estimateCreatorRefund>> | Awaited<ReturnType<typeof estimateAIRefund>>;
  try {
    estimate = subscription_type === "ai"
      ? await estimateAIRefund(supabase, user.id)
      : await estimateCreatorRefund(supabase, user.id);
  } catch (err) {
    req.log.error({ err }, "refund estimate failed during request");
    res.status(500).json({ code: "ESTIMATE_ERROR", message: "Could not compute refund estimate." });
    return;
  }

  if (!estimate.refund_eligible) {
    res.status(422).json({
      code: "NOT_ELIGIBLE",
      message: estimate.ineligible_reason ?? "This subscription is not eligible for a refund.",
    });
    return;
  }

  const row: Record<string, unknown> = {
    user_id:                   user.id,
    subscription_type,
    plan_code:                 estimate.plan_code,
    payment_amount_php:        estimate.payment_amount_php,
    estimated_used_php:        estimate.estimated_used_php,
    estimated_refundable_php:  estimate.estimated_refundable_php,
    requested_amount_php:      requested_amount_php ?? null,
    reason,
    description:               description.trim().slice(0, 2000),
    screenshot_url:            screenshot_url ?? null,
    abuse_score:               abuseScore,
    is_flagged:                abuseScore >= 50,
    flag_reason:               abuseScore >= 50 ? abuseReason : null,
    status:                    "pending",
    credits_total:             "credits_total"     in estimate ? estimate.credits_total     : 0,
    credits_used:              "credits_used"      in estimate ? estimate.credits_used      : 0,
    credits_remaining:         "credits_remaining" in estimate ? estimate.credits_remaining : 0,
    ai_requests_used:          "ai_requests_used"  in estimate ? estimate.ai_requests_used  : 0,
    ai_requests_limit:         "ai_requests_limit" in estimate ? estimate.ai_requests_limit : 0,
  };

  if (subscription_type === "creator" && "payment_reference" in estimate && estimate.payment_reference) {
    row["payment_reference"] = estimate.payment_reference;
  }
  if (payment_reference) row["payment_reference"] = String(payment_reference).trim().slice(0, 100);

  const { data: inserted, error: insertError } = await supabase
    .from("refund_requests")
    .insert(row)
    .select("id, status, estimated_refundable_php")
    .single();

  if (insertError) {
    req.log.error({ err: insertError }, "refund insert failed");
    res.status(500).json({ code: "INSERT_ERROR", message: insertError.message });
    return;
  }

  req.log.info({ userId: user.id, subscription_type, id: (inserted as { id: string }).id }, "refund request submitted");
  res.status(201).json({
    ok: true,
    request: inserted,
    estimate,
    message: "Your billing issue has been submitted and is pending review. We will notify you once a decision is made.",
  });
});

export default router;
