import { Router } from "express";
import { createRateLimiter } from "../lib/rateLimit.js";
import { interpolateLuma, isMockMode, FalError } from "../lib/fal.js";
import { composeSegmentPrompt } from "../lib/beatPrompt.js";
import { uploadBufferToCloudinary } from "../lib/cloudinaryServer.js";
import { stitchMp4Urls, StitchError } from "../lib/videoStitch.js";
import { videoSemaphore } from "../lib/queue.js";
import { logger } from "../lib/logger.js";
import { requireAuth, getAuthedUser, getRequestSupabase } from "../lib/replitAuth.js";
import { gateAndConsume, shouldRefund } from "../lib/billing.js";
import { trackUsage } from "../lib/usageTracker.js";
import { evaluateRequest, recordEvent, invalidateSpendCache } from "../lib/aiGovernance.js";

const router = Router();

const MIN_FRAMES = 2;
const MAX_FRAMES = 10;

/**
 * Multi-frame storyboard → single video.
 *
 * Pipeline (every step is real, no fakes):
 *   1. Validate N frames (2–10), all https URLs.
 *   2. Consume ONE video quota credit (not N-1 — fairer to the user).
 *   3. For each consecutive pair (frame[i], frame[i+1]):
 *        - Real call to fal.ai Luma Dream Machine `keyframes` endpoint.
 *        - Per-frame caption from `framePrompts[i]` (falls back to
 *          `globalPrompt`). The caption guides ONLY that segment.
 *   4. Download every segment MP4, stitch with ffmpeg (libx264 re-encode for
 *      cross-provider safety), drop audio (Luma clips are silent).
 *   5. Upload merged MP4 to Cloudinary as the final public URL.
 *   6. Return total duration, segment count, per-segment metadata.
 *
 * Honest limitations (documented for the client):
 *   - Each Luma segment is fixed at ~5s; total = (N-1) × 5s. There's no
 *     server-side knob for per-segment duration on Luma.
 *   - Segments are generated SEQUENTIALLY to respect fal.ai per-account
 *     concurrency. N=10 takes (N-1) × ~60s ≈ 9 minutes.
 *   - Character/outfit/scene consistency depends entirely on how similar
 *     consecutive user frames are. If the frames depict different characters,
 *     Luma will render exactly that — a hard cut interpolation.
 */
router.post("/generate-multiframe-video", createRateLimiter({ name: "gen-mf-video", windowSec: 60, max: 5 }), requireAuth, async (req, res) => {
  const user = getAuthedUser(req);
  const sb = getRequestSupabase(req);

  const {
    images = [],
    framePrompts = [],
    globalPrompt = "",
    aspect = "9:16",
    frameBeats = [],
    frameDirections = [],
    frameContinuity = [],
  } = req.body as {
    images?: string[];
    framePrompts?: string[];
    globalPrompt?: string;
    aspect?: string;
    frameBeats?: Array<Array<{
      startSec?: number; endSec?: number;
      cameraMove?: string; motionStrength?: string;
      facialBehavior?: string; effect?: string;
    }>>;
    frameDirections?: Array<{ cameraMove?: string; motionStrength?: string; emotion?: string }>;
    frameContinuity?: Array<{
      keepFace?: boolean; keepOutfit?: boolean; keepHairstyle?: boolean;
      keepEnvironment?: boolean; keepLighting?: boolean; keepCinematicTone?: boolean;
    }>;
  };

  // ── 1. Validate inputs ─────────────────────────────────────────────────
  if (!Array.isArray(images) || images.length < MIN_FRAMES || images.length > MAX_FRAMES) {
    return res.status(400).json({
      error: `Provide ${MIN_FRAMES}–${MAX_FRAMES} frames.`,
      code: "INVALID_FRAME_COUNT",
    });
  }
  for (let i = 0; i < images.length; i++) {
    if (typeof images[i] !== "string" || !/^https?:\/\//.test(images[i])) {
      return res.status(400).json({
        error: `Frame ${i + 1} is not a valid public URL.`,
        code: "INVALID_FRAME_URL",
      });
    }
  }

  // FAL mock-mode guard (CRITICAL): if FAL_KEY is missing in production,
  // refuse BEFORE consuming credits. fal.ts would silently return demo
  // MP4s while we charge 60 real credits. Mirrors /generate-video guard.
  if (isMockMode() && process.env["NODE_ENV"] === "production") {
    logger.error({ userId: user.id }, "[generateMultiframeVideo] Refusing — FAL_KEY missing in production");
    return res.status(503).json({
      error: "Multi-frame video is temporarily unavailable. No credits were charged.",
      code:  "PROVIDER_NOT_CONFIGURED",
    });
  }

  // ── AI governance gate (BEFORE any credit consumption) ────────────────
  const gov = await evaluateRequest("multiframe_video", { requireProvider: "fal" });
  if (!gov.allowed) {
    void recordEvent({
      eventType: gov.code === "BUDGET_EXHAUSTED" ? "budget_pause" : "block",
      feature: "multiframe_video",
      reason: gov.message ?? "Blocked by governance.",
      scope: "feature",
      meta: { code: gov.code, userRef: user.id.slice(0, 8) },
    });
    return res.status(gov.code === "BUDGET_EXHAUSTED" ? 402 : 403).json({
      error: gov.message ?? "This feature is currently unavailable.",
      code: gov.code ?? "BLOCKED",
    });
  }

  // ── 2. Credit gate — multi_frame is a flat 60-credit charge (paid). ────
  const gate = await gateAndConsume(req, sb, {
    freeKind:   "video",
    pickAction: () => "multi_frame",
  });
  if (!gate.ok) return res.status(gate.status).json(gate.body);

  const segmentCount = images.length - 1;
  logger.info(
    { userId: user.id, plan: gate.plan, frames: images.length, segments: segmentCount, aspect, cost: gate.cost },
    "Multi-frame video generation started",
  );

  try {
    // ── 3. Generate every (frame[i] → frame[i+1]) segment with Luma ─────
    const segmentUrls: string[] = [];
    const segmentMeta: Array<{ index: number; prompt: string; videoUrl: string }> = [];

    for (let i = 0; i < segmentCount; i++) {
      const frame0 = images[i];
      const frame1 = images[i + 1];
      const basePrompt =
        (framePrompts[i] && framePrompts[i].trim()) ||
        globalPrompt.trim() ||
        "smooth cinematic transition, natural movement, photorealistic motion";
      const dir = frameDirections[i] || {};
      const cont = frameContinuity[i] || {};
      const segPrompt = composeSegmentPrompt({
        basePrompt,
        cameraMove:        dir.cameraMove,
        motionStrength:    dir.motionStrength,
        emotion:           dir.emotion,
        beats:             frameBeats[i] || [],
        keepFace:          cont.keepFace,
        keepOutfit:        cont.keepOutfit,
        keepHairstyle:     cont.keepHairstyle,
        keepEnvironment:   cont.keepEnvironment,
        keepLighting:      cont.keepLighting,
        keepCinematicTone: cont.keepCinematicTone,
      });

      logger.info(
        { userId: user.id, segment: i + 1, of: segmentCount },
        "Multi-frame: launching Luma segment",
      );

      const url = await videoSemaphore.run(() =>
        interpolateLuma(frame0, frame1, segPrompt, aspect),
      );

      segmentUrls.push(url);
      segmentMeta.push({ index: i, prompt: segPrompt, videoUrl: url });
    }

    // ── 4. Stitch with ffmpeg ─────────────────────────────────────────
    logger.info({ userId: user.id, segments: segmentUrls.length }, "Multi-frame: stitching");
    const mergedBuffer = await stitchMp4Urls(segmentUrls);

    // ── 5. Upload merged MP4 to Cloudinary ────────────────────────────
    const finalUrl = await uploadBufferToCloudinary(
      mergedBuffer,
      "video",
      `multiframe_${segmentCount}seg`,
    );

    // ~5s per Luma segment; document this honestly to the client.
    const totalDurationSec = segmentCount * 5;

    logger.info(
      { userId: user.id, plan: gate.plan, segments: segmentCount, totalDurationSec, bytes: mergedBuffer.length },
      "Multi-frame video generation succeeded",
    );

    // Fire-and-forget usage tracking (admin-only cost data, never in response)
    trackUsage(sb, user.id, {
      tool_used:       "multiframe_video",
      generation_type: "multi_frame",
      model_used:      "luma",
      status:          "success",
      metadata:        { aspect, frame_count: images.length, segment_count: segmentCount, duration_sec: totalDurationSec, plan: gate.plan },
    }).then(() => invalidateSpendCache()).catch(() => {});

    return res.json({
      videoUrl: finalUrl,
      thumbnailUrl: images[0],
      type: "video",
      durationSec: totalDurationSec,
      segments: segmentMeta,
      frameCount: images.length,
      provider: "fal-ai/luma-dream-machine",
      billing: {
        plan: gate.plan, cost: gate.cost, balance: gate.balance,
        smart_saver: gate.smart_saver, cooldown_until: gate.cooldown_until,
        remaining: gate.remaining, limit: gate.limit,
      },
    });
  } catch (err) {
    if (err instanceof FalError) {
      // Same mapping as the single-segment route.
      const status =
        err.code === "FAL_AUTH"          ? 500 :
        err.code === "FAL_BILLING"       ? 503 :
        err.code === "FAL_FORBIDDEN"     ? 403 :
        err.code === "FAL_MODERATED"     ? 400 :
        err.code === "FAL_INVALID_INPUT" ? 400 :
        err.code === "FAL_RATE_LIMITED"  ? 429 :
        err.code === "FAL_UNAVAILABLE"   ? 503 :
        err.code === "FAL_TIMEOUT"       ? 503 : 502;
      const friendly =
        err.code === "FAL_BILLING"
          ? "Video generation is temporarily unavailable (provider balance exhausted). Try again later."
          : err.code === "FAL_MODERATED"
          ? "One of your frames or captions was blocked by the safety filter."
          : err.message;
      logger.error(
        { code: err.code, status: err.status, msg: err.message, userId: user.id },
        "Multi-frame video failed (fal.ai)",
      );
      if (shouldRefund(err.code)) await gate.refund(err.code);
      return res.status(status).json({ error: friendly, code: err.code });
    }
    if (err instanceof StitchError) {
      logger.error({ err: err.message, userId: user.id }, "Multi-frame stitch failed");
      if (shouldRefund("STITCH_FAILED")) await gate.refund("stitch_failed");
      return res.status(500).json({
        error: "Failed to stitch video segments. Your credits were refunded.",
        code: "STITCH_FAILED",
      });
    }
    const msg = err instanceof Error ? err.message : "Multi-frame video generation failed.";
    logger.error({ err, userId: user.id }, "Multi-frame video generation failed");
    if (shouldRefund("INTERNAL")) await gate.refund("multiframe_internal_error");
    return res.status(500).json({ error: msg, code: "INTERNAL" });
  }
});

export default router;
