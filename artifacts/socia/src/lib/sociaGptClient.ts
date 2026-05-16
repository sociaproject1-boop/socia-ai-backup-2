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

/** A file the user attached to a chat message (image / audio / video). */
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
  createdAt:   string;
}

interface ChatState {
  messages:               ChatMessage[];
  mode:                   SociaGptMode;
  setMode:                (m: SociaGptMode) => void;
  addUser:                (text: string, attachments?: ChatAttachment[]) => ChatMessage;
  addAssistantPlaceholder: () => ChatMessage;
  appendToAssistant:      (id: string, text: string) => void;
  finishAssistant:        (id: string, error?: string) => void;
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
      finishAssistant: (id, error) =>
        set((s) => ({
          messages: s.messages.map((m) =>
            m.id === id ? { ...m, pending: false, error } : m,
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

/**
 * Stream a chat reply. The caller has already added the user message and an
 * assistant placeholder via the store; we just feed tokens into the placeholder.
 *
 * New optional callbacks:
 *   onDone(meta)           — called when streaming finishes successfully
 *   onRateLimit(retrySec)  — called when a cooldown/rate-limit error is received
 */
export async function streamChat(opts: {
  history:       { role: "user" | "assistant"; content: string; attachments?: ChatAttachment[] }[];
  mode:          SociaGptMode;
  assistantId:   string;
  signal?:       AbortSignal;
  onDone?:       (meta: StreamChatDoneMeta) => void;
  onRateLimit?:  (retryAfterSec: number) => void;
}): Promise<void> {
  const { history, mode, assistantId, signal, onDone, onRateLimit } = opts;
  const store = useSociaGptStore.getState();

  const session = await supabase.auth.getSession();
  const token   = session.data.session?.access_token;
  if (!token) {
    store.finishAssistant(assistantId, "You're signed out. Please sign in again.");
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
    const msg = err instanceof Error ? err.message : "Network error";
    store.finishAssistant(assistantId, msg);
    return;
  }

  // JSON error path
  if (!res.ok) {
    let errMsg = `Request failed (HTTP ${res.status}).`;
    let retryAfterSec = 0;
    try {
      const j = await res.json() as { error?: string; retryAfterSec?: number; code?: string };
      if (j && typeof j.error === "string") errMsg = j.error;
      if (j && typeof j.retryAfterSec === "number") retryAfterSec = j.retryAfterSec;

      // Trigger cooldown callback for 429 errors
      if ((res.status === 429 || j.code === "COOLDOWN" || j.code === "RATE_LIMITED") && onRateLimit) {
        onRateLimit(retryAfterSec || 20);
      }
    } catch { /* ignore */ }
    store.finishAssistant(assistantId, errMsg);
    return;
  }
  if (!res.body) {
    store.finishAssistant(assistantId, "No response body received.");
    return;
  }

  // SSE parser
  const reader  = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer    = "";
  let sseError: string | null = null;
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
        let event   = "message";
        let dataLine = "";
        for (const line of block.split("\n")) {
          if (line.startsWith("event:"))      event    = line.slice(6).trim();
          else if (line.startsWith("data:")) dataLine += line.slice(5).trim();
        }
        if (!dataLine) continue;
        let payload: unknown;
        try { payload = JSON.parse(dataLine); } catch { continue; }

        if (event === "token") {
          const t = (payload as { text?: unknown })?.text;
          if (typeof t === "string") store.appendToAssistant(assistantId, t);
        } else if (event === "error") {
          const e = (payload as { error?: unknown })?.error;
          sseError = typeof e === "string" ? e : "Stream error";
        } else if (event === "done") {
          const d = payload as Partial<StreamChatDoneMeta>;
          doneMeta = {
            chars:  typeof d.chars  === "number" ? d.chars  : 0,
            plan:   typeof d.plan   === "string" ? d.plan   : "free",
            used:   typeof d.used   === "number" ? d.used   : 0,
            limit:  typeof d.limit  === "number" ? d.limit  : 15,
            period: typeof d.period === "string" ? d.period : "daily",
          };
        }
      }
    }
  } catch (err) {
    if (signal?.aborted) {
      store.finishAssistant(assistantId);
      return;
    }
    sseError = err instanceof Error ? err.message : "Stream interrupted";
  }

  store.finishAssistant(assistantId, sseError ?? undefined);

  if (!sseError && doneMeta && onDone) {
    onDone(doneMeta);
  }
}
