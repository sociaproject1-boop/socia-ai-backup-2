/**
 * Smart Usage Engine — Enterprise AI Cost & Queue Management
 *
 * Principles:
 *  - Users should FEEL unlimited. Hard blocks are last resort.
 *  - Soft limits are invisible: priority drops, queue delays increase.
 *  - Abuse is caught by pattern detection, not by single render size.
 *  - All cost data is internal; never expose raw GPU units to users.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

/* ─── GPU Weight Tables ──────────────────────────────────────────── */

/** GPU cost units per segment for each AI model */
export const MODEL_GPU_WEIGHT: Record<string, number> = {
  "kling-standard":  1.0,
  "kling-cinematic": 1.8,
  "runway-gen4":     3.5,
  "veo-ultra":       6.0,
  "anime-motion":    1.3,
  "hyper-real":      3.0,
};

/** Resolution render multiplier */
export const RESOLUTION_WEIGHT: Record<string, number> = {
  "720p":  0.70,
  "1080p": 1.00,
  "2k":    2.20,
  "4k":    4.50,
};

/** Per-segment motion intensity multiplier */
export const MOTION_WEIGHT: Record<string, number> = {
  "subtle":   0.80,
  "balanced": 1.00,
  "strong":   1.40,
  "extreme":  1.90,
};

/** Transition complexity map (0 = zero overhead, 1 = 15% overhead) */
export const TRANSITION_COMPLEXITY: Record<string, number> = {
  "fade":           0.0,
  "dissolve":       0.1,
  "zoom":           0.3,
  "flash":          0.2,
  "warp":           0.7,
  "slide-left":     0.2,
  "slide-right":    0.2,
  "cinematic-blur": 0.5,
  "glitch":         0.8,
  "anime-cut":      0.4,
};

/* ─── Monthly GPU Budget per Plan (GPU units) ────────────────────── */

/**
 * Hidden per-plan monthly GPU allocation.
 * Average creator on Pro uses ~400 units/month.
 * Budget headroom prevents runaway costs while keeping FEEL unlimited.
 */
export const PLAN_MONTHLY_BUDGET: Record<string, number> = {
  free:  0,
  p15:   350,   // Standard ₱1,700 — image/video only (no multi-frame)
  p30:   2200,  // Pro ₱3,000 — multi-frame + high quality
};

/** 1 GPU unit = ₱2 internal cost floor */
export const GPU_UNIT_COST_PHP = 2.0;

/* ─── Soft Limit Stages ──────────────────────────────────────────── */

export type LimitStage =
  | "full"            // <45% budget used — full speed
  | "slight"          // 45–65% — barely noticeable
  | "standard"        // 65–80% — modest queue delay
  | "reduced"         // 80–95% — ultra modes restricted, delay increases
  | "suggest-upgrade";// >95%   — heavily throttled, upgrade nudge shown

export function getLimitStage(usedUnits: number, totalBudget: number): LimitStage {
  if (totalBudget === 0) return "suggest-upgrade";
  const ratio = usedUnits / totalBudget;
  if (ratio < 0.45) return "full";
  if (ratio < 0.65) return "slight";
  if (ratio < 0.80) return "standard";
  if (ratio < 0.95) return "reduced";
  return "suggest-upgrade";
}

/* ─── Render Cost Calculator ─────────────────────────────────────── */

export interface RenderParams {
  frameCount:       number;
  avgDurationSec:   number;
  model:            string;
  resolution:       string;
  motionStrength:   string;
  transitions:      string[];  // transition type per segment
}

export interface RenderCostResult {
  gpuUnits:         number;   // internal GPU cost (hidden from user)
  phpCost:          number;   // estimated PHP cost (admin only)
  complexityLabel:  "lightweight" | "moderate" | "heavy" | "ultra-heavy";
  breakdown: {
    modelWeight:    number;
    resolutionWeight: number;
    avgMotionWeight: number;
    transitionOverhead: number;
    durationFactor: number;
  };
}

export function calcRenderCost(p: RenderParams): RenderCostResult {
  const modelW  = MODEL_GPU_WEIGHT[p.model]      ?? 1.0;
  const resW    = RESOLUTION_WEIGHT[p.resolution] ?? 1.0;
  const motionW = MOTION_WEIGHT[p.motionStrength] ?? 1.0;

  // Duration scales sub-linearly — longer clips are slightly cheaper per-second
  const durationFactor = Math.pow(Math.max(1, p.avgDurationSec) / 5, 0.75);

  // Average transition overhead across all segments
  const avgTransitionComplexity = p.transitions.length > 0
    ? p.transitions.reduce((s, t) => s + (TRANSITION_COMPLEXITY[t] ?? 0.2), 0) / p.transitions.length
    : 0.2;
  const transitionOverhead = 1 + avgTransitionComplexity * 0.15;

  const gpuUnits = Math.round(
    p.frameCount * durationFactor * modelW * resW * motionW * transitionOverhead * 10
  ) / 10;

  const phpCost = gpuUnits * GPU_UNIT_COST_PHP;

  const complexityLabel: RenderCostResult["complexityLabel"] =
    gpuUnits < 15  ? "lightweight" :
    gpuUnits < 50  ? "moderate"    :
    gpuUnits < 120 ? "heavy"       : "ultra-heavy";

  return {
    gpuUnits,
    phpCost,
    complexityLabel,
    breakdown: {
      modelWeight:        modelW,
      resolutionWeight:   resW,
      avgMotionWeight:    motionW,
      transitionOverhead,
      durationFactor,
    },
  };
}

/* ─── Queue Priority ─────────────────────────────────────────────── */

/** Lower number = higher priority in the render queue */
export function getRenderPriority(
  plan:       string,
  stage:      LimitStage,
  abuseScore: number,
): number {
  const basePriority: Record<string, number> = {
    p30:  1,
    p15:  4,
    free: 12,
  };
  const stagePenalty: Record<LimitStage, number> = {
    full:              0,
    slight:            1,
    standard:          3,
    reduced:           7,
    "suggest-upgrade": 14,
  };
  const base = basePriority[plan] ?? 12;
  return base + stagePenalty[stage] + Math.floor(abuseScore / 20);
}

/** Queue delay in milliseconds based on stage + plan */
export function getQueueDelayMs(stage: LimitStage, plan: string): number {
  const baseDelay: Record<string, number> = {
    p30:  0,
    p15:  1_500,
    free: 10_000,
  };
  const stageMultiplier: Record<LimitStage, number> = {
    full:              1.0,
    slight:            1.3,
    standard:          2.0,
    reduced:           3.5,
    "suggest-upgrade": 7.0,
  };
  return Math.round((baseDelay[plan] ?? 10_000) * stageMultiplier[stage]);
}

/* ─── Premium User-Facing Messaging ─────────────────────────────── */

export function getThrottleMessage(stage: LimitStage): string | null {
  switch (stage) {
    case "full":    return null;
    case "slight":  return "Optimizing cinematic generation for peak quality.";
    case "standard":return "High demand detected — your render is queued for smooth delivery.";
    case "reduced": return "Ultra rendering temporarily queued. Optimizing infrastructure.";
    case "suggest-upgrade":
      return "Priority rendering is available for 3T Ultimate users. Your render is in standard queue.";
    default: return null;
  }
}

export function getThrottleCode(stage: LimitStage): string {
  switch (stage) {
    case "full":             return "RENDER_OK";
    case "slight":           return "RENDER_OPTIMIZING";
    case "standard":         return "RENDER_QUEUED";
    case "reduced":          return "RENDER_QUEUED_DELAY";
    case "suggest-upgrade":  return "RENDER_QUEUE_LONG";
    default: return "RENDER_OK";
  }
}

/* ─── Monthly GPU Usage Tracker ──────────────────────────────────── */

/** Read how many GPU units a user has consumed this billing month */
export async function getMonthlyGpuUsage(
  userId: string,
  sb: SupabaseClient,
): Promise<number> {
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const { data, error } = await sb
    .from("usage_receipts")
    .select("estimated_cost")
    .eq("user_id", userId)
    .gte("created_at", monthStart.toISOString());

  if (error || !data) return 0;
  // estimated_cost is in PHP; convert back to GPU units
  return data.reduce(
    (sum: number, r: { estimated_cost: string | number }) =>
      sum + (parseFloat(String(r.estimated_cost)) || 0) / GPU_UNIT_COST_PHP,
    0,
  );
}

/* ─── Abuse Detection ────────────────────────────────────────────── */

export interface AbuseResult {
  score:     number;   // 0–100
  isAbuser:  boolean;  // score >= 60
  stage:     "clean" | "watch" | "throttle" | "block";
  reason:    string | null;
}

export async function detectRenderAbuse(
  userId: string,
  sb: SupabaseClient,
): Promise<AbuseResult> {
  const nowMs      = Date.now();
  const oneHourAgo = new Date(nowMs - 3_600_000).toISOString();
  const sixHrAgo   = new Date(nowMs - 21_600_000).toISOString();
  const oneDayAgo  = new Date(nowMs - 86_400_000).toISOString();

  const videoTools = ["video_generation", "multiframe_video"];

  const [hourRes, sixHrRes, dayRes, failRes] = await Promise.allSettled([
    sb.from("usage_receipts").select("id", { count: "exact", head: true })
      .eq("user_id", userId).in("tool", videoTools).gte("created_at", oneHourAgo),
    sb.from("usage_receipts").select("id", { count: "exact", head: true })
      .eq("user_id", userId).in("tool", videoTools).gte("created_at", sixHrAgo),
    sb.from("usage_receipts").select("id", { count: "exact", head: true })
      .eq("user_id", userId).in("tool", videoTools).gte("created_at", oneDayAgo),
    sb.from("usage_receipts").select("id", { count: "exact", head: true })
      .eq("user_id", userId).eq("status", "failed").gte("created_at", oneDayAgo),
  ]);

  const hourCount  = hourRes.status  === "fulfilled" ? (hourRes.value.count  ?? 0) : 0;
  const sixHrCount = sixHrRes.status === "fulfilled" ? (sixHrRes.value.count ?? 0) : 0;
  const dayCount   = dayRes.status   === "fulfilled" ? (dayRes.value.count   ?? 0) : 0;
  const failCount  = failRes.status  === "fulfilled" ? (failRes.value.count  ?? 0) : 0;

  let score = 0;
  let reason: string | null = null;

  // Hourly velocity
  if (hourCount > 15)      { score += 70; reason = "Extreme render frequency (>15/hr)"; }
  else if (hourCount > 8)  { score += 40; reason = reason ?? "High render frequency (>8/hr)"; }
  else if (hourCount > 4)  { score += 15; }

  // 6-hour velocity
  if (sixHrCount > 40)     { score += 30; }
  else if (sixHrCount > 20){ score += 10; }

  // Daily total
  if (dayCount > 80)       { score += 25; reason = reason ?? "Very high daily volume (>80/day)"; }
  else if (dayCount > 50)  { score += 10; }

  // Failure rate spike (possible exploit probing)
  if (failCount > 20)      { score += 30; reason = reason ?? "Abnormal failure rate"; }
  else if (failCount > 10) { score += 10; }

  const finalScore = Math.min(100, score);

  const stage: AbuseResult["stage"] =
    finalScore < 20  ? "clean"    :
    finalScore < 50  ? "watch"    :
    finalScore < 80  ? "throttle" : "block";

  return { score: finalScore, isAbuser: finalScore >= 60, stage, reason };
}

/* ─── Plan Access Control ────────────────────────────────────────── */

export interface PlanAccess {
  canUseMultiFrame:    boolean;
  maxFrames:           number;
  allowedModels:       string[];
  maxResolution:       string;
  watermark:           boolean;
  queueTier:           "premium" | "standard" | "economy" | "free";
}

export function getPlanAccess(planCode: string): PlanAccess {
  switch (planCode) {
    case "p30":
      return {
        canUseMultiFrame: true,
        maxFrames:        10,
        allowedModels:    ["kling-standard","kling-cinematic","runway-gen4","veo-ultra","anime-motion","hyper-real"],
        maxResolution:    "4k",
        watermark:        false,
        queueTier:        "premium",
      };
    case "p15":
      return {
        canUseMultiFrame: false,
        maxFrames:        0,
        allowedModels:    ["kling-standard","kling-cinematic"],
        maxResolution:    "1080p",
        watermark:        false,
        queueTier:        "standard",
      };
    default: // free
      return {
        canUseMultiFrame: false,
        maxFrames:        0,
        allowedModels:    [],
        maxResolution:    "720p",
        watermark:        true,
        queueTier:        "free",
      };
  }
}

/* ─── Full Smart Gate (call before rendering) ────────────────────── */

export interface SmartGateResult {
  allowed:       boolean;
  priority:      number;         // queue priority (lower = higher)
  delayMs:       number;         // suggested pre-render delay
  stage:         LimitStage;
  abuseScore:    number;
  throttleMsg:   string | null;  // premium user-facing message (may be null)
  throttleCode:  string;
  gpuUnits:      number;         // estimated cost of this job
  monthlyUsed:   number;         // units used so far this month
  monthlyBudget: number;         // plan budget
}

export async function smartGate(params: {
  userId:   string;
  plan:     string;
  render:   RenderParams;
  sb:       SupabaseClient;
}): Promise<SmartGateResult> {
  const { userId, plan, render, sb } = params;

  const access = getPlanAccess(plan);
  if (!access.canUseMultiFrame && render.frameCount > 1) {
    return {
      allowed: false,
      priority: 99,
      delayMs: 0,
      stage: "suggest-upgrade",
      abuseScore: 0,
      throttleMsg: "Multi-Frame Studio requires the Pro plan (₱3,000/mo).",
      throttleCode: "PLAN_UPGRADE_REQUIRED",
      gpuUnits: 0,
      monthlyUsed: 0,
      monthlyBudget: PLAN_MONTHLY_BUDGET[plan] ?? 0,
    };
  }

  const [monthlyUsed, abuse] = await Promise.all([
    getMonthlyGpuUsage(userId, sb),
    detectRenderAbuse(userId, sb),
  ]);

  const cost        = calcRenderCost(render);
  const budget      = PLAN_MONTHLY_BUDGET[plan] ?? 0;
  const stage       = getLimitStage(monthlyUsed, budget);
  const priority    = getRenderPriority(plan, stage, abuse.score);
  const delayMs     = getQueueDelayMs(stage, plan);
  const throttleMsg = abuse.isAbuser
    ? "Cinematic rendering is temporarily rate-limited on your account."
    : getThrottleMessage(stage);

  // Block only in extreme abuse (score ≥ 80) — otherwise always allow, just slow
  const allowed = abuse.stage !== "block" || plan === "p30";

  return {
    allowed,
    priority,
    delayMs,
    stage,
    abuseScore:    abuse.score,
    throttleMsg,
    throttleCode:  getThrottleCode(stage),
    gpuUnits:      cost.gpuUnits,
    monthlyUsed,
    monthlyBudget: budget,
  };
}
