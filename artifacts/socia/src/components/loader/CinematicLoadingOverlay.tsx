/**
 * CinematicLoadingOverlay — premium cinematic AI generation loader.
 *
 * Visual contract:
 *   • Galaxy nebula backdrop (drifting radial gradients)
 *   • Outer orbital ring (slow CW) + inner orbital ring (faster CCW)
 *   • Centre: breathing glowing Socia logo
 *   • Vertical scanning line sweeping through the backdrop
 *   • Primary label with animated stage transitions
 *   • Staggered tri-dot pulse
 *   • Thin neon progress bar at the bottom edge
 *
 * All animations: transform + opacity only → GPU compositor path.
 * Rendered via React portal into <body> at z-index 9999.
 */

import { memo } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles } from "lucide-react";

const PUR  = "#a855f7";
const PINK = "#ec4899";
const BLUE = "#60a5fa";

const GPU: React.CSSProperties = {
  willChange: "transform, opacity",
  transform: "translateZ(0)",
  backfaceVisibility: "hidden",
};

export interface CinematicLoadingOverlayProps {
  open: boolean;
  message?: string;
  subtitle?: string;
}

/* ─── Orbital rings ────────────────────────────────────────────────────── */
function OrbitalRings() {
  return (
    <div
      aria-hidden="true"
      style={{
        position: "absolute",
        width: 220,
        height: 220,
        pointerEvents: "none",
        ...GPU,
      }}
    >
      {/* Outer ring — slow clockwise */}
      <svg
        width={220}
        height={220}
        viewBox="0 0 220 220"
        style={{
          position: "absolute",
          inset: 0,
          animation: "orbit-cw 14s linear infinite",
          ...GPU,
        }}
      >
        <defs>
          <linearGradient id="outerRingGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%"   stopColor={PUR}  stopOpacity={0.0} />
            <stop offset="40%"  stopColor={PUR}  stopOpacity={0.7} />
            <stop offset="60%"  stopColor={PINK} stopOpacity={0.9} />
            <stop offset="100%" stopColor={BLUE} stopOpacity={0.0} />
          </linearGradient>
        </defs>
        <circle
          cx={110} cy={110} r={100}
          fill="none"
          stroke="url(#outerRingGrad)"
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeDasharray="200 430"
        />
        {/* Bright leading dot */}
        <circle cx={110} cy={10} r={2.5} fill={PUR} opacity={0.9}
          style={{ filter: `drop-shadow(0 0 6px ${PUR})` }} />
      </svg>

      {/* Inner ring — faster counter-clockwise */}
      <svg
        width={170}
        height={170}
        viewBox="0 0 170 170"
        style={{
          position: "absolute",
          top: 25,
          left: 25,
          animation: "orbit-ccw 9s linear infinite",
          ...GPU,
        }}
      >
        <defs>
          <linearGradient id="innerRingGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%"   stopColor={PINK} stopOpacity={0.0} />
            <stop offset="50%"  stopColor={PINK} stopOpacity={0.65} />
            <stop offset="100%" stopColor={PUR}  stopOpacity={0.0} />
          </linearGradient>
        </defs>
        <circle
          cx={85} cy={85} r={75}
          fill="none"
          stroke="url(#innerRingGrad)"
          strokeWidth={1}
          strokeLinecap="round"
          strokeDasharray="120 350"
        />
        <circle cx={85} cy={10} r={2} fill={PINK} opacity={0.85}
          style={{ filter: `drop-shadow(0 0 5px ${PINK})` }} />
      </svg>

      {/* Innermost accent ring */}
      <svg
        width={130}
        height={130}
        viewBox="0 0 130 130"
        style={{
          position: "absolute",
          top: 45,
          left: 45,
          animation: "orbit-cw 6s linear infinite",
          ...GPU,
        }}
      >
        <circle
          cx={65} cy={65} r={57}
          fill="none"
          stroke={BLUE}
          strokeWidth={0.75}
          strokeOpacity={0.35}
          strokeLinecap="round"
          strokeDasharray="60 300"
        />
      </svg>
    </div>
  );
}

/* ─── Cinematic backdrop layers ────────────────────────────────────────── */
function CinematicBackdrop() {
  return (
    <>
      {/* Nebula — drifting radial gradients */}
      <motion.div
        aria-hidden="true"
        animate={{
          x: ["-2%", "3%", "-1%", "-2%"],
          y: ["-1%", "2%", "4%", "-1%"],
          scale: [1, 1.06, 1.03, 1],
        }}
        transition={{ duration: 22, repeat: Infinity, ease: "easeInOut" }}
        style={{
          position: "absolute",
          inset: 0,
          background: `
            radial-gradient(55% 45% at 20% 25%, rgba(168,85,247,0.55) 0%, transparent 60%),
            radial-gradient(50% 40% at 80% 30%, rgba(96,165,250,0.38) 0%, transparent 60%),
            radial-gradient(65% 50% at 35% 80%, rgba(217,70,239,0.38) 0%, transparent 60%),
            radial-gradient(45% 35% at 75% 85%, rgba(56,189,248,0.22) 0%, transparent 60%)
          `,
          mixBlendMode: "screen",
          pointerEvents: "none",
          ...GPU,
        }}
      />

      {/* Energy layer */}
      <motion.div
        aria-hidden="true"
        animate={{
          x: ["3%", "-3%", "2%", "3%"],
          y: ["4%", "-2%", "-4%", "4%"],
          opacity: [0.55, 0.85, 0.65, 0.55],
        }}
        transition={{ duration: 16, repeat: Infinity, ease: "easeInOut" }}
        style={{
          position: "absolute",
          inset: 0,
          background: `
            radial-gradient(40% 32% at 60% 52%, rgba(139,92,246,0.42) 0%, transparent 70%),
            radial-gradient(38% 28% at 28% 58%, rgba(244,114,182,0.28) 0%, transparent 70%)
          `,
          mixBlendMode: "screen",
          pointerEvents: "none",
          ...GPU,
        }}
      />

      {/* Scan line sweeping down */}
      <span
        aria-hidden="true"
        className="scan-line"
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 0,
          height: "2px",
          background: `linear-gradient(90deg, transparent 0%, rgba(167,139,250,0.45) 20%, rgba(217,70,239,0.65) 50%, rgba(167,139,250,0.45) 80%, transparent 100%)`,
          pointerEvents: "none",
          boxShadow: `0 0 12px 2px rgba(167,139,250,0.25)`,
          ...GPU,
        }}
      />
    </>
  );
}

/* ─── Breathing logo ────────────────────────────────────────────────────── */
function GlowLogo() {
  return (
    <motion.div
      initial={{ scale: 0.82, opacity: 0 }}
      animate={{ scale: [1, 1.07, 1], opacity: 1 }}
      exit={{ scale: 0.9, opacity: 0 }}
      transition={{
        scale:   { duration: 2.6, repeat: Infinity, ease: "easeInOut" },
        opacity: { duration: 0.35 },
      }}
      style={{
        position: "relative",
        width: 80,
        height: 80,
        borderRadius: "50%",
        background: `linear-gradient(135deg, ${PUR} 0%, ${PINK} 50%, ${BLUE} 100%)`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        boxShadow: `0 0 36px ${PUR}bb, 0 0 80px ${PINK}66, 0 0 120px ${PUR}33, inset 0 1px 0 rgba(255,255,255,0.30)`,
        ...GPU,
      }}
    >
      {/* Inner breathing glow — opacity + scale only */}
      <motion.span
        aria-hidden="true"
        animate={{ opacity: [0.5, 1, 0.5], scale: [1, 1.22, 1] }}
        transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut" }}
        style={{
          position: "absolute",
          inset: -32,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${PUR}66 0%, ${PINK}44 30%, transparent 70%)`,
          filter: "blur(20px)",
          pointerEvents: "none",
          zIndex: -1,
          ...GPU,
        }}
      />
      {/* Outer far glow */}
      <motion.span
        aria-hidden="true"
        animate={{ opacity: [0.2, 0.6, 0.2], scale: [1, 1.35, 1] }}
        transition={{ duration: 3.4, repeat: Infinity, ease: "easeInOut", delay: 0.3 }}
        style={{
          position: "absolute",
          inset: -52,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${PUR}33 0%, transparent 70%)`,
          filter: "blur(28px)",
          pointerEvents: "none",
          zIndex: -2,
          ...GPU,
        }}
      />
      <Sparkles
        style={{ width: 34, height: 34, color: "white", position: "relative", zIndex: 1,
          filter: "drop-shadow(0 0 10px rgba(255,255,255,0.6))" }}
        strokeWidth={2.1}
        aria-hidden="true"
      />
    </motion.div>
  );
}

/* ─── Staggered dots ────────────────────────────────────────────────────── */
const DOT_CONFIGS = [
  { color: "rgba(255,255,255,0.4)", glow: false },
  { color: PUR,                    glow: true   },
  { color: PINK,                   glow: true   },
  { color: "rgba(255,255,255,0.4)", glow: false },
];

const Dots = memo(function Dots() {
  return (
    <div
      aria-hidden="true"
      style={{ display: "flex", alignItems: "center", gap: 9, marginTop: 6 }}
    >
      {DOT_CONFIGS.map((d, i) => (
        <motion.span
          key={i}
          animate={{ opacity: [0.2, 1, 0.2], scale: [0.7, 1.2, 0.7], y: [0, -3, 0] }}
          transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut", delay: i * 0.16 }}
          style={{
            width: 7,
            height: 7,
            borderRadius: "50%",
            background: d.color,
            boxShadow: d.glow ? `0 0 10px ${d.color}cc, 0 0 20px ${d.color}66` : "none",
            display: "inline-block",
            ...GPU,
          }}
        />
      ))}
    </div>
  );
});

/* ─── Main overlay ──────────────────────────────────────────────────────── */
export const CinematicLoadingOverlay = memo(function CinematicLoadingOverlay({
  open,
  message = "Working…",
  subtitle,
}: CinematicLoadingOverlayProps) {
  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          key="cinematic-loader"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
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
            background: "radial-gradient(120% 90% at 50% 45%, rgba(14,5,28,0.97) 0%, rgba(3,2,10,0.99) 70%)",
            backdropFilter: "blur(26px) saturate(150%)",
            WebkitBackdropFilter: "blur(26px) saturate(150%)",
            pointerEvents: "auto",
            overflow: "hidden",
            ...GPU,
          }}
        >
          {/* Cinematic backdrop */}
          <CinematicBackdrop />

          {/* Content stack */}
          <div
            style={{
              position: "relative",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 22,
              padding: "0 28px",
              textAlign: "center",
              maxWidth: 340,
              zIndex: 2,
            }}
          >
            {/* Orbital rings + logo */}
            <div
              style={{
                position: "relative",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 220,
                height: 220,
              }}
            >
              <OrbitalRings />
              <div style={{ position: "absolute" }}>
                <GlowLogo />
              </div>
            </div>

            {/* Primary message */}
            <motion.h2
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ delay: 0.1, duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
              style={{
                margin: 0,
                marginTop: -12,
                fontSize: 22,
                fontWeight: 800,
                letterSpacing: "-0.018em",
                lineHeight: 1.18,
                color: "white",
                textShadow: `0 0 30px ${PUR}88, 0 2px 16px rgba(0,0,0,0.6)`,
              }}
            >
              {message}
            </motion.h2>

            {subtitle && (
              <motion.p
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ delay: 0.18, duration: 0.32 }}
                style={{
                  margin: 0,
                  marginTop: -10,
                  fontSize: 13,
                  fontWeight: 500,
                  color: "rgba(255,255,255,0.55)",
                  lineHeight: 1.5,
                }}
              >
                {subtitle}
              </motion.p>
            )}

            <Dots />
          </div>

          {/* Bottom neon progress bar */}
          <motion.div
            initial={{ scaleX: 0, opacity: 0 }}
            animate={{ scaleX: 1, opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ delay: 0.2, duration: 0.5 }}
            style={{
              position: "absolute",
              bottom: 0,
              left: 0,
              right: 0,
              height: 2,
              overflow: "hidden",
              transformOrigin: "left center",
              zIndex: 3,
            }}
          >
            <span
              className="progress-shimmer"
              style={{
                display: "block",
                width: "100%",
                height: "100%",
              }}
            />
          </motion.div>

          {/* Corner accent lines — cinematic letterbox feel */}
          {(["top-0 left-0", "top-0 right-0", "bottom-0 left-0", "bottom-0 right-0"] as const).map((pos, i) => {
            const isRight  = pos.includes("right");
            const isBottom = pos.includes("bottom");
            return (
              <motion.div
                key={i}
                aria-hidden="true"
                initial={{ opacity: 0, scale: 0.7 }}
                animate={{ opacity: 0.6, scale: 1 }}
                exit={{ opacity: 0 }}
                transition={{ delay: 0.15 + i * 0.05, duration: 0.4 }}
                style={{
                  position: "absolute",
                  [isBottom ? "bottom" : "top"]: 16,
                  [isRight  ? "right"  : "left"]: 16,
                  width: 20,
                  height: 20,
                  borderTop:    !isBottom ? `1px solid rgba(167,139,250,0.45)` : "none",
                  borderBottom: isBottom  ? `1px solid rgba(167,139,250,0.45)` : "none",
                  borderLeft:   !isRight  ? `1px solid rgba(167,139,250,0.45)` : "none",
                  borderRight:  isRight   ? `1px solid rgba(167,139,250,0.45)` : "none",
                  pointerEvents: "none",
                }}
              />
            );
          })}
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
});
