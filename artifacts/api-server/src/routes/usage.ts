/**
 * User-facing usage history routes.
 *
 * ⚠️  PRIVACY RULE: `estimated_cost` is NEVER included in any response here.
 *     Only user-safe fields are returned (tool, model, status, timestamps, duration).
 *
 * Routes:
 *   GET /api/usage/my          — paginated activity history (no cost data)
 *   GET /api/usage/my/summary  — generation counts by tool type
 */

import { Router } from "express";
import { requireAuth, getAuthedUser, getRequestSupabase } from "../lib/supabaseAuth.js";

const router = Router();

/* ── Columns safe to return to users — MUST NOT include estimated_cost ── */
const USER_SAFE_COLUMNS = [
  "id",
  "tool_used",
  "model_used",
  "generation_type",
  "status",
  "duration_ms",
  "metadata",       // filtered below — only non-cost fields
  "created_at",
].join(",");

/* ── GET /api/usage/my ────────────────────────────────────────────────── */
router.get("/usage/my", requireAuth, async (req, res): Promise<void> => {
  const supabase = getRequestSupabase(req);
  const user     = getAuthedUser(req);
  const limit    = Math.min(Number(req.query["limit"] ?? 50), 200);
  const offset   = Math.max(Number(req.query["offset"] ?? 0), 0);
  const tool     = req.query["tool"] as string | undefined;

  let query = supabase
    .from("usage_receipts")
    .select(USER_SAFE_COLUMNS)
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (tool) query = query.eq("tool_used", tool);

  const { data, error } = await query;

  if (error) {
    req.log.error({ err: error }, "usage/my query failed");
    res.status(500).json({ code: "DB_ERROR", message: "Could not load activity history." });
    return;
  }

  // Strip any fields that might leak cost data from metadata JSONB
  const safeRows = ((data ?? []) as unknown as Record<string, unknown>[]).map((row) => {
    const { metadata, ...rest } = row;
    const safeMeta: Record<string, unknown> = {};
    if (metadata && typeof metadata === "object") {
      const m = metadata as Record<string, unknown>;
      // Only expose display-safe metadata fields
      const allowedMetaKeys = ["aspect", "quality", "style", "duration_sec", "frame_count", "mode"];
      for (const key of allowedMetaKeys) {
        if (key in m) safeMeta[key] = m[key];
      }
    }
    return { ...rest, metadata: Object.keys(safeMeta).length > 0 ? safeMeta : null };
  });

  res.json({ events: safeRows, limit, offset });
});

/* ── GET /api/usage/my/summary ────────────────────────────────────────── */
router.get("/usage/my/summary", requireAuth, async (req, res): Promise<void> => {
  const supabase = getRequestSupabase(req);
  const user     = getAuthedUser(req);

  // Count events grouped by tool_used for the current calendar month
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const { data, error } = await supabase
    .from("usage_receipts")
    .select("tool_used, status")
    .eq("user_id", user.id)
    .gte("created_at", monthStart.toISOString());

  if (error) {
    req.log.error({ err: error }, "usage/my/summary query failed");
    res.status(500).json({ code: "DB_ERROR", message: "Could not load usage summary." });
    return;
  }

  const rows = (data ?? []) as Array<{ tool_used: string; status: string }>;

  const counts: Record<string, number> = {};
  for (const row of rows) {
    if (row.status === "success") {
      counts[row.tool_used] = (counts[row.tool_used] ?? 0) + 1;
    }
  }

  res.json({
    period: "current_month",
    period_start: monthStart.toISOString(),
    image_generations:   (counts["image_generation"] ?? 0) + (counts["preset_studio"] ?? 0),
    video_generations:   (counts["video_generation"] ?? 0) + (counts["multiframe_video"] ?? 0),
    ai_chat_messages:    counts["ai_chat"] ?? 0,
    total_generations:   rows.filter((r) => r.status === "success").length,
    by_tool: counts,
  });
});

export default router;
