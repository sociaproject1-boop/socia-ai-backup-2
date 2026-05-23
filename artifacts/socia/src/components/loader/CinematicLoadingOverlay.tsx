/**
 * CinematicLoadingOverlay — the ONE cinematic loader for the entire app.
 *
 * Visual contract (matches the Socia design reference):
 *   ┌────────────────────────────┐
 *   │        ●  ← glowing logo   │
 *   │     Creating image…        │
 *   │   Usually 15–30 seconds    │
 *   │        • • •  ← dots       │
 *   └────────────────────────────┘
 *
 * Rendered through a React Portal directly into <body> at z-index 9999 so it
 * always sits above modals, drawers, and the AppShell. The backdrop blurs +
 * dims the page and absorbs all pointer events to disable interactions
 * underneath while a generation/render is in flight.
 *
 * Animations:
 *   • Logo: gentle breathing scale + glow pulse (GPU transform/opacity only).
 *   • Dots: staggered fade/scale, infinite.
 *   • Backdrop: 220 ms blur-in / blur-out.
 *
 * Driven exclusively by `GlobalLoaderProvider` — do not instantiate directly;
 * call `useGlobalLoader().showLoader(...)` from anywhere in the tree.
 */

import { memo } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles } from "lucide-react";

const PUR = "#B026FF";
const PINK = "#ec4899";

export interface CinematicLoadingOverlayProps {
  open: boolean;
  /** Primary line — e.g. "Creating image…" / "Rendering cinematic video…". */
  message?: string;
  /** Secondary line — e.g. "Usually 15–30 seconds". */
  subtitle?: string;
}

/* GPU-only style token so the overlay never causes layout thrash. */
const GPU: React.CSSProperties = {
  willChange: "transform, opacity",
  transform: "translateZ(0)",
  backfaceVisibility: "hidden",
};

export const CinematicLoadingOverlay = memo(function CinematicLoadingOverlay({
  open,
  message = "Working…",
  subtitle,
}: CinematicLoadingOverlayProps) {
  /* SSR / pre-mount safety — render nothing until <body> exists. */
  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          key="cinematic-loader"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          aria-live="polite"
          aria-busy="true"
          role="status"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(4,1,12,0.72)",
            backdropFilter: "blur(22px) saturate(140%)",
            WebkitBackdropFilter: "blur(22px) saturate(140%)",
            /* Absorbs ALL pointer events so the page underneath is frozen. */
            pointerEvents: "auto",
            ...GPU,
          }}
        >
          {/* Ambient glow halo — cinematic depth behind the logo. */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
            style={{
              position: "absolute",
              width: 280, height: 280,
              borderRadius: "50%",
              background: `radial-gradient(circle, ${PUR}33 0%, ${PINK}1f 38%, transparent 70%)`,
              filter: "blur(38px)",
              pointerEvents: "none",
            }}
          />

          <div
            style={{
              position: "relative",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 18,
              padding: "0 24px",
              textAlign: "center",
              maxWidth: 320,
            }}
          >
            {/* ── Glowing animated Socia logo ─────────────────────────
                The pulse is driven by transform+opacity ONLY (GPU compositor
                path). A sibling absolutely-positioned blurred radial gradient
                acts as the breathing "glow", instead of an animated boxShadow
                which would force paint on every frame. */}
            <motion.div
              initial={{ scale: 0.85, opacity: 0 }}
              animate={{ scale: [1, 1.06, 1], opacity: 1 }}
              exit={{ scale: 0.92, opacity: 0 }}
              transition={{
                scale:   { duration: 2.4, repeat: Infinity, ease: "easeInOut" },
                opacity: { duration: 0.3 },
              }}
              style={{
                position: "relative",
                width: 76,
                height: 76,
                borderRadius: "50%",
                background: `linear-gradient(135deg, ${PUR} 0%, ${PINK} 100%)`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: `0 0 30px ${PUR}aa, 0 0 70px ${PINK}66, inset 0 1px 0 rgba(255,255,255,0.28)`,
                ...GPU,
              }}
            >
              {/* GPU-cheap glow pulse — only opacity + scale animate. */}
              <motion.span
                aria-hidden="true"
                animate={{ opacity: [0.55, 1, 0.55], scale: [1, 1.18, 1] }}
                transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
                style={{
                  position: "absolute",
                  inset: -28,
                  borderRadius: "50%",
                  background: `radial-gradient(circle, ${PUR}55 0%, ${PINK}33 35%, transparent 70%)`,
                  filter: "blur(18px)",
                  pointerEvents: "none",
                  zIndex: -1,
                  ...GPU,
                }}
              />
              <Sparkles
                style={{ width: 32, height: 32, color: "white", position: "relative", zIndex: 1 }}
                strokeWidth={2.2}
                aria-hidden="true"
              />
            </motion.div>

            {/* ── Primary message ──────────────────────────────────── */}
            <motion.h2
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ delay: 0.08, duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
              style={{
                margin: 0,
                fontSize: 20,
                fontWeight: 800,
                letterSpacing: "-0.015em",
                lineHeight: 1.2,
                color: "white",
                textShadow: "0 2px 14px rgba(0,0,0,0.55)",
              }}
            >
              {message}
            </motion.h2>

            {/* ── Optional subtitle ────────────────────────────────── */}
            {subtitle && (
              <motion.p
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ delay: 0.14, duration: 0.32 }}
                style={{
                  margin: 0,
                  marginTop: -8,
                  fontSize: 13,
                  fontWeight: 500,
                  color: "rgba(255,255,255,0.62)",
                  lineHeight: 1.45,
                }}
              >
                {subtitle}
              </motion.p>
            )}

            {/* ── Animated cinematic dots (3 dots, staggered pulse) ── */}
            <Dots />
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
});

/* Three softly-pulsing dots — the centre one is the brand purple, sides are
   muted white for the same calm cadence as the reference. */
const DOT_COLORS = ["rgba(255,255,255,0.45)", PUR, "rgba(255,255,255,0.45)"];

const Dots = memo(function Dots() {
  return (
    <div
      aria-hidden="true"
      style={{
        marginTop: 4,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
      }}
    >
      {DOT_COLORS.map((c, i) => (
        <motion.span
          key={i}
          animate={{
            opacity: [0.25, 1, 0.25],
            scale:   [0.85, 1.15, 0.85],
          }}
          transition={{
            duration: 1.1,
            repeat: Infinity,
            ease: "easeInOut",
            delay: i * 0.18,
          }}
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: c,
            boxShadow: i === 1 ? `0 0 10px ${PUR}aa` : "none",
            display: "inline-block",
            ...GPU,
          }}
        />
      ))}
    </div>
  );
});
