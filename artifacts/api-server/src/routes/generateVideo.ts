import { Router } from "express";
import { imageToVideo, FalError } from "../lib/fal.js";
import { enhancePrompt } from "../lib/promptEnhancer.js";
import { uploadUrlToCloudinary } from "../lib/cloudinaryServer.js";
import { videoSemaphore } from "../lib/queue.js";
import { logger } from "../lib/logger.js";
import { requireAuth, getAuthedUser, getRequestSupabase } from "../lib/supabaseAuth.js";
import { gateAndConsume, shouldRefund, type CreditAction } from "../lib/billing.js";
import { trackUsage } from "../lib/usageTracker.js";

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

router.post("/generate-video", requireAuth, async (req, res) => {
  const user = getAuthedUser(req);
  const sb   = getRequestSupabase(req);

  const {
    imageUrl,
    prompt = "",
    aspect = "9:16",
    durationSec = 5,
    hd: hdReq = true,
  } = req.body as {
    imageUrl?: string; prompt?: string; aspect?: string; durationSec?: number; hd?: boolean;
  };

  if (!imageUrl) return res.status(400).json({ error: "imageUrl is required for video generation" });

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
    const rawVideoUrl = await videoSemaphore.run(() => imageToVideo(imageUrl, videoPrompt, aspect, dur));
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
    }).catch(() => {});

    return res.json({
      videoUrl, thumbnailUrl: imageUrl, type: "video", durationSec: dur,
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
