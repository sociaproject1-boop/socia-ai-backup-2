import { useEffect, useMemo, useState } from "react";
import logoUrl from "@assets/splash/logo.png";
import sUrl from "@assets/splash/letter_s.png";
import oUrl from "@assets/splash/letter_o.png";
import cUrl from "@assets/splash/letter_c.png";
import iUrl from "@assets/splash/letter_i.png";
import aUrl from "@assets/splash/letter_a.png";

/**
 * SplashScreen — premium animated launch screen for SOCIA.
 *
 * Fully additive & isolated: mounts once at the app root, plays a ~3.6s
 * choreographed intro, then fades out to reveal whatever the router already
 * shows underneath (the login screen for unauthenticated users). It never
 * touches routing, auth, or business logic — it is purely a visual layer.
 *
 * The artwork is the uploaded SOCIA image, sliced (on its pure-black
 * background, so seams are invisible) into the glowing "S" mark and the five
 * SOCIA letters. The letters are placed at their exact original widths so the
 * wordmark reconstructs the original artwork precisely while still allowing
 * each letter to animate in one by one.
 *
 * All motion uses only CSS transforms + opacity (compositor-only) for a
 * smooth 60fps result on mobile / low-end Android.
 */

// Letter slices in original order with their source pixel widths (uniform
// height) so the row reconstructs the wordmark exactly.
const LETTERS = [
  { url: sUrl, w: 112 },
  { url: oUrl, w: 119 },
  { url: cUrl, w: 114 },
  { url: iUrl, w: 68 },
  { url: aUrl, w: 119 },
];
const WORDMARK_W = LETTERS.reduce((sum, l) => sum + l.w, 0); // 532

const PARTICLE_COLORS = ["#ec4899", "#d946ef", "#a855f7", "#60a5fa", "#3b82f6"];

// Animation schedule (ms).
const LETTER_START = 1000;
const LETTER_STAGGER = 150;
const UNDERLINE_DELAY = LETTER_START + LETTERS.length * LETTER_STAGGER + 200; // ~1950
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

      {/* Glowing "S" mark + soft neon halo */}
      <div style={{ position: "relative", display: "grid", placeItems: "center" }}>
        <div
          style={{
            position: "absolute",
            width: "min(72vw, 320px)",
            height: "min(72vw, 320px)",
            borderRadius: "50%",
            background:
              "radial-gradient(circle, rgba(168,85,247,0.38) 0%, rgba(59,130,246,0.18) 42%, rgba(0,0,0,0) 70%)",
            filter: "blur(6px)",
            opacity: 0,
            animation:
              "splashGlowIn 1s ease-out 200ms forwards, splashGlowPulse 2.6s ease-in-out 1200ms infinite",
            willChange: "transform, opacity",
          }}
        />
        <img
          src={logoUrl}
          alt="SOCIA"
          draggable={false}
          style={{
            position: "relative",
            width: markWidth,
            height: "auto",
            mixBlendMode: "screen",
            animation: "splashLogoIn 1s cubic-bezier(0.16,1,0.3,1) both",
            willChange: "transform, opacity",
          }}
        />
      </div>

      {/* SOCIA wordmark — letters appear one by one */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "center",
          width: markWidth,
          marginTop: "min(3.5vw, 16px)",
        }}
      >
        {LETTERS.map((l, idx) => (
          <img
            key={idx}
            src={l.url}
            alt=""
            draggable={false}
            style={{
              width: `${(l.w / WORDMARK_W) * 100}%`,
              height: "auto",
              mixBlendMode: "screen",
              opacity: 0,
              animation: `splashLetterIn 450ms ease-out ${LETTER_START + idx * LETTER_STAGGER}ms forwards`,
              willChange: "transform, opacity",
            }}
          />
        ))}
      </div>

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
