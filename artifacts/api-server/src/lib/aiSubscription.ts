/**
 * AI Subscription system — completely separate from creator subscriptions.
 *
 * Reads `ai_subscriptions` table from Supabase (via the caller's JWT so RLS
 * protects it). Falls back to "free" if the table doesn't exist yet or the
 * user has no active subscription.
 *
 * The attached plan is used downstream by aiRateLimit.ts and the sociaGpt
 * route to pick the correct OpenAI model and enforce usage limits.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Request, RequestHandler } from "express";
import { getAuthedUser, getRequestSupabase } from "./supabaseAuth.js";

export type AIPlanCode = "free" | "premium" | "ultra";

export interface AIPlan {
  code:         AIPlanCode;
  label:        string;
  model:        string;
  dailyLimit:   number | null;
  monthlyLimit: number | null;
  cooldownSec:  number;
  maxWords:     number;
  maxMessages:  number;
}

export const AI_PLANS: Record<AIPlanCode, AIPlan> = {
  free: {
    code: "free",
    label: "Free AI",
    model: "gpt-4o-mini",
    dailyLimit: 15,
    monthlyLimit: null,
    cooldownSec: 20,
    maxWords: 300,
    maxMessages: 1,
  },
  premium: {
    code: "premium",
    label: "Premium AI",
    model: "gpt-4o",
    dailyLimit: null,
    monthlyLimit: 300,
    cooldownSec: 8,
    maxWords: 4000,
    maxMessages: 30,
  },
  ultra: {
    code: "ultra",
    label: "Ultra Pro",
    model: "o1-mini",
    dailyLimit: null,
    monthlyLimit: 120,
    cooldownSec: 20,
    maxWords: 8000,
    maxMessages: 30,
  },
};

export interface AISubscriptionRow {
  id:         string;
  user_id:    string;
  plan_code:  AIPlanCode;
  status:     "active" | "cancelled" | "expired";
  expires_at: string | null;
  created_at: string;
}

/** Fetch the active AI plan for a user. Falls back to "free" on any error. */
export async function fetchAIPlan(
  supabase: SupabaseClient,
  userId: string,
): Promise<AIPlan> {
  try {
    const { data, error } = await supabase
      .from("ai_subscriptions")
      .select("plan_code, status, expires_at")
      .eq("user_id", userId)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) return AI_PLANS.free; // Table missing or RLS — default free

    if (!data) return AI_PLANS.free;

    // Check expiry
    if (data.expires_at && new Date(data.expires_at) < new Date()) {
      return AI_PLANS.free;
    }

    const code = (data.plan_code as AIPlanCode) in AI_PLANS ? (data.plan_code as AIPlanCode) : "free";
    return AI_PLANS[code];
  } catch {
    return AI_PLANS.free;
  }
}

/** Express type augmentation */
declare global {
  namespace Express {
    interface Request {
      aiPlan?: AIPlan;
    }
  }
}

/** Middleware: attach aiPlan to every authenticated request. Must run after requireAuth. */
export const attachAIPlan: RequestHandler = async (req, _res, next) => {
  try {
    const user     = getAuthedUser(req);
    const supabase = getRequestSupabase(req);
    req.aiPlan     = await fetchAIPlan(supabase, user.id);
  } catch {
    req.aiPlan = AI_PLANS.free;
  }
  next();
};
