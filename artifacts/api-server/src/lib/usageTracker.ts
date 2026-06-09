/**
 * Usage Tracker — Drizzle/PostgreSQL implementation.
 */
import { logger } from "./logger.js";
import { db, schema } from "./db.js";
import { eq, and, gte, lte } from "drizzle-orm";

const { usageReceipts } = schema;

export const INTERNAL_COST_MAP_PHP: Record<string, number> = {
  std_image:      2.24,
  hd_image:       6.72,
  std_video_5s:   28.00,
  hd_video_5s:    56.00,
  std_video_10s:  56.00,
  hd_video_10s:  112.00,
  multi_frame:   112.00,
  gpt_msg_mini:    0.17,
  gpt_msg_4o:      0.56,
  gpt_msg_o1:      1.68,
  preset_studio:   2.24,
  unknown:         1.00,
};

export const AI_PLAN_COST_KEY: Record<string, string> = {
  free:          "gpt_msg_mini",
  premium:       "gpt_msg_4o",
  elite:         "gpt_msg_4o",
  "super-elite": "gpt_msg_o1",
  ultra:         "gpt_msg_o1",
};

export const HEAVY_THRESHOLDS = {
  image_count:   20,
  video_count:    5,
  chat_count:   200,
  cost_ratio:  0.70,
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
  generation_type?: string;
  model_used?:      string;
  request_id?:      string;
  payment_order_id?: string | null;
  duration_ms?:     number;
  queue_time_ms?:   number;
  token_usage?:     { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } | null;
  status?:          "success" | "failed" | "refunded" | "moderated";
  metadata?:        Record<string, unknown>;
}

export async function trackUsage(
  _sb: any,
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

    await db.insert(usageReceipts).values({
      userId,
      paymentOrderId: event.payment_order_id ?? null,
      toolUsed:       event.tool_used,
      modelUsed:      event.model_used ?? null,
      generationType: event.generation_type ?? null,
      requestId:      event.request_id ?? null,
      estimatedCost:  String(estimatedCost),
      durationMs:     event.duration_ms ?? null,
      queueTimeMs:    event.queue_time_ms ?? null,
      tokenUsage:     event.token_usage ?? null,
      status:         event.status ?? "success",
      metadata:       event.metadata ?? null,
    });
  } catch (err) {
    logger.warn({ err, userId, tool: event.tool_used }, "[usage] trackUsage failed");
  }
}

export interface UsageBreakdownItem {
  tool_used:         string;
  generation_type:   string | null;
  model_used:        string | null;
  count:             number;
  total_cost_php:    number;
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
  total_estimated_cost:  number;
  breakdown:             UsageBreakdownItem[];
  heavy_usage_score:     number;
  heavy_flags:           string[];
  is_heavy_user:         boolean;
}

export async function computeUsageSummary(
  _sb: any,
  userId: string,
  periodStart: Date,
  periodEnd: Date,
): Promise<UsageSummary> {
  try {
    const rows = await db
      .select({
        toolUsed:       usageReceipts.toolUsed,
        generationType: usageReceipts.generationType,
        modelUsed:      usageReceipts.modelUsed,
        estimatedCost:  usageReceipts.estimatedCost,
        durationMs:     usageReceipts.durationMs,
        status:         usageReceipts.status,
      })
      .from(usageReceipts)
      .where(and(
        eq(usageReceipts.userId, userId),
        eq(usageReceipts.status, "success"),
        gte(usageReceipts.createdAt, periodStart),
        lte(usageReceipts.createdAt, periodEnd),
      ));

    const imageCount = rows.filter((e) => e.toolUsed === "image_generation" || e.toolUsed === "preset_studio").length;
    const videoCount = rows.filter((e) => e.toolUsed === "video_generation" || e.toolUsed === "multiframe_video").length;
    const chatCount  = rows.filter((e) => e.toolUsed === "ai_chat").length;
    const totalCost  = rows.reduce((s, e) => s + Number(e.estimatedCost ?? 0), 0);

    const breakdownMap = new Map<string, UsageBreakdownItem>();
    for (const e of rows) {
      const key = `${e.toolUsed}::${e.generationType ?? ""}::${e.modelUsed ?? ""}`;
      const existing = breakdownMap.get(key);
      if (existing) {
        existing.count++;
        existing.total_cost_php += Number(e.estimatedCost ?? 0);
      } else {
        breakdownMap.set(key, {
          tool_used:        e.toolUsed,
          generation_type:  e.generationType,
          model_used:       e.modelUsed,
          count:            1,
          total_cost_php:   Number(e.estimatedCost ?? 0),
          avg_duration_ms:  e.durationMs ?? null,
        });
      }
    }
    const breakdown = Array.from(breakdownMap.values()).sort((a, b) => b.total_cost_php - a.total_cost_php);
    const { score, flags } = computeHeavyScore({ imageCount, videoCount, chatCount, totalCost, paymentAmountPhp: 0 });

    return {
      user_id:               userId,
      period_start:          periodStart.toISOString(),
      period_end:            periodEnd.toISOString(),
      total_events:          rows.length,
      image_count:           imageCount,
      video_count:           videoCount,
      chat_count:            chatCount,
      total_estimated_cost:  Math.round(totalCost * 100) / 100,
      breakdown,
      heavy_usage_score:     score,
      heavy_flags:           flags,
      is_heavy_user:         score >= 60,
    };
  } catch (err) {
    logger.warn({ err, userId }, "[usage] computeUsageSummary failed");
    return emptyUsageSummary(userId, periodStart, periodEnd);
  }
}

export function computeHeavyScore(opts: {
  imageCount: number; videoCount: number; chatCount: number;
  totalCost: number; paymentAmountPhp: number;
}): { score: number; flags: string[] } {
  const flags: string[] = [];
  let score = 0;
  if (opts.imageCount >= HEAVY_THRESHOLDS.image_count) { score += 25; flags.push(`High image volume: ${opts.imageCount} generations`); }
  else if (opts.imageCount >= Math.floor(HEAVY_THRESHOLDS.image_count * 0.6)) { score += 12; }
  if (opts.videoCount >= HEAVY_THRESHOLDS.video_count) { score += 35; flags.push(`High video volume: ${opts.videoCount} generations`); }
  else if (opts.videoCount >= Math.floor(HEAVY_THRESHOLDS.video_count * 0.6)) { score += 15; }
  if (opts.chatCount >= HEAVY_THRESHOLDS.chat_count) { score += 15; flags.push(`High AI chat volume: ${opts.chatCount} messages`); }
  if (opts.paymentAmountPhp > 0) {
    const ratio = opts.totalCost / opts.paymentAmountPhp;
    if (ratio >= HEAVY_THRESHOLDS.cost_ratio) { score += 35; flags.push(`Cost ratio ${Math.round(ratio * 100)}% — heavy compute use`); }
    else if (ratio >= 0.50) { score += 15; }
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
