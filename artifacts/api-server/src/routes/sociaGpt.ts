/**
 * SociaGPT chat endpoint — 4-tier AI subscription with smart model routing.
 *
 * POST /api/socia-gpt/chat
 *
 * Plans:
 *   free        → Standard AI  | 30/day   | 15s cooldown | 300 words  | 800 tokens out
 *   premium     → Advanced AI  | 150/day  |  3s cooldown | 4000 words | 3000 tokens out
 *   elite       → Elite AI     | 300/day  |  1s cooldown | 8000 words | 8000 tokens out
 *   super-elite → Pro Reasoning| 500/day  |  0s cooldown | 16000 words| 16000 tokens out
 *
 * Model routing is handled by aiModelRouter.ts — users on paid plans
 * feel unlimited but the router picks the cheapest model that satisfies
 * the request complexity.
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
import { routeModel, getLimitMessage, getCooldownMessage } from "../lib/aiModelRouter.js";
import { getGrok, GROK_FAST, GROK_SMART } from "../lib/grokClient.js";
import { routeXai } from "../lib/xaiRouter.js";

const router = Router();

const MAX_MESSAGES = 50;

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
 */
router.post(
  "/socia-gpt/chat",
  requireAuth,
  attachAIPlan,
  async (req, res): Promise<void> => {
    const user = getAuthedUser(req);
    const plan = req.aiPlan ?? AI_PLANS.free;

    // ── 1. Abuse detection ──────────────────────────────────────────
    const abuse = checkAbuse(user.id);
    if (!abuse.allowed) {
      res.status(429).json({
        error: "Socia GPT is cooling down for your account. High-frequency usage protection is active. Please try again in a few minutes.",
        code:          "ABUSE_DETECTED",
        retryAfterSec: abuse.retryAfterSec,
        abuseScore:    abuse.abuseScore,
      });
      return;
    }

    // ── 2. Cooldown enforcement ─────────────────────────────────────
    const cd = checkCooldown(user.id, plan);
    if (!cd.allowed) {
      res.setHeader("Retry-After", String(cd.retryAfterSec));
      res.status(429).json({
        error:         getCooldownMessage(cd.retryAfterSec, plan),
        code:          "COOLDOWN",
        retryAfterSec: cd.retryAfterSec,
        plan:          plan.code,
      });
      return;
    }

    // ── 3. Validate request body ────────────────────────────────────
    const body        = (req.body ?? {}) as Record<string, unknown>;
    const rawMessages = body.messages;
    const rawMode     = body.mode;

    if (!Array.isArray(rawMessages) || rawMessages.length === 0) {
      res.status(400).json({ error: "messages must be a non-empty array" }); return;
    }

    if (rawMessages.length > MAX_MESSAGES) {
      res.status(400).json({ error: `messages too long (max ${MAX_MESSAGES})` }); return;
    }

    const maxChars = plan.maxWords * 6;
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
          error: `Your message is too long for your current plan. ${plan.label} allows up to ${plan.maxWords.toLocaleString()} words per message.`,
          code:     "MESSAGE_TOO_LONG",
          maxWords: plan.maxWords,
          plan:     plan.code,
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

    let mode: SociaGptMode = "general";
    if (rawMode !== undefined) {
      if (typeof rawMode !== "string" || !VALID_MODES.has(rawMode as SociaGptMode)) {
        res.status(400).json({ error: "invalid mode" }); return;
      }
      mode = rawMode as SociaGptMode;
    }

    // ── 4. Usage limit check (daily) ───────────────────────────────
    const supabase    = getRequestSupabase(req);
    const usageResult = await checkAndIncrementUsage(supabase, user.id, plan);

    if (!usageResult.allowed) {
      res.status(429).json({
        error:     getLimitMessage(plan, usageResult.period, usageResult.used, usageResult.limit),
        code:      "USAGE_LIMIT_EXCEEDED",
        used:      usageResult.used,
        limit:     usageResult.limit,
        period:    usageResult.period,
        resetAt:   usageResult.resetAt,
        plan:      plan.code,
        upgradeUrl: plan.code === "free" ? "/socia-gpt/upgrade" : null,
      });
      return;
    }

    // ── 5. Cooldown clock starts now ────────────────────────────────
    recordRequest(user.id);

    // ── 6. Attachment processing (last turn only) ───────────────────
    const lastIdx = messages.length - 1;
    const last    = messages[lastIdx];
    let multimodalLastContent: OpenAIContentPart[] | string = last.content;

    if (last.attachments && last.attachments.length > 0) {
      // Free plan: images only (cost protection)
      if (plan.allowAttachments === "images-only") {
        const hasHeavy = last.attachments.some((a) => a.kind === "audio" || a.kind === "video");
        if (hasHeavy) {
          res.status(403).json({
            error: "Audio and video attachments are available on Premium and above. Upgrade to unlock full multimodal AI.",
            code:       "ATTACHMENT_PLAN_LIMIT",
            plan:       plan.code,
            upgradeUrl: "/socia-gpt/upgrade",
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

    // ── 7. Smart model routing ──────────────────────────────────────
    // Default = Grok Fast (xAI). Auto-switches to Grok Smart for heavy
    // reasoning / long context. Falls back to OpenAI (existing router)
    // if Grok is not configured or fails mid-flight.
    const lastUserPrompt = last.content || "";
    const historyLen     = messages.filter((m) => m.role === "user").length;
    const totalChars     = messages.reduce((s, m) => s + m.content.length, 0);
    const hasHeavyAttachment = (last.attachments ?? []).some(
      (a) => a.kind === "audio" || a.kind === "video",
    );

    // OpenAI routing decision (used as fallback path).
    const oaRouting = routeModel({
      plan,
      prompt:     lastUserPrompt,
      historyLen,
      abuseScore: abuse.abuseScore,
    });

    // Grok routing decision (used as primary path when XAI_API_KEY set).
    const grok = getGrok();
    const xai  = grok ? routeXai({
      prompt:     lastUserPrompt,
      historyLen,
      totalChars,
      hasHeavyAttachment,
    }) : null;

    // Build the ordered fallback chain: [primary, ...backups].
    // Each attempt has its own client + model. If one errors before any
    // tokens are emitted, we transparently try the next one.
    type Attempt = {
      client:      typeof openai;
      model:       string;
      isReasoning: boolean;
      provider:    "xai" | "openai";
      tier:        "fast" | "smart";
      label:       string;
    };

    const attempts: Attempt[] = [];

    if (grok && xai) {
      // Primary: Grok at the chosen tier.
      attempts.push({
        client:      grok as unknown as typeof openai,
        model:       xai.tier === "smart" ? GROK_SMART : GROK_FAST,
        isReasoning: false,
        provider:    "xai",
        tier:        xai.tier,
        label:       xai.tier === "smart" ? "Auto · Smart" : "Auto · Fast",
      });
      // Safety net: drop to Grok Fast if Smart fails.
      if (xai.tier === "smart") {
        attempts.push({
          client:      grok as unknown as typeof openai,
          model:       GROK_FAST,
          isReasoning: false,
          provider:    "xai",
          tier:        "fast",
          label:       "Auto · Fast",
        });
      }
    }

    // Final fallback: existing OpenAI integration (always works).
    attempts.push({
      client:      openai,
      model:       oaRouting.model,
      isReasoning: oaRouting.model === "o1-mini",
      provider:    "openai",
      tier:        xai?.tier ?? (oaRouting.model === "gpt-4o-mini" ? "fast" : "smart"),
      label:       (xai?.tier ?? "fast") === "smart" ? "Auto · Smart" : "Auto · Fast",
    });

    const maxOutputTokens = plan.maxOutputTokens;

    // ── 8. SSE handshake ───────────────────────────────────────────
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

    const oaMessages = messages.map((m, i) => {
      if (i === lastIdx) {
        return { role: m.role, content: multimodalLastContent } as const;
      }
      return { role: m.role, content: m.content } as const;
    });

    let chosen: Attempt | null = null;
    let totalChars2 = 0;
    let lastErr: unknown = null;

    try {
      for (let i = 0; i < attempts.length; i++) {
        const attempt   = attempts[i];
        const isLast    = i === attempts.length - 1;

        const completionParams: Parameters<typeof openai.chat.completions.create>[0] = {
          model:  attempt.model,
          stream: true,
          messages: [
            { role: "system", content: buildSystemPrompt(mode) },
            ...oaMessages,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ] as any,
        };

        if (attempt.isReasoning) {
          (completionParams as unknown as Record<string, unknown>).max_completion_tokens = maxOutputTokens;
        } else {
          completionParams.max_tokens = maxOutputTokens;
        }

        let stream: AsyncIterable<{ choices?: Array<{ delta?: { content?: string | null }; finish_reason?: string | null }> }>;
        try {
          stream = await attempt.client.chat.completions.create(completionParams) as AsyncIterable<{ choices?: Array<{ delta?: { content?: string | null }; finish_reason?: string | null }> }>;
        } catch (err) {
          lastErr = err;
          logger.warn(
            { err, provider: attempt.provider, model: attempt.model, attempt: i + 1 },
            "Socia GPT: provider init failed, trying next",
          );
          if (isLast) throw err;
          continue;
        }

        // We have a stream — commit to this attempt. Announce the active
        // model to the client for the subtle "Auto · Fast/Smart" label.
        chosen = attempt;
        send("meta", { provider: attempt.provider, tier: attempt.tier, label: attempt.label });

        try {
          for await (const chunk of stream) {
            if (aborted) break;
            const delta = chunk.choices?.[0]?.delta?.content;
            if (typeof delta === "string" && delta.length > 0) {
              totalChars2 += delta.length;
              send("token", { text: delta });
            }
            const finish = chunk.choices?.[0]?.finish_reason;
            if (finish && finish !== "stop") {
              send("warning", { finishReason: finish });
            }
          }
          // Successful stream completion — break out of fallback loop.
          break;
        } catch (err) {
          lastErr = err;
          // Mid-stream failure: if we've already emitted any tokens, we
          // cannot safely retry (the user is reading them). Surface as
          // a sanitized warning and stop.
          if (totalChars2 > 0 || isLast) throw err;
          logger.warn(
            { err, provider: attempt.provider, model: attempt.model },
            "Socia GPT: stream failed before first token, trying next",
          );
          // No tokens yet — fall through to next attempt.
          continue;
        }
      }

      if (!aborted && chosen) {
        send("done", {
          chars:   totalChars2,
          plan:    plan.code,
          used:    usageResult.used,
          limit:   usageResult.limit,
          period:  usageResult.period,
        });

        logger.info(
          { userId: user.id, mode, turns: messages.length, chars: totalChars2,
            attCount: last.attachments?.length ?? 0, plan: plan.code,
            provider: chosen.provider, model: chosen.model, tier: chosen.tier,
            oaRouteReason: oaRouting.reason, xaiReason: xai?.reason },
          "Socia GPT reply",
        );

        // Best-effort: log to ai_requests
        void Promise.resolve(supabase.from("ai_requests").insert({
          user_id:          user.id,
          plan_code:        plan.code,
          model:            chosen.model,
          mode,
          input_chars:      totalChars,
          output_chars:     totalChars2,
          attachment_count: last.attachments?.length ?? 0,
          status:           "completed",
          abuse_score:      abuse.abuseScore,
          route_reason:     `${chosen.provider}:${chosen.tier} ${xai?.reason ?? oaRouting.reason}`,
        })).catch(() => {});

        // Fire-and-forget usage tracking
        const costKey = AI_PLAN_COST_KEY[plan.code] ?? "gpt_msg_mini";
        trackUsage(supabase, user.id, {
          tool_used:       "ai_chat",
          generation_type: costKey,
          model_used:      chosen.model,
          status:          "success",
          token_usage: {
            prompt_tokens:     Math.ceil(totalChars / 4),
            completion_tokens: Math.ceil(totalChars2 / 4),
            total_tokens:      Math.ceil((totalChars + totalChars2) / 4),
          },
          metadata: { mode, plan: plan.code, attachment_count: last.attachments?.length ?? 0, routed_model: chosen.model, provider: chosen.provider, tier: chosen.tier },
        }).catch(() => {});
      }
    } catch (err) {
      const raw = err instanceof Error ? err.message : "Chat failed";
      logger.error(
        { err, userId: user.id, mode, plan: plan.code, lastErr: raw },
        "Socia GPT error (all attempts exhausted)",
      );

      if (abuse.abuseScore > 30) escalateCooldown(user.id, 2);

      // Never leak provider details to clients.
      const safeMsg = "AI service temporarily unavailable. Please try again in a moment.";
      if (!res.headersSent) {
        res.status(503).json({ error: safeMsg, code: "CHAT_FAILED" }); return;
      } else {
        send("error", { error: safeMsg, code: "CHAT_FAILED" });
      }
    } finally {
      clearInterval(heartbeat);
      if (!res.writableEnded) res.end();
    }
  },
);

export default router;
