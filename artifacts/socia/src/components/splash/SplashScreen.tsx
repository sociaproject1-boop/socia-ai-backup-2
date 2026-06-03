import { useEffect, useMemo, useState } from "react";
import markUrl from "@assets/splash2/mark.png";
import wordmarkUrl from "@assets/splash2/wordmark.png";

/**
 * SplashScreen — premium animated launch screen for SOCIA.
 *
 * Fully additive & isolated: mounts once at the app root, plays a short
 * choreographed intro, then fades out to reveal whatever the router already
 * shows underneath (the login screen for unauthenticated users). It never
 * touches routing, auth, or business logic — it is purely a visual layer.
 *
 * The artwork is rendered from genuinely transparent assets cut from the clean
 * SOCIA lockup: `mark.png` (the glowing "S" + the two stars) and
 * `wordmark.png` (the SOCIA letters). Neither asset contains any baked-in
 * background, so there is no tile, square, or panel behind the logo — it
 * floats directly on pure black. The neon glow is produced by `drop-shadow`
 * filters applied to the logo's own alpha shape (not a container), and the
 * underline is a thin CSS gradient bar.
 *
 * All motion uses compositor-friendly properties (transform / opacity /
 * clip-path / filter) for a smooth result on mobile / low-end Android.
 */

const PARTICLE_COLORS = ["#ec4899", "#d946ef", "#a855f7", "#60a5fa", "#3b82f6"];

// Animation schedule (ms).
const WORDMARK_DELAY = 1100;
const WORDMARK_DUR = 700;
const UNDERLINE_DELAY = WORDMARK_DELAY + WORDMARK_DUR + 150; // ~1950
const EXIT_AT = 3300;
const UNMOUNT_AT = 3850;

type Particle = {
  left: number;
  top: number;
  size: number;
  color: string;
  dx: number;
  dy: number;
  dur: number;
  delay: number;
  op: number;
};

function buildParticles(): Particle[] {
  const rnd = (min: number, max: number) => min + Math.random() * (max - min);
  return Array.from({ length: 16 }, () => {
    // Cluster softly around the vertical centre where the logo sits.
    const angle = rnd(0, Math.PI * 2);
    const radius = rnd(12, 42); // % from centre
    return {
      left: 50 + Math.cos(angle) * radius,
      top: 46 + Math.sin(angle) * radius * 0.9,
      size: rnd(2, 5),
      color: PARTICLE_COLORS[Math.floor(rnd(0, PARTICLE_COLORS.length))],
      dx: rnd(-10, 10),
      dy: rnd(-14, -4),
      dur: rnd(4.5, 7.5),
      delay: rnd(0, 1.2),
      op: rnd(0.45, 0.85),
    };
  });
}

export function SplashScreen() {
  const [exiting, setExiting] = useState(false);
  const [done, setDone] = useState(false);
  const particles = useMemo(buildParticles, []);

  useEffect(() => {
    const t1 = window.setTimeout(() => setExiting(true), EXIT_AT);
    const t2 = window.setTimeout(() => setDone(true), UNMOUNT_AT);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, []);

  if (done) return null;

  const markWidth = "min(58vw, 240px)";

  return (
    <div
      aria-hidden
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100000,
        background: "#000000",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        opacity: exiting ? 0 : 1,
        transition: "opacity 550ms ease",
        pointerEvents: exiting ? "none" : "auto",
        overflow: "hidden",
      }}
    >
      {/* Floating neon particles */}
      {particles.map((p, idx) => {
        const wrapStyle: React.CSSProperties = {
          position: "absolute",
          left: `${p.left}%`,
          top: `${p.top}%`,
          opacity: 0,
          animation: `splashParticleIn 900ms ease-out ${400 + p.delay * 1000}ms forwards`,
        };
        (wrapStyle as Record<string, string | number>)["--op"] = p.op;

        const dotStyle: React.CSSProperties = {
          display: "block",
          width: p.size,
          height: p.size,
          borderRadius: "50%",
          background: p.color,
          boxShadow: `0 0 ${p.size * 3}px ${p.size}px ${p.color}`,
          animation: `splashParticleDrift ${p.dur}s ease-in-out ${p.delay}s infinite`,
        };
        (dotStyle as Record<string, string | number>)["--dx"] = `${p.dx}px`;
        (dotStyle as Record<string, string | number>)["--dy"] = `${p.dy}px`;

        return (
          <span key={idx} style={wrapStyle}>
            <span style={dotStyle} />
          </span>
        );
      })}

      {/* Glowing "S" mark — transparent asset, glow from its own shape */}
      <img
        src={markUrl}
        alt="SOCIA"
        draggable={false}
        style={{
          width: markWidth,
          height: "auto",
          filter:
            "drop-shadow(0 0 14px rgba(168,85,247,0.5)) drop-shadow(0 0 32px rgba(59,130,246,0.28))",
          animation:
            "splashLogoIn 1s cubic-bezier(0.16,1,0.3,1) both, splashMarkGlow 2.6s ease-in-out 1200ms infinite",
          willChange: "transform, opacity, filter",
        }}
      />

      {/* SOCIA wordmark — transparent asset, revealed left to right */}
      <img
        src={wordmarkUrl}
        alt=""
        draggable={false}
        style={{
          width: markWidth,
          height: "auto",
          marginTop: "min(3.5vw, 16px)",
          filter: "drop-shadow(0 0 10px rgba(168,85,247,0.35))",
          clipPath: "inset(0 100% 0 0)",
          animation: `splashWordmarkWipe ${WORDMARK_DUR}ms ease-out ${WORDMARK_DELAY}ms both`,
          willChange: "clip-path",
        }}
      />

      {/* Neon underline — pink→blue wipe, left to right */}
      <div
        style={{
          width: `calc(${markWidth} * 0.55)`,
          height: 2.5,
          marginTop: "min(2.5vw, 12px)",
          borderRadius: 999,
          background: "linear-gradient(90deg, #ec4899 0%, #a855f7 50%, #3b82f6 100%)",
          boxShadow: "0 0 10px rgba(168,85,247,0.7)",
          transformOrigin: "left center",
          transform: "scaleX(0)",
          animation: `splashUnderlineGrow 550ms cubic-bezier(0.16,1,0.3,1) ${UNDERLINE_DELAY}ms forwards`,
          willChange: "transform",
        }}
      />
    </div>
  );
}

export default SplashScreen;
