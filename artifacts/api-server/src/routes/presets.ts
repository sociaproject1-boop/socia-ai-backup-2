import { Router } from "express";
import { generateImage, editImageWithPrompt } from "../lib/openai.js";
import { imageToVideo, isMockMode, FalError } from "../lib/fal.js";
import { uploadBufferToCloudinary, uploadUrlToCloudinary } from "../lib/cloudinaryServer.js";
import { imageSemaphore, videoSemaphore } from "../lib/queue.js";
import { logger } from "../lib/logger.js";
import { requireAuth, getAuthedUser, getRequestSupabase } from "../lib/supabaseAuth.js";
import { gateAndConsume, shouldRefund, type CreditAction } from "../lib/billing.js";
import {
  PRESETS,
  getPreset,
  sanitizePreset,
  buildFinalPromptAdvanced,
} from "../lib/presets.js";
import { downloadImageToTempFile } from "../lib/imageDownload.js";

const router = Router();

/**
 * Public catalog of presets — sanitised. Never exposes the prompt template.
 * No auth required so the studio screen can render instantly.
 */
router.get("/presets", (_req, res) => {
  res.json({ presets: PRESETS.map(sanitizePreset) });
});

/** Map a FalError to a friendly HTTP response. */
function falToHttp(err: FalError): { status: number; body: { error: string; code: string } } {
  switch (err.code) {
    case "FAL_AUTH":
      return { status: 500, body: { error: "Video service authentication failed. Contact support.", code: err.code } };
    case "FAL_BILLING":
      return { status: 503, body: { error: "Video generation is temporarily unavailable (provider balance exhausted). Try again later.", code: err.code } };
    case "FAL_FORBIDDEN":
      return { status: 403, body: { error: err.message, code: err.code } };
    case "FAL_MODERATED":
      return { status: 400, body: { error: "This image or prompt was blocked by the content safety filter. Try a different one.", code: err.code } };
    case "FAL_INVALID_INPUT":
      return { status: 400, body: { error: err.message, code: err.code } };
    case "FAL_RATE_LIMITED":
      return { status: 429, body: { error: "Too many requests right now. Please try again in a moment.", code: err.code } };
    case "FAL_UNAVAILABLE":
    case "FAL_TIMEOUT":
      return { status: 503, body: { error: err.message, code: err.code } };
    case "FAL_NO_OUTPUT":
    case "FAL_FAILED":
    default:
      return { status: 502, body: { error: err.message || "Video generation failed.", code: err.code } };
  }
}

/**
 * 1-click generation from a preset.
 *
 * Body: {
 *   presetId         — string (required)
 *   imageUrl?        — string (public https URL)
 *   userText?        — string ≤500 chars, folded into {subject} token
 *   cameraMotion?    — string, appended as camera instruction (video especially)
 *   lightingOverride? — string, overrides lighting description in prompt
 *   negativePhraseExtra? — string, extra things to avoid (appended to negatives)
 *   durationOverride? — 5 | 10, overrides preset's default durationSec for video
 * }
 */
router.post("/generate-from-preset", requireAuth, async (req, res) => {
  const user = getAuthedUser(req);
  const sb = getRequestSupabase(req);

  const body = (req.body ?? {}) as Record<string, unknown>;
  const presetId = body.presetId;
  const imageUrl = body.imageUrl;
  const userText = body.userText;
  const cameraMotion = body.cameraMotion;
  const lightingOverride = body.lightingOverride;
  const negativePhraseExtra = body.negativePhraseExtra;
  const durationOverride = body.durationOverride;

  if (typeof presetId !== "string" || !presetId) {
    return res.status(400).json({ error: "presetId is required (string)" });
  }
  const preset = getPreset(presetId);
  if (!preset) {
    return res.status(404).json({ error: `Unknown preset: ${presetId}` });
  }

  // Strict type checks
  if (imageUrl !== undefined && typeof imageUrl !== "string") {
    return res.status(400).json({ error: "imageUrl must be a string" });
  }
  if (userText !== undefined && typeof userText !== "string") {
    return res.status(400).json({ error: "userText must be a string" });
  }
  if (cameraMotion !== undefined && typeof cameraMotion !== "string") {
    return res.status(400).json({ error: "cameraMotion must be a string" });
  }
  if (lightingOverride !== undefined && typeof lightingOverride !== "string") {
    return res.status(400).json({ error: "lightingOverride must be a string" });
  }
  if (negativePhraseExtra !== undefined && typeof negativePhraseExtra !== "string") {
    return res.status(400).json({ error: "negativePhraseExtra must be a string" });
  }
  if (durationOverride !== undefined && durationOverride !== 5 && durationOverride !== 10) {
    return res.status(400).json({ error: "durationOverride must be 5 or 10" });
  }

  const needsImage = preset.kind === "video" || preset.requiresUploadedImage;
  if (needsImage && !imageUrl) {
    return res.status(400).json({
      error: "This preset requires an uploaded image.",
      code: "IMAGE_REQUIRED",
    });
  }
  if (imageUrl && !/^https?:\/\//.test(imageUrl)) {
    return res.status(400).json({ error: "imageUrl must be a public http(s) URL" });
  }
  if (userText && userText.length > 500) {
    return res.status(400).json({ error: "userText is too long (max 500 chars)" });
  }
  if (cameraMotion && cameraMotion.length > 300) {
    return res.status(400).json({ error: "cameraMotion is too long (max 300 chars)" });
  }
  if (lightingOverride && lightingOverride.length > 300) {
    return res.status(400).json({ error: "lightingOverride is too long (max 300 chars)" });
  }
  if (negativePhraseExtra && negativePhraseExtra.length > 300) {
    return res.status(400).json({ error: "negativePhraseExtra is too long (max 300 chars)" });
  }

  // Effective duration (preset default → override)
  const effectiveDuration: 5 | 10 =
    (durationOverride as 5 | 10 | undefined) ?? preset.durationSec ?? 5;

  // FAL mock-mode guard (CRITICAL): only for video presets, since the image
  // preset path runs through OpenAI. Refuses BEFORE the credit gate so no
  // deduction happens when fal.ts would silently return demo MP4s.
  if (preset.kind === "video" && isMockMode() && process.env["NODE_ENV"] === "production") {
    return res.status(503).json({
      error: "Video presets are temporarily unavailable. No credits were charged.",
      code:  "PROVIDER_NOT_CONFIGURED",
    });
  }

  // Plan-aware credit gate
  const gate = await gateAndConsume(req, sb, {
    freeKind: preset.kind,
    pickAction: (saver): CreditAction => {
      if (preset.kind === "video") {
        const wantHd = !saver;
        if (effectiveDuration >= 10) return wantHd ? "hd_video_10s" : "std_video_10s";
        return wantHd ? "hd_video_5s" : "std_video_5s";
      }
      return saver ? "std_image" : "hd_image";
    },
  });
  if (!gate.ok) return res.status(gate.status).json(gate.body);

  const quality: "standard" | "hd" = gate.plan === "free" || gate.smart_saver ? "standard" : "hd";

  const finalPrompt = buildFinalPromptAdvanced(
    preset,
    userText as string | undefined,
    {
      cameraMotion: cameraMotion as string | undefined,
      lightingOverride: lightingOverride as string | undefined,
      negativePhraseExtra: negativePhraseExtra as string | undefined,
    },
  );

  logger.info(
    {
      userId: user.id,
      presetId: preset.id,
      kind: preset.kind,
      requiresUploadedImage: preset.requiresUploadedImage,
      plan: gate.plan,
      cost: gate.cost,
      smart_saver: gate.smart_saver,
      promptLen: finalPrompt.length,
      cameraMotion: !!cameraMotion,
      lightingOverride: !!lightingOverride,
      durationOverride,
    },
    "Preset generation started",
  );

  try {
    // ── VIDEO PRESET ────────────────────────────────────────────────────────
    if (preset.kind === "video") {
      const aspect = preset.defaultAspect;
      const rawUrl = await videoSemaphore.run(() =>
        imageToVideo(imageUrl as string, finalPrompt, aspect, effectiveDuration),
      );
      const videoUrl = await uploadUrlToCloudinary(
        rawUrl,
        "video",
        `${preset.id}_${Date.now()}`,
      );
      logger.info({ userId: user.id, presetId: preset.id }, "Preset video succeeded");
      return res.json({
        type: "video",
        url: imageUrl as string,
        videoUrl,
        thumbnailUrl: imageUrl as string,
        durationSec: effectiveDuration,
        prompt: finalPrompt,
        presetUsed: { id: preset.id, title: preset.title, category: preset.category },
        billing: { plan: gate.plan, cost: gate.cost, balance: gate.balance, smart_saver: gate.smart_saver, remaining: gate.remaining, limit: gate.limit },
      });
    }

    // ── IMAGE PRESET ────────────────────────────────────────────────────────
    let buffer: Buffer;
    if (preset.requiresUploadedImage) {
      const dl = await downloadImageToTempFile(imageUrl as string);
      try {
        buffer = await imageSemaphore.run(() =>
          editImageWithPrompt(dl.filePath, finalPrompt),
        );
      } finally {
        await dl.cleanup().catch(() => {});
      }
    } else {
      buffer = await imageSemaphore.run(() =>
        generateImage(finalPrompt, preset.defaultAspect, quality),
      );
    }
    const imageUrlOut = await uploadBufferToCloudinary(
      buffer,
      "image",
      `${preset.id}_${Date.now()}`,
    );
    logger.info({ userId: user.id, presetId: preset.id, edit: preset.requiresUploadedImage }, "Preset image succeeded");
    return res.json({
      type: "image",
      url: imageUrlOut,
      prompt: finalPrompt,
      presetUsed: { id: preset.id, title: preset.title, category: preset.category },
      billing: { plan: gate.plan, cost: gate.cost, balance: gate.balance, smart_saver: gate.smart_saver, remaining: gate.remaining, limit: gate.limit },
    });
  } catch (err) {
    if (err instanceof FalError) {
      const { status, body } = falToHttp(err);
      logger.error(
        { code: err.code, msg: err.message, presetId, userId: user.id },
        "Preset video failed (fal.ai)",
      );
      if (shouldRefund(err.code)) await gate.refund(err.code);
      return res.status(status).json(body);
    }
    const msg =
      err instanceof Error ? err.message : "Preset generation failed. Please try again.";
    logger.error({ err, presetId, userId: user.id }, "Preset generation failed");
    if (shouldRefund("INTERNAL")) await gate.refund("preset_internal_error");
    return res.status(500).json({ error: msg, code: "INTERNAL" });
  }
});

export default router;
