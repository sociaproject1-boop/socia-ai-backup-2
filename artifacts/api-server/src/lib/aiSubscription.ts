/**
 * AI Subscription system — 4-tier plan structure.
 *
 * Plans: free | premium | elite | super-elite
 *
 * Model names are internal. The UI shows branded labels only.
 * Smart model routing is handled by aiModelRouter.ts — users on premium+
 * feel unlimited but the router picks the cheapest model that satisfies
 * the request complexity.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Request, RequestHandler } from "express";
import { getAuthedUser, getRequestSupabase } from "./supabaseAuth.js";

export type AIPlanCode = "free" | "premium" | "elite" | "super-elite";

export interface AIPlan {
  code:             AIPlanCode;
  label:            string;
  brandedModel:     string;   // shown to users — branding only
  model:            string;   // actual default OpenAI model
  dailyLimit:       number | null;
  monthlyLimit:     number | null;
  cooldownSec:      number;
  maxWords:         number;
  maxMessages:      number;
  maxOutputTokens:  number;
  queuePriority:    number;   // 1 (lowest) → 10 (highest)
  price_php:        number;
  price_usd:        number;
  allowAttachments: "images-only" | "all" | "none";
}

export const AI_PLANS: Record<AIPlanCode, AIPlan> = {
  free: {
    code:             "free",
    label:            "Free",
    brandedModel:     "Standard AI",
    model:            "gpt-4o-mini",
    dailyLimit:       30,
    monthlyLimit:     null,
    cooldownSec:      15,
    maxWords:         300,
    maxMessages:      10,
    maxOutputTokens:  800,
    queuePriority:    1,
    price_php:        0,
    price_usd:        0,
    allowAttachments: "images-only",
  },
  premium: {
    code:             "premium",
    label:            "Premium",
    brandedModel:     "Advanced AI",
    model:            "gpt-4o",
    dailyLimit:       150,
    monthlyLimit:     null,
    cooldownSec:      3,
    maxWords:         4000,
    maxMessages:      30,
    maxOutputTokens:  3000,
    queuePriority:    5,
    price_php:        499,
    price_usd:        9.99,
    allowAttachments: "all",
  },
  elite: {
    code:             "elite",
    label:            "Elite",
    brandedModel:     "Elite AI",
    model:            "gpt-4o",
    dailyLimit:       300,
    monthlyLimit:     null,
    cooldownSec:      1,
    maxWords:         8000,
    maxMessages:      50,
    maxOutputTokens:  8000,
    queuePriority:    8,
    price_php:        1499,
    price_usd:        24.99,
    allowAttachments: "all",
  },
  "super-elite": {
    code:             "super-elite",
    label:            "Super Elite",
    brandedModel:     "Pro Reasoning",
    model:            "o1-mini",
    dailyLimit:       500,
    monthlyLimit:     null,
    cooldownSec:      0,
    maxWords:         16000,
    maxMessages:      100,
    maxOutputTokens:  16000,
    queuePriority:    10,
    price_php:        3999,
    price_usd:        69,
    allowAttachments: "all",
  },
};

// Legacy plan code alias (existing "ultra" DB rows → elite)
const LEGACY_ALIAS: Record<string, AIPlanCode> = {
  ultra: "elite",
};

export interface AISubscriptionRow {
  id:         string;
  user_id:    string;
  plan_code:  string;
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

    if (error) return AI_PLANS.free;
    if (!data)  return AI_PLANS.free;

    // Check expiry
    if (data.expires_at && new Date(data.expires_at) < new Date()) {
      return AI_PLANS.free;
    }

    const rawCode = data.plan_code as string;
    // Resolve legacy aliases
    const code: AIPlanCode = LEGACY_ALIAS[rawCode]
      ?? ((rawCode in AI_PLANS) ? rawCode as AIPlanCode : "free");

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
