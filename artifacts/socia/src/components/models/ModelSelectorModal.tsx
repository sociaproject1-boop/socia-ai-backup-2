/**
 * ModelSelectorModal — Fullscreen glassmorphism AI Models orchestrator.
 *
 * Lives EXCLUSIVELY inside the AI Cinematic Studio. Opens from the
 * "Cinematic Engine" pill in the studio header and presents the
 * orchestrator's premium model catalog as a scrollable vertical
 * gallery (Krea / Runway / Poe-style).
 *
 * Selection flows through `useSelectedModel` → `useStudioModelStore`
 * → `cfg.renderEngine` in CreateMultiFrame, which drives the actual
 * render pipeline (credits, prompt enrichment, motion settings).
 */

import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X, Cpu, Check, Coins,
  Sparkles, Film, ChevronRight,
} from "lucide-react";
import { useSelectedModel } from "@/hooks/useSelectedModel";
import type { AiModel, AiModelId } from "@/data/aiModels";

const PUR = "#B026FF";

export function ModelSelectorModal({
  open,
  onClose,
  onSelect,
}: {
  open: boolean;
  onClose: () => void;
  /** Called AFTER the persisted store is updated so callers can mirror
      the change into their local render config (cfg.renderEngine). */
  onSelect?: (id: AiModelId) => void;
}) {
  const { model: active, models, setModel } = useSelectedModel();

  /* Lock body scroll while open (mobile-first modal). */
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  /* Close on Escape for desktop users. */
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  function handleSelect(id: AiModelId) {
    setModel(id);
    onSelect?.(id);
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="msm-root"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.22 }}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 120,
            background: "rgba(4,1,12,0.78)",
            backdropFilter: "blur(28px) saturate(140%)",
            WebkitBackdropFilter: "blur(28px) saturate(140%)",
            display: "flex",
            justifyContent: "center",
          }}
        >
          {/* Ambient orbs for cinematic atmosphere */}
          <AmbientOrbs />

          <motion.div
            initial={{ y: 18, opacity: 0, scale: 0.985 }}
            animate={{ y: 0,  opacity: 1, scale: 1 }}
            exit={{    y: 12, opacity: 0, scale: 0.99 }}
            transition={{ type: "spring", stiffness: 340, damping: 30 }}
            style={{
              position: "relative",
              width: "100%",
              maxWidth: 480,
              height: "100dvh",
              display: "flex",
              flexDirection: "column",
              paddingTop: "env(safe-area-inset-top, 0px)",
              paddingBottom: "env(safe-area-inset-bottom, 0px)",
              color: "white",
            }}
          >
            <Header onClose={onClose} />

            <div
              style={{
                flex: 1,
                overflowY: "auto",
                overflowX: "hidden",
                WebkitOverflowScrolling: "touch",
                paddingBottom: 32,
              }}
            >
              {/* Featured / flagship card spotlight */}
              {models.filter(m => m.featured).map((m) => (
                <FlagshipCard
                  key={m.id}
                  model={m}
                  selected={m.id === active.id}
                  onSelect={() => handleSelect(m.id)}
                />
              ))}

              {/* All other models — vertical gallery */}
              <div style={{ padding: "8px 16px 0", display: "flex", alignItems: "center", gap: 8 }}>
                <Film style={{ width: 14, height: 14, color: "rgba(255,255,255,0.55)" }} />
                <p style={{
                  fontSize: 10, fontWeight: 800, letterSpacing: "0.16em",
                  textTransform: "uppercase", color: "rgba(255,255,255,0.55)",
                }}>
                  All Cinematic Engines
                </p>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: "12px 16px 0" }}>
                {models.filter(m => !m.featured).map((m) => (
                  <ModelRow
                    key={m.id}
                    model={m}
                    selected={m.id === active.id}
                    onSelect={() => handleSelect(m.id)}
                  />
                ))}
              </div>

              {/* Footer disclaimer */}
              <p style={{
                margin: "24px 16px 0",
                fontSize: 10,
                lineHeight: 1.55,
                color: "rgba(255,255,255,0.38)",
                textAlign: "center",
              }}>
                The selected engine powers every scene render in this project —
                AI Director · Voice · Music · Final Cut.
              </p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ────────────────────────────────────────────────────────────── */

function Header({ onClose }: { onClose: () => void }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "14px 16px 12px",
      borderBottom: "1px solid rgba(255,255,255,0.05)",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{
          width: 38, height: 38, borderRadius: 12,
          background: `linear-gradient(135deg, ${PUR}, #ec4899)`,
          display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: `0 0 22px rgba(176,38,255,0.55), inset 0 1px 0 rgba(255,255,255,0.18)`,
        }}>
          <Cpu style={{ width: 18, height: 18, color: "white" }} />
        </div>
        <div>
          <p style={{
            fontSize: 9, fontWeight: 800, letterSpacing: "0.18em",
            textTransform: "uppercase", color: "rgba(176,38,255,0.95)", marginBottom: 2,
          }}>Cinematic Studio</p>
          <h2 style={{
            fontSize: 19, fontWeight: 900, color: "white",
            letterSpacing: "-0.015em", lineHeight: 1.1,
          }}>
            AI Models
          </h2>
        </div>
      </div>
      <button
        onClick={onClose}
        aria-label="Close model selector"
        style={{
          width: 36, height: 36, borderRadius: 12,
          background: "rgba(255,255,255,0.06)",
          border: "1px solid rgba(255,255,255,0.08)",
          display: "flex", alignItems: "center", justifyContent: "center",
          cursor: "pointer", color: "rgba(255,255,255,0.7)",
          backdropFilter: "blur(12px)",
        }}
      >
        <X style={{ width: 16, height: 16 }} />
      </button>
    </div>
  );
}

function AmbientOrbs() {
  return (
    <>
      <div style={{
        position: "absolute", top: "-15%", left: "-10%",
        width: 360, height: 360, borderRadius: "50%",
        background: "radial-gradient(circle, rgba(176,38,255,0.28) 0%, transparent 65%)",
        filter: "blur(40px)", pointerEvents: "none",
      }} />
      <div style={{
        position: "absolute", bottom: "-12%", right: "-10%",
        width: 320, height: 320, borderRadius: "50%",
        background: "radial-gradient(circle, rgba(236,72,153,0.22) 0%, transparent 65%)",
        filter: "blur(40px)", pointerEvents: "none",
      }} />
    </>
  );
}

/* ── Flagship hero card ───────────────────────────────────────── */

function FlagshipCard({
  model, selected, onSelect,
}: {
  model: AiModel; selected: boolean; onSelect: () => void;
}) {
  return (
    <motion.button
      onClick={onSelect}
      whileTap={{ scale: 0.985 }}
      animate={selected ? {
        boxShadow: [
          `0 0 0px ${model.glow}`,
          `0 0 36px ${model.glow}, 0 0 72px rgba(176,38,255,0.32)`,
          `0 0 0px ${model.glow}`,
        ],
      } : { boxShadow: "0 12px 32px rgba(0,0,0,0.55)" }}
      transition={selected ? { duration: 2.6, repeat: Infinity, ease: "easeInOut" } : { duration: 0.3 }}
      style={{
        position: "relative",
        margin: "14px 16px 18px",
        height: 280,
        borderRadius: 26,
        overflow: "hidden",
        border: `1.5px solid ${selected ? "rgba(176,38,255,0.55)" : "rgba(255,255,255,0.08)"}`,
        background: "#0a0510",
        cursor: "pointer",
        textAlign: "left",
        padding: 0,
        width: "calc(100% - 32px)",
      }}
    >
      <motion.img
        src={model.cover}
        alt={model.name}
        draggable={false}
        loading="lazy"
        decoding="async"
        animate={selected ? { scale: 1.06 } : { scale: 1 }}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        style={{
          position: "absolute", inset: 0,
          width: "100%", height: "100%",
          objectFit: "cover",
        }}
      />
      <div style={{
        position: "absolute", inset: 0,
        background: "linear-gradient(to top, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.55) 45%, rgba(0,0,0,0.1) 75%, rgba(0,0,0,0.35) 100%)",
      }} />

      {selected && (
        <div style={{
          position: "absolute", inset: 0, borderRadius: 26,
          boxShadow: `inset 0 0 0 1.5px ${PUR}, inset 0 0 40px rgba(176,38,255,0.25)`,
          pointerEvents: "none",
        }} />
      )}

      {/* Top pills */}
      <div style={{
        position: "absolute", top: 14, left: 14, right: 14,
        display: "flex", justifyContent: "space-between", alignItems: "flex-start",
      }}>
        <div style={{
          display: "flex", alignItems: "center", gap: 5,
          padding: "5px 10px", borderRadius: 999,
          background: "rgba(176,38,255,0.22)",
          border: "1px solid rgba(176,38,255,0.45)",
          backdropFilter: "blur(12px)",
        }}>
          <Sparkles style={{ width: 10, height: 10, color: "#e0b3ff" }} />
          <span style={{
            fontSize: 9, fontWeight: 800, letterSpacing: "0.1em",
            textTransform: "uppercase", color: "#f0d4ff",
          }}>Flagship</span>
        </div>

        {selected ? (
          <motion.div
            initial={{ scale: 0 }} animate={{ scale: 1 }}
            transition={{ type: "spring", stiffness: 420, damping: 20 }}
            style={{
              width: 30, height: 30, borderRadius: "50%",
              background: `linear-gradient(135deg, ${PUR}, #ec4899)`,
              display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: `0 0 16px ${PUR}`,
            }}
          >
            <Check style={{ width: 16, height: 16, color: "white" }} strokeWidth={3} />
          </motion.div>
        ) : null}
      </div>

      {/* Bottom content */}
      <div style={{
        position: "absolute", left: 0, right: 0, bottom: 0,
        padding: "16px 18px 18px",
      }}>
        <h3 style={{
          fontSize: 26, fontWeight: 900, color: "white",
          letterSpacing: "-0.025em", lineHeight: 1.05,
          marginBottom: 6,
          textShadow: "0 2px 14px rgba(0,0,0,0.9)",
        }}>{model.name}</h3>
        <p style={{
          fontSize: 12, fontWeight: 500,
          color: "rgba(255,255,255,0.82)",
          lineHeight: 1.45, marginBottom: 12,
          textShadow: "0 1px 6px rgba(0,0,0,0.85)",
        }}>{model.tagline}</p>

        <SpecRow model={model} compact={false} />

        <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 12 }}>
          {model.tags.slice(0, 4).map(t => (
            <span key={t} style={{
              fontSize: 8.5, fontWeight: 800,
              letterSpacing: "0.06em", textTransform: "uppercase",
              padding: "3.5px 8px", borderRadius: 7,
              background: "rgba(255,255,255,0.14)",
              border: "1px solid rgba(255,255,255,0.2)",
              color: "rgba(255,255,255,0.92)",
              backdropFilter: "blur(8px)",
            }}>{t}</span>
          ))}
        </div>
      </div>
    </motion.button>
  );
}

/* ── Compact row card for the rest of the catalog ─────────────── */

function ModelRow({
  model, selected, onSelect,
}: {
  model: AiModel; selected: boolean; onSelect: () => void;
}) {
  return (
    <motion.button
      onClick={model.available ? onSelect : undefined}
      whileTap={model.available ? { scale: 0.98 } : undefined}
      disabled={!model.available}
      style={{
        position: "relative",
        display: "flex", gap: 14,
        padding: 10,
        borderRadius: 20,
        border: `1.5px solid ${selected ? "rgba(176,38,255,0.5)" : "rgba(255,255,255,0.07)"}`,
        background: selected
          ? "linear-gradient(135deg, rgba(176,38,255,0.10), rgba(236,72,153,0.06))"
          : "rgba(255,255,255,0.03)",
        backdropFilter: "blur(14px)",
        WebkitBackdropFilter: "blur(14px)",
        cursor: model.available ? "pointer" : "not-allowed",
        opacity: model.available ? 1 : 0.55,
        textAlign: "left",
        width: "100%",
        boxShadow: selected
          ? `0 0 24px ${model.glow}, inset 0 1px 0 rgba(255,255,255,0.04)`
          : "0 4px 14px rgba(0,0,0,0.35)",
        transition: "border 0.2s, background 0.2s, box-shadow 0.3s",
      }}
    >
      {/* Cover thumb */}
      <div style={{
        position: "relative",
        width: 84, height: 108,
        flexShrink: 0,
        borderRadius: 14,
        overflow: "hidden",
        border: "1px solid rgba(255,255,255,0.08)",
        background: model.gradient,
      }}>
        <img
          src={model.cover}
          alt=""
          loading="lazy"
          decoding="async"
          draggable={false}
          style={{
            position: "absolute", inset: 0,
            width: "100%", height: "100%",
            objectFit: "cover",
          }}
        />
        {selected && (
          <div style={{
            position: "absolute", inset: 0,
            background: "rgba(176,38,255,0.18)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <div style={{
              width: 26, height: 26, borderRadius: "50%",
              background: `linear-gradient(135deg, ${PUR}, #ec4899)`,
              display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: `0 0 14px ${PUR}`,
            }}>
              <Check style={{ width: 14, height: 14, color: "white" }} strokeWidth={3} />
            </div>
          </div>
        )}
      </div>

      {/* Right side */}
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
          <h4 style={{
            fontSize: 15, fontWeight: 800, color: "white",
            letterSpacing: "-0.01em",
          }}>{model.name}</h4>
          {!model.available && (
            <span style={{
              fontSize: 8, fontWeight: 800, letterSpacing: "0.08em",
              textTransform: "uppercase",
              padding: "2px 6px", borderRadius: 5,
              background: "rgba(255,255,255,0.08)",
              color: "rgba(255,255,255,0.55)",
            }}>Soon</span>
          )}
        </div>
        <p style={{
          fontSize: 11, color: "rgba(255,255,255,0.55)",
          lineHeight: 1.4,
          marginBottom: 8,
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
        }}>{model.tagline}</p>

        <SpecRow model={model} compact />

        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 7 }}>
          {model.tags.slice(0, 3).map(t => (
            <span key={t} style={{
              fontSize: 8, fontWeight: 700,
              letterSpacing: "0.05em", textTransform: "uppercase",
              padding: "2.5px 6.5px", borderRadius: 5,
              background: selected ? "rgba(176,38,255,0.18)" : "rgba(255,255,255,0.06)",
              border: `1px solid ${selected ? "rgba(176,38,255,0.3)" : "rgba(255,255,255,0.1)"}`,
              color: selected ? "#f0d4ff" : "rgba(255,255,255,0.7)",
            }}>{t}</span>
          ))}
        </div>
      </div>

      <ChevronRight style={{
        position: "absolute", right: 14, top: "50%",
        transform: "translateY(-50%)",
        width: 14, height: 14,
        color: "rgba(255,255,255,0.3)",
      }} />
    </motion.button>
  );
}

/* ── Quality / Speed / Credits row ────────────────────────────── */

function SpecRow({ model, compact }: { model: AiModel; compact: boolean }) {
  const size = compact ? 9 : 10;
  const barH = compact ? 3 : 4;
  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "1fr 1fr auto",
      gap: compact ? 8 : 12,
      alignItems: "center",
    }}>
      <Bar label="Quality" value={model.cinematicScore} color="#B026FF" size={size} barH={barH} />
      <Bar label="Speed"   value={model.speedScore}     color="#06d6a0" size={size} barH={barH} />
      <div style={{
        display: "flex", alignItems: "center", gap: 4,
        padding: compact ? "3px 7px" : "4px 9px",
        borderRadius: 999,
        background: "rgba(245,158,11,0.12)",
        border: "1px solid rgba(245,158,11,0.3)",
      }}>
        <Coins style={{ width: compact ? 9 : 11, height: compact ? 9 : 11, color: "#fbbf24" }} />
        <span style={{
          fontSize: size, fontWeight: 800,
          color: "#fde68a", letterSpacing: "0.02em",
        }}>{model.creditsPerSegment}/seg</span>
      </div>
    </div>
  );
}

function Bar({
  label, value, color, size, barH,
}: { label: string; value: number; color: string; size: number; barH: number }) {
  return (
    <div>
      <div style={{
        display: "flex", justifyContent: "space-between", marginBottom: 2,
      }}>
        <span style={{
          fontSize: size, fontWeight: 700,
          color: "rgba(255,255,255,0.55)",
          letterSpacing: "0.04em",
        }}>{label}</span>
        <span style={{
          fontSize: size, fontWeight: 800,
          color: "rgba(255,255,255,0.85)",
        }}>{value}</span>
      </div>
      <div style={{
        position: "relative",
        height: barH,
        borderRadius: barH,
        background: "rgba(255,255,255,0.07)",
        overflow: "hidden",
      }}>
        <div style={{
          position: "absolute", inset: 0,
          width: `${Math.max(0, Math.min(100, value))}%`,
          background: `linear-gradient(90deg, ${color}, ${color}99)`,
          borderRadius: barH,
          boxShadow: `0 0 8px ${color}77`,
        }} />
      </div>
    </div>
  );
}

