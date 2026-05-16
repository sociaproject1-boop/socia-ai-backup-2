/**
 * SociaGPT chat endpoint — now with AI subscription plan routing,
 * per-plan rate limiting, abuse detection, and usage tracking.
 *
 * POST /api/socia-gpt/chat
 *
 * Plans:
 *   free    → gpt-4o-mini  | 15/day   | 20s cooldown | 300 words max
 *   premium → gpt-4o       | 300/mo   |  8s cooldown | 4000 words max
 *   ultra   → o1-mini      | 120/mo   | 20s cooldown | 8000 words max
 */
import { Router } from "express";
import { openai } from "@workspace/integrations-openai-ai-server";
import { logger } from "../lib/logger.js";
import { requireAuth, getAuthedUser, getRequestSupabase } from "../lib/supabaseAuth.js";
import { buildSystemPrompt, type SociaGptMode } from "../lib/sociaGptSystem.js";
import {
  buildAttachmentParts, validateAttachments,
  type ChatAttachment, type OpenAIContentPart,
} from "../lib/sociaGptMedia.js";
import { attachAIPlan, AI_PLANS } from "../lib/aiSubscription.js";
import { checkCooldown, recordRequest, checkAndIncrementUsage } from "../lib/aiRateLimit.js";
import { checkAbuse, escalateCooldown } from "../lib/aiAbuseGuard.js";
import { trackUsage, AI_PLAN_COST_KEY } from "../lib/usageTracker.js";

const router = Router();

const MAX_MESSAGES = 30;

interface ChatTurn {
  role: "user" | "assistant";
  content: string;
  attachments?: ChatAttachment[];
}

const VALID_MODES = new Set<SociaGptMode>([
  "general", "prompt-fixer", "tiktok", "shopee", "fashion",
  "cinematic", "ai-influencer", "product-ads", "video-director",
]);

/**
 * POST /api/socia-gpt/chat
 * Body: {
 *   messages: [{ role:"user"|"assistant", content:string, attachments?: [...] }],
 *   mode?: SociaGptMode,
 * }
 *
 * Streams the assistant's reply as Server-Sent Events:
 *   event: token   data: {"text":"..."}
 *   event: done    data: {"chars":N,"plan":"free","used":N,"limit":N}
 *   event: error   data: {"error":"...","code":"..."}
 */
router.post(
  "/socia-gpt/chat",
  requireAuth,
  attachAIPlan,
  async (req, res): Promise<void> => {
    const user = getAuthedUser(req);
    const plan = req.aiPlan ?? AI_PLANS.free;

    // ── 1. Abuse detection ─────────────────────────────────────────────
    const abuse = checkAbuse(user.id);
    if (!abuse.allowed) {
      res.status(429).json({
        error: abuse.reason ?? "Too many requests. Please slow down.",
        code: "ABUSE_DETECTED",
        retryAfterSec: abuse.retryAfterSec,
        abuseScore: abuse.abuseScore,
      });
      return;
    }

    // ── 2. Cooldown enforcement ────────────────────────────────────────
    const cd = checkCooldown(user.id, plan);
    if (!cd.allowed) {
      res.setHeader("Retry-After", String(cd.retryAfterSec));
      res.status(429).json({
        error: `Please wait ${cd.retryAfterSec}s before sending another message.`,
        code: "COOLDOWN",
        retryAfterSec: cd.retryAfterSec,
        plan: plan.code,
      });
      return;
    }

    // ── 3. Validate request body ───────────────────────────────────────
    const body        = (req.body ?? {}) as Record<string, unknown>;
    const rawMessages = body.messages;
    const rawMode     = body.mode;

    if (!Array.isArray(rawMessages) || rawMessages.length === 0) {
      res.status(400).json({ error: "messages must be a non-empty array" }); return;
    }

    const maxMessages = plan.maxMessages;
    if (rawMessages.length > MAX_MESSAGES) {
      res.status(400).json({ error: `messages too long (max ${MAX_MESSAGES})` }); return;
    }

    // Word limit for free plan
    const maxChars = plan.maxWords * 6; // ~6 chars per word estimate
    const messages: ChatTurn[] = [];
    for (const m of rawMessages) {
      if (!m || typeof m !== "object") {
        res.status(400).json({ error: "messages must be objects with role+content" }); return;
      }
      const mm = m as Record<string, unknown>;
      if (mm.role !== "user" && mm.role !== "assistant") {
        res.status(400).json({ error: "message.role must be 'user' or 'assistant'" }); return;
      }
      if (typeof mm.content !== "string") {
        res.status(400).json({ error: "message.content must be a string" }); return;
      }
      if (mm.content.length > maxChars) {
        res.status(400).json({
          error: `Message too long. Your ${plan.label} plan allows up to ${plan.maxWords} words per message.`,
          code: "MESSAGE_TOO_LONG",
          maxWords: plan.maxWords,
          plan: plan.code,
        }); return;
      }
      let attachments: ChatAttachment[] | undefined;
      try { attachments = validateAttachments(mm.attachments); }
      catch (e) {
        res.status(400).json({ error: e instanceof Error ? e.message : "invalid attachments" }); return;
      }
      messages.push({ role: mm.role as "user" | "assistant", content: mm.content, attachments });
    }

    if (messages[messages.length - 1].role !== "user") {
      res.status(400).json({ error: "last message must be from the user" }); return;
    }

    // Free plan: only 1 active conversation stream (enforce via single message check)
    if (plan.code === "free" && messages.filter((m) => m.role === "user").length > maxMessages) {
      res.status(403).json({
        error: "Free plan allows limited conversation length. Upgrade for longer conversations.",
        code: "PLAN_LIMIT",
        plan: plan.code,
      }); return;
    }

    let mode: SociaGptMode = "general";
    if (rawMode !== undefined) {
      if (typeof rawMode !== "string" || !VALID_MODES.has(rawMode as SociaGptMode)) {
        res.status(400).json({ error: "invalid mode" }); return;
      }
      mode = rawMode as SociaGptMode;
    }

    // ── 4. Usage limit check (daily/monthly) ──────────────────────────
    const supabase = getRequestSupabase(req);
    const usageResult = await checkAndIncrementUsage(supabase, user.id, plan);

    if (!usageResult.allowed) {
      const periodLabel = usageResult.period === "daily" ? "today" : "this month";
      res.status(429).json({
        error: `You've used all ${usageResult.limit} ${plan.label} messages ${periodLabel}. ${
          plan.code === "free"
            ? "Upgrade to Premium AI for 300 messages/month."
            : "Resets at the start of next period."
        }`,
        code: "USAGE_LIMIT_EXCEEDED",
        used: usageResult.used,
        limit: usageResult.limit,
        period: usageResult.period,
        resetAt: usageResult.resetAt,
        plan: plan.code,
        upgradeUrl: plan.code === "free" ? "/socia-gpt/billing" : null,
      });
      return;
    }

    // ── 5. Record the request (cooldown clock starts now) ─────────────
    recordRequest(user.id);

    // ── 6. Process attachments on the LAST user turn only ─────────────
    const lastIdx = messages.length - 1;
    const last    = messages[lastIdx];
    let multimodalLastContent: OpenAIContentPart[] | string = last.content;

    if (last.attachments && last.attachments.length > 0) {
      // Free plan users can only attach images (no audio/video processing to keep costs low)
      if (plan.code === "free") {
        const hasHeavyAttachment = last.attachments.some(
          (a) => a.kind === "audio" || a.kind === "video",
        );
        if (hasHeavyAttachment) {
          res.status(403).json({
            error: "Audio and video attachments require a Premium AI or Ultra Pro subscription.",
            code: "ATTACHMENT_PLAN_LIMIT",
            plan: plan.code,
            upgradeUrl: "/socia-gpt/billing",
          });
          return;
        }
      }
      try {
        const { parts, notes } = await buildAttachmentParts(last.attachments);
        const composedText = [
          last.content?.trim() ? last.content : "(no text — see attachment)",
          ...notes,
        ].join("\n\n");
        multimodalLastContent = [
          { type: "text", text: composedText },
          ...parts,
        ];
      } catch (err) {
        const msg = err instanceof Error ? err.message : "attachment processing failed";
        logger.error({ err, userId: user.id }, "Socia GPT: attachment pre-processing failed");
        res.status(400).json({ error: msg, code: "ATTACHMENT_FAILED" });
        return;
      }
    }

    // ── 7. SSE handshake ──────────────────────────────────────────────
    res.status(200);
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders?.();

    const send = (event: string, payload: unknown) => {
      res.write(`event: ${event}\n`);
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
    };

    const heartbeat = setInterval(() => res.write(`: ping\n\n`), 15_000);
    let aborted = false;
    req.on("close", () => { aborted = true; });

    try {
      const oaMessages = messages.map((m, i) => {
        if (i === lastIdx) {
          return { role: m.role, content: multimodalLastContent } as const;
        }
        return { role: m.role, content: m.content } as const;
      });

      const model          = plan.model;
      const maxOutputTokens = plan.code === "free" ? 1_000 : plan.code === "premium" ? 3_000 : 8_000;

      const stream = await openai.chat.completions.create({
        model,
        stream: true,
        max_completion_tokens: maxOutputTokens,
        messages: [
          { role: "system", content: buildSystemPrompt(mode) },
          ...oaMessages,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ] as any,
      });

      let totalChars = 0;
      for await (const chunk of stream) {
        if (aborted) break;
        const delta = chunk.choices?.[0]?.delta?.content;
        if (typeof delta === "string" && delta.length > 0) {
          totalChars += delta.length;
          send("token", { text: delta });
        }
        const finish = chunk.choices?.[0]?.finish_reason;
        if (finish && finish !== "stop") {
          send("warning", { finishReason: finish });
        }
      }

      if (!aborted) {
        send("done", {
          chars: totalChars,
          plan: plan.code,
          used: usageResult.used,
          limit: usageResult.limit,
          period: usageResult.period,
        });
        const attCount = last.attachments?.length ?? 0;
        logger.info(
          { userId: user.id, mode, turns: messages.length, chars: totalChars, attCount, plan: plan.code, model },
          "Socia GPT reply",
        );

        // Log to ai_requests table (best-effort)
        supabase.from("ai_requests").insert({
          user_id:          user.id,
          plan_code:        plan.code,
          model,
          mode,
          input_chars:      messages.reduce((s, m) => s + m.content.length, 0),
          output_chars:     totalChars,
          attachment_count: attCount,
          status:           "completed",
          abuse_score:      abuse.abuseScore,
        }).then(() => {}).catch(() => {});

        // Fire-and-forget usage tracking (admin-only cost data, never in response)
        const inputChars  = messages.reduce((s, m) => s + m.content.length, 0);
        const costKey     = AI_PLAN_COST_KEY[plan.code] ?? "gpt_msg_mini";
        trackUsage(supabase, user.id, {
          tool_used:       "ai_chat",
          generation_type: costKey,
          model_used:      model,
          status:          "success",
          token_usage:     {
            prompt_tokens:     Math.ceil(inputChars / 4),
            completion_tokens: Math.ceil(totalChars / 4),
            total_tokens:      Math.ceil((inputChars + totalChars) / 4),
          },
          metadata: { mode, plan: plan.code, attachment_count: attCount },
        }).catch(() => {});
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Chat failed";
      logger.error({ err, userId: user.id, mode, plan: plan.code }, "Socia GPT error");

      // If abuse score is elevated and we got an error, escalate cooldown
      if (abuse.abuseScore > 30) {
        escalateCooldown(user.id, 2);
      }

      if (!res.headersSent) {
        res.status(500).json({ error: msg, code: "CHAT_FAILED" }); return;
      } else {
        send("error", { error: msg, code: "CHAT_FAILED" });
      }
    } finally {
      clearInterval(heartbeat);
      if (!res.writableEnded) res.end();
    }
  },
);

export default router;
