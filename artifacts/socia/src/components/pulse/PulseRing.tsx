/**
 * PulseRing — animated gradient ring shown around avatars when a user
 * has active Pulse stories.  Socia-branded: magenta → purple → cyan gradient.
 *
 * Usage:
 *   <PulseRing hasActivePulse={true} size={88} onTap={openViewer}>
 *     <img ... />
 *   </PulseRing>
 */
import type { ReactNode } from "react";

interface PulseRingProps {
  hasActivePulse: boolean;
  /** Diameter in px of the inner content. The ring adds 6px padding. */
  size:           number;
  /** If true, use a duller "already viewed" style instead of vivid ring. */
  viewed?:        boolean;
  onTap?:         () => void;
  children:       ReactNode;
  className?:     string;
}

export function PulseRing({
  hasActivePulse,
  size,
  viewed = false,
  onTap,
  children,
  className = "",
}: PulseRingProps) {
  if (!hasActivePulse) {
    return (
      <div className={className} style={{ width: size, height: size }}>
        {children}
      </div>
    );
  }

  const gap    = 2;
  const border = 3;
  const outer  = size + (gap + border) * 2;

  return (
    <div
      onClick={onTap}
      className={`relative flex-shrink-0 cursor-pointer select-none ${className}`}
      style={{ width: outer, height: outer }}
      role={onTap ? "button" : undefined}
      aria-label="View Story"
    >
      {/* Spinning conic-gradient ring */}
      <div
        className="pulse-ring-anim absolute inset-0 rounded-full"
        style={{
          background: viewed
            ? "conic-gradient(from 0deg, #666, #999, #666)"
            : "conic-gradient(from 0deg, #ff006e, #8338ec, #3a86ff, #06d6a0, #ffbe0b, #ff006e)",
          opacity: viewed ? 0.45 : 1,
        }}
      />
      {/* Dark gap ring */}
      <div
        className="absolute rounded-full"
        style={{
          inset:      border,
          background: "#000",
          borderRadius: "50%",
        }}
      />
      {/* Content — centred inside gap */}
      {/* Children — positioned inside the gap; children handle their own clipping */}
      <div
        className="absolute"
        style={{
          inset:  border + gap,
          borderRadius: "50%",
        }}
      >
        {children}
      </div>
    </div>
  );
}
