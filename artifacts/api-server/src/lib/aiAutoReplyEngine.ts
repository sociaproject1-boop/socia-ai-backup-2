/**
 * aiAutoReplyEngine.ts — core AI auto-reply logic.
 *
 * Flow for each inbound user message:
 *   1. Look up admin UUID (cached after first call).
 *   2. Add user message to per-conversation memory.
 *   3. Calculate human-like typing delay based on message length.
 *   4. Set typing indicator in Supabase typing_status.
 *   5. Wait the delay, then call OpenAI with the system prompt + history.
 *   6. Clear typing indicator, insert AI reply as admin.
 *   7. Store the reply in memory for future context.
 */
import { openai } from "@workspace/integrations-openai-ai-server";
import { getServiceClient } from "./adminAuth.js";
import { addMessage, getContext } from "./aiAutoReplyMemory.js";
import { aiState } from "./aiAutoReplyState.js";
import { logger } from "./logger.js";

/* ── Language detection ──────────────────────────────────────────────────── */

const RE_BISAYA = /\b(oy|naa|unsa|wala|basta|bitaw|diri|didto|akoa|imoa|mao|ganahan|libre|taga|lagi|uy|ani|ana|adto|dayon|palihug|salamat|bayad|pila|nia|nila|ato|nato|atoa|unsaon|ngano|asa|kinsa|karon|gahapon|bukas|ok|sige)\b/gi;
const RE_TAGALOG = /\b(po|kuya|ate|naman|lang|daw|parang|yung|ang|mga|ito|iyan|talaga|kasi|pwede|ganon|hindi|huwag|salamat|bakit|ano|saan|kailan|sino|kung|ay|eh|kaya|meron|niya|nila|atin|akin|pala|ba|ha|na|din|rin|nga|diba|opo)\b/gi;

function detectLanguage(text: string): "bisaya" | "tagalog" | "english" | "mixed" {
  const bisayaHits   = (text.match(RE_BISAYA)  || []).length;
  const tagalogHits  = (text.match(RE_TAGALOG) || []).length;

  if (bisayaHits > 0 && tagalogHits > 0) return "mixed";
  if (bisayaHits > tagalogHits)           return "bisaya";
  if (tagalogHits > bisayaHits)           return "tagalog";
  return "english";
}

/* ── Model routing ───────────────────────────────────────────────────────── */

const EMOTIONAL_RE = /angry|sad|upset|unfair|refund|scam|fraud|disappoint|frustrat|kumplain|reklamo|galit|malungkot|inis|bwisit|ayaw|umiyak|ibalik|magpabalik/i;

function selectModel(text: string, historyLen: number): string {
  if (EMOTIONAL_RE.test(text) || text.length > 200 || historyLen > 20) {
    return "gpt-5";
  }
  if (text.length > 30 || historyLen > 5) {
    return "gpt-4.1";
  }
  return "gpt-4.1-mini";
}

/* ── Human-like typing delay ─────────────────────────────────────────────── */

function calcDelay(text: string): number {
  const len  = text.trim().length;
  const base = len <= 5  ? 1000
             : len <= 20 ? 2000
             : len <= 100 ? 3500
             :              6000;
  return base + Math.random() * 1500; // ± randomness
}

/* ── System prompt builder ───────────────────────────────────────────────── */

function buildSystemPrompt(lang: ReturnType<typeof detectLanguage>): string {
  const langRule =
    lang === "bisaya"  ? "The user is writing in Bisaya/Cebuano. Reply ONLY in Bisaya/Cebuano." :
    lang === "tagalog" ? "The user is writing in Tagalog/Filipino. Reply ONLY in Tagalog/Filipino." :
    lang === "mixed"   ? "The user mixes Tagalog/Bisaya/English. Match their exact mix naturally." :
                         "The user is writing in English. Reply in English.";

  return `You are the real human admin of a Filipino social media and online shop app. You are NOT an AI — you are a real person running this app.

${langRule}

RULES (never break these):
- Match the user's language EXACTLY — no exceptions.
- Keep replies SHORT, CASUAL, and NATURAL — like texting a close friend.
- Never say you are an AI, bot, or assistant. Never say "As an AI".
- Use emojis sometimes but not every message.
- Avoid perfect grammar — natural typos and shortcuts are fine.
- Sound like a busy but friendly real person.
- If unsure, say: "wait lang po", "check ko muna", or "isa sec".
- Never repeat the same reply pattern twice in a row.
- Stay calm and helpful with upset users.
- If asked about prices, availability, or orders — help naturally.
- Natural Filipino online tone: "ok po", "sige", "noted", "konting sandali" etc.
- Keep replies under 2 sentences when possible.`;
}

/* ── Admin user ID lookup (cached) ──────────────────────────────────────── */

export async function getAdminUserId(): Promise<string | null> {
  if (aiState.adminUserId) return aiState.adminUserId;
  const sb = getServiceClient();
  if (!sb) return null;
  try {
    const { data } = await sb
      .from("users")
      .select("id")
      .eq("is_owner", true)
      .single();
    if (data?.id) {
      aiState.adminUserId = data.id as string;
      return aiState.adminUserId;
    }
  } catch (err) {
    logger.warn({ err }, "[aiAutoReply] admin user ID lookup failed");
  }
  return null;
}

/* ── Full reply orchestration ────────────────────────────────────────────── */

export async function triggerAiReply(
  senderId:    string,
  userMessage: string,
): Promise<void> {
  try {
    const adminId = await getAdminUserId();
    if (!adminId) {
      logger.warn("[aiAutoReply] admin user ID not found — skipping");
      return;
    }

    const sb = getServiceClient();
    if (!sb) {
      logger.warn("[aiAutoReply] service client unavailable — skipping");
      return;
    }

    // Add inbound message to memory
    addMessage(senderId, adminId, "user", userMessage);

    const history   = getContext(senderId, adminId);
    const lang      = detectLanguage(userMessage);
    const model     = selectModel(userMessage, history.length);
    const delayMs   = calcDelay(userMessage);
    const convKey   = [senderId, adminId].sort().join("_");

    // 1. Show typing indicator
    await sb.from("typing_status").upsert(
      { user_id: adminId, conversation_id: convKey, is_typing: true, updated_at: new Date().toISOString() },
      { onConflict: "user_id" },
    );

    // 2. Human-like delay
    await new Promise<void>((resolve) => setTimeout(resolve, delayMs));

    // 3. Generate reply
    let reply: string | null = null;
    try {
      const params: Parameters<typeof openai.chat.completions.create>[0] = {
        model,
        max_completion_tokens: 120,
        messages: [
          { role: "system", content: buildSystemPrompt(lang) },
          // Last 10 turns of history for context
          ...history.slice(-10).map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
          { role: "user", content: userMessage },
        ],
      };
      const res = await openai.chat.completions.create(params) as { choices: Array<{ message: { content: string | null } }> };
      reply = res.choices[0]?.message?.content?.trim() ?? null;
    } catch (err) {
      logger.error({ err }, "[aiAutoReply] OpenAI call failed");
    }

    // 4. Clear typing indicator (always, even on failure)
    await sb.from("typing_status").upsert(
      { user_id: adminId, conversation_id: convKey, is_typing: false, updated_at: new Date().toISOString() },
      { onConflict: "user_id" },
    );

    if (!reply) return;

    // 5. Insert reply as admin
    const { error: insertErr } = await sb.from("messages").insert({
      sender_id:   adminId,
      receiver_id: senderId,
      text:        reply,
      seen:        false,
      seen_at:     null,
    });

    if (insertErr) {
      logger.error({ err: insertErr }, "[aiAutoReply] message insert failed");
      return;
    }

    // 6. Store AI reply in memory
    addMessage(senderId, adminId, "assistant", reply);

    logger.info({ senderId, model, lang, delayMs: Math.round(delayMs) }, "[aiAutoReply] reply sent");
  } catch (err) {
    logger.error({ err }, "[aiAutoReply] triggerAiReply unhandled error");
  }
}
