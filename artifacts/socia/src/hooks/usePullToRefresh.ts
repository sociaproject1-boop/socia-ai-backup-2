/**
 * usePullToRefresh — native-feel pull-to-refresh for mobile feeds.
 *
 * Design choices:
 * - All touch tracking via refs + direct DOM writes (zero setState on touchmove).
 * - Only setState on phase transitions (idle/pulling/ready/refreshing/done).
 * - All listeners are { passive: true } — never blocks scroll thread.
 * - Only activates when container.scrollTop === 0, no scroll conflicts.
 * - Returns indicatorRef so the indicator element is imperatively controlled.
 */
import { useCallback, useEffect, useRef, useState } from "react";

export type PTRPhase = "idle" | "pulling" | "ready" | "refreshing" | "done";

const THRESHOLD   = 72;   // px of damped pull to trigger refresh
const MAX_PULL    = 110;  // px max damped pull distance
const DAMPING     = 0.44; // resistance (raw delta × DAMPING = display distance)
const INDICATOR_H = 64;   // indicator height in px (must match component CSS)
const DONE_MS     = 1400; // how long "Updated just now" shows before hiding

export interface PTRState {
  phase:        PTRPhase;
  pullDist:     number;
  indicatorRef: React.RefObject<HTMLDivElement | null>;
}

export function usePullToRefresh(
  containerRef: React.RefObject<HTMLElement | null>,
  onRefresh:    () => Promise<void> | void,
  disabled = false,
): PTRState {
  const [phase, setPhase]       = useState<PTRPhase>("idle");
  const [pullDist, setPullDist] = useState(0);

  const indicatorRef = useRef<HTMLDivElement>(null);
  const phaseRef     = useRef<PTRPhase>("idle");
  const startYRef    = useRef(0);
  const distRef      = useRef(0);
  const rafId        = useRef<number | null>(null);

  useEffect(() => { phaseRef.current = phase; }, [phase]);

  /* ── Imperative indicator moves (no React re-render per frame) ─────── */
  const setIndicatorY = useCallback((dist: number) => {
    const el = indicatorRef.current;
    if (!el) return;
    const y       = dist - INDICATOR_H;
    const opacity = Math.min(dist / INDICATOR_H, 1);
    el.style.transition = "";
    el.style.transform  = `translateY(${y}px)`;
    el.style.opacity    = String(opacity);
  }, []);

  const snapIndicatorTo = useCallback((y: number, opacity: number) => {
    const el = indicatorRef.current;
    if (!el) return;
    el.style.transition = "transform 0.28s cubic-bezier(0.22,1,0.36,1), opacity 0.28s ease";
    el.style.transform  = `translateY(${y}px)`;
    el.style.opacity    = String(opacity);
    setTimeout(() => { if (indicatorRef.current) indicatorRef.current.style.transition = ""; }, 300);
  }, []);

  /* ── Touch handlers ─────────────────────────────────────────────────── */
  useEffect(() => {
    const container = containerRef.current;
    if (!container || disabled) return;

    const onTouchStart = (e: TouchEvent) => {
      if (phaseRef.current === "refreshing") return;
      if (container.scrollTop > 0) { startYRef.current = 0; return; }
      startYRef.current = e.touches[0]!.clientY;
      distRef.current   = 0;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (phaseRef.current === "refreshing") return;
      if (!startYRef.current) return;
      if (container.scrollTop > 0) { startYRef.current = 0; return; }

      const delta = e.touches[0]!.clientY - startYRef.current;
      if (delta <= 0) return;

      const damped = Math.min(delta * DAMPING, MAX_PULL);
      distRef.current = damped;

      if (rafId.current !== null) cancelAnimationFrame(rafId.current);
      rafId.current = requestAnimationFrame(() => {
        setIndicatorY(damped);
        setPullDist(damped);
        const next: PTRPhase = damped >= THRESHOLD ? "ready" : "pulling";
        if (phaseRef.current !== next && phaseRef.current !== "refreshing") {
          phaseRef.current = next;
          setPhase(next);
        }
      });
    };

    const onTouchEnd = async () => {
      if (phaseRef.current === "idle") return;
      if (phaseRef.current === "refreshing") return;
      if (rafId.current !== null) { cancelAnimationFrame(rafId.current); rafId.current = null; }

      const dist = distRef.current;
      distRef.current = 0;

      if (dist >= THRESHOLD) {
        /* ── Snap indicator to "refreshing" hold position ── */
        snapIndicatorTo(0, 1);          // sits exactly at y=0 (top edge)
        phaseRef.current = "refreshing";
        setPhase("refreshing");
        setPullDist(0);

        try { await onRefresh(); } catch { /* noop */ }

        phaseRef.current = "done";
        setPhase("done");

        setTimeout(() => {
          snapIndicatorTo(-INDICATOR_H, 0);   // slide back up
          phaseRef.current = "idle";
          setPhase("idle");
          setPullDist(0);
        }, DONE_MS);
      } else {
        /* ── Not enough pull — snap back ── */
        snapIndicatorTo(-INDICATOR_H, 0);
        phaseRef.current = "idle";
        setPhase("idle");
        setPullDist(0);
      }

      startYRef.current = 0;
    };

    container.addEventListener("touchstart", onTouchStart, { passive: true });
    container.addEventListener("touchmove",  onTouchMove,  { passive: true });
    container.addEventListener("touchend",   onTouchEnd,   { passive: true });
    container.addEventListener("touchcancel",onTouchEnd,   { passive: true });

    return () => {
      container.removeEventListener("touchstart",  onTouchStart);
      container.removeEventListener("touchmove",   onTouchMove);
      container.removeEventListener("touchend",    onTouchEnd);
      container.removeEventListener("touchcancel", onTouchEnd);
      if (rafId.current !== null) cancelAnimationFrame(rafId.current);
    };
  }, [containerRef, onRefresh, disabled, setIndicatorY, snapIndicatorTo]);

  return { phase, pullDist, indicatorRef };
}
