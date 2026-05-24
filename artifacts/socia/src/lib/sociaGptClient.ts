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

/* ─── Profiles (personas + isolated persistent memory) ───────────────── */
export type SociaGptProfile =
  | "assistant"
  | "creative"
  | "coding"
  | "cinematic"
  | "business";

export const PROFILES: {
  id: SociaGptProfile;
  label: string;
  emoji: string;
  hint:  string;
}[] = [
  { id: "assistant", label: "Assistant", emoji: "🤝", hint: "General helpful assistant"      },
  { id: "creative",  label: "Creative",  emoji: "🎨", hint: "Brainstorming + ideation"      },
  { id: "coding",    label: "Coding",    emoji: "💻", hint: "Senior software engineer"      },
  { id: "cinematic", label: "Cinematic", emoji: "🎬", hint: "Shot designer for AI video"    },
  { id: "business",  label: "Business",  emoji: "📈", hint: "Strategy + operator framing"   },
];

/** How many user turns between memory snapshots. Mirrors server constant. */
export const SNAPSHOT_EVERY_N_TURNS = 10;

export interface ChatAttachment {
  kind: "image" | "audio" | "video";
  url:  string;
  path: string;
  mime: string;
  name: string;
  size: number;
}

export interface ChatMessageMeta {
  provider:  "xai" | "openai";
  tier:      "fast" | "smart";
  model:     string;
  tokens:    number;
  latencyMs: number;
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
  meta?:       ChatMessageMeta;
}

interface ChatState {
  messages:               ChatMessage[];
  mode:                   SociaGptMode;
  profile:                SociaGptProfile;
  /** Per-profile counter of user turns since the last successful snapshot. */
  turnsSinceSnapshot:     Record<SociaGptProfile, number>;
  setMode:                (m: SociaGptMode) => void;
  setProfile:             (p: SociaGptProfile) => void;
  addUser:                (text: string, attachments?: ChatAttachment[]) => ChatMessage;
  addAssistantPlaceholder: () => ChatMessage;
  appendToAssistant:      (id: string, text: string) => void;
  setAssistantMeta:       (id: string, meta: ChatMessageMeta) => void;
  finishAssistant:        (id: string, error?: string, errorCode?: string) => void;
  removeMessage:          (id: string) => void;
  clear:                  () => void;
  bumpTurnsSinceSnapshot: (p: SociaGptProfile) => number;
  resetTurnsSinceSnapshot: (p: SociaGptProfile) => void;
}

const EMPTY_TURN_COUNTS: Record<SociaGptProfile, number> = {
  assistant: 0, creative: 0, coding: 0, cinematic: 0, business: 0,
};

export const useSociaGptStore = create<ChatState>()(
  persist(
    (set, get) => ({
      messages: [],
      mode: "general",
      profile: "assistant",
      turnsSinceSnapshot: { ...EMPTY_TURN_COUNTS },
      setMode:    (m) => set({ mode: m }),
      setProfile: (p) => set({ profile: p }),
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
      setAssistantMeta: (id, meta) =>
        set((s) => ({
          messages: s.messages.map((m) =>
            m.id === id ? { ...m, meta } : m,
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
      bumpTurnsSinceSnapshot: (p) => {
        const cur  = get().turnsSinceSnapshot[p] ?? 0;
        const next = cur + 1;
        set((s) => ({ turnsSinceSnapshot: { ...s.turnsSinceSnapshot, [p]: next } }));
        return next;
      },
      resetTurnsSinceSnapshot: (p) =>
        set((s) => ({ turnsSinceSnapshot: { ...s.turnsSinceSnapshot, [p]: 0 } })),
    }),
    {
      name: "socia_gpt_chat_v2",
      version: 1,
      // Persist messages + mode + profile + counters. Slice keeps the
      // persisted blob small (last 50 messages is plenty for context).
      partialize: (s) => ({
        mode:               s.mode,
        profile:            s.profile,
        turnsSinceSnapshot: s.turnsSinceSnapshot,
        messages:           s.messages.slice(-50).map((m) => ({ ...m, pending: false })),
      }),
      // Migrate v0 → v1: backfill profile + turnsSinceSnapshot for existing
      // users so the store shape is consistent. Messages are preserved
      // untouched (the user constraint: "Do NOT break existing message history").
      migrate: (persisted, version) => {
        const p = (persisted ?? {}) as Record<string, unknown>;
        if (version < 1) {
          return {
            ...p,
            // Defensively preserve messages + mode even if the v0 shape was
            // partial. Constraint: NEVER drop existing chat history.
            messages:           Array.isArray(p["messages"]) ? p["messages"] : [],
            mode:               (p["mode"] as SociaGptMode) ?? "general",
            profile:            (p["profile"] as SociaGptProfile) ?? "assistant",
            turnsSinceSnapshot: (p["turnsSinceSnapshot"] as Record<SociaGptProfile, number>) ?? { ...EMPTY_TURN_COUNTS },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          } as any;
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return p as any;
      },
    },
  ),
);

export interface StreamChatDoneMeta {
  chars:     number;
  plan:      string;
  used:      number;
  limit:     number;
  period:    string;
  provider?: "xai" | "openai";
  tier?:     "fast" | "smart";
  model?:    string;
  tokens?:   number;
  latencyMs?: number;
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
  profile?:      SociaGptProfile;
  assistantId:   string;
  signal?:       AbortSignal;
  onDone?:       (meta: StreamChatDoneMeta) => void;
  onRateLimit?:  (retryAfterSec: number) => void;
  onModel?:      (meta: ActiveModelMeta) => void;
}): Promise<void> {
  const { history, mode, assistantId, signal, onDone, onRateLimit, onModel } = opts;
  const profile = opts.profile ?? "assistant";
  const store   = useSociaGptStore.getState();

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
      body: JSON.stringify({ messages: history, mode, profile }),
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
            chars:     typeof d.chars     === "number" ? d.chars     : 0,
            plan:      typeof d.plan      === "string" ? d.plan      : "free",
            used:      typeof d.used      === "number" ? d.used      : 0,
            limit:     typeof d.limit     === "number" ? d.limit     : 30,
            period:    typeof d.period    === "string" ? d.period    : "daily",
            provider:  d.provider === "xai" || d.provider === "openai" ? d.provider : undefined,
            tier:      d.tier === "fast" || d.tier === "smart" ? d.tier : undefined,
            model:     typeof d.model     === "string" ? d.model     : undefined,
            tokens:    typeof d.tokens    === "number" ? d.tokens    : undefined,
            latencyMs: typeof d.latencyMs === "number" ? d.latencyMs : undefined,
          };
          // Persist the per-message meta so the bubble can render
          // "Grok 4 · 412 tokens · 1.4s" forever.
          if (doneMeta.provider && doneMeta.tier && doneMeta.model && doneMeta.tokens !== undefined && doneMeta.latencyMs !== undefined) {
            store.setAssistantMeta(assistantId, {
              provider:  doneMeta.provider,
              tier:      doneMeta.tier,
              model:     doneMeta.model,
              tokens:    doneMeta.tokens,
              latencyMs: doneMeta.latencyMs,
            });
          }
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
    // Periodic memory snapshot — bump the per-profile counter and, every
    // SNAPSHOT_EVERY_N_TURNS user turns, fire a fire-and-forget snapshot.
    // Failure is silent: snapshots are best-effort and must NEVER break
    // chat or streaming.
    try {
      const live  = useSociaGptStore.getState();
      const next  = live.bumpTurnsSinceSnapshot(profile);
      if (next >= SNAPSHOT_EVERY_N_TURNS) {
        live.resetTurnsSinceSnapshot(profile);
        void snapshotMemory(profile, live.messages).catch(() => {});
      }
    } catch { /* ignore */ }
  }

  if (!sseError && doneMeta && onDone) {
    onDone(doneMeta);
  }
}

/* ───────────────────────── Memory API helpers ───────────────────────── */

async function authHeaders(): Promise<Record<string, string> | null> {
  const session = await supabase.auth.getSession();
  const token   = session.data.session?.access_token;
  if (!token) return null;
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

export interface MemorySnapshotInfo {
  profile:        SociaGptProfile;
  summary:        string;
  turnCount:      number;
  snapshotAtTurn: number;
  updatedAt:      string | null;
}

/** Fetch the current memory snapshot for a profile (owner-scoped). */
export async function getMemory(profile: SociaGptProfile): Promise<MemorySnapshotInfo | null> {
  const headers = await authHeaders();
  if (!headers) return null;
  try {
    const r = await fetch(`/api/socia-gpt/memory/${profile}`, { headers });
    if (!r.ok) return null;
    return (await r.json()) as MemorySnapshotInfo;
  } catch { return null; }
}

/** Force-snapshot the current conversation into this profile's memory. */
export async function snapshotMemory(
  profile: SociaGptProfile,
  messages: ChatMessage[],
): Promise<{ ok: boolean; skipped?: boolean; summary?: string } | null> {
  const headers = await authHeaders();
  if (!headers) return null;
  // Send a slim transcript: role + content only, last 30 user-or-assistant turns.
  const clean = messages
    .filter((m) => !m.pending && !m.error && (m.role === "user" || m.role === "assistant"));
  // Send the *total* user turn count across the whole conversation — the
  // slim window we send below is only the recent context the model needs
  // to write the summary. The DB row's turn_count should reflect lifetime,
  // not just the window, so snapshot cadence comparisons stay correct.
  const totalUserTurns = clean.filter((m) => m.role === "user").length;
  const slim = clean.slice(-30).map((m) => ({ role: m.role, content: m.content }));
  if (slim.length === 0) return { ok: true, skipped: true };
  try {
    const r = await fetch("/api/socia-gpt/memory/snapshot", {
      method: "POST",
      headers,
      body: JSON.stringify({ profile, messages: slim, totalUserTurns }),
    });
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}

/** Wipe this profile's memory. Other profiles are untouched. */
export async function resetMemory(profile: SociaGptProfile): Promise<boolean> {
  const headers = await authHeaders();
  if (!headers) return false;
  try {
    const r = await fetch(`/api/socia-gpt/memory/${profile}`, {
      method: "DELETE",
      headers,
    });
    return r.ok;
  } catch { return false; }
}
