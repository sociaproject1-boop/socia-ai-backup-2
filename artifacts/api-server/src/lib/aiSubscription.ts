/**
 * AI Subscription system — 4-tier plan structure.
 * Ported to Drizzle/PostgreSQL.
 */
import type { Request, RequestHandler } from "express";
import { getAuthedUser } from "./replitAuth.js";
import { db, schema } from "./db.js";
import { eq, and, gt } from "drizzle-orm";

export type AIPlanCode = "free" | "premium" | "elite" | "super-elite";

export interface AIPlan {
  code:             AIPlanCode;
  label:            string;
  brandedModel:     string;
  model:            string;
  dailyLimit:       number | null;
  monthlyLimit:     number | null;
  cooldownSec:      number;
  maxWords:         number;
  maxMessages:      number;
  maxOutputTokens:  number;
  queuePriority:    number;
  price_php:        number;
  price_usd:        number;
  allowAttachments: "images-only" | "all" | "none";
}

export const AI_PLANS: Record<AIPlanCode, AIPlan> = {
  free: {
    code: "free", label: "Free", brandedModel: "Standard AI",
    model: "gpt-4o-mini", dailyLimit: 30, monthlyLimit: null,
    cooldownSec: 15, maxWords: 300, maxMessages: 10, maxOutputTokens: 800,
    queuePriority: 1, price_php: 0, price_usd: 0, allowAttachments: "images-only",
  },
  premium: {
    code: "premium", label: "Premium", brandedModel: "Advanced AI",
    model: "gpt-4o", dailyLimit: 150, monthlyLimit: null,
    cooldownSec: 3, maxWords: 4000, maxMessages: 30, maxOutputTokens: 3000,
    queuePriority: 5, price_php: 499, price_usd: 9.99, allowAttachments: "all",
  },
  elite: {
    code: "elite", label: "Elite", brandedModel: "Elite AI",
    model: "gpt-4o", dailyLimit: 300, monthlyLimit: null,
    cooldownSec: 1, maxWords: 8000, maxMessages: 50, maxOutputTokens: 8000,
    queuePriority: 8, price_php: 999, price_usd: 17.99, allowAttachments: "all",
  },
  "super-elite": {
    code: "super-elite", label: "Super Elite", brandedModel: "Pro Reasoning",
    model: "o1-mini", dailyLimit: 500, monthlyLimit: null,
    cooldownSec: 0, maxWords: 16000, maxMessages: 100, maxOutputTokens: 16000,
    queuePriority: 10, price_php: 1999, price_usd: 35, allowAttachments: "all",
  },
};

const LEGACY_ALIAS: Record<string, AIPlanCode> = { ultra: "elite" };

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
  _sb: any,
  userId: string,
): Promise<AIPlan> {
  try {
    const rows = await db
      .select({ planCode: schema.users.planCode, subscriptionStatus: schema.users.subscriptionStatus })
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .limit(1);
    if (!rows.length) return AI_PLANS.free;
    const rawCode = rows[0]!.planCode ?? "free";
    const code: AIPlanCode = LEGACY_ALIAS[rawCode] ?? ((rawCode in AI_PLANS) ? rawCode as AIPlanCode : "free");
    return AI_PLANS[code];
  } catch {
    return AI_PLANS.free;
  }
}

declare global {
  namespace Express {
    interface Request {
      aiPlan?: AIPlan;
    }
  }
}

export const attachAIPlan: RequestHandler = async (req, _res, next) => {
  try {
    const user = getAuthedUser(req);
    req.aiPlan = await fetchAIPlan(null, user.id);
  } catch {
    req.aiPlan = AI_PLANS.free;
  }
  next();
};
