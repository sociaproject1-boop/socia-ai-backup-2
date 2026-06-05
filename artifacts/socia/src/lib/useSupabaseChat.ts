/**
 * useSupabaseChat.ts — Real-time chat via Supabase
 *
 * Design decisions:
 *  • useConversations uses TWO queries (messages + users) instead of FK JOINs.
 *    This is resilient: no FK constraint required, works even if DROP CONSTRAINT
 *    was already run.
 *  • ALL .on() handlers are chained BEFORE .subscribe() (Supabase rule).
 *  • Cleanup uses supabase.removeChannel(ch) — fully destroys the channel.
 *  • Channel names use Math.random() for guaranteed uniqueness — Date.now() repeats
 *    within the same millisecond when navigating away/back quickly, causing Supabase
 *    to return a cached already-subscribed channel and throw "cannot add postgres_changes
 *    after subscribe()".
 *  • `load` is excluded from useEffect deps — it's stable via useCallback and
 *    including it would cause subscribe → cleanup → re-subscribe loops.
 *  • Every Supabase call logs its inputs and any error so issues are visible in
 *    the browser console.
 */
import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "./supabase";

/* ══════════════════════════════════════════════════════════════════════════ */
/*  Types                                                                     */
/* ══════════════════════════════════════════════════════════════════════════ */

export interface SupabaseMessage {
  id:           string;
  sender_id:    string;
  receiver_id:  string;
  text:         string | null;
  image_url:    string | null;
  audio_url:    string | null;
  seen:          boolean;
  seen_at:       string | null;
  delivered_at?: string | null;
  edited:        boolean;
  created_at:   string;
  reply_to_id?: string | null;
  /* Prompt-to-chat — populated by send_prompt_message RPC.
     Optional/?: harmless on older rows that predate the §13 schema. */
  prompt?:      string | null;
  is_prompt?:   boolean;
}

export interface MessageReaction {
  id:         string;
  message_id: string;
  user_id:    string;
  emoji:      string;
  created_at: string;
}

export interface ConversationUser {
  id:           string;
  name:         string;
  username:     string;
  avatar_url:   string;
  last_seen:    string | null;
  /* Badge fields — populated when present in the row, harmless when absent */
  is_owner?:    boolean;
  is_verified?: boolean;
}

export interface Conversation {
  otherId:         string;
  otherName:       string;
  otherUsername:   string;
  otherAvatar:     string;
  otherLastSeen:   string | null;
  otherIsOwner:    boolean;
  otherIsVerified: boolean;
  lastText:        string;
  lastImageUrl:    string | null;
  lastAt:          string;
  unread:          boolean;
}

/* ══════════════════════════════════════════════════════════════════════════ */
/*  Helpers                                                                   */
/* ══════════════════════════════════════════════════════════════════════════ */

export function isUserOnline(lastSeen: string | null | undefined): boolean {
  if (!lastSeen) return false;
  return Date.now() - new Date(lastSeen).getTime() < 2 * 60 * 1000;
}

/** Human-readable "Active X min ago" string for the chat header */
export function getLastSeenText(lastSeen: string | null | undefined): string {
  if (!lastSeen) return "Offline";
  const ms  = Date.now() - new Date(lastSeen).getTime();
  const min = Math.floor(ms / 60_000);
  if (min < 2)  return "Online";
  if (min < 60) return `Active ${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24)  return `Active ${hr}h ago`;
  return "Offline";
}

/* In-memory user cache so we don't re-fetch profiles on every re-render */
const userCache = new Map<string, ConversationUser>();

/** Clear the user cache on sign-out to prevent cross-user data leakage. */
export function clearUserCache(): void {
  userCache.clear();
}

/* ══════════════════════════════════════════════════════════════════════════ */
/*  Presence heartbeat                                                        */
/* ══════════════════════════════════════════════════════════════════════════ */

/**
 * usePresenceHeartbeat — kept for backward-compat; the real heartbeat is now
 * handled by useMyPresence() in AuthProvider (15 s, presence-aware).
 * This is a deliberate no-op.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function usePresenceHeartbeat(_userId: string | null): void {
  // no-op: useMyPresence in authContext handles heartbeat + AWAY detection
}

/* ══════════════════════════════════════════════════════════════════════════ */
/*  useMessages — messages in a single thread                                 */
/* ══════════════════════════════════════════════════════════════════════════ */

const CHAT_PAGE_SIZE = 50;

export function useMessages(myId: string | null, otherId: string | null) {
  const [messages,      setMessages]      = useState<SupabaseMessage[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [error,         setError]         = useState<string | null>(null);
  const [hasMore,       setHasMore]       = useState(false);
  const [loadingOlder,  setLoadingOlder]  = useState(false);
  const seenIds = useRef(new Set<string>());

  const threadFilter = useCallback(() =>
    `and(sender_id.eq.${myId},receiver_id.eq.${otherId}),` +
    `and(sender_id.eq.${otherId},receiver_id.eq.${myId})`,
  [myId, otherId]);

  const load = useCallback(async () => {
    if (!myId || !otherId) {
      setLoading(false);
      return;
    }

    /* Fetch the most-recent PAGE_SIZE messages (desc) then reverse to asc.
       Fetching one extra lets us know if there are older pages. */
    const { data, error: qErr } = await supabase
      .from("messages")
      .select("*")
      .or(threadFilter())
      .order("created_at", { ascending: false })
      .limit(CHAT_PAGE_SIZE + 1);

    if (qErr) {
      console.error("[Chat] useMessages load:", qErr.code, qErr.message);
      seenIds.current = new Set();
      setMessages([]);
      setError(null);
      setHasMore(false);
    } else {
      const raw = (data ?? []) as SupabaseMessage[];
      const more = raw.length > CHAT_PAGE_SIZE;
      const rows = (more ? raw.slice(0, CHAT_PAGE_SIZE) : raw).reverse();
      seenIds.current = new Set(rows.map((m) => m.id));
      setMessages(rows);
      setHasMore(more);
      setError(null);
    }
    setLoading(false);
  }, [myId, otherId, threadFilter]);

  /** Load the page of messages older than the oldest currently loaded. */
  const loadOlder = useCallback(async (oldestCreatedAt: string) => {
    if (!myId || !otherId || loadingOlder) return;
    setLoadingOlder(true);
    try {
      const { data, error: qErr } = await supabase
        .from("messages")
        .select("*")
        .or(threadFilter())
        .lt("created_at", oldestCreatedAt)
        .order("created_at", { ascending: false })
        .limit(CHAT_PAGE_SIZE + 1);

      if (!qErr) {
        const raw = (data ?? []) as SupabaseMessage[];
        const more = raw.length > CHAT_PAGE_SIZE;
        const rows = (more ? raw.slice(0, CHAT_PAGE_SIZE) : raw).reverse();
        const newOnes = rows.filter((m) => !seenIds.current.has(m.id));
        newOnes.forEach((m) => seenIds.current.add(m.id));
        if (newOnes.length > 0) setMessages((prev) => [...newOnes, ...prev]);
        setHasMore(more);
      }
    } finally {
      setLoadingOlder(false);
    }
  }, [myId, otherId, loadingOlder, threadFilter]);

  useEffect(() => {
    seenIds.current.clear();
    setMessages([]);
    setError(null);
    setHasMore(false);
    setLoading(true);
    load();

    if (!myId || !otherId) return;

    const channelName = `thread_${[myId, otherId].sort().join("_")}_${Math.random().toString(36).slice(2)}`;

    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        (payload) => {
          const msg = payload.new as SupabaseMessage;
          const relevant =
            (msg.sender_id === myId   && msg.receiver_id === otherId) ||
            (msg.sender_id === otherId && msg.receiver_id === myId);
          if (!relevant) return;
          if (seenIds.current.has(msg.id)) return;
          seenIds.current.add(msg.id);
          setMessages((prev) => [...prev, msg]);
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "messages" },
        (payload) => {
          const updated = payload.new as SupabaseMessage;
          setMessages((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
        }
      )
      .subscribe((status, err) => {
        if (err) console.error("[Chat] thread channel error:", err.message);
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [myId, otherId]); // eslint-disable-line react-hooks/exhaustive-deps

  return { messages, loading, error, hasMore, loadOlder, loadingOlder };
}

/* ══════════════════════════════════════════════════════════════════════════ */
/*  useConversations — conversation list (TWO-QUERY, no FK JOIN dependency)  */
/* ══════════════════════════════════════════════════════════════════════════ */

export function useConversations(myId: string | null) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading,       setLoading]       = useState(true);

  const load = useCallback(async () => {
    if (!myId) {
      setLoading(false);
      return;
    }

    /* ── Step 1: fetch all messages involving me ─────────────────────── *
     *  SELECT * so missing optional columns (edited, edited_at, …) on   *
     *  older schemas can never break the inbox.                          */
    // 100 rows covers ~50 distinct conversations with 2 messages each, which
    // is enough for any real inbox.  500 was causing a large initial payload
    // and a slow second-query user-batch fetch on every Messages page mount.
    const { data: msgs, error: msgErr } = await supabase
      .from("messages")
      .select("*")
      .or(`sender_id.eq.${myId},receiver_id.eq.${myId}`)
      .order("created_at", { ascending: false })
      .limit(100);

    if (msgErr) {
      console.error("[Chat] useConversations messages ERROR:", msgErr);
      /* Do NOT clear conversations — keep the last known good list      *
       * so the inbox doesn't visually "disappear" on a transient error. */
      setLoading(false);
      return;
    }

    /* ── Step 2: collect unique other-user IDs ───────────────────────── */
    const otherIdSet = new Set<string>();
    for (const m of (msgs ?? [])) {
      otherIdSet.add(m.sender_id === myId ? m.receiver_id : m.sender_id);
    }
    const otherIds = [...otherIdSet];

    /* ── Step 3: batch-fetch those users ─────────────────────────────── */
    const userMap = new Map<string, ConversationUser>();

    if (otherIds.length > 0) {
      const { data: users, error: uErr } = await supabase
        .from("users")
        .select("*")
        .in("id", otherIds);

      if (uErr) {
        console.error("[Chat] useConversations users ERROR:", uErr);
      } else {
        for (const u of (users ?? []) as ConversationUser[]) {
          userMap.set(u.id, u);
          userCache.set(u.id, u);
        }
      }
    }

    /* ── Step 4: build deduplicated conversation list ────────────────── */
    const seen = new Set<string>();
    const convs: Conversation[] = [];

    for (const row of (msgs ?? []) as any[]) {
      const fromMe  = row.sender_id === myId;
      const otherId = fromMe ? row.receiver_id : row.sender_id;
      if (seen.has(otherId)) continue;
      seen.add(otherId);

      const other = userMap.get(otherId) ?? userCache.get(otherId);

      convs.push({
        otherId,
        otherName:       other?.name         || "",
        otherUsername:   other?.username     || "",
        otherAvatar:     other?.avatar_url   || "",
        otherLastSeen:   other?.last_seen    ?? null,
        otherIsOwner:    Boolean(other?.is_owner),
        otherIsVerified: Boolean(other?.is_verified),
        lastText:
          row.text       ||
          (row.image_url  ? "📷 Photo"         : "") ||
          (row.audio_url  ? "🎤 Voice message"  : "") ||
          "",
        lastImageUrl: row.image_url ?? null,
        lastAt:       row.created_at,
        unread:       !row.seen && row.receiver_id === myId,
      });
    }

    setConversations(convs);
    setLoading(false);
  }, [myId]);

  useEffect(() => {
    load();
    if (!myId) return;

    const channelName = `convs_${myId}_${Math.random().toString(36).slice(2)}`;

    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `receiver_id=eq.${myId}` },
        () => { load(); }
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `sender_id=eq.${myId}` },
        () => load()
      )
      /* Listen for any user-row UPDATE — covers badge changes (is_owner /
       * is_verified) for participants in this user's conversation list.
       * We can't filter by `id IN (...)` server-side (Supabase realtime
       * doesn't support IN filters), so we accept all UPDATEs and reload
       * cheaply — the inbox query is just two SELECTs. */
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "users" },
        (payload: any) => {
          const updatedId: string | undefined = payload?.new?.id;
          if (!updatedId) return;
          /* Only re-fetch if the updated user is one we care about (a peer
           * already in our conversation list, OR ourselves). Avoids churn. */
          if (updatedId === myId) { load(); return; }
          // Use the cache as the cheap "do we know this user" check
          if (userCache.has(updatedId)) load();
        },
      )
      .subscribe((status, err) => {
        if (err) console.error("[Chat] convs channel error:", err.message);
      });

    return () => { supabase.removeChannel(channel); };
  }, [myId]); // eslint-disable-line react-hooks/exhaustive-deps

  return { conversations, loading };
}

/* ══════════════════════════════════════════════════════════════════════════ */
/*  fetchUserById — single user profile lookup (with cache)                  */
/* ══════════════════════════════════════════════════════════════════════════ */

export async function fetchUserById(id: string): Promise<ConversationUser | null> {
  if (userCache.has(id)) return userCache.get(id)!;

  const { data, error } = await supabase
    .from("users")
    .select("id, name, username, avatar_url, last_seen, is_owner, is_verified")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("[Chat] fetchUserById ERROR:", error.code, error.message);
    return null;
  }

  if (!data) return null;

  const user = data as ConversationUser;
  userCache.set(id, user);
  return user;
}

/* ══════════════════════════════════════════════════════════════════════════ */
/*  sendMessage                                                               */
/* ══════════════════════════════════════════════════════════════════════════ */

export async function sendMessage(
  _senderId:  string,   // ignored — server enforces sender identity from JWT
  receiverId: string,
  payload:    { text?: string; image_url?: string; audio_url?: string; reply_to_id?: string },
): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) return "Not signed in. Please sign in again.";

  try {
    const res = await fetch("/api/messages/send", {
      method:  "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body:    JSON.stringify({ receiver_id: receiverId, ...payload }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({})) as { error?: string };
      return j.error ?? `Failed to send message (${res.status})`;
    }
    return null;
  } catch (err) {
    console.error("[Chat] sendMessage ERROR:", err);
    return err instanceof Error ? err.message : "Network error. Please try again.";
  }
}

/* ══════════════════════════════════════════════════════════════════════════ */
/*  Prompt-to-chat — server-enforced quota                                    */
/* ══════════════════════════════════════════════════════════════════════════ */

export interface SendPromptResult {
  ok:           boolean;
  messageId?:   string;
  error?:       string;
  isQuotaError?: boolean;
}

/**
 * sendPromptMessage — calls the send_prompt_message RPC (SECURITY DEFINER).
 * Free users get 5/day; Pro & King get unlimited.  The cap is enforced
 * server-side so a tampered client cannot exceed it.
 */
export async function sendPromptMessage(
  receiverId: string,
  promptText: string,
): Promise<SendPromptResult> {
  const trimmed = promptText.trim();
  if (!trimmed) return { ok: false, error: "Prompt is empty." };
  if (!receiverId) return { ok: false, error: "Pick someone to send to." };

  const { data, error } = await supabase.rpc("send_prompt_message", {
    p_receiver: receiverId,
    p_prompt:   trimmed,
  });

  if (error) {
    /* Postgres exceptions raised inside the RPC bubble up here. The
       quota-exceeded one uses ERRCODE P0001 (raise_exception). */
    const msg = error.message || "Failed to send prompt.";
    const isQuota = /limit/i.test(msg) && /day/i.test(msg);
    console.error("[Chat] sendPromptMessage RPC error:", error.code, msg);
    return { ok: false, error: msg, isQuotaError: isQuota };
  }

  return { ok: true, messageId: data as string };
}

/**
 * useDailyMessageQuota — live read of the current user's prompt-send count.
 *  - returns { count, limit, remaining, isUnlimited, loading }
 *  - subscribes to UPDATEs so the gauge ticks immediately after a send
 *  - auto-resets visually when last_reset rolls over to today
 */
export function useDailyMessageQuota(myId: string | null, isPro: boolean) {
  const FREE_LIMIT = 5;
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const todayStr = () => new Date().toISOString().slice(0, 10);

  const load = useCallback(async () => {
    if (!myId) { setLoading(false); return; }
    const { data, error } = await supabase
      .from("message_usage")
      .select("count, last_reset")
      .eq("user_id", myId)
      .maybeSingle();
    if (error) {
      console.warn("[Chat] useDailyMessageQuota:", error.message);
      setCount(0);
    } else if (!data) {
      setCount(0);
    } else {
      /* If the row hasn't been touched today, the displayed count is 0
         — the next RPC call will reset it server-side. */
      setCount(data.last_reset === todayStr() ? Number(data.count ?? 0) : 0);
    }
    setLoading(false);
  }, [myId]);

  useEffect(() => {
    load();
    if (!myId) return;
    const ch = supabase
      .channel(`usage_${myId}_${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "message_usage", filter: `user_id=eq.${myId}` },
        (payload: any) => {
          const row = payload.new as { count: number; last_reset: string } | null;
          if (!row) return;
          setCount(row.last_reset === todayStr() ? Number(row.count ?? 0) : 0);
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [myId, load]);

  /* Midnight rollover — if the app stays open across midnight (no DB event
     to wake the realtime subscriber), zero out the displayed count locally
     so the gauge reflects the new day immediately. The next RPC will
     persist the reset server-side. */
  useEffect(() => {
    const now = new Date();
    const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const msUntilMidnight = tomorrow.getTime() - now.getTime();
    const t = setTimeout(() => setCount(0), msUntilMidnight + 1000);
    return () => clearTimeout(t);
  }, [count]);

  return {
    count,
    limit:       FREE_LIMIT,
    remaining:   isPro ? Infinity : Math.max(0, FREE_LIMIT - count),
    isUnlimited: isPro,
    loading,
  };
}

/* ══════════════════════════════════════════════════════════════════════════ */
/*  markThreadSeen                                                            */
/* ══════════════════════════════════════════════════════════════════════════ */

export async function markThreadSeen(_myId: string, otherId: string): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) return;
  try {
    await fetch("/api/messages/seen", {
      method:  "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body:    JSON.stringify({ other_id: otherId }),
    });
  } catch { /* non-critical — ignore silently */ }
}

/* ══════════════════════════════════════════════════════════════════════════ */
/*  markThreadDelivered                                                        */
/* ══════════════════════════════════════════════════════════════════════════ */

export async function markThreadDelivered(_myId: string, otherId: string): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) return;
  try {
    await fetch("/api/messages/delivered", {
      method:  "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body:    JSON.stringify({ other_id: otherId }),
    });
  } catch { /* non-critical — ignore silently */ }
}

/* ══════════════════════════════════════════════════════════════════════════ */
/*  uploadChatImage — Supabase Storage: chat-images bucket                   */
/* ══════════════════════════════════════════════════════════════════════════ */

export async function uploadChatImage(file: File, senderId: string): Promise<string | null> {
  const ext  = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
  const path = `${senderId}/${Date.now()}.${ext}`;

  const { data, error } = await supabase.storage
    .from("chat-images")
    .upload(path, file, { upsert: false, contentType: file.type });

  if (error || !data) {
    console.error("[Chat] uploadChatImage ERROR:", error?.message);
    return null;
  }

  const { data: urlData } = supabase.storage.from("chat-images").getPublicUrl(data.path);
  return urlData.publicUrl;
}

/* ══════════════════════════════════════════════════════════════════════════ */
/*  useTypingStatus — Supabase-backed typing indicator                       */
/* ══════════════════════════════════════════════════════════════════════════ */

export function useTypingStatus(myId: string | null, otherId: string | null) {
  const [peerTyping, setPeerTyping] = useState(false);
  const clearTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idleTimer  = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* Stable conversation key — same for both sides of the chat */
  const convKey = myId && otherId ? [myId, otherId].sort().join("_") : null;

  /* ── Subscribe to other user's typing status ── */
  useEffect(() => {
    if (!myId || !otherId || !convKey) return;

    const ch = supabase
      .channel(`typing_${convKey}_${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "typing_status", filter: `user_id=eq.${otherId}` },
        (payload) => {
          const row = payload.new as { is_typing: boolean; conversation_id: string } | null;
          /* Ignore rows for different conversations */
          if (!row || row.conversation_id !== convKey) return;

          if (row.is_typing) {
            setPeerTyping(true);
            /* Auto-clear if we stop receiving updates (safety net) */
            if (clearTimer.current) clearTimeout(clearTimer.current);
            clearTimer.current = setTimeout(() => setPeerTyping(false), 5_000);
          } else {
            setPeerTyping(false);
            if (clearTimer.current) clearTimeout(clearTimer.current);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(ch);
      if (clearTimer.current) clearTimeout(clearTimer.current);
      if (idleTimer.current)  clearTimeout(idleTimer.current);
    };
  }, [myId, otherId, convKey]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Send my typing status ── */
  const sendTyping = useCallback(
    (isTyping: boolean) => {
      if (!myId || !convKey) return;
      if (idleTimer.current) clearTimeout(idleTimer.current);

      /* Fire-and-forget upsert */
      supabase.from("typing_status").upsert(
        { user_id: myId, conversation_id: convKey, is_typing: isTyping, updated_at: new Date().toISOString() },
        { onConflict: "user_id" }
      );

      if (isTyping) {
        /* Auto-stop after 2 s of no new calls (debounce on idle) */
        idleTimer.current = setTimeout(() => {
          supabase.from("typing_status").upsert(
            { user_id: myId, conversation_id: convKey, is_typing: false, updated_at: new Date().toISOString() },
            { onConflict: "user_id" }
          );
        }, 2_000);
      }
    },
    [myId, convKey]
  );

  return { peerTyping, sendTyping };
}

/* ══════════════════════════════════════════════════════════════════════════ */
/*  editMessage                                                               */
/* ══════════════════════════════════════════════════════════════════════════ */

export async function editMessage(
  messageId: string,
  _senderId: string,  // ignored — server enforces sender identity from JWT
  newText:   string,
): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) return "Not signed in";
  try {
    const res = await fetch("/api/messages/edit", {
      method:  "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body:    JSON.stringify({ message_id: messageId, text: newText }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({})) as { error?: string };
      return j.error ?? `Failed to edit message (${res.status})`;
    }
    return null;
  } catch (err) {
    console.error("[Chat] editMessage ERROR:", err);
    return err instanceof Error ? err.message : "Network error";
  }
}

export async function deleteMessage(messageId: string): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) return "Not signed in";
  try {
    const res = await fetch("/api/messages/delete", {
      method:  "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body:    JSON.stringify({ message_id: messageId }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({})) as { error?: string };
      return j.error ?? `Failed to delete message (${res.status})`;
    }
    return null;
  } catch (err) {
    console.error("[Chat] deleteMessage ERROR:", err);
    return err instanceof Error ? err.message : "Network error";
  }
}

/* ══════════════════════════════════════════════════════════════════════════ */
/*  Reactions                                                                 */
/* ══════════════════════════════════════════════════════════════════════════ */

export async function fetchThreadReactions(
  myId:    string,
  otherId: string,
): Promise<MessageReaction[]> {
  const { data: msgs } = await supabase
    .from("messages")
    .select("id")
    .or(
      `and(sender_id.eq.${myId},receiver_id.eq.${otherId}),` +
      `and(sender_id.eq.${otherId},receiver_id.eq.${myId})`
    );
  if (!msgs || msgs.length === 0) return [];
  const ids = msgs.map((m: { id: string }) => m.id);
  const { data, error } = await supabase
    .from("message_reactions")
    .select("*")
    .in("message_id", ids);
  if (error) { console.warn("[Chat] fetchThreadReactions:", error.message); return []; }
  return (data ?? []) as MessageReaction[];
}

export async function toggleReaction(
  messageId: string,
  userId:    string,
  emoji:     string,
): Promise<void> {
  const { data: existing } = await supabase
    .from("message_reactions")
    .select("id")
    .eq("message_id", messageId)
    .eq("user_id",    userId)
    .eq("emoji",      emoji)
    .maybeSingle();
  if (existing) {
    await supabase.from("message_reactions").delete().eq("id", (existing as { id: string }).id);
  } else {
    await supabase.from("message_reactions").insert({ message_id: messageId, user_id: userId, emoji });
  }
}

export function useReactions(myId: string | null, otherId: string | null, messageIds: string[]) {
  const [reactions, setReactions] = useState<MessageReaction[]>([]);

  const load = useCallback(async () => {
    if (!myId || !otherId) return;
    const rows = await fetchThreadReactions(myId, otherId);
    setReactions(rows);
  }, [myId, otherId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    load();
    if (!myId || !otherId) return;
    const idSet = new Set(messageIds);
    const ch = supabase
      .channel(`reactions_${[myId, otherId].sort().join("_")}_${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "message_reactions" }, (p) => {
        const r = p.new as MessageReaction;
        if (idSet.has(r.message_id)) setReactions((prev) => [...prev, r]);
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "message_reactions" }, (p) => {
        const r = p.old as { id: string };
        setReactions((prev) => prev.filter((x) => x.id !== r.id));
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [myId, otherId]); // eslint-disable-line react-hooks/exhaustive-deps

  const optimisticToggle = useCallback((messageId: string, userId: string, emoji: string) => {
    setReactions((prev) => {
      const existing = prev.find(
        (r) => r.message_id === messageId && r.user_id === userId && r.emoji === emoji
      );
      if (existing) return prev.filter((r) => r.id !== existing.id);
      return [
        ...prev,
        { id: `opt_${Date.now()}`, message_id: messageId, user_id: userId, emoji, created_at: new Date().toISOString() },
      ];
    });
  }, []);

  return { reactions, optimisticToggle };
}

/* ══════════════════════════════════════════════════════════════════════════ */
/*  Nicknames                                                                 */
/* ══════════════════════════════════════════════════════════════════════════ */

export async function fetchNickname(userId: string, targetId: string): Promise<string | null> {
  const { data } = await supabase
    .from("nicknames")
    .select("nickname")
    .eq("user_id",        userId)
    .eq("target_user_id", targetId)
    .maybeSingle();
  return (data as { nickname: string } | null)?.nickname ?? null;
}

export async function upsertNickname(
  userId:   string,
  targetId: string,
  nickname: string,
): Promise<void> {
  await supabase.from("nicknames").upsert(
    { user_id: userId, target_user_id: targetId, nickname },
    { onConflict: "user_id,target_user_id" },
  );
}

/* ══════════════════════════════════════════════════════════════════════════ */
/*  uploadAudioMessage — Supabase Storage: audio-messages bucket             */
/* ══════════════════════════════════════════════════════════════════════════ */

export async function uploadAudioMessage(blob: Blob, senderId: string): Promise<string | null> {
  const path = `${senderId}/${Date.now()}.webm`;

  const { data, error } = await supabase.storage
    .from("audio-messages")
    .upload(path, blob, { upsert: false, contentType: "audio/webm" });

  if (error || !data) {
    console.error("[Chat] uploadAudioMessage ERROR:", error?.message);
    return null;
  }

  const { data: urlData } = supabase.storage.from("audio-messages").getPublicUrl(data.path);
  return urlData.publicUrl;
}
