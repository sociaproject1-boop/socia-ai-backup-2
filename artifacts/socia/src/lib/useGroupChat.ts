/**
 * useGroupChat.ts -- Real-time group chat via Supabase Realtime
 *
 * Mirrors useSupabaseChat.ts patterns:
 *  - Math.random() channel names avoid "already subscribed" errors
 *  - ALL .on() handlers chained BEFORE .subscribe()
 *  - cleanup via supabase.removeChannel()
 */
import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "./supabase";

export interface GroupAttachment {
  url:   string;
  type:  string;
  name?: string;
  size?: number;
}

export interface GroupMessage {
  id:          string;
  group_id:    string;
  sender_id:   string;
  content:     string | null;
  attachments: GroupAttachment[];
  created_at:  string;
  sender?: {
    id:           string;
    name:         string;
    username:     string;
    avatar_url:   string;
    is_verified?: boolean;
  };
}

export interface GroupMember {
  user_id:   string;
  role:      "owner" | "admin" | "member";
  joined_at: string;
  user: {
    id:           string;
    name:         string;
    username:     string;
    avatar_url:   string;
    is_verified?: boolean;
    is_owner?:    boolean;
  };
}

export interface ChatGroup {
  id:            string;
  name:          string;
  avatar_url:    string | null;
  owner_id:      string;
  created_at:    string;
  updated_at:    string;
  member_count?: number;
  last_message?: GroupMessage | null;
  unread_count?: number;
}

/* ── API helpers ─────────────────────────────────────────────────────────── */
async function apiFetch(path: string, opts?: RequestInit) {
  const res = await fetch(`/api${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(opts?.headers ?? {}) },
    ...opts,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((json as any).error ?? `HTTP ${res.status}`);
  return json;
}

export const groupApi = {
  createGroup:  (name: string, memberIds: string[], avatarUrl?: string) =>
    apiFetch("/groups", { method: "POST", body: JSON.stringify({ name, member_ids: memberIds, avatar_url: avatarUrl }) }),
  listGroups:   (): Promise<{ groups: ChatGroup[] }> => apiFetch("/groups"),
  getGroup:     (id: string): Promise<{ group: ChatGroup; members: GroupMember[] }> => apiFetch(`/groups/${id}`),
  sendMessage:  (groupId: string, content: string, attachments?: GroupAttachment[]) =>
    apiFetch(`/groups/${groupId}/messages`, { method: "POST", body: JSON.stringify({ content, attachments }) }),
  getMessages:  (groupId: string, before?: string): Promise<{ messages: GroupMessage[]; has_more: boolean }> =>
    apiFetch(`/groups/${groupId}/messages${before ? `?before=${encodeURIComponent(before)}` : ""}`),
  markRead:     (groupId: string, messageId: string) =>
    apiFetch(`/groups/${groupId}/read`, { method: "POST", body: JSON.stringify({ message_id: messageId }) }),
  patchGroup:   (groupId: string, updates: { name?: string; avatar_url?: string }) =>
    apiFetch(`/groups/${groupId}`, { method: "PATCH", body: JSON.stringify(updates) }),
  deleteGroup:  (groupId: string) => apiFetch(`/groups/${groupId}`, { method: "DELETE" }),
  leaveGroup:   (groupId: string) => apiFetch(`/groups/${groupId}/leave`, { method: "POST" }),
  addMembers:   (groupId: string, userIds: string[]) =>
    apiFetch(`/groups/${groupId}/members`, { method: "POST", body: JSON.stringify({ user_ids: userIds }) }),
  removeMember: (groupId: string, userId: string) =>
    apiFetch(`/groups/${groupId}/members/${userId}`, { method: "DELETE" }),
  transfer:     (groupId: string, newOwnerId: string) =>
    apiFetch(`/groups/${groupId}/transfer`, { method: "PATCH", body: JSON.stringify({ new_owner_id: newOwnerId }) }),
};

/* ── useMyGroups ─────────────────────────────────────────────────────────── */
export function useMyGroups(userId: string | null) {
  const [groups,  setGroups]  = useState<ChatGroup[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!userId) { setGroups([]); setLoading(false); return; }
    try {
      const { groups: g } = await groupApi.listGroups();
      setGroups(g ?? []);
    } catch { /* keep stale */ }
    setLoading(false);
  }, [userId]);

  useEffect(() => { void load(); }, [load]);

  // Real-time: bump unread when any group gets a new message
  useEffect(() => {
    if (!userId) return;
    const ch = (supabase
      .channel(`group-inbox:${userId}:${Math.random()}`) as any)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_group_messages" },
        () => { void load(); })
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [userId, load]);

  return { groups, loading, reload: load };
}

/* ── useGroupMessages ────────────────────────────────────────────────────── */
export function useGroupMessages(groupId: string | null, myId: string | null) {
  const [messages, setMessages] = useState<GroupMessage[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [hasMore,  setHasMore]  = useState(false);
  const seenIds = useRef(new Set<string>());

  const load = useCallback(async () => {
    if (!groupId) { setMessages([]); setLoading(false); return; }
    setLoading(true);
    try {
      const { messages: msgs, has_more } = await groupApi.getMessages(groupId);
      seenIds.current = new Set(msgs.map((m) => m.id));
      setMessages(msgs);
      setHasMore(has_more);
      if (msgs.length && myId) void groupApi.markRead(groupId, msgs[msgs.length - 1]!.id);
    } catch { /* ignore */ }
    setLoading(false);
  }, [groupId, myId]);

  useEffect(() => { void load(); }, [load]);

  // Real-time new messages
  useEffect(() => {
    if (!groupId) return;
    const ch = (supabase
      .channel(`group-msgs:${groupId}:${Math.random()}`) as any)
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_group_messages", filter: `group_id=eq.${groupId}` },
        (payload: any) => {
          const row = payload.new as GroupMessage;
          if (seenIds.current.has(row.id)) return;
          seenIds.current.add(row.id);
          void supabase
            .from("users").select("id, name, username, avatar_url, is_verified")
            .eq("id", row.sender_id).single()
            .then(({ data: sender }: any) => {
              setMessages((prev) => [...prev, { ...row, sender: sender ?? undefined }]);
              if (myId) void groupApi.markRead(groupId, row.id);
            });
        })
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [groupId, myId]);

  const loadMore = useCallback(async () => {
    if (!groupId || !hasMore || !messages.length) return;
    try {
      const { messages: older, has_more } = await groupApi.getMessages(groupId, messages[0]!.created_at);
      const fresh = older.filter((m) => !seenIds.current.has(m.id));
      fresh.forEach((m) => seenIds.current.add(m.id));
      setMessages((prev) => [...fresh, ...prev]);
      setHasMore(has_more);
    } catch { /* ignore */ }
  }, [groupId, hasMore, messages]);

  return { messages, loading, hasMore, loadMore, reload: load };
}

/* ── useGroupTyping ──────────────────────────────────────────────────────── */
export function useGroupTyping(groupId: string | null, myId: string | null, myName: string) {
  const [typingNames, setTypingNames] = useState<string[]>([]);
  const channelRef = useRef<any>(null);

  useEffect(() => {
    if (!groupId || !myId) return;
    const ch = supabase.channel(`group-typing:${groupId}:${Math.random()}`, {
      config: { presence: { key: myId } },
    }) as any;
    ch.on("presence", { event: "sync" }, () => {
      const state = ch.presenceState() as Record<string, { name: string }[]>;
      const names = Object.entries(state)
        .filter(([uid]) => uid !== myId)
        .flatMap(([, presences]) => presences.map((p) => p.name));
      setTypingNames(names);
    }).subscribe();
    channelRef.current = ch;
    return () => { void supabase.removeChannel(ch); channelRef.current = null; };
  }, [groupId, myId]);

  const sendTyping = useCallback((isTyping: boolean) => {
    if (!channelRef.current) return;
    if (isTyping) void channelRef.current.track({ name: myName, typing: true });
    else          void channelRef.current.untrack();
  }, [myName]);

  return { typingNames, sendTyping };
}
