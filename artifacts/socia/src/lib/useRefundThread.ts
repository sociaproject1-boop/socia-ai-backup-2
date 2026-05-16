/**
 * useRefundThread — Supabase Realtime hook for live refund message threads.
 *
 * Follows the same pattern as useSupabaseChat.ts:
 *   - Random channel name suffix prevents "already subscribed" errors.
 *   - Explicit removeChannel() cleanup on unmount.
 *   - No complex FK JOINs — messages fetched with simple select.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "./supabase";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export interface RefundMessage {
  id: string;
  refund_request_id: string;
  sender_id: string | null;
  sender_role: "user" | "admin" | "system";
  message: string;
  attachment_url: string | null;
  created_at: string;
}

export interface RefundNotification {
  id: string;
  refund_request_id: string;
  type: "status_update" | "new_message" | "decision" | "proof_requested" | "info";
  title: string;
  message: string;
  is_read: boolean;
  created_at: string;
}

async function authFetch(path: string, init: RequestInit = {}) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token ?? "";
  return fetch(`${BASE}${path}`, {
    ...init,
    credentials: "include",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
}

/* ── useRefundThread ──────────────────────────────────────────────────── */
export function useRefundThread(refundId: string | null) {
  const [messages,  setMessages]  = useState<RefundMessage[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState<string | null>(null);
  const [sending,   setSending]   = useState(false);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const load = useCallback(async () => {
    if (!refundId) return;
    setLoading(true); setError(null);
    try {
      const res = await authFetch(`/api/refunds/${refundId}/messages`);
      if (!res.ok) throw new Error("Failed to load messages");
      const json = await res.json() as { messages: RefundMessage[] };
      setMessages(json.messages ?? []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [refundId]);

  useEffect(() => {
    if (!refundId) return;
    void load();

    const suffix = Math.random().toString(36).slice(2);
    const ch = supabase
      .channel(`refund-thread-${refundId}-${suffix}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT", schema: "public", table: "refund_messages",
          filter: `refund_request_id=eq.${refundId}`,
        },
        (payload) => {
          const msg = payload.new as RefundMessage;
          if (!msg.sender_id && msg.sender_role !== "system" && !msg) return;
          setMessages((prev) => {
            if (prev.some((m) => m.id === msg.id)) return prev;
            return [...prev, msg];
          });
        },
      )
      .subscribe();

    channelRef.current = ch;
    return () => { void supabase.removeChannel(ch); };
  }, [refundId, load]);

  const sendMessage = useCallback(async (message: string, attachmentUrl?: string) => {
    if (!refundId || !message.trim()) return false;
    setSending(true);
    try {
      const res = await authFetch(`/api/refunds/${refundId}/messages`, {
        method: "POST",
        body: JSON.stringify({ message: message.trim(), attachment_url: attachmentUrl ?? null }),
      });
      if (!res.ok) {
        const j = await res.json() as { message?: string };
        throw new Error(j.message ?? "Failed to send message");
      }
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setSending(false);
    }
  }, [refundId]);

  return { messages, loading, error, sending, sendMessage, reload: load };
}

/* ── useRefundNotifications ───────────────────────────────────────────── */
export function useRefundNotifications() {
  const [notifications, setNotifications] = useState<RefundNotification[]>([]);
  const [unreadCount,   setUnreadCount]   = useState(0);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await authFetch("/api/refund-notifications?limit=30");
      if (!res.ok) return;
      const json = await res.json() as { notifications: RefundNotification[]; unread_count: number };
      setNotifications(json.notifications ?? []);
      setUnreadCount(json.unread_count ?? 0);
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    void load();

    supabase.auth.getUser().then(({ data }) => {
      const uid = data.user?.id;
      if (!uid) return;

      const suffix = Math.random().toString(36).slice(2);
      const ch = supabase
        .channel(`refund-notif-${uid}-${suffix}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT", schema: "public", table: "refund_notifications",
            filter: `user_id=eq.${uid}`,
          },
          (payload) => {
            const n = payload.new as RefundNotification;
            setNotifications((prev) => [n, ...prev]);
            setUnreadCount((c) => c + 1);
          },
        )
        .subscribe();

      channelRef.current = ch;
    });

    return () => {
      if (channelRef.current) void supabase.removeChannel(channelRef.current);
    };
  }, [load]);

  const markRead = useCallback(async (id: string) => {
    setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, is_read: true } : n));
    setUnreadCount((c) => Math.max(0, c - 1));
    await authFetch(`/api/refund-notifications/${id}`, { method: "PATCH" });
  }, []);

  const markAllRead = useCallback(async () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    setUnreadCount(0);
    await authFetch("/api/refund-notifications/read-all", { method: "POST" });
  }, []);

  return { notifications, unreadCount, markRead, markAllRead, reload: load };
}
