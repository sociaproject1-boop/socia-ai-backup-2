/**
 * Server-side billing helpers.
 *
 * Calls the Supabase SECURITY DEFINER RPCs:
 *   • consume_credits(action) — atomic debit + cooldown evaluation
 *   • refund_credits(amount, reason, ref) — credit-back on provider failure
 *   • my_billing_summary() — read-only snapshot
 *
 * Action codes are the SAME as the cost-map keys in billing-schema.sql §10.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "./logger.js";

export type CreditAction =
  | "std_image"
  | "hd_image"
  | "std_video_5s"
  | "hd_video_5s"
  | "std_video_10s"
  | "hd_video_10s"
  | "multi_frame"
  | "gpt_msg";

export interface ConsumeResult {
  allowed:        boolean;
  balance:        number;
  plan:           "free" | "active" | "owner" | string;
  action:         CreditAction;
  cost:           number;
  smart_saver:    boolean;
  cooldown_until: string | null;
  reason?:        "free_plan" | "insufficient" | "cooldown";
}

/** Server-side mirror of the SQL cost map — used only for refund sizing. */
export const CREDIT_COSTS: Record<CreditAction, number> = {
  std_image:     3,
  hd_image:      10,
  std_video_5s:  20,
  hd_video_5s:   30,
  std_video_10s: 40,
  hd_video_10s:  60,
  multi_frame:   60,
  gpt_msg:       1,
};

export async function consumeCredits(
  supabase: SupabaseClient,
  action: CreditAction,
): Promise<ConsumeResult> {
  const { data, error } = await supabase.rpc("consume_credits", { p_action: action });
  if (error) throw new Error(`consume_credits failed: ${error.message}`);
  if (!data || typeof data !== "object") throw new Error("consume_credits returned no data");
  return data as ConsumeResult;
}

/**
 * Unified generation gate: handles BOTH the daily-quota model (free users)
 * and the credit-ledger model (paid + owner). Routes call this once before
 * launching a generation; on provider failure they call `result.refund()` to
 * credit the user back.
 *
 *  – `freeKind`  → "image" | "video", used to pick the daily-quota bucket.
 *  – `pickAction(smart_saver)` → returns the CreditAction to charge for
 *     a paid user; receives the user's smart_saver flag so callers can swap
 *     HD → standard automatically when the wallet is low.
 */
import type { Request } from "express";
import { consumeGenerationQuota } from "./supabaseAuth.js";

export type GateOk = {
  ok:             true;
  plan:           "free" | "active" | "owner";
  hd_allowed:     boolean;
  smart_saver:    boolean;
  cost:           number;
  balance:        number;
  cooldown_until: string | null;
  /** Daily-quota counters for free users (undefined for paid). */
  remaining?:     number;
  limit?:         number;
  /** Credit-back closure (no-op for free + owner). */
  refund:         (reason: string, ref?: string) => Promise<void>;
};
export type GateFail = {
  ok:     false;
  status: number;
  body:   Record<string, unknown> & { error: string; code: string };
};
export type GateResult = GateOk | GateFail;

export async function gateAndConsume(
  req: Request,
  supabase: SupabaseClient,
  opts: {
    freeKind:    "image" | "video";
    pickAction:  (smart_saver: boolean) => CreditAction;
  },
): Promise<GateResult> {
  // 1. Get plan snapshot.
  const { data: summary, error: sErr } = await supabase.rpc("my_billing_summary");
  if (sErr || !summary) {
    return {
      ok: false, status: 503,
      body: { error: "Billing service temporarily unavailable.", code: "BILLING_UNAVAILABLE" },
    };
  }
  const s = summary as {
    is_owner: boolean; plan_code: string; credits: number;
    smart_saver: boolean; cooldown_until: string | null;
  };

  // 2. Owner — never debit, never block.
  if (s.is_owner) {
    return {
      ok: true, plan: "owner", hd_allowed: true, smart_saver: false,
      cost: 0, balance: Number.MAX_SAFE_INTEGER, cooldown_until: null,
      refund: async () => {},
    };
  }

  // 3. Free — keep daily-quota model.
  if (s.plan_code === "free") {
    const q = await consumeGenerationQuota(supabase, opts.freeKind);
    if (!q.allowed) {
      return {
        ok: false, status: 429,
        body: {
          error: `Free plan limit reached (${q.limit}/day). Upgrade or top up to keep generating.`,
          code: "QUOTA_EXCEEDED",
          plan: "free", remaining: 0, limit: q.limit,
          upgrade_url: "/billing/upgrade",
        },
      };
    }
    return {
      ok: true, plan: "free", hd_allowed: false, smart_saver: false,
      cost: 0, balance: 0, cooldown_until: null,
      remaining: q.remaining, limit: q.limit,
      refund: async () => {},
    };
  }

  // 4. Paid — credits.
  const action = opts.pickAction(s.smart_saver);
  const r = await consumeCredits(supabase, action);
  if (!r.allowed) {
    if (r.reason === "cooldown") {
      return {
        ok: false, status: 429,
        body: {
          error: "You're on a brief fair-use cooldown. Try again in a few minutes.",
          code: "COOLDOWN",
          cooldown_until: r.cooldown_until,
        },
      };
    }
    if (r.reason === "insufficient") {
      return {
        ok: false, status: 402,
        body: {
          error: `Not enough credits. This action costs ${r.cost}; you have ${r.balance}.`,
          code: "INSUFFICIENT_CREDITS",
          balance: r.balance, cost: r.cost, plan: r.plan,
          topup_url: "/billing/topup",
        },
      };
    }
    return {
      ok: false, status: 403,
      body: { error: "Generation blocked.", code: "BLOCKED", reason: r.reason ?? null },
    };
  }
  // Capture for refund closure.
  const charged = r.cost;
  return {
    ok: true,
    plan: r.plan === "owner" ? "owner" : "active",
    hd_allowed: !s.smart_saver,
    smart_saver: r.smart_saver,
    cost: charged,
    balance: r.balance,
    cooldown_until: r.cooldown_until,
    refund: async (reason: string, ref?: string) => {
      await refundCredits(supabase, charged, reason, ref);
    },
  };
}

/** Whether an error code from a downstream provider deserves a refund. */
export function shouldRefund(code: string | undefined | null): boolean {
  if (!code) return true; // unknown internal errors → refund (user wasn't at fault)
  switch (code) {
    case "FAL_BILLING":
    case "FAL_TIMEOUT":
    case "FAL_UNAVAILABLE":
    case "FAL_NO_OUTPUT":
    case "FAL_FAILED":
    case "FAL_AUTH":
    case "FAL_RATE_LIMITED":
    case "STITCH_FAILED":
    case "INTERNAL":
      return true;
    case "FAL_MODERATED":
    case "FAL_INVALID_INPUT":
    case "FAL_FORBIDDEN":
      return false; // user-attributable
    default:
      return false;
  }
}

export async function refundCredits(
  supabase: SupabaseClient,
  amount: number,
  reason: string,
  ref?: string,
): Promise<{ refunded: number; balance: number }> {
  if (amount <= 0) return { refunded: 0, balance: 0 };
  const { data, error } = await supabase.rpc("refund_credits", {
    p_amount: amount,
    p_reason: reason,
    p_ref:    ref ?? null,
  });
  if (error) {
    // Log but never throw — refund failure must not mask the original error.
    logger.error({ err: error, amount, reason, ref }, "[billing] refund_credits RPC failed — user may have lost credits");
    return { refunded: 0, balance: 0 };
  }
  return (data ?? { refunded: 0, balance: 0 }) as { refunded: number; balance: number };
}

/**
 * Admin refund — for background workers that have no user JWT (e.g. the
 * cinematic renderWorker). Calls public.refund_credits_admin which accepts
 * an explicit p_user_id and is GRANTed only to service_role.
 *
 * REQUIRES MIGRATION 41 (41-refund-credits-admin.sql). If the migration is
 * not applied this call will fail with `function does not exist` and the
 * caller's catch block will log a "manual credit may be required" warning.
 * It will NOT throw — refund failures must not mask the original error.
 */
export async function refundCreditsAdmin(
  serviceClient: SupabaseClient,
  userId: string,
  amount: number,
  reason: string,
  ref?: string,
): Promise<{ refunded: number; balance: number }> {
  if (amount <= 0) return { refunded: 0, balance: 0 };
  const { data, error } = await serviceClient.rpc("refund_credits_admin", {
    p_user_id: userId,
    p_amount:  amount,
    p_reason:  reason,
    p_ref:     ref ?? null,
  });
  if (error) {
    logger.error(
      { err: error, userId, amount, reason, ref },
      "[billing] refund_credits_admin RPC failed — apply migration 41 if 'function does not exist'; user may have lost credits otherwise",
    );
    return { refunded: 0, balance: 0 };
  }
  return (data ?? { refunded: 0, balance: 0 }) as { refunded: number; balance: number };
}
