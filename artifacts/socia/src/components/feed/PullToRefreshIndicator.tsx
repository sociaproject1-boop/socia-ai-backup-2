/**
 * PullToRefreshIndicator — overlay that appears at the top of the viewport
 * when the user pulls down on a feed. Imperatively controlled via indicatorRef
 * (transforms set directly in usePullToRefresh for 60fps performance).
 *
 * Height must stay 64px to match INDICATOR_H in usePullToRefresh.ts.
 */
import { useEffect, useRef } from "react";
import type { PTRPhase } from "@/hooks/usePullToRefresh";

interface Props {
  phase:        PTRPhase;
  indicatorRef: React.RefObject<HTMLDivElement | null>;
}

export function PullToRefreshIndicator({ phase, indicatorRef }: Props) {
  const spinnerRef  = useRef<SVGSVGElement>(null);
  const arrowRef    = useRef<SVGSVGElement>(null);
  const checkRef    = useRef<SVGSVGElement>(null);
  const textRef     = useRef<HTMLSpanElement>(null);
  const dotRef      = useRef<HTMLSpanElement>(null);

  /* Update inner elements based on phase without re-mounting the node */
  useEffect(() => {
    const text    = textRef.current;
    const spinner = spinnerRef.current;
    const arrow   = arrowRef.current;
    const check   = checkRef.current;
    const dot     = dotRef.current;
    if (!text || !spinner || !arrow || !check || !dot) return;

    switch (phase) {
      case "idle":
      case "pulling":
        text.textContent       = "Pull down to refresh";
        spinner.style.display  = "none";
        check.style.display    = "none";
        dot.style.display      = "none";
        arrow.style.display    = "block";
        arrow.style.transform  = "rotate(0deg)";
        arrow.style.transition = "transform 0.2s ease";
        break;

      case "ready":
        text.textContent       = "Release to refresh";
        spinner.style.display  = "none";
        check.style.display    = "none";
        dot.style.display      = "none";
        arrow.style.display    = "block";
        arrow.style.transform  = "rotate(180deg)";
        arrow.style.transition = "transform 0.25s cubic-bezier(0.34,1.56,0.64,1)";
        break;

      case "refreshing":
        text.textContent      = "Refreshing…";
        arrow.style.display   = "none";
        check.style.display   = "none";
        dot.style.display     = "none";
        spinner.style.display = "block";
        break;

      case "done":
        text.textContent      = "Updated just now";
        arrow.style.display   = "none";
        spinner.style.display = "none";
        dot.style.display     = "block";
        check.style.display   = "block";
        break;
    }
  }, [phase]);

  return (
    <div
      ref={indicatorRef as React.RefObject<HTMLDivElement>}
      aria-live="polite"
      aria-label={
        phase === "refreshing" ? "Refreshing feed" :
        phase === "done"       ? "Feed updated"    : undefined
      }
      style={{
        position:  "fixed",
        top:       0,
        left:      0,
        right:     0,
        height:    64,
        zIndex:    55,
        display:   "flex",
        alignItems: "center",
        justifyContent: "center",
        gap:       8,
        pointerEvents: "none",
        /* Start hidden above viewport — usePullToRefresh drives the transform */
        transform: "translateY(-64px)",
        opacity:   0,
        willChange: "transform, opacity",
        background: "linear-gradient(180deg, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.0) 100%)",
      }}
    >
      {/* Socia gradient accent line at very top */}
      <div style={{
        position:   "absolute",
        top:        0,
        left:       0,
        right:      0,
        height:     2,
        background: "#1D9BF0",
        opacity:    0.7,
      }} />

      {/* Down-arrow icon (pulling / ready) */}
      <svg
        ref={arrowRef}
        width={15} height={15}
        viewBox="0 0 15 15"
        fill="none"
        style={{ color: "rgba(255,255,255,0.75)", flexShrink: 0, display: "block" }}
      >
        <path
          d="M7.5 2v9M3 8l4.5 4.5L12 8"
          stroke="currentColor"
          strokeWidth={1.6}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>

      {/* Spinner (refreshing) */}
      <svg
        ref={spinnerRef}
        width={15} height={15}
        viewBox="0 0 15 15"
        fill="none"
        style={{ color: "rgba(255,255,255,0.75)", flexShrink: 0, display: "none",
                 animation: "ptr-spin 0.75s linear infinite" }}
      >
        <circle cx={7.5} cy={7.5} r={6} stroke="currentColor" strokeWidth={1.5}
                strokeDasharray="20 18" strokeLinecap="round"/>
      </svg>

      {/* Check (done) */}
      <svg
        ref={checkRef}
        width={14} height={14}
        viewBox="0 0 14 14"
        fill="none"
        style={{ color: "#4ade80", flexShrink: 0, display: "none" }}
      >
        <path d="M2.5 7l3.5 3.5 5.5-6"
              stroke="currentColor" strokeWidth={1.8}
              strokeLinecap="round" strokeLinejoin="round"/>
      </svg>

      {/* Green dot (done, inline with text) */}
      <span
        ref={dotRef}
        style={{
          display:      "none",
          width:        6,
          height:       6,
          borderRadius: "50%",
          background:   "#4ade80",
          flexShrink:   0,
        }}
      />

      <span
        ref={textRef}
        style={{
          fontSize:    12,
          fontWeight:  500,
          letterSpacing: "0.01em",
          color:       "rgba(255,255,255,0.75)",
          userSelect:  "none",
        }}
      >
        Pull down to refresh
      </span>

    </div>
  );
}
