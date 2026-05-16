/**
 * Admin WebSocket hook — connects to the /admin Socket.IO namespace.
 *
 * Provides:
 *  - liveEvents   : real-time fraud + audit events (newest first)
 *  - reviewers    : list of currently active admin reviewers
 *  - isConnected  : WebSocket connection status
 *  - emit         : send events to server (e.g. "reviewing" with current view)
 *  - clearEvents  : flush the local event buffer
 */
import { useEffect, useRef, useState, useCallback } from "react";
import { io, type Socket } from "socket.io-client";

export interface LiveFraudEvent {
  id:            string;
  type:          string;
  severity:      "critical" | "high" | "medium" | "low" | "info";
  message:       string;
  details?:      Record<string, unknown>;
  userId?:       string;
  username?:     string;
  adminUsername?: string;
  score?:        number;
  reference?:    string;
  amount?:       number;
  ts:            string;
}

export interface ReviewerPresence {
  socketId:     string;
  username:     string;
  role:         string;
  currentView?: string;
  connectedAt:  string;
}

const TOKEN_KEY  = "socia_admin_token";
const MAX_EVENTS = 200;

export interface SurgeEvent {
  count:          number;
  window_seconds: number;
  ts:             string;
}

export interface AdminSocketState {
  isConnected:  boolean;
  liveEvents:   LiveFraudEvent[];
  reviewers:    ReviewerPresence[];
  latestSurge:  SurgeEvent | null;
  emit:         (event: string, data?: unknown) => void;
  clearEvents:  () => void;
}

export function useAdminSocket(): AdminSocketState {
  const [isConnected,  setIsConnected]  = useState(false);
  const [liveEvents,   setLiveEvents]   = useState<LiveFraudEvent[]>([]);
  const [reviewers,    setReviewers]    = useState<ReviewerPresence[]>([]);
  const [latestSurge,  setLatestSurge]  = useState<SurgeEvent | null>(null);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) return;

    const socket = io("/admin", {
      path:                 "/api/socket.io/",
      auth:                 { token },
      transports:           ["websocket", "polling"],
      reconnectionDelay:    2_000,
      reconnectionAttempts: 15,
    });
    socketRef.current = socket;

    socket.on("connect",    () => setIsConnected(true));
    socket.on("disconnect", () => setIsConnected(false));

    socket.on("history", (events: LiveFraudEvent[]) => {
      setLiveEvents([...events].reverse().slice(0, MAX_EVENTS));
    });

    socket.on("reviewers", (list: ReviewerPresence[]) => {
      setReviewers(list);
    });

    socket.on("fraud:alert", (event: LiveFraudEvent) => {
      setLiveEvents((prev) => [event, ...prev].slice(0, MAX_EVENTS));
    });

    socket.on("audit:event", (event: LiveFraudEvent) => {
      setLiveEvents((prev) => [event, ...prev].slice(0, MAX_EVENTS));
    });

    socket.on("reviewer:joined", (reviewer: ReviewerPresence) => {
      setReviewers((prev) => [
        ...prev.filter((r) => r.socketId !== reviewer.socketId),
        reviewer,
      ]);
    });

    socket.on("reviewer:left", ({ socketId }: { socketId: string }) => {
      setReviewers((prev) => prev.filter((r) => r.socketId !== socketId));
    });

    socket.on("reviewer:update", (reviewer: ReviewerPresence) => {
      setReviewers((prev) =>
        prev.map((r) => (r.socketId === reviewer.socketId ? reviewer : r)),
      );
    });

    /* Batch events — server coalesces rapid-fire events into a single frame */
    socket.on("fraud:batch", (events: LiveFraudEvent[]) => {
      if (!events?.length) return;
      setLiveEvents((prev) => [...events.reverse(), ...prev].slice(0, MAX_EVENTS));
    });

    /* Surge alert from server-side detection */
    socket.on("fraud:surge", (surge: SurgeEvent) => {
      setLatestSurge(surge);
      // Auto-clear after 90 s so the UI doesn't get stuck
      setTimeout(() => setLatestSurge(null), 90_000);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, []);

  const emit = useCallback((event: string, data?: unknown) => {
    socketRef.current?.emit(event, data);
  }, []);

  const clearEvents = useCallback(() => setLiveEvents([]), []);

  return { isConnected, liveEvents, reviewers, latestSurge, emit, clearEvents };
}
