import { Router } from "express";
import { createRateLimiter } from "../lib/rateLimit.js";
import { generateImage, expandPromptWithAI } from "../lib/openai.js";
import { enhancePromptAdvanced, expandShortPrompt } from "../lib/promptEnhancer.js";
import { uploadBufferToCloudinary } from "../lib/cloudinaryServer.js";
import { imageSemaphore } from "../lib/queue.js";
import { logger } from "../lib/logger.js";
import { requireAuth, getAuthedUser, getRequestSupabase } from "../lib/supabaseAuth.js";
import { gateAndConsume, shouldRefund } from "../lib/billing.js";
import { trackUsage } from "../lib/usageTracker.js";

const router = Router();

const PORTRAIT_LABELS = new Set([
  "2:3", "3:4", "4:5", "9:16", "1:2",
  "TikTok", "Story", "IG Story", "IG Portrait", "Phone WP",
]);
const LANDSCAPE_LABELS = new Set([
  "3:2", "4:3", "5:4", "16:9", "21:9", "2:1",
  "YT Thumb", "FB Post", "IG Wide", "Wallpaper", "Desktop WP", "CinemaScope", "Cinema",
]);

function resolveApiAspect(label: string): "1:1" | "9:16" | "16:9" {
  if (PORTRAIT_LABELS.has(label)) return "9:16";
  if (LANDSCAPE_LABELS.has(label)) return "16:9";
  return "1:1";
}

router.post("/generate-image", createRateLimiter({ name: "gen-image", windowSec: 60, max: 20 }), requireAuth, async (req, res) => {
  const user = getAuthedUser(req);
  const sb   = getRequestSupabase(req);

  const {
    prompt = "",
    style,
    aspect = "1:1",
    hd: hdReq = true,
    negativePrompt,
    lightingStyle,
    cameraLens,
  } = req.body as {
    prompt?: string;
    style?: string;
    aspect?: string;
    hd?: boolean;
    negativePrompt?: string;
    lightingStyle?: string;
    cameraLens?: string;
  };

  if (!prompt.trim()) return res.status(400).json({ error: "prompt is required" });

  const apiAspect = resolveApiAspect(aspect);

  const gate = await gateAndConsume(req, sb, {
    freeKind: "image",
    pickAction: (saver) => (saver || !hdReq ? "std_image" : "hd_image"),
  });
  if (!gate.ok) return res.status(gate.status).json(gate.body);

  const quality: "standard" | "hd" =
    gate.plan === "free" ? "standard" : (gate.smart_saver || !hdReq ? "standard" : "hd");

  logger.info(
    { userId: user.id, plan: gate.plan, style, aspect, apiAspect, quality, smart_saver: gate.smart_saver, cost: gate.cost },
    "Image generation started",
  );

  try {
    const result = await imageSemaphore.run(async () => {
      let enhanced = enhancePromptAdvanced(prompt, { style, lightingStyle, cameraLens, negativePrompt });
      const wordCount = prompt.trim().split(/\s+/).length;
      if (gate.plan !== "free" || wordCount < 6) {
        enhanced = await expandPromptWithAI(prompt, style ?? "");
        if (lightingStyle || cameraLens || negativePrompt) {
          if (lightingStyle) enhanced += `, ${lightingStyle} lighting`;
          if (cameraLens) enhanced += `, ${cameraLens}`;
          if (negativePrompt?.trim()) enhanced += `. Avoid: ${negativePrompt}`;
        }
      } else {
        enhanced = expandShortPrompt(enhanced);
      }
      const buffer   = await generateImage(enhanced, apiAspect, quality);
      const imageUrl = await uploadBufferToCloudinary(buffer, "image", prompt);
      return { imageUrl, enhancedPrompt: enhanced };
    });

    logger.info({ userId: user.id, plan: gate.plan }, "Image generation succeeded");

    const genType = gate.plan === "free" ? "std_image" : (gate.smart_saver || !hdReq ? "std_image" : "hd_image");
    trackUsage(sb, user.id, {
      tool_used:       "image_generation",
      generation_type: genType,
      model_used:      "gpt-image-1",
      status:          "success",
      metadata:        { aspect, apiAspect, quality, style: style ?? null, plan: gate.plan },
    }).catch(() => {});

    return res.json({
      url:            result.imageUrl,
      type:           "image",
      prompt:         result.enhancedPrompt,
      originalPrompt: prompt,
      quality,
      billing: {
        plan: gate.plan, cost: gate.cost, balance: gate.balance,
        smart_saver: gate.smart_saver, cooldown_until: gate.cooldown_until,
        remaining: gate.remaining, limit: gate.limit,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Image generation failed.";
    logger.error({ err, userId: user.id }, "Image generation failed");
    if (shouldRefund(null)) await gate.refund("image_internal_error");
    trackUsage(sb, user.id, {
      tool_used: "image_generation", generation_type: "std_image",
      model_used: "gpt-image-1", status: "failed",
      metadata:  { aspect, quality: quality ?? "standard", plan: gate.plan },
    }).catch(() => {});
    return res.status(500).json({ error: msg, code: "INTERNAL" });
  }
});

export default router;
