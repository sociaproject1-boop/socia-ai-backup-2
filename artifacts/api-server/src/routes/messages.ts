/**
 * Server-side message + presence routes.
 *
 * Moving these off the client eliminates two attack vectors:
 *   1. Forged sender_id — client could previously INSERT any sender_id directly
 *      to Supabase. Server now ENFORCES sender_id = auth.uid() from the JWT.
 *   2. Marking other users' messages seen — server ENFORCES receiver_id = auth.uid().
 *   3. Spoofed last_seen — server ENFORCES users.id = auth.uid().
 *
 * Rate limiting (chatRateLimit.ts) is now applied server-side on message sends.
 *
 * POST /api/messages/send   — send a message (rate limited)
 * POST /api/messages/seen   — mark a thread as seen
 * POST /api/messages/edit   — edit own message
 * POST /api/presence/heartbeat — update last_seen for authenticated user
 */

import { Router } from "express";
import { requireAuth, getAuthedUser, getRequestSupabase } from "../lib/supabaseAuth.js";
import { takeChatToken } from "../lib/chatRateLimit.js";
import { logger } from "../lib/logger.js";
import {
  ADMIN_EMAIL,
  shouldAiReply,
  markAdminActive,
  setOwnerOnline,
} from "../lib/aiAutoReplyState.js";
import { getAdminUserId, triggerAiReply } from "../lib/aiAutoReplyEngine.js";

const router = Router();

const MAX_MESSAGE_CHARS = 4_000;

/* ── POST /api/messages/send ─────────────────────────────────────────────── */

router.post("/messages/send", requireAuth, async (req, res): Promise<void> => {
  const user     = getAuthedUser(req);
  const supabase = getRequestSupabase(req);

  // Rate limit: 12 messages per 60 s per user (in-memory, H-02 fix)
  const rateCheck = takeChatToken(user.id);
  if (!rateCheck.allowed) {
    res.setHeader("Retry-After", String(rateCheck.retryAfterSec));
    res.status(429).json({
      error:         `Too many messages. Wait ${rateCheck.retryAfterSec}s before sending again.`,
      code:          "RATE_LIMITED",
      retryAfterSec: rateCheck.retryAfterSec,
    });
    return;
  }

  const { receiver_id, text, image_url, audio_url, reply_to_id } = (req.body ?? {}) as Record<string, unknown>;

  if (!receiver_id || typeof receiver_id !== "string") {
    res.status(400).json({ error: "receiver_id is required", code: "MISSING_RECEIVER" });
    return;
  }
  if (receiver_id === user.id) {
    res.status(400).json({ error: "Cannot send a message to yourself", code: "SELF_MESSAGE" });
    return;
  }
  if (!text && !image_url && !audio_url) {
    res.status(400).json({ error: "Message must have text, image_url, or audio_url", code: "EMPTY_MESSAGE" });
    return;
  }
  if (text && typeof text === "string" && text.length > MAX_MESSAGE_CHARS) {
    res.status(400).json({ error: `Message too long (max ${MAX_MESSAGE_CHARS} chars)`, code: "MESSAGE_TOO_LONG" });
    return;
  }

  const { data, error } = await supabase
    .from("messages")
    .insert({
      sender_id:   user.id,                                           // ENFORCED — never from body
      receiver_id: String(receiver_id),
      text:        text        ? String(text).trim()  : null,
      image_url:   image_url   ? String(image_url)    : null,
      audio_url:   audio_url   ? String(audio_url)    : null,
      reply_to_id: reply_to_id && typeof reply_to_id === "string" ? reply_to_id : null,
      seen:        false,
      seen_at:     null,
    })
    .select("id")
    .single();

  if (error) {
    logger.error({ err: error, userId: user.id }, "messages/send insert failed");
    res.status(500).json({ error: "Failed to send message", code: "DB_ERROR" });
    return;
  }

  // ── AI auto-reply hook ─────────────────────────────────────────────────
  // Fire-and-forget — never block the response.

  // 1. Track admin manual activity so online-mode AI yields after manual replies.
  if (user.email === ADMIN_EMAIL) {
    markAdminActive();
  }

  // 2. Trigger AI reply when a user messages the admin and the feature is on.
  if (
    text &&
    typeof text === "string" &&
    user.email !== ADMIN_EMAIL &&  // sender is NOT the admin
    shouldAiReply()
  ) {
    const messageText = String(text).trim();
    const senderId    = user.id;
    const receiverId  = String(receiver_id);

    // Async: look up admin ID, confirm the receiver is admin, then reply.
    (async () => {
      try {
        const adminId = await getAdminUserId();
        if (adminId && receiverId === adminId) {
          await triggerAiReply(senderId, messageText);
        }
      } catch (err) {
        logger.warn({ err }, "[aiAutoReply] background dispatch failed");
      }
    })();
  }
  // ── End AI hook ────────────────────────────────────────────────────────

  res.json({ ok: true, id: data.id });
});

/* ── POST /api/messages/seen ─────────────────────────────────────────────── */

router.post("/messages/seen", requireAuth, async (req, res): Promise<void> => {
  const user     = getAuthedUser(req);
  const supabase = getRequestSupabase(req);

  const { other_id } = (req.body ?? {}) as Record<string, unknown>;
  if (!other_id || typeof other_id !== "string") {
    res.status(400).json({ error: "other_id is required", code: "MISSING_OTHER_ID" });
    return;
  }

  // ENFORCED: receiver_id = auth user — can only mark messages sent TO us as seen.
  const { error } = await supabase
    .from("messages")
    .update({ seen: true, seen_at: new Date().toISOString() })
    .eq("receiver_id", user.id)        // enforced — never from body
    .eq("sender_id",   String(other_id))
    .eq("seen",        false);

  if (error) {
    logger.error({ err: error, userId: user.id }, "messages/seen update failed");
    res.status(500).json({ error: "Failed to mark messages as seen", code: "DB_ERROR" });
    return;
  }

  res.json({ ok: true });
});

/* ── POST /api/messages/edit ─────────────────────────────────────────────── */

router.post("/messages/edit", requireAuth, async (req, res): Promise<void> => {
  const user     = getAuthedUser(req);
  const supabase = getRequestSupabase(req);

  const { message_id, text } = (req.body ?? {}) as Record<string, unknown>;
  if (!message_id || typeof message_id !== "string") {
    res.status(400).json({ error: "message_id is required", code: "MISSING_ID" });
    return;
  }
  if (!text || typeof text !== "string" || !text.trim()) {
    res.status(400).json({ error: "text is required", code: "MISSING_TEXT" });
    return;
  }
  if (text.length > MAX_MESSAGE_CHARS) {
    res.status(400).json({ error: "Message too long", code: "MESSAGE_TOO_LONG" });
    return;
  }

  // ENFORCED: sender_id = auth user — only original sender can edit their own message.
  const { error } = await supabase
    .from("messages")
    .update({ text: text.trim(), edited: true })
    .eq("id",        String(message_id))
    .eq("sender_id", user.id);          // enforced — never from body

  if (error) {
    logger.error({ err: error, userId: user.id }, "messages/edit update failed");
    res.status(500).json({ error: "Failed to edit message", code: "DB_ERROR" });
    return;
  }

  res.json({ ok: true });
});

/* ── POST /api/presence/heartbeat ────────────────────────────────────────── */

router.post("/presence/heartbeat", requireAuth, async (req, res): Promise<void> => {
  const user     = getAuthedUser(req);
  const supabase = getRequestSupabase(req);

  // Accept optional status from realtime presence system
  const body   = (req.body ?? {}) as Record<string, unknown>;
  const status = typeof body["status"] === "string" ? body["status"] : "online";
  const isOnline = status === "online";

  // ENFORCED: only updates the authenticated user's own last_seen — id is never from body.
  const { error } = await supabase
    .from("users")
    .update({ last_seen: new Date().toISOString() })
    .eq("id", user.id);               // enforced by JWT

  if (error) {
    // Presence is non-critical — log but don't fail the request.
    logger.warn({ err: error, userId: user.id }, "presence/heartbeat update failed");
  }

  // Sync owner online/offline state into AI auto-reply engine in real time
  if (user.email === ADMIN_EMAIL) {
    setOwnerOnline(isOnline);
    logger.debug({ status, isOnline }, "[presence] owner heartbeat received");
  }

  res.json({ ok: true });
});

export default router;
