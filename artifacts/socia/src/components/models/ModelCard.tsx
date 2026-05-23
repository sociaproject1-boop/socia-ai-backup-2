/**
 * ModelCard — Premium cinematic AI model card.
 * Used inside the ModelSelector panel (horizontal scroll).
 */

import { motion } from "framer-motion";
import { Check, Lock, Sparkles } from "lucide-react";

const PUR        = "#B026FF";
const PUR_BORDER = "rgba(176,38,255,0.55)";
const BORDER_W   = "rgba(255,255,255,0.08)";

export interface ModelCardData {
  id: string;
  name: string;
  subtitle: string;
  cover: string | null;          // background image url, null → gradient placeholder
  gradient: string;              // fallback / accent gradient
  glow: string;                  // colored glow
  available: boolean;
  badges?: string[];             // ["Cinema Grade", "Lip Sync", ...]
}

export function ModelCard({
  data, selected, onSelect,
}: {
  data: ModelCardData;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <motion.button
      onClick={data.available ? onSelect : undefined}
      disabled={!data.available}
      whileTap={data.available ? { scale: 0.97 } : undefined}
      animate={selected ? { boxShadow: [
        `0 0 0px ${data.glow}`,
        `0 0 32px ${data.glow}, 0 0 60px rgba(176,38,255,0.35)`,
        `0 0 0px ${data.glow}`,
      ] } : { boxShadow: "0 8px 24px rgba(0,0,0,0.45)" }}
      transition={selected ? { duration: 2.4, repeat: Infinity, ease: "easeInOut" } : { duration: 0.3 }}
      style={{
        position: "relative",
        flexShrink: 0,
        width: 244, height: 320,
        borderRadius: 22,
        overflow: "hidden",
        border: `1.5px solid ${selected ? PUR_BORDER : BORDER_W}`,
        background: "#0a0510",
        cursor: data.available ? "pointer" : "not-allowed",
        opacity: data.available ? 1 : 0.55,
        textAlign: "left",
        padding: 0,
      }}
    >
      {/* Cover image or gradient placeholder */}
      {data.cover ? (
        <motion.img
          src={data.cover}
          alt={data.name}
          draggable={false}
          animate={selected ? { scale: 1.05 } : { scale: 1 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          style={{
            position: "absolute", inset: 0,
            width: "100%", height: "100%",
            objectFit: "cover",
          }}
        />
      ) : (
        <div style={{
          position: "absolute", inset: 0,
          background: data.gradient,
        }}>
          <div style={{
            position: "absolute", inset: 0,
            display: "flex", alignItems: "center", justifyContent: "center",
            opacity: 0.4,
          }}>
            <Sparkles style={{ width: 56, height: 56, color: "white" }} />
          </div>
        </div>
      )}

      {/* Dark gradient overlay for text legibility */}
      <div style={{
        position: "absolute", inset: 0,
        background: "linear-gradient(to top, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.55) 35%, rgba(0,0,0,0.15) 60%, rgba(0,0,0,0.35) 100%)",
      }} />

      {/* Selected glow ring (inner) */}
      {selected && (
        <div style={{
          position: "absolute", inset: 0,
          borderRadius: 22,
          boxShadow: `inset 0 0 0 1.5px ${PUR}, inset 0 0 30px rgba(176,38,255,0.25)`,
          pointerEvents: "none",
        }} />
      )}

      {/* Top-right: status pill */}
      <div style={{ position: "absolute", top: 12, right: 12 }}>
        {!data.available ? (
          <div style={{
            display: "flex", alignItems: "center", gap: 4,
            padding: "4px 9px",
            borderRadius: 999,
            background: "rgba(0,0,0,0.65)",
            border: `1px solid ${BORDER_W}`,
            backdropFilter: "blur(10px)",
          }}>
            <Lock style={{ width: 9, height: 9, color: "rgba(255,255,255,0.6)" }} />
            <span style={{ fontSize: 8, fontWeight: 800, letterSpacing: "0.08em", color: "rgba(255,255,255,0.7)", textTransform: "uppercase" }}>Soon</span>
          </div>
        ) : selected ? (
          <motion.div
            initial={{ scale: 0 }} animate={{ scale: 1 }}
            transition={{ type: "spring", stiffness: 400, damping: 18 }}
            style={{
              width: 26, height: 26, borderRadius: "50%",
              background: `linear-gradient(135deg, ${PUR}, #ec4899)`,
              display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: `0 0 14px ${PUR}`,
            }}>
            <Check style={{ width: 14, height: 14, color: "white" }} strokeWidth={3} />
          </motion.div>
        ) : (
          <div style={{
            padding: "4px 9px",
            borderRadius: 999,
            background: "rgba(176,38,255,0.18)",
            border: `1px solid ${PUR_BORDER}`,
            backdropFilter: "blur(10px)",
          }}>
            <span style={{ fontSize: 8, fontWeight: 800, letterSpacing: "0.08em", color: "#e0b3ff", textTransform: "uppercase" }}>Available</span>
          </div>
        )}
      </div>

      {/* Bottom: name + subtitle + badges */}
      <div style={{
        position: "absolute", left: 0, right: 0, bottom: 0,
        padding: "14px 16px 16px",
      }}>
        <h3 style={{
          fontSize: 18, fontWeight: 900, color: "white",
          letterSpacing: "-0.01em", lineHeight: 1.1,
          marginBottom: 4,
          textShadow: "0 2px 12px rgba(0,0,0,0.85)",
        }}>{data.name}</h3>
        <p style={{
          fontSize: 10, fontWeight: 500,
          color: "rgba(255,255,255,0.78)",
          lineHeight: 1.4,
          marginBottom: data.badges?.length ? 8 : 0,
          textShadow: "0 1px 6px rgba(0,0,0,0.85)",
        }}>{data.subtitle}</p>

        {data.badges && data.badges.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {data.badges.map(b => (
              <span key={b} style={{
                fontSize: 8, fontWeight: 800,
                letterSpacing: "0.05em", textTransform: "uppercase",
                padding: "3px 7px", borderRadius: 6,
                background: selected
                  ? "rgba(176,38,255,0.28)"
                  : "rgba(255,255,255,0.12)",
                border: `1px solid ${selected ? PUR_BORDER : "rgba(255,255,255,0.18)"}`,
                color: selected ? "#f0d4ff" : "rgba(255,255,255,0.85)",
                backdropFilter: "blur(8px)",
              }}>{b}</span>
            ))}
          </div>
        )}
      </div>
    </motion.button>
  );
}
