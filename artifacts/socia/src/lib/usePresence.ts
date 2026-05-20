/**
 * usePresence.ts — Full Supabase Realtime Presence system
 *
 * Architecture:
 *  - Supabase Realtime channel "global:presence" for instant cross-client sync
 *  - Each connected user tracks { user_id, status, ts } via channel.track()
 *  - Presence store (Zustand) exposes reactive status for every user
 *  - AWAY detection: 3 min without mousemove/keydown/touchstart → "away"
 *  - DB heartbeat: POST /api/presence/heartbeat every 15 s (persists last_seen)
 *  - Auto-reconnect: Supabase Realtime SDK handles this transparently
 *
 * Usage:
 *  useMyPresence(userId, isOwner)     — call once near root (AuthProvider)
 *  usePresenceStatus(userId)          — returns live PresenceStatus for any user
 *  usePresenceStore.getState().getStatus(userId) — non-hook access
 */

import { useEffect, useRef } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { create } from "zustand";
import { supabase, isSupabaseReady } from "./supabase";

/* ── Types ──────────────────────────────────────────────────────────────── */

export type PresenceStatus = "online" | "away" | "offline";

interface PresencePayload {
  user_id: string;
  status:  PresenceStatus;
  ts:      number;
}

/* ── Zustand store ───────────────────────────────────────────────────────── */

interface PresenceStoreState {
  presences: Record<string, PresenceStatus>;
  setPresence:    (userId: string, status: PresenceStatus) => void;
  removePresence: (userId: string) => void;
  getStatus:      (userId: string) => PresenceStatus;
}

export const usePresenceStore = create<PresenceStoreState>((set, get) => ({
  presences: {},
  setPresence: (userId, status) =>
    set((s) => ({ presences: { ...s.presences, [userId]: status } })),
  removePresence: (userId) =>
    set((s) => {
      const p = { ...s.presences };
      delete p[userId];
      return { presences: p };
    }),
  getStatus: (userId) => get().presences[userId] ?? "offline",
}));

/* ── Shared channel singleton ────────────────────────────────────────────── */

const CHANNEL_NAME = "global:presence";
const AWAY_MS      = 3 * 60 * 1000;  // 3 min inactivity → away
const HEARTBEAT_MS = 15_000;          // 15 s DB heartbeat

let sharedChannel:  RealtimeChannel | null = null;
let channelRefs     = 0;

function getOrCreateChannel(): RealtimeChannel {
  if (!sharedChannel) {
    const ch = supabase.channel(CHANNEL_NAME);

    ch.on("presence", { event: "sync" }, () => {
      syncFromChannel(ch);
    });

    ch.on("presence", { event: "join" }, ({ newPresences }) => {
      const { setPresence } = usePresenceStore.getState();
      for (const p of (newPresences as unknown) as PresencePayload[]) {
        if (p.user_id) setPresence(p.user_id, p.status ?? "online");
      }
    });

    ch.on("presence", { event: "leave" }, ({ leftPresences }) => {
      const { removePresence, setPresence } = usePresenceStore.getState();
      for (const p of (leftPresences as unknown) as PresencePayload[]) {
        if (p.user_id) {
          // Mark offline rather than removing so last-seen dots update instantly
          setPresence(p.user_id, "offline");
          // Clean up after a short delay so UI doesn't flicker on reconnect
          setTimeout(() => removePresence(p.user_id), 5_000);
        }
      }
    });

    ch.subscribe();
    sharedChannel = ch;
  }
  channelRefs++;
  return sharedChannel;
}

function releaseChannel() {
  channelRefs = Math.max(0, channelRefs - 1);
  if (channelRefs === 0 && sharedChannel) {
    supabase.removeChannel(sharedChannel);
    sharedChannel = null;
  }
}

function syncFromChannel(ch: RealtimeChannel) {
  const state = ch.presenceState<PresencePayload>();
  const { setPresence } = usePresenceStore.getState();
  for (const key of Object.keys(state)) {
    const entries = state[key] as PresencePayload[];
    const latest  = entries.reduce<PresencePayload | null>(
      (best, e) => (!best || e.ts > best.ts ? e : best),
      null,
    );
    if (latest?.user_id) {
      setPresence(latest.user_id, latest.status ?? "online");
    }
  }
}

/* ── DB heartbeat helper ─────────────────────────────────────────────────── */

async function pingHeartbeat(status: PresenceStatus): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) return;
  try {
    await fetch("/api/presence/heartbeat", {
      method:  "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body:    JSON.stringify({ status }),
    });
  } catch { /* non-critical */ }
}

/* ══════════════════════════════════════════════════════════════════════════ */
/*  useMyPresence — call once near root for the signed-in user               */
/* ══════════════════════════════════════════════════════════════════════════ */

export function useMyPresence(userId: string | null, isOwner = false): void {
  const statusRef    = useRef<PresenceStatus>("online");
  const awayTimer    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const channelRef   = useRef<RealtimeChannel | null>(null);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!userId || !isSupabaseReady) return;

    // ── Acquire channel ──────────────────────────────────────────────────
    const ch = getOrCreateChannel();
    channelRef.current = ch;

    // ── Track own presence ───────────────────────────────────────────────
    const track = (status: PresenceStatus) => {
      statusRef.current = status;
      usePresenceStore.getState().setPresence(userId, status);
      ch.track({ user_id: userId, status, ts: Date.now() } as PresencePayload);
      // DB heartbeat carries the status so backend knows owner is online/offline
      void pingHeartbeat(status);
    };

    // Wait for channel to be subscribed before tracking
    const trackOnReady = () => {
      // Supabase Realtime may already be SUBSCRIBED if channel was shared
      track("online");
    };

    // Give the channel a moment to be ready (idempotent if already connected)
    const readyTimer = setTimeout(trackOnReady, 300);

    // ── AWAY detection ───────────────────────────────────────────────────
    const resetAwayTimer = () => {
      if (awayTimer.current) clearTimeout(awayTimer.current);
      if (statusRef.current === "away") {
        track("online");
      }
      awayTimer.current = setTimeout(() => {
        track("away");
      }, AWAY_MS);
    };

    const ACTIVITY_EVENTS = ["mousemove", "mousedown", "keydown", "touchstart", "scroll"] as const;
    ACTIVITY_EVENTS.forEach((ev) => document.addEventListener(ev, resetAwayTimer, { passive: true }));
    resetAwayTimer(); // start the timer immediately

    // ── Visibility changes ───────────────────────────────────────────────
    const handleVisibility = () => {
      if (document.visibilityState === "hidden") {
        if (awayTimer.current) clearTimeout(awayTimer.current);
        track("away");
      } else {
        resetAwayTimer();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);

    // ── Before-unload: mark offline instantly ────────────────────────────
    const handleBeforeUnload = () => {
      track("offline");
      ch.untrack();
    };
    window.addEventListener("beforeunload", handleBeforeUnload);

    // ── 15 s DB heartbeat ────────────────────────────────────────────────
    heartbeatRef.current = setInterval(() => {
      void pingHeartbeat(statusRef.current);
    }, HEARTBEAT_MS);

    return () => {
      clearTimeout(readyTimer);
      if (awayTimer.current)    clearTimeout(awayTimer.current);
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      ACTIVITY_EVENTS.forEach((ev) => document.removeEventListener(ev, resetAwayTimer));
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("beforeunload", handleBeforeUnload);
      // Mark offline in channel & store before unmounting
      ch.untrack();
      usePresenceStore.getState().setPresence(userId, "offline");
      releaseChannel();
      channelRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);
}

/* ══════════════════════════════════════════════════════════════════════════ */
/*  usePresenceStatus — reactive status for any user                         */
/* ══════════════════════════════════════════════════════════════════════════ */

export function usePresenceStatus(userId: string | null): PresenceStatus {
  return usePresenceStore((s) =>
    userId ? (s.presences[userId] ?? "offline") : "offline"
  );
}

/* ══════════════════════════════════════════════════════════════════════════ */
/*  isOnlineByPresence — checks store + falls back to last_seen timestamp    */
/* ══════════════════════════════════════════════════════════════════════════ */

export function isOnlineByPresence(
  userId: string | null | undefined,
  lastSeen: string | null | undefined,
): boolean {
  if (!userId) return false;
  const storeStatus = usePresenceStore.getState().getStatus(userId);
  if (storeStatus === "online") return true;
  if (storeStatus === "away")   return false;
  // Fallback: consider online if last_seen within 2 min
  if (!lastSeen) return false;
  return Date.now() - new Date(lastSeen).getTime() < 2 * 60 * 1000;
}
