import { Router } from "express";
import { createRateLimiter } from "../lib/rateLimit.js";
import { imageToVideo, interpolateKling, isMockMode, FalError } from "../lib/fal.js";
import { enhancePrompt } from "../lib/promptEnhancer.js";
import { uploadUrlToCloudinary } from "../lib/cloudinaryServer.js";
import { videoSemaphore } from "../lib/queue.js";
import { logger } from "../lib/logger.js";
import { requireAuth, getAuthedUser, getRequestSupabase } from "../lib/replitAuth.js";
import { gateAndConsume, shouldRefund, type CreditAction } from "../lib/billing.js";
import { trackUsage } from "../lib/usageTracker.js";
import { evaluateRequest, recordEvent, invalidateSpendCache } from "../lib/aiGovernance.js";

function falToHttp(err: FalError): { status: number; body: { error: string; code: string } } {
  switch (err.code) {
    case "FAL_AUTH":          return { status: 500, body: { error: "Video service authentication failed. Contact support.", code: err.code } };
    case "FAL_BILLING":       return { status: 503, body: { error: "Video generation is temporarily unavailable. Your credits were refunded.", code: err.code } };
    case "FAL_FORBIDDEN":     return { status: 403, body: { error: err.message, code: err.code } };
    case "FAL_MODERATED":     return { status: 400, body: { error: "This image or prompt was blocked by the safety filter.", code: err.code } };
    case "FAL_INVALID_INPUT": return { status: 400, body: { error: err.message, code: err.code } };
    case "FAL_RATE_LIMITED":  return { status: 429, body: { error: "Too many requests right now. Try again in a moment.", code: err.code } };
    case "FAL_UNAVAILABLE":
    case "FAL_TIMEOUT":       return { status: 503, body: { error: err.message, code: err.code } };
    case "FAL_NO_OUTPUT":
    case "FAL_FAILED":
    default:                  return { status: 502, body: { error: err.message || "Video generation failed.", code: err.code } };
  }
}

const router = Router();

router.post("/generate-video", createRateLimiter({ name: "gen-video", windowSec: 60, max: 8 }), requireAuth, async (req, res) => {
  const user = getAuthedUser(req);
  const sb   = getRequestSupabase(req);

  const {
    imageUrl,
    endImageUrl,
    prompt = "",
    aspect = "9:16",
    durationSec = 5,
    hd: hdReq = true,
  } = req.body as {
    imageUrl?: string; endImageUrl?: string; prompt?: string; aspect?: string; durationSec?: number; hd?: boolean;
  };

  if (!imageUrl) return res.status(400).json({ error: "imageUrl is required for video generation" });
  // Validate endImageUrl is a public URL if provided; reject early instead
  // of letting fal.ai 422 us. Empty/undefined is fine — single-frame path.
  const tailUrl = typeof endImageUrl === "string" && /^https?:\/\//.test(endImageUrl)
    ? endImageUrl : undefined;

  // FAL mock-mode guard (CRITICAL): if the provider key is missing, fal.ts
  // silently returns sample MP4s. In production that means we'd charge a
  // real user real credits for a fake video. Refuse the request *before*
  // gateAndConsume so nothing is deducted. In dev, we let it through so
  // the pipeline stays exercisable.
  if (isMockMode() && process.env["NODE_ENV"] === "production") {
    logger.error({ userId: user.id }, "[generateVideo] Refusing request — FAL_KEY missing in production");
    return res.status(503).json({
      error: "Video generation is temporarily unavailable. No credits were charged.",
      code:  "PROVIDER_NOT_CONFIGURED",
    });
  }

  // ── AI governance gate (BEFORE any credit consumption) ────────────────
  const gov = await evaluateRequest("video_generation", { requireProvider: "fal" });
  if (!gov.allowed) {
    void recordEvent({
      eventType: gov.code === "BUDGET_EXHAUSTED" ? "budget_pause" : "block",
      feature: "video_generation",
      reason: gov.message ?? "Blocked by governance.",
      scope: "feature",
      meta: { code: gov.code, userRef: user.id.slice(0, 8) },
    });
    return res.status(gov.code === "BUDGET_EXHAUSTED" ? 402 : 403).json({
      error: gov.message ?? "This feature is currently unavailable.",
      code: gov.code ?? "BLOCKED",
    });
  }

  const dur: 5 | 10 = durationSec >= 10 ? 10 : 5;
  const gate = await gateAndConsume(req, sb, {
    freeKind: "video",
    pickAction: (saver): CreditAction => {
      const wantHd = hdReq && !saver;
      if (dur === 10) return wantHd ? "hd_video_10s" : "std_video_10s";
      return wantHd ? "hd_video_5s" : "std_video_5s";
    },
  });
  if (!gate.ok) return res.status(gate.status).json(gate.body);

  const videoPrompt = prompt.trim()
    ? enhancePrompt(prompt, "Cinematic")
    : "smooth cinematic camera movement, natural light, photorealistic motion, shallow depth of field";

  logger.info({ userId: user.id, plan: gate.plan, aspect, durationSec: dur, cost: gate.cost }, "Video generation started");

  try {
    // If the user supplied an end frame, route to Kling's keyframe
    // interpolation model (start + tail). It is currently locked to a
    // 5s clip on fal.ai; we keep dur=5 even if the user asked for 10s
    // and surface that in the response so the UI can show "5s (keyframe
    // mode)" — better than silently dropping the second frame.
    const usedKeyframes = Boolean(tailUrl);
    const effectiveDur: 5 | 10 = usedKeyframes ? 5 : dur;
    const rawVideoUrl = await videoSemaphore.run(() =>
      usedKeyframes
        ? interpolateKling(imageUrl, tailUrl!, videoPrompt, aspect)
        : imageToVideo(imageUrl, videoPrompt, aspect, dur),
    );
    const videoUrl    = await uploadUrlToCloudinary(rawVideoUrl, "video", prompt);

    logger.info({ userId: user.id, plan: gate.plan }, "Video generation succeeded");

    // Fire-and-forget usage tracking
    const wantHd = hdReq && !gate.smart_saver;
    const vidGenType = dur === 10 ? (wantHd ? "hd_video_10s" : "std_video_10s") : (wantHd ? "hd_video_5s" : "std_video_5s");
    trackUsage(sb, user.id, {
      tool_used:       "video_generation",
      generation_type: vidGenType,
      model_used:      "kling-1.6-pro",
      status:          "success",
      metadata:        { aspect, duration_sec: dur, plan: gate.plan },
    }).then(() => invalidateSpendCache()).catch(() => {});

    return res.json({
      videoUrl, thumbnailUrl: imageUrl, type: "video",
      durationSec: effectiveDur,
      keyframeMode: usedKeyframes,
      billing: {
        plan: gate.plan, cost: gate.cost, balance: gate.balance,
        smart_saver: gate.smart_saver, cooldown_until: gate.cooldown_until,
        remaining: gate.remaining, limit: gate.limit,
      },
    });
  } catch (err) {
    if (err instanceof FalError) {
      const { status, body } = falToHttp(err);
      logger.error({ code: err.code, status: err.status, msg: err.message, userId: user.id }, "Video generation failed (fal.ai)");
      if (shouldRefund(err.code)) await gate.refund(err.code, undefined);
      trackUsage(sb, user.id, {
        tool_used: "video_generation", generation_type: "std_video_5s",
        model_used: "kling-1.6-pro", status: err.code === "FAL_MODERATED" ? "moderated" : "failed",
        metadata: { aspect, duration_sec: dur, fal_code: err.code },
      }).catch(() => {});
      return res.status(status).json(body);
    }
    const msg = err instanceof Error ? err.message : "Video generation failed.";
    logger.error({ err, userId: user.id }, "Video generation failed");
    if (shouldRefund("INTERNAL")) await gate.refund("video_internal_error");
    trackUsage(sb, user.id, {
      tool_used: "video_generation", generation_type: "std_video_5s",
      model_used: "kling-1.6-pro", status: "failed",
      metadata: { aspect, duration_sec: dur },
    }).catch(() => {});
    return res.status(500).json({ error: msg, code: "INTERNAL" });
  }
});

export default router;
