/**
 * LiveReactions.tsx — Floating animated reactions for live streams.
 * Reactions float upward from the right side of the screen and fade out.
 */
import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

export type ReactionType = "heart" | "like" | "fire" | "clap";

export interface FloatingReaction {
  id:    string;
  type:  ReactionType;
  x:     number; // random x offset (0–1)
}

const EMOJI: Record<ReactionType, string> = {
  heart: "❤️",
  like:  "👍",
  fire:  "🔥",
  clap:  "👏",
};

/* ── FloatingItem — one emoji that floats up then fades ────────────────────── */
function FloatingItem({ reaction, onDone }: { reaction: FloatingReaction; onDone: () => void }) {
  const xOffset = -20 + reaction.x * 40; // ±20px horizontal drift

  return (
    <motion.div
      key={reaction.id}
      initial={{ opacity: 1, y: 0, x: xOffset, scale: 0.6 }}
      animate={{ opacity: 0, y: -180, x: xOffset + (Math.random() > 0.5 ? 15 : -15), scale: 1.2 }}
      transition={{ duration: 2.2, ease: [0.25, 0.46, 0.45, 0.94] }}
      onAnimationComplete={onDone}
      style={{
        position: "absolute",
        bottom: 0,
        right: 0,
        fontSize: 28,
        pointerEvents: "none",
        userSelect: "none",
        willChange: "transform, opacity",
      }}
    >
      {EMOJI[reaction.type]}
    </motion.div>
  );
}

/* ── ReactionButton — tappable button for sending reactions ─────────────────── */
export function ReactionButton({
  type,
  onReact,
}: {
  type:    ReactionType;
  onReact: (type: ReactionType) => void;
}) {
  const [pulse, setPulse] = useState(false);

  function handleTap() {
    onReact(type);
    setPulse(true);
    setTimeout(() => setPulse(false), 300);
  }

  return (
    <motion.button
      whileTap={{ scale: 0.75 }}
      onClick={handleTap}
      style={{
        width: 44,
        height: 44,
        borderRadius: "50%",
        background: pulse ? "rgba(255,255,255,0.22)" : "rgba(0,0,0,0.42)",
        backdropFilter: "blur(8px)",
        border: "1px solid rgba(255,255,255,0.14)",
        display: "grid",
        placeItems: "center",
        fontSize: 20,
        cursor: "pointer",
        transition: "background 0.15s ease",
      }}
      aria-label={type}
    >
      {EMOJI[type]}
    </motion.button>
  );
}

/* ── LiveReactions — container that manages the floating stack ──────────────── */
export function LiveReactions({
  reactions,
  onReact,
}: {
  reactions: FloatingReaction[];
  onReact:   (type: ReactionType) => void;
}) {
  const [visible, setVisible] = useState<FloatingReaction[]>([]);
  const prevLen = useRef(0);

  // Show the latest reactions as they come in
  useEffect(() => {
    if (reactions.length > prevLen.current) {
      const newOnes = reactions.slice(prevLen.current);
      setVisible((v) => [...v, ...newOnes].slice(-20)); // keep last 20
    }
    prevLen.current = reactions.length;
  }, [reactions]);

  function removeDone(id: string) {
    setVisible((v) => v.filter((r) => r.id !== id));
  }

  return (
    <div
      style={{
        position: "absolute",
        right: 16,
        bottom: 160,
        width: 56,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 10,
        zIndex: 20,
      }}
    >
      {/* Floating emojis */}
      <div style={{ position: "relative", width: 56, height: 200 }}>
        <AnimatePresence>
          {visible.map((r) => (
            <FloatingItem key={r.id} reaction={r} onDone={() => removeDone(r.id)} />
          ))}
        </AnimatePresence>
      </div>

      {/* Reaction buttons */}
      {(["heart", "fire", "like", "clap"] as ReactionType[]).map((type) => (
        <ReactionButton key={type} type={type} onReact={onReact} />
      ))}
    </div>
  );
}
