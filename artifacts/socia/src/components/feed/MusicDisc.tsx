/**
 * MusicDisc.tsx — TikTok-style rotating sound disc overlay.
 *
 * - Shows sound cover art (or gradient placeholder) in a spinning vinyl disc
 * - Spins while playing, pauses when video pauses
 * - Clicking opens the Sound Page (/sounds/:id)
 */
import { useLocation } from "wouter";
import type { Sound } from "@/lib/soundsClient";

interface MusicDiscProps {
  sound:   Sound;
  playing: boolean;
  size?:   number;
}

export function MusicDisc({ sound, playing, size = 48 }: MusicDiscProps) {
  const [, navigate] = useLocation();

  return (
    <div
      onClick={(e) => { e.stopPropagation(); navigate(`/sounds/${sound.id}`); }}
      className="absolute cursor-pointer select-none"
      style={{ bottom: 12, right: 12, width: size, height: size, zIndex: 10 }}
      title={sound.title}
    >
      {/* Outer glow ring */}
      <div
        className="absolute inset-0 rounded-full"
        style={{
          boxShadow: "0 0 0 2px rgba(255,255,255,0.18), 0 4px 16px rgba(0,0,0,0.5)",
          borderRadius: "50%",
        }}
      />

      {/* Spinning disc */}
      <div
        className="w-full h-full rounded-full overflow-hidden relative"
        style={{
          animationName:            "discSpin",
          animationDuration:        "3s",
          animationTimingFunction:  "linear",
          animationIterationCount:  "infinite",
          animationPlayState:       playing ? "running" : "paused",
          border:                   "2px solid rgba(255,255,255,0.12)",
          background:               "linear-gradient(135deg,#8338ec,#ff006e)",
        }}
      >
        {sound.cover_image ? (
          <img
            src={sound.cover_image}
            alt={sound.title}
            className="absolute inset-0 w-full h-full object-cover"
            draggable={false}
          />
        ) : (
          <div
            className="absolute inset-0"
            style={{ background: "linear-gradient(135deg,#8338ec,#ff006e)" }}
          />
        )}

        {/* Vinyl rings overlay */}
        <div
          className="absolute inset-0 rounded-full"
          style={{
            background:
              "radial-gradient(circle, transparent 18%, rgba(0,0,0,0.15) 18%, rgba(0,0,0,0.15) 20%, transparent 20%, transparent 38%, rgba(0,0,0,0.1) 38%, rgba(0,0,0,0.1) 40%, transparent 40%)",
          }}
        />
      </div>

      {/* Center hole */}
      <div
        className="absolute rounded-full bg-black"
        style={{
          width:     size * 0.22,
          height:    size * 0.22,
          top:       "50%",
          left:      "50%",
          transform: "translate(-50%, -50%)",
          border:    "1.5px solid rgba(255,255,255,0.2)",
          zIndex:    2,
        }}
      />

      {/* Music note badge (bottom-left of disc) */}
      <div
        className="absolute flex items-center justify-center rounded-full"
        style={{
          width:      16,
          height:     16,
          bottom:     -3,
          left:       -3,
          background: "linear-gradient(135deg,#8338ec,#ff006e)",
          border:     "1.5px solid #fff",
          fontSize:   8,
          zIndex:     3,
        }}
      >
        🎵
      </div>
    </div>
  );
}
