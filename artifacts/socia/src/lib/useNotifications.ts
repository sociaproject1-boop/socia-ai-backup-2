/**
 * useNotifications.ts
 *
 * • Listens for new messages addressed to myId via Supabase Realtime
 * • Shows an in-app banner (dismissed after 4 s or on click)
 * • Plays a Web Audio API chime — no external sound file needed
 * • Tracks unread message count from DB (unseen messages)
 * • Inserts a row into public.notifications for persistence
 */
import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "./supabase";
import { fetchUserById, type SupabaseMessage } from "./useSupabaseChat";

export interface BannerNotif {
  senderId:    string;
  senderName:  string;
  senderAvatar:string;
  preview:     string;
  threadId:    string;
}

export interface DbNotification {
  id:         string;
  user_id:    string;
  type:       string;
  data:       Record<string, unknown>;
  read:       boolean;
  created_at: string;
}

/* ── Web Audio chime ────────────────────────────────────────────────────── */
function playNotificationSound() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const playTone = (freq: number, startOffset: number, dur: number) => {
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.22, ctx.currentTime + startOffset);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + startOffset + dur);
      osc.start(ctx.currentTime + startOffset);
      osc.stop(ctx.currentTime + startOffset + dur);
    };
    playTone(880,  0,    0.28);
    playTone(1100, 0.12, 0.32);
    setTimeout(() => ctx.close(), 700);
  } catch {
    // AudioContext blocked in some browsers — silently ignore
  }
}

/* ── Main hook ──────────────────────────────────────────────────────────── */
export function useNotifications(
  myId: string | null,
  /** Pass the otherId of the currently open thread so we skip its banner */
  currentThreadId: string | null,
) {
  const [banner,      setBanner]      = useState<BannerNotif | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const bannerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* ── Load initial unread count from messages table ─────────────────── */
  const loadUnread = useCallback(async () => {
    if (!myId) return;
    const { count } = await supabase
      .from("messages")
      .select("*", { count: "exact", head: true })
      .eq("receiver_id", myId)
      .eq("seen", false);
    setUnreadCount(count ?? 0);
  }, [myId]);

  useEffect(() => { loadUnread(); }, [loadUnread]);

  /* ── Realtime: new message → banner + sound + persist notification ── */
  useEffect(() => {
    if (!myId) return;

    const channelName = `notif_${myId}_${Math.random().toString(36).slice(2)}`;

    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        {
          event:  "INSERT",
          schema: "public",
          table:  "messages",
          filter: `receiver_id=eq.${myId}`,
        },
        async (payload) => {
          const msg = payload.new as SupabaseMessage;

          // Always bump unread count
          setUnreadCount((c) => c + 1);

          // Don't show banner if user is already in that thread
          if (msg.sender_id === currentThreadId) return;

          // Resolve sender profile
          const sender = await fetchUserById(msg.sender_id);
          const preview =
            msg.text        ||
            (msg.image_url  ? "📷 Photo"      : "") ||
            (msg.audio_url  ? "🎤 Voice message" : "") ||
            "New message";

          // Play chime
          playNotificationSound();

          // Store notification in DB (fire-and-forget)
          supabase.from("notifications").insert({
            user_id: myId,
            type:    "message",
            data: {
              sender_id:    msg.sender_id,
              sender_name:  sender?.name       || "Someone",
              sender_avatar:sender?.avatar_url || "",
              preview,
              thread_id:    msg.sender_id,
            },
          }).then(({ error }) => {
            if (error) console.error("[Notif] insert:", error.message);
          });

          // Show banner — only for NEW messages (sender ≠ current thread)
          if (bannerTimer.current) clearTimeout(bannerTimer.current);
          setBanner({
            senderId:     msg.sender_id,
            senderName:   sender?.name       || "Someone",
            senderAvatar: sender?.avatar_url || "",
            preview,
            threadId:     msg.sender_id,
          });
          /* Auto-dismiss after 2 s */
          bannerTimer.current = setTimeout(() => setBanner(null), 2000);
        }
      )
      /* When a message is marked seen, recompute unread */
      .on(
        "postgres_changes",
        {
          event:  "UPDATE",
          schema: "public",
          table:  "messages",
          filter: `receiver_id=eq.${myId}`,
        },
        () => loadUnread()
      )
      .subscribe((status, err) => {
        if (err) console.error("[Notif] channel:", err.message);
      });

    return () => {
      if (bannerTimer.current) clearTimeout(bannerTimer.current);
      supabase.removeChannel(channel);
    };
  }, [myId, currentThreadId, loadUnread]);

  const dismissBanner = useCallback(() => {
    if (bannerTimer.current) clearTimeout(bannerTimer.current);
    setBanner(null);
  }, []);

  /** Call when user enters a thread to clear its unread count */
  const markThreadRead = useCallback(async (otherId: string) => {
    if (!myId) return;
    await supabase
      .from("messages")
      .update({ seen: true })
      .eq("receiver_id", myId)
      .eq("sender_id", otherId)
      .eq("seen", false);
    setUnreadCount((c) => Math.max(0, c - 1));
    loadUnread(); // Recompute accurately
  }, [myId, loadUnread]);

  return { banner, unreadCount, dismissBanner, markThreadRead };
}
