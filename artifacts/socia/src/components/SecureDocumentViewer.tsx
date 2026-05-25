/**
 * SecureDocumentViewer — premium pinch/pan/zoom viewer with a privacy
 * overlay, built on react-zoom-pan-pinch for the gesture engine.
 *
 * Why this exists separately from BusinessVerificationModal: the modal
 * owns the chrome (header, badge, caption, trust list) while this
 * component owns the *interactive document surface*. Splitting them
 * keeps the modal a thin composer and lets the viewer be reused for
 * future verification docs (KYC, AOI, BIR registration, etc.).
 *
 * Gesture behaviour:
 *   • Pinch zoom (native via the lib's wheel/touch handlers)
 *   • Double-tap to step zoom (lib default, mode = "zoomIn")
 *   • +/- buttons step through STOPS = [0.5, 1, 1.5, 2, 3]
 *   • Pan with one finger when zoomed in
 *
 * Performance:
 *   • The image gets `will-change: transform` and `translateZ(0)` so the
 *     compositor promotes it to its own layer (no repaints during pan).
 *   • The outer overlay uses `overscroll-behavior: contain` and
 *     `touch-action: none` on the gesture surface so swipes never bleed
 *     into the modal's vertical scroll or the page underneath.
 *
 * Security overlay: when `useSecureView` flags a capture attempt, a
 * black panel fades in over the document with the "Protected" copy.
 * The watermark is always on at low opacity for psychological deterrent.
 */

import { useCallback, useRef, useState } from "react";
import {
  TransformWrapper,
  TransformComponent,
  type ReactZoomPanPinchRef,
} from "react-zoom-pan-pinch";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Minus, RotateCcw, ShieldAlert } from "lucide-react";
import { useSecureView } from "@/hooks/useSecureView";

/** Discrete zoom stops the +/- buttons cycle through. Pinch can land
 *  anywhere between minScale/maxScale, but the buttons keep things
 *  predictable for users who don't pinch. */
const STOPS = [0.5, 1, 1.5, 2, 3] as const;
const MIN_SCALE = STOPS[0];
const MAX_SCALE = STOPS[STOPS.length - 1];

interface Props {
  src: string;
  alt: string;
  /** Whether the host overlay is open. Drives FLAG_SECURE + deterrents. */
  active: boolean;
}

export function SecureDocumentViewer({ src, alt, active }: Props) {
  const { isProtected, clearProtection, documentGuardProps } = useSecureView(active);
  const apiRef = useRef<ReactZoomPanPinchRef | null>(null);
  const [scale, setScale] = useState(1);

  /** Step to the nearest STOP above/below the current scale. We pick by
   *  comparing against the current value rather than tracking an index
   *  so pinch-zoom and button-zoom stay coherent. */
  const stepZoom = useCallback((dir: 1 | -1) => {
    const api = apiRef.current;
    if (!api) return;
    const s = api.instance.state;
    const current = s.scale;
    let next: number;
    if (dir === 1) {
      next = STOPS.find(v => v > current + 0.01) ?? MAX_SCALE;
    } else {
      next = [...STOPS].reverse().find(v => v < current - 0.01) ?? MIN_SCALE;
    }
    // Centre-anchor the step zoom so the document doesn't jump off-screen.
    api.setTransform(s.positionX, s.positionY, next, 280, "easeOut");
  }, []);

  const resetView = useCallback(() => {
    apiRef.current?.resetTransform(280, "easeOut");
  }, []);

  return (
    <div
      style={{
        position: "relative",
        borderRadius: 22,
        padding: 1.5,
        background:
          "linear-gradient(135deg, rgba(59,130,246,0.55), rgba(139,92,246,0.55), rgba(236,72,153,0.35))",
        boxShadow:
          "0 24px 60px -10px rgba(99,102,241,0.35), 0 0 40px rgba(139,92,246,0.25)",
      }}
    >
      <div
        style={{
          position: "relative",
          borderRadius: 21,
          overflow: "hidden",
          background: "#0a0a14",
          border: "1px solid rgba(255,255,255,0.04)",
          /* Fixed-height stage gives the gesture engine a stable
             coordinate system, which matters for centred pinch. */
          height: "min(72dvh, 620px)",
        }}
      >
        <TransformWrapper
          ref={(r) => { apiRef.current = r; }}
          initialScale={1}
          minScale={MIN_SCALE}
          maxScale={MAX_SCALE}
          centerOnInit
          centerZoomedOut
          limitToBounds
          smooth
          doubleClick={{ mode: "zoomIn", step: 1, animationTime: 260 }}
          wheel={{ step: 0.15 }}
          pinch={{ step: 5 }}
          /* Disable single-finger pan while at base scale so a vertical
             swipe on the document falls through to the modal's pan-y
             scroller. Two-finger pinch is unaffected (handled by the
             lib's pinch handlers regardless of `panning.disabled`). */
          panning={{ velocityDisabled: false, disabled: scale <= 1.01 }}
          onTransform={(_ref: unknown, state: { scale: number }) => setScale(state.scale)}
        >
          <TransformComponent
            wrapperStyle={{
              width: "100%",
              height: "100%",
              background: "#0a0a14",
              /* Gesture/scroll arbitration: at base scale we want
                 vertical swipes to scroll the modal body, so allow
                 `pan-y` (browser keeps pinch via the lib's touch
                 handlers). Once zoomed in, we own all gestures and set
                 `none` so panning the document never tears the page. */
              touchAction: scale > 1.01 ? "none" : "pan-y",
              overscrollBehavior: "contain",
              cursor: scale > 1 ? "grab" : "zoom-in",
            }}
            contentStyle={{
              width: "100%",
              height: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <img
              src={src}
              alt={alt}
              draggable={false}
              {...documentGuardProps}
              style={{
                ...documentGuardProps.style,
                display: "block",
                maxWidth: "100%",
                maxHeight: "100%",
                width: "auto",
                height: "auto",
                /* GPU-promote so pan stays at 60fps on mid-range Android. */
                transform: "translateZ(0)",
                willChange: "transform",
                backfaceVisibility: "hidden",
                pointerEvents: "none", // gestures handled by wrapper
              }}
            />
          </TransformComponent>
        </TransformWrapper>

        {/* Diagonal confidential watermark — purely psychological deterrent,
            kept low opacity so it doesn't fight the document itself. */}
        <div
          aria-hidden
          style={{
            position: "absolute", inset: 0, pointerEvents: "none",
            display: "flex", alignItems: "center", justifyContent: "center",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              transform: "rotate(-28deg)",
              opacity: 0.09,
              color: "#1e1b4b",
              fontWeight: 900,
              fontSize: 22,
              letterSpacing: "0.32em",
              textTransform: "uppercase",
              whiteSpace: "nowrap",
              lineHeight: 2.4,
              textAlign: "center",
            }}
          >
            {Array.from({ length: 9 }).map((_, i) => (
              <div key={i}>Confidential Verification Copy</div>
            ))}
          </div>
        </div>

        {/* Privacy overlay — fades in on capture-like events. */}
        <AnimatePresence>
          {isProtected && (
            <motion.div
              key="privacy"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              onClick={clearProtection}
              style={{
                position: "absolute", inset: 0,
                background: "rgba(0,0,0,0.96)",
                backdropFilter: "blur(24px)",
                WebkitBackdropFilter: "blur(24px)",
                display: "flex", flexDirection: "column",
                alignItems: "center", justifyContent: "center",
                gap: 10, padding: 24, textAlign: "center",
                cursor: "pointer",
                zIndex: 5,
              }}
            >
              <div style={{
                width: 48, height: 48, borderRadius: 14,
                background: "linear-gradient(135deg, #ef4444, #f97316)",
                display: "flex", alignItems: "center", justifyContent: "center",
                boxShadow: "0 0 24px rgba(239,68,68,0.55)",
              }}>
                <ShieldAlert style={{ width: 22, height: 22, color: "white" }} />
              </div>
              <p style={{
                fontSize: 14, fontWeight: 800, letterSpacing: "0.04em",
                color: "white",
              }}>
                Protected Business Document
              </p>
              <p style={{ fontSize: 11, color: "rgba(255,255,255,0.55)" }}>
                Tap to dismiss
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Floating glassmorphism zoom controls. Stops short of the
            bottom edge so they sit cleanly on small viewports. */}
        <div
          style={{
            position: "absolute",
            right: 12, bottom: 12,
            display: "flex", alignItems: "center", gap: 6,
            padding: 5,
            borderRadius: 999,
            background: "rgba(10,10,20,0.72)",
            border: "1px solid rgba(255,255,255,0.08)",
            boxShadow: "0 8px 24px rgba(0,0,0,0.55)",
            backdropFilter: "blur(18px) saturate(140%)",
            WebkitBackdropFilter: "blur(18px) saturate(140%)",
            zIndex: 4,
          }}
        >
          <ZoomBtn
            onClick={() => stepZoom(-1)}
            disabled={scale <= MIN_SCALE + 0.01}
            aria-label="Zoom out"
          >
            <Minus style={{ width: 14, height: 14 }} />
          </ZoomBtn>
          <div style={{
            minWidth: 44, textAlign: "center",
            fontVariantNumeric: "tabular-nums",
            fontSize: 11, fontWeight: 700, color: "white",
            letterSpacing: "0.02em",
          }}>
            {Math.round(scale * 100)}%
          </div>
          <ZoomBtn
            onClick={() => stepZoom(1)}
            disabled={scale >= MAX_SCALE - 0.01}
            aria-label="Zoom in"
          >
            <Plus style={{ width: 14, height: 14 }} />
          </ZoomBtn>
          <div style={{ width: 1, height: 18, background: "rgba(255,255,255,0.1)", margin: "0 2px" }} />
          <ZoomBtn onClick={resetView} aria-label="Reset zoom">
            <RotateCcw style={{ width: 13, height: 13 }} />
          </ZoomBtn>
        </div>
      </div>
    </div>
  );
}

function ZoomBtn({
  children, onClick, disabled, ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      {...rest}
      style={{
        width: 30, height: 30, borderRadius: 999,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: disabled ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.08)",
        color: disabled ? "rgba(255,255,255,0.3)" : "white",
        border: "1px solid rgba(255,255,255,0.06)",
        cursor: disabled ? "default" : "pointer",
        touchAction: "manipulation",
        transition: "background 0.15s ease, transform 0.1s ease",
      }}
    >
      {children}
    </button>
  );
}
