/**
 * usePulse.ts — React hooks for the PULSE system.
 *
 * usePulseFeed()    — home bar data (grouped, sorted unviewed-first)
 * useUserPulses()   — single-user active pulses + hasActivePulse flag
 * usePulseSocket()  — shared socket listener for pulse:new / pulse:deleted
 */
import { useState, useEffect, useCallback, useRef } from "react";
import {
  fetchPulseFeed,
  fetchUserPulses,
  type PulseFeedGroup,
  type Pulse,
} from "@/lib/pulseClient";
import { useAppStore } from "@/lib/store";

/* ── Singleton socket ref (shared across hook instances) ─────────────────── */
let _pulseListeners: Array<(event: string, data: any) => void> = [];

function emitToPulseListeners(event: string, data: any) {
  _pulseListeners.forEach((fn) => fn(event, data));
}

export function usePulseSocket() {
  useEffect(() => {
    let sock: any = null;
    let cancelled = false;

    import("socket.io-client").then(({ io }) => {
      if (cancelled) return;
      sock = io("/", { path: "/api/socket.io/", autoConnect: true });
      sock.on("pulse:new",     (d: any) => emitToPulseListeners("pulse:new", d));
      sock.on("pulse:deleted", (d: any) => emitToPulseListeners("pulse:deleted", d));
      sock.on("pulse:viewed",  (d: any) => emitToPulseListeners("pulse:viewed", d));
    });

    return () => {
      cancelled = true;
      sock?.disconnect();
    };
  }, []);
}

/* ── usePulseFeed ────────────────────────────────────────────────────────── */

export function usePulseFeed() {
  const me      = useAppStore((s) => s.user);
  const [groups, setGroups]   = useState<PulseFeedGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const loadedRef = useRef(false);

  const load = useCallback(async () => {
    if (!me) return;
    try {
      const data = await fetchPulseFeed();
      setGroups(data);
    } catch {
      /* non-fatal — table may not exist yet */
    } finally {
      setLoading(false);
      loadedRef.current = true;
    }
  }, [me]);

  useEffect(() => { load(); }, [load]);

  /* Realtime: on pulse:new or pulse:deleted refresh the feed */
  useEffect(() => {
    const handler = (event: string) => {
      if (event === "pulse:new" || event === "pulse:deleted") load();
    };
    _pulseListeners.push(handler);
    return () => { _pulseListeners = _pulseListeners.filter((f) => f !== handler); };
  }, [load]);

  /** Mark a single pulse as viewed in local state (optimistic) */
  const markViewed = useCallback((pulseId: string) => {
    setGroups((prev) =>
      prev.map((g) => {
        const nextPulses = g.pulses.map((p) =>
          p.id === pulseId ? { ...p, is_viewed: true } : p
        );
        return {
          ...g,
          pulses: nextPulses,
          has_unviewed: nextPulses.some((p) => !p.is_viewed),
        };
      })
    );
  }, []);

  return { groups, loading, refresh: load, markViewed };
}

/* ── useUserPulses ───────────────────────────────────────────────────────── */

export function useUserPulses(userId: string | undefined) {
  const [pulses, setPulses]         = useState<Pulse[]>([]);
  const [loading, setLoading]       = useState(false);
  const [hasActivePulse, setHasAP]  = useState(false);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    setLoading(true);
    fetchUserPulses(userId)
      .then((data) => {
        if (cancelled) return;
        setPulses(data);
        setHasAP(data.length > 0);
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [userId]);

  /* Realtime: refresh on create/delete events for this user */
  useEffect(() => {
    if (!userId) return;
    const handler = (event: string, data: any) => {
      if ((event === "pulse:new" || event === "pulse:deleted") && data?.userId === userId) {
        fetchUserPulses(userId).then((d) => { setPulses(d); setHasAP(d.length > 0); }).catch(() => {});
      }
    };
    _pulseListeners.push(handler);
    return () => { _pulseListeners = _pulseListeners.filter((f) => f !== handler); };
  }, [userId]);

  return { pulses, loading, hasActivePulse };
}
