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
 *
 * UX contract:
 *  - The CURRENTLY SELECTED model is always promoted to the hero slot
 *    at the top — tapping any row swaps the hero with a crossfade.
 *  - The header softly fades + translates with scroll for native feel.
 *  - Cards are React.memo'd and use CSS containment/will-change so the
 *    scroll stays 120 Hz on mobile.
 */

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence, useScroll, useTransform } from "framer-motion";
import {
  X, Cpu, Check, Coins,
  Sparkles, Film, ChevronRight,
} from "lucide-react";
import { useSelectedModel } from "@/hooks/useSelectedModel";
import type { AiModel, AiModelId } from "@/data/aiModels";

const PUR = "#B026FF";

/* ────────────────────────────────────────────────────────────────
   Shared GPU-friendly style tokens. Using will-change + contain
   keeps the scroller off the main-thread paint path so the gallery
   stays buttery on mid-range Android. */
const GPU: React.CSSProperties = {
  willChange: "transform, opacity",
  transform: "translateZ(0)",
  backfaceVisibility: "hidden",
};

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
  const scrollerRef = useRef<HTMLDivElement>(null);

  /* Track scroll inside the modal so the header can softly fade + drift,
     giving the screen a native-feeling parallax instead of a frozen bar. */
  const { scrollY } = useScroll({ container: scrollerRef });
  const headerOpacity = useTransform(scrollY, [0, 60, 120], [1, 0.92, 0.78]);
  const headerY       = useTransform(scrollY, [0, 120], [0, -4]);
  const headerBlur    = useTransform(scrollY, [0, 80], [0, 14]);

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

  /* Memoized so the row's onClick identity is stable across renders — lets
     React.memo on ModelRow short-circuit the diff for non-selected rows. */
  const handleSelect = useCallback((id: AiModelId) => {
    setModel(id);
    onSelect?.(id);
    /* Instant scroll-to-top — `smooth` adds 250-400ms of perceived lag
       that competes with the hero crossfade and makes selection feel slow. */
    scrollerRef.current?.scrollTo({ top: 0, behavior: "auto" });
  }, [setModel, onSelect]);

  /* Preload EVERY model thumbnail the first time the modal opens so hero
     swaps never wait on a network round-trip. Browsers dedupe so subsequent
     opens are free. */
  useEffect(() => {
    if (!open) return;
    for (const m of models) {
      const img = new Image();
      img.decoding = "async";
      img.src = m.cover;
    }
  }, [open, models]);

  /* The selected model is ALWAYS the hero. Everything else flows below
     as the catalog list. Memoized so changing selection doesn't rebuild
     the list arrays on every parent re-render. */
  const others = useMemo(
    () => models.filter((m) => m.id !== active.id),
    [models, active.id],
  );

  /* Stable callback identity for the hero so React.memo on FlagshipCard
     short-circuits parent re-renders (architect feedback). */
  const onHeroSelect = useCallback(
    () => handleSelect(active.id),
    [handleSelect, active.id],
  );

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
              ...GPU,
            }}
          >
            <Header
              onClose={onClose}
              opacity={headerOpacity}
              y={headerY}
              blur={headerBlur}
            />

            <div
              ref={scrollerRef}
              style={{
                flex: 1,
                /* CRITICAL: flex children default to `min-height: auto`,
                   which prevents `overflow-y: auto` from ever activating
                   inside a `flex: 1` column. Without `minHeight: 0`, the
                   scroller grows to its content height instead of being
                   capped by the parent's 100dvh, and the lower model
                   cards (Veo / Pika / Luma) literally cannot be reached
                   because nothing scrolls — the page just clips. This is
                   the root cause of the "lower models can't be tapped"
                   bug. Do not remove. */
                minHeight: 0,
                overflowY: "auto",
                overflowX: "hidden",
                WebkitOverflowScrolling: "touch",
                overscrollBehavior: "contain",
                scrollbarWidth: "none",
                /* Explicit hint to Chrome Android / Replit webview that
                   this surface only handles vertical pan gestures —
                   prevents the browser from waiting for a horizontal-
                   swipe interpretation and gives momentum scrolling
                   immediately on first finger movement. */
                touchAction: "pan-y",
                /* Padding bottom = visual breathing room PLUS the home-
                   indicator safe-area inset, so the last card never
                   sits behind the iOS gesture bar. */
                paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 32px)",
                /* NOTE: previously had `contain: "layout paint"` here —
                   intended as a paint-isolation win but on Chrome
                   Android it occasionally creates a compositor layer
                   that swallows touches that begin near the top edge.
                   Removed; per-row `contain` is still applied. */
                ...GPU,
              }}
            >
              {/* HERO — the currently selected model. Crossfades cleanly
                  when the user picks a different engine from the list.
                  mode="popLayout" lets the old hero exit while the new
                  one enters in the same DOM slot — no snap. */}
              {/* `mode="wait"` keeps a single hero slot — the old hero
                  finishes its 220ms fade-out before the new one fades in,
                  preventing a stacked-card paint storm on selection. */}
              <AnimatePresence mode="wait" initial={false}>
                <FlagshipCard
                  key={active.id}
                  model={active}
                  onSelect={onHeroSelect}
                />
              </AnimatePresence>

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

              {/* Plain div — the previous `motion.div layout` animated
                  height on every selection swap, which on Android Chrome
                  intermittently captured touch events on the rows below
                  the changing region (the "dead tap zone" symptom).
                  Individual rows still animate in/out via AnimatePresence
                  on the ModelRow itself; we just don't need the parent
                  to re-layout-animate too. */}
              <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: "12px 16px 0" }}>
                <AnimatePresence initial={false}>
                  {others.map((m) => (
                    <ModelRow
                      key={m.id}
                      model={m}
                      onSelect={handleSelect}
                    />
                  ))}
                </AnimatePresence>
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

interface HeaderProps {
  onClose: () => void;
  opacity: ReturnType<typeof useTransform<number, number>>;
  y:       ReturnType<typeof useTransform<number, number>>;
  blur:    ReturnType<typeof useTransform<number, number>>;
}

/* Header — uses motion values driven by scroll so it softly drifts and
   fades as the user scrolls. The X button shares the parent opacity so
   it floats naturally instead of feeling glued in place. */
function Header({ onClose, opacity, y, blur }: HeaderProps) {
  const backdrop = useTransform(blur, (v) => `blur(${v}px)`);
  return (
    <motion.div
      style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "14px 16px 12px",
        borderBottom: "1px solid rgba(255,255,255,0.05)",
        opacity,
        y,
        backdropFilter: backdrop,
        WebkitBackdropFilter: backdrop,
        ...GPU,
      }}
    >
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
      <motion.button
        onClick={onClose}
        whileTap={{ scale: 0.92 }}
        whileHover={{ scale: 1.05, backgroundColor: "rgba(255,255,255,0.10)" }}
        transition={{ type: "spring", stiffness: 420, damping: 24 }}
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
      </motion.button>
    </motion.div>
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

/* React.memo with explicit comparator — the hero only needs to re-render
   when its model id changes (selected state is implicit: this card always
   represents the active model). Keeps the scroller cheap. */
const FlagshipCard = memo(function FlagshipCard({
  model,
  onSelect,
}: {
  model: AiModel;
  onSelect: () => void;
}) {
  return (
    <motion.button
      key={model.id}
      /* Snappy 200ms tween — buttery on 144 Hz, instant on tap.
         Springs/long durations made the swap feel laggy; we now use a
         single transform+opacity transition with no infinite paint
         animation (the glow is a static box-shadow, no longer animated). */
      initial={{ opacity: 0, scale: 0.985 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.99 }}
      whileTap={{ scale: 0.985 }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
      onClick={onSelect}
      style={{
        position: "relative",
        margin: "14px 16px 18px",
        /* Mobile-first hero sizing. `clamp` keeps it cinematic on tablets
           and desktop (cap at 280) but shrinks aggressively on small
           phones so the user can see and reach at least 2–3 catalog rows
           below it without scrolling. Previously a fixed 280px ate ~40%
           of a 700-dvh phone viewport, hiding Runway/Veo/Pika/Luma
           below the fold and contributing to the "lower models
           unreachable" report. */
        height: "clamp(200px, 32dvh, 280px)",
        borderRadius: 26,
        overflow: "hidden",
        border: `1.5px solid rgba(176,38,255,0.55)`,
        background: "#0a0510",
        cursor: "pointer",
        textAlign: "left",
        padding: 0,
        width: "calc(100% - 32px)",
        /* Static cinematic glow — paint-cheap (no per-frame box-shadow). */
        boxShadow: `0 12px 32px rgba(0,0,0,0.55), 0 0 36px ${model.glow}, 0 0 72px rgba(176,38,255,0.22)`,
        contain: "layout paint",
        ...GPU,
      }}
    >
      <img
        src={model.cover}
        alt={model.name}
        draggable={false}
        loading="eager"
        decoding="async"
        fetchPriority="high"
        style={{
          position: "absolute", inset: 0,
          width: "100%", height: "100%",
          objectFit: "cover",
          /* Mild static zoom for cinematic depth — no animation churn. */
          transform: "scale(1.05)",
        }}
      />

      {/* DUAL gradient stack — kills any baked-in text on the cover image
          (e.g. KLING 3.0 OMNI rendered into the source artwork) so it
          cannot overlap the foreground typography. The bottom 70% is now
          almost fully opaque black so even high-contrast baked text
          disappears completely before the foreground title sits on top. */}
      <div style={{
        position: "absolute", inset: 0,
        background:
          "linear-gradient(to top, rgba(0,0,0,0.99) 0%, rgba(0,0,0,0.92) 38%, rgba(0,0,0,0.55) 68%, rgba(0,0,0,0.35) 100%)",
        pointerEvents: "none",
      }} />
      <div style={{
        position: "absolute", inset: 0,
        background:
          "radial-gradient(ellipse at 0% 100%, rgba(176,38,255,0.18) 0%, transparent 55%)",
        pointerEvents: "none",
      }} />

      {/* Selected glow ring — always on, since hero == selected model. */}
      <div style={{
        position: "absolute", inset: 0, borderRadius: 26,
        boxShadow: `inset 0 0 0 1.5px ${PUR}, inset 0 0 40px rgba(176,38,255,0.25)`,
        pointerEvents: "none",
      }} />

      {/* GIANT WATERMARK — model name as masked background typography
          pinned to the UPPER half of the hero so it can never collide
          with the foreground title block at the bottom. Smaller, even
          fainter, fully masked left/right + bottom. */}
      <div style={{
        position: "absolute",
        left: -8, right: -8, top: 56,
        fontSize: 44,
        fontWeight: 900,
        letterSpacing: "-0.04em",
        lineHeight: 0.9,
        textTransform: "uppercase",
        color: "rgba(255,255,255,0.035)",
        whiteSpace: "nowrap",
        overflow: "hidden",
        pointerEvents: "none",
        WebkitMaskImage:
          "linear-gradient(to bottom, black 0%, black 60%, transparent 100%), linear-gradient(to right, transparent 0%, black 18%, black 78%, transparent 100%)",
        WebkitMaskComposite: "source-in",
        maskImage:
          "linear-gradient(to bottom, black 0%, black 60%, transparent 100%), linear-gradient(to right, transparent 0%, black 18%, black 78%, transparent 100%)",
        maskComposite: "intersect",
        zIndex: 1,
      }}>
        {model.name}
      </div>

      {/* Top pills */}
      <div style={{
        position: "absolute", top: 14, left: 14, right: 14,
        display: "flex", justifyContent: "space-between", alignItems: "flex-start",
        zIndex: 3,
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
          }}>Active Engine</span>
        </div>

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
      </div>

      {/* Bottom content — sits on top of the watermark thanks to z-index. */}
      <div style={{
        position: "absolute", left: 0, right: 0, bottom: 0,
        padding: "16px 18px 18px",
        zIndex: 3,
      }}>
        <h3 style={{
          fontSize: 26, fontWeight: 900, color: "white",
          letterSpacing: "-0.025em", lineHeight: 1.05,
          marginBottom: 6,
          textShadow: "0 2px 14px rgba(0,0,0,0.95), 0 1px 2px rgba(0,0,0,1)",
        }}>{model.name}</h3>
        <p style={{
          fontSize: 12, fontWeight: 500,
          color: "rgba(255,255,255,0.88)",
          lineHeight: 1.45, marginBottom: 12,
          textShadow: "0 1px 6px rgba(0,0,0,0.95)",
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
});

/* ── Compact row card for the rest of the catalog ─────────────── */

/* Memoized — row only re-renders when its own model or its onSelect
   identity changes. `onSelect` is stable thanks to useCallback above. */
const ModelRow = memo(function ModelRow({
  model,
  onSelect,
}: {
  model: AiModel;
  onSelect: (id: AiModelId) => void;
}) {
  /* Localised hover state so the row reacts instantly without forcing the
     parent scroller to re-render. */
  const [hovered, setHovered] = useState(false);
  const handleClick = useCallback(() => {
    if (model.available) onSelect(model.id);
  }, [model.available, model.id, onSelect]);

  return (
    <motion.button
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6, scale: 0.985 }}
      transition={{ type: "spring", stiffness: 360, damping: 30, mass: 0.6 }}
      onClick={handleClick}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      whileTap={model.available ? { scale: 0.98 } : undefined}
      disabled={!model.available}
      style={{
        position: "relative",
        display: "flex", gap: 14,
        padding: 10,
        borderRadius: 20,
        border: `1.5px solid ${hovered && model.available ? "rgba(176,38,255,0.32)" : "rgba(255,255,255,0.07)"}`,
        background: "rgba(255,255,255,0.03)",
        cursor: model.available ? "pointer" : "not-allowed",
        opacity: model.available ? 1 : 0.55,
        textAlign: "left",
        width: "100%",
        /* Removes Android Chrome's 300ms double-tap delay on the row
           and lets the browser commit the click on first tap-up. */
        touchAction: "manipulation",
        /* Minimum tap-target size per WCAG 2.5.5 — ensures the row is
           always reachable even when the thumbnail/text would otherwise
           collapse below ~44px. */
        minHeight: 44,
        boxShadow: hovered && model.available
          ? `0 6px 20px rgba(0,0,0,0.45), 0 0 14px ${model.glow}`
          : "0 4px 14px rgba(0,0,0,0.35)",
        transition: "border 0.2s, box-shadow 0.25s",
        contain: "layout paint",
        ...GPU,
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
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.1)",
              color: "rgba(255,255,255,0.7)",
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
});

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
