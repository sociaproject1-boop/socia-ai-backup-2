/**
 * GalaxyBackground — pure CSS + Framer Motion animated deep-space nebula layer.
 *
 * Zero canvas, zero heavy libs. Every animation runs on the GPU compositor
 * path (transform + opacity only). Designed for AMOLED black backgrounds.
 *
 * Usage: place as the FIRST child of a `relative overflow-hidden` container.
 * The component is absolutely positioned and pointer-events:none — it never
 * intercepts touches.
 */
import { memo, useMemo } from "react";
import { motion } from "framer-motion";

const GPU: React.CSSProperties = {
  willChange: "transform, opacity",
  transform: "translateZ(0)",
  backfaceVisibility: "hidden",
};

/* Individual nebula orb — uses CSS class animations from index.css */
function NebulaOrb({
  style,
  animClass,
}: {
  style: React.CSSProperties;
  animClass: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={animClass}
      style={{
        position: "absolute",
        borderRadius: "50%",
        pointerEvents: "none",
        ...GPU,
        ...style,
      }}
    />
  );
}

/* Star field — each star twinkles with a unique framer-motion animation */
function Stars({ count = 55, seed = 42 }: { count?: number; seed?: number }) {
  /* Deterministic pseudo-random so SSR/hydration match client */
  const stars = useMemo(() => {
    let s = seed;
    const rand = () => { s = (s * 1664525 + 1013904223) & 0xffffffff; return (s >>> 0) / 0xffffffff; };
    return Array.from({ length: count }, (_, i) => ({
      id: i,
      x: rand() * 100,
      y: rand() * 100,
      size: rand() * 1.8 + 0.4,
      opacity: rand() * 0.55 + 0.15,
      minOpacity: rand() * 0.06 + 0.03,
      delay: rand() * 5,
      duration: rand() * 3 + 2.2,
      color: ["white", "white", "white", "#c4b5fd", "#93c5fd", "#f9a8d4"][Math.floor(rand() * 6)],
    }));
  }, [count, seed]);

  return (
    <>
      {stars.map((s) => (
        <motion.span
          key={s.id}
          aria-hidden="true"
          animate={{
            opacity: [s.opacity, s.minOpacity, s.opacity],
            scale:   [1, 0.55, 1],
          }}
          transition={{
            duration: s.duration,
            repeat: Infinity,
            ease: "easeInOut",
            delay: s.delay,
          }}
          style={{
            position: "absolute",
            left: `${s.x}%`,
            top:  `${s.y}%`,
            width:  s.size,
            height: s.size,
            borderRadius: "50%",
            background: s.color,
            pointerEvents: "none",
            ...GPU,
          }}
        />
      ))}
    </>
  );
}

export const GalaxyBackground = memo(function GalaxyBackground({
  intensity = "medium",
}: {
  intensity?: "low" | "medium" | "high";
}) {
  const alpha = intensity === "low" ? 0.5 : intensity === "high" ? 1 : 0.78;
  const starCount = intensity === "low" ? 35 : intensity === "high" ? 65 : 50;

  return (
    <div
      aria-hidden="true"
      style={{
        position: "absolute",
        inset: 0,
        overflow: "hidden",
        pointerEvents: "none",
        zIndex: 0,
        ...GPU,
      }}
    >
      {/* Deep space base — AMOLED pure black */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "linear-gradient(180deg, #05020f 0%, #090118 50%, #040012 100%)",
        }}
      />

      {/* Nebula orb 1 — large purple, top-left drift */}
      <NebulaOrb
        animClass="galaxy-orb-1"
        style={{
          width: 440,
          height: 440,
          top: "-18%",
          left: "-22%",
          background: `radial-gradient(circle, rgba(120,40,220,${alpha * 0.40}) 0%, rgba(90,20,180,${alpha * 0.24}) 38%, transparent 70%)`,
          filter: "blur(50px)",
        }}
      />

      {/* Nebula orb 2 — pink/rose, bottom-right drift */}
      <NebulaOrb
        animClass="galaxy-orb-2"
        style={{
          width: 400,
          height: 400,
          bottom: "4%",
          right: "-20%",
          background: `radial-gradient(circle, rgba(220,50,150,${alpha * 0.34}) 0%, rgba(180,30,100,${alpha * 0.20}) 40%, transparent 70%)`,
          filter: "blur(54px)",
        }}
      />

      {/* Nebula orb 3 — cyan/blue, mid-right drift */}
      <NebulaOrb
        animClass="galaxy-orb-3"
        style={{
          width: 300,
          height: 300,
          top: "32%",
          right: "-10%",
          background: `radial-gradient(circle, rgba(40,120,255,${alpha * 0.26}) 0%, rgba(20,80,200,${alpha * 0.16}) 44%, transparent 70%)`,
          filter: "blur(42px)",
        }}
      />

      {/* Nebula orb 4 — hot-pink, bottom-left accent */}
      <NebulaOrb
        animClass="galaxy-orb-4"
        style={{
          width: 220,
          height: 220,
          bottom: "20%",
          left: "-5%",
          background: `radial-gradient(circle, rgba(255,60,180,${alpha * 0.22}) 0%, transparent 70%)`,
          filter: "blur(34px)",
        }}
      />

      {/* Nebula orb 5 — indigo spine center */}
      <NebulaOrb
        animClass="galaxy-orb-5"
        style={{
          width: 350,
          height: 180,
          top: "48%",
          left: "15%",
          background: `radial-gradient(ellipse, rgba(100,30,255,${alpha * 0.18}) 0%, transparent 70%)`,
          filter: "blur(38px)",
        }}
      />

      {/* Star field */}
      <Stars count={starCount} />
    </div>
  );
});
