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
import { VALID_PROFILES, type SociaGptProfile } from "../lib/sociaGptProfiles.js";
import { readMemory } from "../lib/memoryStore.js";
import {
  buildAttachmentParts, validateAttachments,
  type ChatAttachment, type OpenAIContentPart,
} from "../lib/sociaGptMedia.js";
import { attachAIPlan, AI_PLANS } from "../lib/aiSubscription.js";
import { checkCooldown, recordRequest, checkAndIncrementUsage } from "../lib/aiRateLimit.js";
import { checkAbuse, escalateCooldown } from "../lib/aiAbuseGuard.js";
import { trackUsage, AI_PLAN_COST_KEY } from "../lib/usageTracker.js";
import { evaluateRequest, recordEvent, invalidateSpendCache } from "../lib/aiGovernance.js";
import { routeModel, getLimitMessage, getCooldownMessage } from "../lib/aiModelRouter.js";
import {
  getGrok, GROK_FAST, GROK_SMART,
  shouldSkipGrok, recordGrokOk, recordGrokFail,
} from "../lib/grokClient.js";
import { routeXai } from "../lib/xaiRouter.js";

/** Per-attempt no-first-byte budget. After this, abort + try next attempt. */
const FIRST_BYTE_TIMEOUT_MS = 8_000;

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

    // ── 2.5 AI governance gate (kill switch / feature off / budget) ──
    // Consulted BEFORE any billable work; permissive when nothing configured.
    const gov = await evaluateRequest("ai_chat");
    if (!gov.allowed) {
      void recordEvent({
        eventType: gov.code === "BUDGET_EXHAUSTED" ? "budget_pause" : "block",
        feature: "ai_chat",
        reason: gov.message ?? "Blocked by governance.",
        scope: "feature",
        meta: { code: gov.code, userRef: user.id.slice(0, 8) },
      });
      res.status(gov.code === "BUDGET_EXHAUSTED" ? 402 : 403).json({
        error: gov.message ?? "AI chat is currently unavailable.",
        code: gov.code ?? "BLOCKED",
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

    // Profile is orthogonal to mode — sets persona + which memory row to load.
    // Defaults to "assistant" so clients that don't send it behave identically.
    let profile: SociaGptProfile = "assistant";
    const rawProfile = body["profile"];
    if (rawProfile !== undefined) {
      if (typeof rawProfile !== "string" || !VALID_PROFILES.has(rawProfile as SociaGptProfile)) {
        res.status(400).json({ error: "invalid profile" }); return;
      }
      profile = rawProfile as SociaGptProfile;
    }

    // Load this profile's persistent memory snapshot (best-effort — a
    // failure here must NEVER break chat, so we swallow + log).
    let memorySummary = "";
    try {
      const mem = await readMemory(user.id, profile);
      memorySummary = mem?.summary ?? "";
    } catch (err) {
      logger.warn(
        { err: err instanceof Error ? err.message : String(err), userId: user.id, profile },
        "[sociaGpt] memory load failed — continuing without",
      );
    }
    const systemPrompt = buildSystemPrompt({ mode, profile, memory: memorySummary });

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
    // Any attachment is "heavy" enough to want Smart — image/audio/video all
    // benefit from stronger multimodal reasoning. Streaming speed is preserved
    // because Grok Smart still streams the same way.
    const atts = last.attachments ?? [];
    const hasHeavyAttachment = atts.length > 0;

    // OpenAI routing decision (used as fallback path).
    const oaRouting = routeModel({
      plan,
      prompt:     lastUserPrompt,
      historyLen,
      abuseScore: abuse.abuseScore,
    });

    // Grok routing decision (used as primary path when XAI_API_KEY set
    // AND the health breaker is closed).
    const grok       = getGrok();
    const grokHealthy = grok !== null && !shouldSkipGrok();
    const xai        = grokHealthy ? routeXai({
      prompt:     lastUserPrompt,
      historyLen,
      totalChars,
      hasHeavyAttachment,
    }) : null;

    // Build the ordered fallback chain: [primary, ...backups].
    // Each attempt has its own client + model + retry budget. If one errors
    // before any tokens are emitted, we transparently try the next one.
    type Attempt = {
      client:      typeof openai;
      model:       string;
      isReasoning: boolean;
      provider:    "xai" | "openai";
      tier:        "fast" | "smart";
      label:       string;
      retries:     number; // extra attempts on this same provider after a timeout
    };

    const attempts: Attempt[] = [];

    if (grok && xai) {
      // Primary: Grok at the chosen tier. Only Grok Smart gets a transparent
      // retry on timeout — Smart is more cold-start-prone and the cost of a
      // single extra try is acceptable. Grok Fast falls through immediately.
      attempts.push({
        client:      grok as unknown as typeof openai,
        model:       xai.tier === "smart" ? GROK_SMART : GROK_FAST,
        isReasoning: false,
        provider:    "xai",
        tier:        xai.tier,
        label:       xai.tier === "smart" ? "Auto · Smart" : "Auto · Fast",
        retries:     xai.tier === "smart" ? 1 : 0,
      });
      // Safety net: drop to Grok Fast if Smart still fails.
      if (xai.tier === "smart") {
        attempts.push({
          client:      grok as unknown as typeof openai,
          model:       GROK_FAST,
          isReasoning: false,
          provider:    "xai",
          tier:        "fast",
          label:       "Auto · Fast",
          retries:     0,
        });
      }
    }

    // Final fallback: existing OpenAI integration (always works).
    // Tier derives from the model OpenAI actually picked, so the UI label
    // accurately reflects what the user is getting even on the fallback path.
    const oaTier: "fast" | "smart" = oaRouting.model === "gpt-4o-mini" ? "fast" : "smart";
    attempts.push({
      client:      openai,
      model:       oaRouting.model,
      isReasoning: oaRouting.model === "o1-mini",
      provider:    "openai",
      tier:        oaTier,
      label:       oaTier === "smart" ? "Auto · Smart" : "Auto · Fast",
      retries:     0,
    });

    // ── 7.5 Apply owner routing config (provider order + enable + failover).
    // gov.chain is already resolved for "ai_chat": disabled providers removed,
    // and collapsed to the primary hop when failover is off. Reorder/filter the
    // attempt chain to match. If nothing the owner enabled is runnable right
    // now (e.g. they disabled OpenAI and Grok is unhealthy), fail honestly
    // rather than quietly using a disabled provider.
    const chainOrder = gov.chain.map((h) => h.provider);
    const orderedAttempts = attempts
      .filter((a) => chainOrder.includes(a.provider))
      .sort((a, b) => chainOrder.indexOf(a.provider) - chainOrder.indexOf(b.provider));
    if (orderedAttempts.length === 0) {
      void recordEvent({
        eventType: "block",
        feature: "ai_chat",
        reason: "No owner-enabled chat provider is currently available.",
        scope: "feature",
        meta: { chainOrder, userRef: user.id.slice(0, 8) },
      });
      res.status(503).json({
        error: "AI chat is temporarily unavailable. No credits were charged.",
        code: "NO_PROVIDER",
      });
      return;
    }
    attempts.length = 0;
    attempts.push(...orderedAttempts);

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
    const startedAt = Date.now();

    try {
      outer: for (let i = 0; i < attempts.length; i++) {
        const attempt = attempts[i];
        const isLast  = i === attempts.length - 1;

        const completionParams: Parameters<typeof openai.chat.completions.create>[0] = {
          model:  attempt.model,
          stream: true,
          messages: [
            { role: "system", content: systemPrompt },
            ...oaMessages,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ] as any,
        };

        if (attempt.isReasoning) {
          (completionParams as unknown as Record<string, unknown>).max_completion_tokens = maxOutputTokens;
        } else {
          completionParams.max_tokens = maxOutputTokens;
        }

        // Local retry budget. attempt.retries=1 → up to 2 tries on the same
        // provider before falling through to the next attempt in the chain.
        const maxTries = attempt.retries + 1;
        for (let t = 0; t < maxTries; t++) {
          if (aborted) break outer;

          /**
           * Per-try AbortController guards the *entire* first-byte phase.
           * - `firstByteTimer` aborts the request if no token arrives within
           *   FIRST_BYTE_TIMEOUT_MS (the stream iterator throws on next read).
           * - The timer is cleared only when we observe an actual content
           *   delta, NOT when create() resolves (streaming SDKs resolve
           *   immediately with an iterator).
           * - `timedOut` and `aborted` are checked in catches so we can
           *   distinguish "our timeout" from "client closed the tab" — only
           *   the former should poison the Grok health breaker.
           */
          const ac = new AbortController();
          let timedOut = false;
          let firstByteSeen = false;
          const firstByteTimer = setTimeout(() => {
            timedOut = true;
            ac.abort();
          }, FIRST_BYTE_TIMEOUT_MS);

          let stream: AsyncIterable<{ choices?: Array<{ delta?: { content?: string | null }; finish_reason?: string | null }> }>;
          try {
            stream = await attempt.client.chat.completions.create(
              { ...completionParams, signal: ac.signal } as Parameters<typeof openai.chat.completions.create>[0],
            ) as AsyncIterable<{ choices?: Array<{ delta?: { content?: string | null }; finish_reason?: string | null }> }>;
          } catch (err) {
            clearTimeout(firstByteTimer);
            lastErr = err;
            // Client closed the tab while we were waiting on the provider —
            // not the provider's fault, don't trip the breaker.
            if (aborted) break outer;
            const isTimeout = timedOut || (err as { name?: string })?.name === "AbortError";
            logger.warn(
              { err: (err as Error).message, provider: attempt.provider, model: attempt.model,
                attempt: i + 1, try: t + 1, timeout: isTimeout },
              "Socia GPT: provider init failed",
            );
            if (attempt.provider === "xai") recordGrokFail(err);
            const moreTries = t < maxTries - 1;
            if (moreTries) continue;          // retry same provider
            if (isLast) throw err;            // out of options
            continue outer;                   // advance to next attempt
          }

          // We have a stream object — but the timer is still running until
          // we actually see a content delta. Commit to this attempt only
          // when first byte arrives, so a fallback can still kick in if the
          // provider stalls before producing anything.
          let committed = false;

          try {
            for await (const chunk of stream) {
              if (aborted) { ac.abort(); break; }
              const delta = chunk.choices?.[0]?.delta?.content;
              if (typeof delta === "string" && delta.length > 0) {
                if (!firstByteSeen) {
                  firstByteSeen = true;
                  clearTimeout(firstByteTimer);
                  chosen    = attempt;
                  committed = true;
                  send("meta", { provider: attempt.provider, tier: attempt.tier, label: attempt.label });
                  if (i > 0) {
                    void recordEvent({
                      eventType: "failover",
                      feature: "ai_chat",
                      fromProvider: attempts[0]?.provider ?? null,
                      toProvider: attempt.provider,
                      model: attempt.model,
                      reason: `Primary chat provider unavailable; served by fallback attempt #${i + 1}.`,
                      scope: "feature",
                    });
                  }
                }
                totalChars2 += delta.length;
                send("token", { text: delta });
              }
              const finish = chunk.choices?.[0]?.finish_reason;
              if (finish && finish !== "stop") {
                send("warning", { finishReason: finish });
              }
            }
            clearTimeout(firstByteTimer);
            if (!firstByteSeen) {
              // Stream ended without any content — treat as provider failure.
              if (aborted) break outer;
              if (attempt.provider === "xai") recordGrokFail(new Error("empty stream"));
              const moreTries = t < maxTries - 1;
              if (moreTries) continue;
              if (isLast) throw new Error("Provider returned empty stream");
              continue outer;
            }
            if (attempt.provider === "xai") recordGrokOk();
            break outer;                      // success — done
          } catch (err) {
            clearTimeout(firstByteTimer);
            lastErr = err;
            if (aborted) break outer;         // client gave up — silent
            // Pre-first-token failure → we never committed, fallback is safe.
            // Post-first-token failure → tokens already on the wire, must surface.
            if (committed && totalChars2 > 0) {
              if (attempt.provider === "xai") recordGrokFail(err);
              throw err;
            }
            if (attempt.provider === "xai") recordGrokFail(err);
            if (isLast) throw err;
            logger.warn(
              { err: (err as Error).message, provider: attempt.provider, model: attempt.model,
                timeout: timedOut },
              "Socia GPT: stream failed before first token, advancing",
            );
            continue outer;
          }
        }
      }

      if (!aborted && chosen) {
        const latencyMs = Date.now() - startedAt;
        send("done", {
          chars:    totalChars2,
          plan:     plan.code,
          used:     usageResult.used,
          limit:    usageResult.limit,
          period:   usageResult.period,
          provider: chosen.provider,
          tier:     chosen.tier,
          model:    chosen.model,
          tokens:   Math.ceil(totalChars2 / 4),
          latencyMs,
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
        }).then(() => invalidateSpendCache()).catch(() => {});
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
