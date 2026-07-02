import React from "react";

export function PresetIcon({
  src,
  alt,
  size = 72,
  className = "",
}: { src: string; alt: string; size?: number; className?: string }) {
  const radius = 24;
  return (
    <div
      className={`preset-icon-root ${className}`}
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        display: "grid",
        placeItems: "center",
        background: "linear-gradient(180deg, rgba(255,255,255,0.03), rgba(255,255,255,0.01))",
        border: "1px solid rgba(255,255,255,0.06)",
        boxShadow: "0 6px 20px rgba(10,10,15,0.6), 0 0 28px rgba(168,85,247,0.06), 0 0 18px rgba(96,165,250,0.04)",
        transform: "perspective(800px) rotateX(6deg) rotateY(-6deg)",
        overflow: "hidden",
        position: "relative",
        backdropFilter: "blur(6px)",
      }}
    >
      <img
        src={src}
        alt={alt}
        style={{
          width: "84%",
          height: "84%",
          objectFit: "contain",
          display: "block",
          filter: "drop-shadow(0 10px 20px rgba(0,0,0,0.6))",
        }}
        loading="lazy"
        decoding="async"
        draggable={false}
      />

      {/* subtle glossy reflection */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: "35%",
          background: "linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0))",
          pointerEvents: "none",
          mixBlendMode: "overlay",
        }}
      />

      {/* neon rim */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          boxShadow: "inset 0 0 30px rgba(168,85,247,0.06), inset 0 0 14px rgba(96,165,250,0.03)",
          pointerEvents: "none",
        }}
      />
    </div>
  );
}
