import { create } from "zustand";
import { persist } from "zustand/middleware";
import { supabase } from "./supabase";

export type SociaGptMode =
  | "general"
  | "prompt-fixer"
  | "tiktok"
  | "shopee"
  | "fashion"
  | "cinematic"
  | "ai-influencer"
  | "product-ads"
  | "video-director";

export const MODES: { id: SociaGptMode; label: string; emoji: string }[] = [
  { id: "general",        label: "General",        emoji: "✨" },
  { id: "prompt-fixer",   label: "Prompt Fixer",   emoji: "🪄" },
  { id: "tiktok",         label: "TikTok Expert",  emoji: "📱" },
  { id: "shopee",         label: "Shopee Expert",  emoji: "🛒" },
  { id: "fashion",        label: "Fashion Prompt", emoji: "👗" },
  { id: "cinematic",      label: "Cinematic",      emoji: "🎬" },
  { id: "ai-influencer",  label: "AI Influencer",  emoji: "🤖" },
  { id: "product-ads",    label: "Product Ads",    emoji: "💎" },
  { id: "video-director", label: "Video Director", emoji: "🎥" },
];

export interface ChatAttachment {
  kind: "image" | "audio" | "video";
  url:  string;
  path: string;
  mime: string;
  name: string;
  size: number;
}

export interface ChatMessage {
  id:          string;
  role:        "user" | "assistant";
  content:     string;
  attachments?: ChatAttachment[];
  pending?:    boolean;
  error?:      string;
  errorCode?:  string;
  createdAt:   string;
}

interface ChatState {
  messages:               ChatMessage[];
  mode:                   SociaGptMode;
  setMode:                (m: SociaGptMode) => void;
  addUser:                (text: string, attachments?: ChatAttachment[]) => ChatMessage;
  addAssistantPlaceholder: () => ChatMessage;
  appendToAssistant:      (id: string, text: string) => void;
  finishAssistant:        (id: string, error?: string, errorCode?: string) => void;
  removeMessage:          (id: string) => void;
  clear:                  () => void;
}

export const useSociaGptStore = create<ChatState>()(
  persist(
    (set) => ({
      messages: [],
      mode: "general",
      setMode: (m) => set({ mode: m }),
      addUser: (text, attachments) => {
        const msg: ChatMessage = {
          id:          `u_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          role:        "user",
          content:     text,
          attachments: attachments && attachments.length > 0 ? attachments : undefined,
          createdAt:   new Date().toISOString(),
        };
        set((s) => ({ messages: [...s.messages, msg] }));
        return msg;
      },
      addAssistantPlaceholder: () => {
        const msg: ChatMessage = {
          id:        `a_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          role:      "assistant",
          content:   "",
          pending:   true,
          createdAt: new Date().toISOString(),
        };
        set((s) => ({ messages: [...s.messages, msg] }));
        return msg;
      },
      appendToAssistant: (id, text) =>
        set((s) => ({
          messages: s.messages.map((m) =>
            m.id === id ? { ...m, content: m.content + text } : m,
          ),
        })),
      finishAssistant: (id, error, errorCode) =>
        set((s) => ({
          messages: s.messages.map((m) =>
            m.id === id ? { ...m, pending: false, error, errorCode } : m,
          ),
        })),
      removeMessage: (id) =>
        set((s) => ({ messages: s.messages.filter((m) => m.id !== id) })),
      clear: () => set({ messages: [] }),
    }),
    {
      name: "socia_gpt_chat_v2",
      partialize: (s) => ({
        mode:     s.mode,
        messages: s.messages.slice(-50).map((m) => ({ ...m, pending: false })),
      }),
    },
  ),
);

export interface StreamChatDoneMeta {
  chars:   number;
  plan:    string;
  used:    number;
  limit:   number;
  period:  string;
}

export interface ActiveModelMeta {
  provider: "xai" | "openai";
  tier:     "fast" | "smart";
  label:    string;
}

/**
 * Tiny module-scoped store for the most recently active model label
 * (e.g. "Auto · Fast"). Kept outside the chat store to avoid re-rendering
 * the message list when only the header label changes.
 */
type ModelListener = (m: ActiveModelMeta | null) => void;
let _activeModel: ActiveModelMeta | null = null;
const _modelListeners = new Set<ModelListener>();
export function getActiveModel(): ActiveModelMeta | null { return _activeModel; }
export function subscribeActiveModel(fn: ModelListener): () => void {
  _modelListeners.add(fn);
  return () => { _modelListeners.delete(fn); };
}
function _setActiveModel(m: ActiveModelMeta | null) {
  _activeModel = m;
  for (const fn of _modelListeners) fn(m);
}

/**
 * Sanitize raw API/server error messages so users never see
 * technical details, OpenAI error text, quota messages, etc.
 */
function sanitizeError(rawMsg: string, code?: string): { msg: string; code: string } {
  const lower = rawMsg.toLowerCase();

  // Premium-worded backend messages — keep as-is
  if (code === "USAGE_LIMIT_EXCEEDED") {
    return { msg: rawMsg, code };
  }
  if (code === "COOLDOWN") {
    return { msg: rawMsg, code };
  }
  if (code === "MESSAGE_TOO_LONG") {
    return { msg: rawMsg, code };
  }
  if (code === "ATTACHMENT_PLAN_LIMIT") {
    return { msg: rawMsg, code };
  }
  if (code === "ABUSE_DETECTED") {
    return {
      msg: "Socia GPT is taking a short break for your account. Please wait a few minutes.",
      code,
    };
  }

  // Raw provider / infra errors — never show to users
  if (
    lower.includes("quota") ||
    lower.includes("exceeded your current") ||
    lower.includes("insufficient_quota") ||
    lower.includes("you exceeded") ||
    lower.includes("openai") ||
    lower.includes("api key") ||
    lower.includes("billing") ||
    lower.includes("rate_limit_exceeded") ||
    lower.includes("model_not_found") ||
    lower.includes("invalid request")
  ) {
    return {
      msg: "AI servers are temporarily busy. Please try again in a moment.",
      code: "SERVER_BUSY",
    };
  }

  // Network / connectivity errors
  if (
    lower.includes("network") ||
    lower.includes("failed to fetch") ||
    lower.includes("connection") ||
    lower.includes("timeout") ||
    lower.includes("aborted")
  ) {
    return {
      msg: "Connection interrupted. Please check your network and try again.",
      code: "NETWORK_ERROR",
    };
  }

  // Generic fallback — never show raw HTTP codes or stack traces
  if (lower.includes("http 5") || lower.includes("http 4") || lower.includes("chat_failed")) {
    return {
      msg: "Something went wrong on our end. Please try again shortly.",
      code: "SERVER_ERROR",
    };
  }

  // If the message is short and looks user-safe, show it
  if (rawMsg.length < 200 && !lower.includes("error:") && !lower.includes("exception")) {
    return { msg: rawMsg, code: code ?? "UNKNOWN" };
  }

  return {
    msg: "Something went wrong. Please try again.",
    code: "UNKNOWN",
  };
}

export async function streamChat(opts: {
  history:       { role: "user" | "assistant"; content: string; attachments?: ChatAttachment[] }[];
  mode:          SociaGptMode;
  assistantId:   string;
  signal?:       AbortSignal;
  onDone?:       (meta: StreamChatDoneMeta) => void;
  onRateLimit?:  (retryAfterSec: number) => void;
  onModel?:      (meta: ActiveModelMeta) => void;
}): Promise<void> {
  const { history, mode, assistantId, signal, onDone, onRateLimit, onModel } = opts;
  const store = useSociaGptStore.getState();

  const session = await supabase.auth.getSession();
  const token   = session.data.session?.access_token;
  if (!token) {
    store.finishAssistant(assistantId, "Please sign in again to continue.", "AUTH_ERROR");
    return;
  }

  let res: Response;
  try {
    res = await fetch("/api/socia-gpt/chat", {
      method: "POST",
      signal,
      headers: {
        "Content-Type":  "application/json",
        Authorization:   `Bearer ${token}`,
        Accept:          "text/event-stream",
      },
      body: JSON.stringify({ messages: history, mode }),
    });
  } catch (err) {
    if (signal?.aborted) { store.finishAssistant(assistantId); return; }
    const raw = err instanceof Error ? err.message : "Network error";
    const { msg, code } = sanitizeError(raw);
    store.finishAssistant(assistantId, msg, code);
    return;
  }

  // JSON error path (non-2xx HTTP)
  if (!res.ok) {
    let rawMsg = `Request failed (${res.status}).`;
    let rawCode = "";
    let retryAfterSec = 0;
    try {
      const j = await res.json() as { error?: string; retryAfterSec?: number; code?: string };
      if (j?.error)         rawMsg        = j.error;
      if (j?.code)          rawCode       = j.code;
      if (j?.retryAfterSec) retryAfterSec = j.retryAfterSec;

      if ((res.status === 429 || rawCode === "COOLDOWN" || rawCode === "ABUSE_DETECTED") && onRateLimit) {
        onRateLimit(retryAfterSec || 15);
      }
    } catch { /* ignore */ }

    const { msg, code } = sanitizeError(rawMsg, rawCode);
    store.finishAssistant(assistantId, msg, code);
    return;
  }

  if (!res.body) {
    store.finishAssistant(assistantId, "No response received. Please try again.", "NO_BODY");
    return;
  }

  // SSE parser
  const reader  = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer    = "";
  let sseError: string | null  = null;
  let sseCode:  string | null  = null;
  let doneMeta: StreamChatDoneMeta | null = null;

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let idx: number;
      while ((idx = buffer.indexOf("\n\n")) !== -1) {
        const block = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        if (!block.trim() || block.startsWith(":")) continue;
        let event    = "message";
        let dataLine = "";
        for (const line of block.split("\n")) {
          if (line.startsWith("event:"))     event    = line.slice(6).trim();
          else if (line.startsWith("data:")) dataLine += line.slice(5).trim();
        }
        if (!dataLine) continue;
        let payload: unknown;
        try { payload = JSON.parse(dataLine); } catch { continue; }

        if (event === "token") {
          const t = (payload as { text?: unknown })?.text;
          if (typeof t === "string") store.appendToAssistant(assistantId, t);
        } else if (event === "meta") {
          const p = payload as Partial<ActiveModelMeta>;
          if (
            (p.provider === "xai" || p.provider === "openai") &&
            (p.tier === "fast" || p.tier === "smart") &&
            typeof p.label === "string"
          ) {
            const meta: ActiveModelMeta = { provider: p.provider, tier: p.tier, label: p.label };
            _setActiveModel(meta);
            onModel?.(meta);
          }
        } else if (event === "error") {
          const p  = payload as { error?: unknown; code?: unknown };
          sseError = typeof p.error === "string" ? p.error : "Stream error";
          sseCode  = typeof p.code  === "string" ? p.code  : "";
        } else if (event === "done") {
          const d  = payload as Partial<StreamChatDoneMeta>;
          doneMeta = {
            chars:  typeof d.chars  === "number" ? d.chars  : 0,
            plan:   typeof d.plan   === "string" ? d.plan   : "free",
            used:   typeof d.used   === "number" ? d.used   : 0,
            limit:  typeof d.limit  === "number" ? d.limit  : 30,
            period: typeof d.period === "string" ? d.period : "daily",
          };
        }
      }
    }
  } catch (err) {
    if (signal?.aborted) { store.finishAssistant(assistantId); return; }
    sseError = err instanceof Error ? err.message : "Stream interrupted";
  }

  if (sseError) {
    const { msg, code } = sanitizeError(sseError, sseCode ?? undefined);
    store.finishAssistant(assistantId, msg, code);
  } else {
    store.finishAssistant(assistantId);
  }

  if (!sseError && doneMeta && onDone) {
    onDone(doneMeta);
  }
}
