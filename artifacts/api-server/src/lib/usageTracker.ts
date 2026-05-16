/**
 * Usage Tracker — fire-and-forget AI usage event recording.
 *
 * Records every generation and chat event to `usage_receipts`.
 *
 * ⚠️  PRIVACY RULE:
 *   `estimated_cost` and all cost data stored here is INTERNAL.
 *   It must NEVER appear in any user-facing API response.
 *   Only admin routes (service-role client) may read it.
 *
 * Usage (call after a successful generation, non-blocking):
 *   trackUsage(supabase, userId, { tool_used: 'image_generation', ... }).catch(() => {});
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "./logger.js";

/* ── Internal cost map (PHP ₱) ─────────────────────────────────────────
 * Approximate infrastructure cost per event in Philippine Peso.
 * Based on published AI provider pricing converted at ~56 PHP/USD.
 * These values are ADMIN-ONLY and never returned to users.
 * ────────────────────────────────────────────────────────────────────── */
export const INTERNAL_COST_MAP_PHP: Record<string, number> = {
  // Image generation (gpt-image-1)
  std_image:      2.24,   // ~$0.04 / image
  hd_image:       6.72,   // ~$0.12 / image

  // Video generation (fal.ai Kling 1.6 Pro)
  std_video_5s:   28.00,  // ~$0.50 / clip
  hd_video_5s:    56.00,  // ~$1.00 / clip
  std_video_10s:  56.00,  // ~$1.00 / clip
  hd_video_10s:  112.00,  // ~$2.00 / clip

  // Multi-frame storyboard (fal.ai Luma — per full sequence)
  multi_frame:   112.00,  // ~$2.00 / sequence

  // AI chat — per message, by model
  gpt_msg_mini:    0.17,  // gpt-4o-mini  ~$0.003
  gpt_msg_4o:      0.56,  // gpt-4o       ~$0.01
  gpt_msg_o1:      1.68,  // o1-mini      ~$0.03

  // Studio presets (image generation, usually standard quality)
  preset_studio:   2.24,

  // Fallback for unknown events
  unknown:         1.00,
};

/* ── AI plan code → chat cost key ───────────────────────────────────── */
export const AI_PLAN_COST_KEY: Record<string, string> = {
  free:    "gpt_msg_mini",
  premium: "gpt_msg_4o",
  ultra:   "gpt_msg_o1",
};

/* ── Heavy-use thresholds (per billing period) ───────────────────────── */
export const HEAVY_THRESHOLDS = {
  image_count:   20,   // ≥20 images → heavy
  video_count:    5,   // ≥5 videos → heavy
  chat_count:   200,   // ≥200 chat messages → heavy
  cost_ratio:  0.70,   // cost > 70% of payment → heavy
} as const;

export type ToolUsed =
  | "image_generation"
  | "video_generation"
  | "multiframe_video"
  | "ai_chat"
  | "preset_studio"
  | "image_upscale";

export interface UsageEvent {
  tool_used:        ToolUsed;
  generation_type?: string;       // e.g. 'hd_image', 'std_video_5s'
  model_used?:      string;       // e.g. 'gpt-image-1', 'gpt-4o-mini'
  request_id?:      string;
  payment_order_id?: string | null;
  duration_ms?:     number;
  queue_time_ms?:   number;
  token_usage?:     { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } | null;
  status?:          "success" | "failed" | "refunded" | "moderated";
  metadata?:        Record<string, unknown>;
}

/**
 * Records a usage event to `usage_receipts`.
 * Always fire-and-forget — catch errors at the call site with `.catch(() => {})`.
 *
 * Cost is looked up from the internal cost map using `generation_type` or
 * `tool_used` as fallback. Never returned to users.
 */
export async function trackUsage(
  supabase: SupabaseClient,
  userId: string,
  event: UsageEvent,
): Promise<void> {
  try {
    const costKey = event.generation_type
      ? event.generation_type
      : event.tool_used === "ai_chat"
      ? (AI_PLAN_COST_KEY[event.model_used ?? ""] ?? "gpt_msg_mini")
      : event.tool_used;

    const estimatedCost = INTERNAL_COST_MAP_PHP[costKey] ?? INTERNAL_COST_MAP_PHP["unknown"]!;

    const { error } = await supabase.from("usage_receipts").insert({
      user_id:          userId,
      payment_order_id: event.payment_order_id ?? null,
      tool_used:        event.tool_used,
      model_used:       event.model_used ?? null,
      generation_type:  event.generation_type ?? null,
      request_id:       event.request_id ?? null,
      estimated_cost:   estimatedCost,
      duration_ms:      event.duration_ms ?? null,
      queue_time_ms:    event.queue_time_ms ?? null,
      token_usage:      event.token_usage ?? null,
      status:           event.status ?? "success",
      metadata:         event.metadata ?? null,
    });

    if (error) {
      logger.warn({ err: error, userId, tool: event.tool_used }, "[usage] insert failed");
    }
  } catch (err) {
    logger.warn({ err, userId, tool: event.tool_used }, "[usage] trackUsage threw");
  }
}

/* ── Usage aggregation (admin-only helpers) ──────────────────────────── */

export interface UsageBreakdownItem {
  tool_used:         string;
  generation_type:   string | null;
  model_used:        string | null;
  count:             number;
  total_cost_php:    number;   // ADMIN ONLY
  avg_duration_ms:   number | null;
}

export interface UsageSummary {
  user_id:               string;
  period_start:          string;
  period_end:            string;
  total_events:          number;
  image_count:           number;
  video_count:           number;
  chat_count:            number;
  total_estimated_cost:  number;   // ADMIN ONLY
  breakdown:             UsageBreakdownItem[];  // ADMIN ONLY
  heavy_usage_score:     number;   // 0–100
  heavy_flags:           string[];
  is_heavy_user:         boolean;
}

/**
 * Computes a full usage summary for a user over a date range.
 * Admin-only — includes estimated_cost data.
 */
export async function computeUsageSummary(
  supabase: SupabaseClient,
  userId: string,
  periodStart: Date,
  periodEnd: Date,
): Promise<UsageSummary> {
  const { data: rows, error } = await supabase
    .from("usage_receipts")
    .select("tool_used, generation_type, model_used, estimated_cost, duration_ms, status, created_at")
    .eq("user_id", userId)
    .eq("status", "success")
    .gte("created_at", periodStart.toISOString())
    .lte("created_at", periodEnd.toISOString());

  if (error || !rows) {
    logger.warn({ err: error, userId }, "[usage] computeUsageSummary query failed");
    return emptyUsageSummary(userId, periodStart, periodEnd);
  }

  const events = rows as Array<{
    tool_used: string;
    generation_type: string | null;
    model_used: string | null;
    estimated_cost: number;
    duration_ms: number | null;
    status: string;
  }>;

  const imageCount = events.filter((e) => e.tool_used === "image_generation" || e.tool_used === "preset_studio").length;
  const videoCount = events.filter((e) => e.tool_used === "video_generation" || e.tool_used === "multiframe_video").length;
  const chatCount  = events.filter((e) => e.tool_used === "ai_chat").length;
  const totalCost  = events.reduce((s, e) => s + Number(e.estimated_cost), 0);

  // Breakdown by tool + generation_type
  const breakdownMap = new Map<string, UsageBreakdownItem>();
  for (const e of events) {
    const key = `${e.tool_used}::${e.generation_type ?? ""}::${e.model_used ?? ""}`;
    const existing = breakdownMap.get(key);
    if (existing) {
      existing.count++;
      existing.total_cost_php += Number(e.estimated_cost);
      if (e.duration_ms && existing.avg_duration_ms !== null) {
        existing.avg_duration_ms = ((existing.avg_duration_ms * (existing.count - 1)) + e.duration_ms) / existing.count;
      }
    } else {
      breakdownMap.set(key, {
        tool_used:        e.tool_used,
        generation_type:  e.generation_type,
        model_used:       e.model_used,
        count:            1,
        total_cost_php:   Number(e.estimated_cost),
        avg_duration_ms:  e.duration_ms ?? null,
      });
    }
  }
  const breakdown = Array.from(breakdownMap.values()).sort((a, b) => b.total_cost_php - a.total_cost_php);

  // Heavy user scoring
  const { score, flags } = computeHeavyScore({ imageCount, videoCount, chatCount, totalCost, paymentAmountPhp: 0 });

  return {
    user_id:               userId,
    period_start:          periodStart.toISOString(),
    period_end:            periodEnd.toISOString(),
    total_events:          events.length,
    image_count:           imageCount,
    video_count:           videoCount,
    chat_count:            chatCount,
    total_estimated_cost:  Math.round(totalCost * 100) / 100,
    breakdown,
    heavy_usage_score:     score,
    heavy_flags:           flags,
    is_heavy_user:         score >= 60,
  };
}

export function computeHeavyScore(opts: {
  imageCount:       number;
  videoCount:       number;
  chatCount:        number;
  totalCost:        number;
  paymentAmountPhp: number;
}): { score: number; flags: string[] } {
  const flags: string[] = [];
  let score = 0;

  if (opts.imageCount >= HEAVY_THRESHOLDS.image_count) {
    score += 25;
    flags.push(`High image volume: ${opts.imageCount} generations`);
  } else if (opts.imageCount >= Math.floor(HEAVY_THRESHOLDS.image_count * 0.6)) {
    score += 12;
  }

  if (opts.videoCount >= HEAVY_THRESHOLDS.video_count) {
    score += 35;
    flags.push(`High video volume: ${opts.videoCount} generations`);
  } else if (opts.videoCount >= Math.floor(HEAVY_THRESHOLDS.video_count * 0.6)) {
    score += 15;
  }

  if (opts.chatCount >= HEAVY_THRESHOLDS.chat_count) {
    score += 15;
    flags.push(`High AI chat volume: ${opts.chatCount} messages`);
  }

  if (opts.paymentAmountPhp > 0) {
    const ratio = opts.totalCost / opts.paymentAmountPhp;
    if (ratio >= HEAVY_THRESHOLDS.cost_ratio) {
      score += 35;
      flags.push(`Cost ratio ${Math.round(ratio * 100)}% — heavy compute use`);
    } else if (ratio >= 0.50) {
      score += 15;
    }
  }

  return { score: Math.min(100, score), flags };
}

function emptyUsageSummary(userId: string, start: Date, end: Date): UsageSummary {
  return {
    user_id: userId, period_start: start.toISOString(), period_end: end.toISOString(),
    total_events: 0, image_count: 0, video_count: 0, chat_count: 0,
    total_estimated_cost: 0, breakdown: [], heavy_usage_score: 0,
    heavy_flags: [], is_heavy_user: false,
  };
}
