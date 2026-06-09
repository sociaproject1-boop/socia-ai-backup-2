/**
 * PresetLibrary — compact AI Preset Studio section embedded in CreateHub.
 *
 * Behaviour:
 *  • Fetches presets from /api/presets (public, no auth required).
 *  • Displays 9 curated category tabs above a horizontal card row.
 *  • Tapping a card opens a preview sheet:
 *      – Guests   : see description + "Sign In to Use" CTA.
 *      – Auth users: "Use Preset" navigates to /studio/:presetId.
 */
import { useState } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  Wand2, Flame, Star, Sparkles, Crown, Zap,
  X, ArrowRight, Lock, ChevronRight,
} from "lucide-react";
import { usePresets, type ClientPreset } from "@/lib/presetClient";
import { useAppStore } from "@/lib/store";
import { useLoginGate } from "@/lib/useLoginGate";

/* ── Category definitions ────────────────────────────────────────────────── */
interface CategoryDef {
  label: string;
  emoji: string;
  /** API category strings to match (substring, case-insensitive) */
  match: string[];
  gradient: string;
  accent: string;
}

const CATEGORIES: CategoryDef[] = [
  {
    label: "Viral TikTok",
    emoji: "🎵",
    match: ["viral tiktok", "tiktok"],
    gradient: "linear-gradient(135deg,#f97316,#ef4444)",
    accent: "#f97316",
  },
  {
    label: "Product Photo",
    emoji: "📸",
    match: ["luxury product", "apple commercial", "ecommerce conversion", "studio lighting"],
    gradient: "linear-gradient(135deg,#a855f7,#7c3aed)",
    accent: "#a855f7",
  },
  {
    label: "Fashion",
    emoji: "👗",
    match: ["fashion editorial", "streetwear", "nike style", "runway"],
    gradient: "linear-gradient(135deg,#ec4899,#be185d)",
    accent: "#ec4899",
  },
  {
    label: "Anime",
    emoji: "⚡",
    match: ["anime style", "anime"],
    gradient: "linear-gradient(135deg,#6366f1,#a855f7)",
    accent: "#818cf8",
  },
  {
    label: "Cinematic",
    emoji: "🎬",
    match: ["cinematic film", "drone cinematic", "cinematic"],
    gradient: "linear-gradient(135deg,#1e3a5f,#3b82f6)",
    accent: "#3b82f6",
  },
  {
    label: "Portrait",
    emoji: "🧑‍🎨",
    match: ["hyper realistic", "ai influencer", "beauty influencer"],
    gradient: "linear-gradient(135deg,#f59e0b,#d97706)",
    accent: "#f59e0b",
  },
  {
    label: "Social Ad",
    emoji: "📣",
    match: ["ecommerce conversion", "viral unboxing", "hand model"],
    gradient: "linear-gradient(135deg,#10b981,#059669)",
    accent: "#10b981",
  },
  {
    label: "Thumbnail",
    emoji: "🖼️",
    match: ["food commercial", "korean aesthetic", "flat lay"],
    gradient: "linear-gradient(135deg,#0ea5e9,#0284c7)",
    accent: "#0ea5e9",
  },
  {
    label: "E-commerce",
    emoji: "🛍️",
    match: ["dark luxury", "jewelry macro", "luxury perfume", "floating"],
    gradient: "linear-gradient(135deg,#8b5cf6,#c026d3)",
    accent: "#c026d3",
  },
];

/* ── Badge config ────────────────────────────────────────────────────────── */
const BADGE: Record<string, { bg: string; color: string; Icon: typeof Flame }> = {
  Hot:        { bg: "rgba(239,68,68,0.90)",  color: "#fff", Icon: Flame    },
  New:        { bg: "rgba(34,197,94,0.90)",  color: "#fff", Icon: Sparkles },
  "Top Pick": { bg: "rgba(168,85,247,0.90)", color: "#fff", Icon: Star     },
  Pro:        { bg: "rgba(251,191,36,0.95)", color: "#000", Icon: Crown    },
  Quick:      { bg: "rgba(34,211,238,0.90)", color: "#000", Icon: Zap      },
};

/* ── Helpers ─────────────────────────────────────────────────────────────── */
function matchCategory(preset: ClientPreset, cat: CategoryDef): boolean {
  const hay = (preset.category + " " + preset.title + " " + (preset.tags ?? []).join(" ")).toLowerCase();
  return cat.match.some((m) => hay.includes(m.toLowerCase()));
}

/* ── Preset card ─────────────────────────────────────────────────────────── */
function PresetCard({
  preset,
  catGradient,
  onTap,
}: {
  preset: ClientPreset;
  catGradient: string;
  onTap: () => void;
}) {
  const bg = `linear-gradient(145deg, ${preset.thumb.from}, ${preset.thumb.to})`;
  const badgeCfg = preset.badge ? BADGE[preset.badge] : null;
  const BadgeIcon = badgeCfg?.Icon;

  return (
    <motion.button
      whileTap={{ scale: 0.94 }}
      onClick={onTap}
      style={{
        width: 130,
        height: 170,
        flexShrink: 0,
        borderRadius: 16,
        overflow: "hidden",
        background: bg,
        border: "1px solid rgba(255,255,255,0.09)",
        position: "relative",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "10px 10px 10px",
        cursor: "pointer",
        textAlign: "left",
      }}
    >
      {/* Subtle gradient overlay */}
      <div style={{
        position: "absolute", inset: 0,
        background: "linear-gradient(180deg, rgba(0,0,0,0.08) 0%, rgba(0,0,0,0.52) 100%)",
        pointerEvents: "none",
      }} />

      {/* Top: badge */}
      <div style={{ position: "relative", zIndex: 1, display: "flex", justifyContent: "flex-end" }}>
        {badgeCfg && BadgeIcon && (
          <span style={{
            display: "flex", alignItems: "center", gap: 3,
            background: badgeCfg.bg, color: badgeCfg.color,
            borderRadius: 6, padding: "2px 6px",
            fontSize: 9, fontWeight: 700, letterSpacing: "0.04em",
          }}>
            <BadgeIcon style={{ width: 8, height: 8 }} />
            {preset.badge}
          </span>
        )}
      </div>

      {/* Center: emoji */}
      <div style={{
        position: "relative", zIndex: 1,
        fontSize: 36, textAlign: "center", lineHeight: 1,
        filter: "drop-shadow(0 2px 8px rgba(0,0,0,0.4))",
        userSelect: "none",
      }}>
        {preset.thumb.emoji}
      </div>

      {/* Bottom: title + kind pill */}
      <div style={{ position: "relative", zIndex: 1 }}>
        <p style={{
          fontSize: 11.5, fontWeight: 700, color: "#fff",
          lineHeight: 1.25, marginBottom: 5,
          overflow: "hidden", display: "-webkit-box",
          WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
          textShadow: "0 1px 4px rgba(0,0,0,0.6)",
        }}>
          {preset.title}
        </p>
        <span style={{
          fontSize: 9, fontWeight: 600,
          color: "rgba(255,255,255,0.7)",
          background: "rgba(0,0,0,0.35)",
          borderRadius: 4, padding: "2px 5px",
          textTransform: "uppercase", letterSpacing: "0.06em",
        }}>
          {preset.kind === "video" ? "🎬 Video" : "🖼 Image"}
        </span>
      </div>
    </motion.button>
  );
}

/* ── Preview / use sheet ─────────────────────────────────────────────────── */
function PresetSheet({
  preset,
  catGradient,
  isAuthenticated,
  onClose,
  onUse,
}: {
  preset: ClientPreset | null;
  catGradient: string;
  isAuthenticated: boolean;
  onClose: () => void;
  onUse: (p: ClientPreset) => void;
}) {
  const bg = preset
    ? `linear-gradient(145deg, ${preset.thumb.from}, ${preset.thumb.to})`
    : "none";

  return (
    <AnimatePresence>
      {preset && (
        <>
          {/* Backdrop */}
          <motion.div
            key="ps-bg"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={onClose}
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", zIndex: 200 }}
          />

          {/* Sheet */}
          <motion.div
            key="ps-sheet"
            initial={{ y: "100%", opacity: 0.7 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: "100%", opacity: 0 }}
            transition={{ type: "spring", stiffness: 480, damping: 40 }}
            style={{
              position: "fixed", bottom: 0, left: "50%",
              transform: "translateX(-50%)",
              width: "100%", maxWidth: 480,
              background: "#0e0e12",
              borderTop: "1px solid rgba(255,255,255,0.09)",
              borderRadius: "22px 22px 0 0",
              zIndex: 201,
              paddingBottom: "calc(env(safe-area-inset-bottom,0px) + 20px)",
            }}
          >
            {/* Drag handle */}
            <div style={{ display: "flex", justifyContent: "center", padding: "12px 0 6px" }}>
              <div style={{ width: 38, height: 4, borderRadius: 2, background: "rgba(255,255,255,0.14)" }} />
            </div>

            {/* Hero gradient strip */}
            <div style={{
              margin: "0 16px 16px",
              borderRadius: 16,
              height: 110,
              background: bg,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 52, position: "relative", overflow: "hidden",
            }}>
              <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg,rgba(0,0,0,0.05),rgba(0,0,0,0.35))" }} />
              <span style={{ position: "relative", filter: "drop-shadow(0 2px 12px rgba(0,0,0,0.5))" }}>
                {preset.thumb.emoji}
              </span>
            </div>

            {/* Meta */}
            <div style={{ padding: "0 20px" }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 6 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 17, fontWeight: 800, color: "#fff", lineHeight: 1.25, marginBottom: 4 }}>
                    {preset.title}
                  </p>
                  <p style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.42)", textTransform: "uppercase", letterSpacing: "0.09em" }}>
                    {preset.category}
                  </p>
                </div>
                <motion.button
                  whileTap={{ scale: 0.88 }}
                  onClick={onClose}
                  style={{
                    background: "rgba(255,255,255,0.08)", border: "none",
                    borderRadius: "50%", width: 30, height: 30,
                    display: "grid", placeItems: "center", cursor: "pointer", flexShrink: 0,
                  }}
                >
                  <X style={{ width: 14, height: 14, color: "rgba(255,255,255,0.6)" }} />
                </motion.button>
              </div>

              <p style={{ fontSize: 13.5, color: "rgba(255,255,255,0.6)", lineHeight: 1.55, marginBottom: 14 }}>
                {preset.description}
              </p>

              {/* Tags */}
              {preset.tags && preset.tags.length > 0 && (
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 18 }}>
                  {preset.tags.map((t) => (
                    <span key={t} style={{
                      fontSize: 10.5, fontWeight: 600, padding: "3px 8px",
                      background: "rgba(255,255,255,0.07)",
                      border: "1px solid rgba(255,255,255,0.1)",
                      borderRadius: 6, color: "rgba(255,255,255,0.5)",
                      textTransform: "lowercase",
                    }}>#{t}</span>
                  ))}
                </div>
              )}

              {/* Spec row */}
              <div style={{
                display: "flex", gap: 8, marginBottom: 20,
              }}>
                <span style={{
                  fontSize: 10.5, fontWeight: 600,
                  padding: "4px 10px",
                  background: "rgba(255,255,255,0.06)",
                  border: "1px solid rgba(255,255,255,0.09)",
                  borderRadius: 8, color: "rgba(255,255,255,0.5)",
                }}>
                  {preset.kind === "video" ? "🎬 Video" : "🖼 Image"}
                </span>
                <span style={{
                  fontSize: 10.5, fontWeight: 600,
                  padding: "4px 10px",
                  background: "rgba(255,255,255,0.06)",
                  border: "1px solid rgba(255,255,255,0.09)",
                  borderRadius: 8, color: "rgba(255,255,255,0.5)",
                }}>
                  {preset.defaultAspect}
                </span>
                {preset.requiresUploadedImage && (
                  <span style={{
                    fontSize: 10.5, fontWeight: 600,
                    padding: "4px 10px",
                    background: "rgba(255,255,255,0.06)",
                    border: "1px solid rgba(255,255,255,0.09)",
                    borderRadius: 8, color: "rgba(255,255,255,0.5)",
                  }}>
                    📎 Needs photo
                  </span>
                )}
              </div>

              {/* CTA */}
              {isAuthenticated ? (
                <motion.button
                  whileTap={{ scale: 0.96 }}
                  onClick={() => onUse(preset)}
                  style={{
                    width: "100%", height: 50, borderRadius: 14,
                    background: "linear-gradient(135deg,#a855f7,#ec4899)",
                    border: "none", cursor: "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                    fontSize: 15, fontWeight: 700, color: "#fff",
                    boxShadow: "0 4px 20px rgba(168,85,247,0.4)",
                  }}
                >
                  <Wand2 style={{ width: 18, height: 18 }} />
                  Use This Preset
                  <ArrowRight style={{ width: 16, height: 16, opacity: 0.7 }} />
                </motion.button>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <div style={{
                    display: "flex", alignItems: "center", gap: 8, padding: "10px 14px",
                    background: "rgba(168,85,247,0.08)",
                    border: "1px solid rgba(168,85,247,0.2)",
                    borderRadius: 12,
                  }}>
                    <Lock style={{ width: 14, height: 14, color: "#a855f7", flexShrink: 0 }} />
                    <p style={{ fontSize: 12.5, color: "rgba(255,255,255,0.55)", lineHeight: 1.4 }}>
                      Sign in to generate with this preset — it takes 30 seconds.
                    </p>
                  </div>
                  <motion.button
                    whileTap={{ scale: 0.96 }}
                    onClick={() => onUse(preset)}
                    style={{
                      width: "100%", height: 50, borderRadius: 14,
                      background: "linear-gradient(135deg,#a855f7,#ec4899)",
                      border: "none", cursor: "pointer",
                      display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                      fontSize: 15, fontWeight: 700, color: "#fff",
                      boxShadow: "0 4px 20px rgba(168,85,247,0.38)",
                    }}
                  >
                    <Sparkles style={{ width: 16, height: 16 }} />
                    Sign In to Use
                    <ChevronRight style={{ width: 16, height: 16, opacity: 0.7 }} />
                  </motion.button>
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

/* ── Main export ─────────────────────────────────────────────────────────── */
export function PresetLibrary() {
  const [, navigate]       = useLocation();
  const isAuthenticated    = useAppStore((s) => s.isAuthenticated);
  const { requireLogin }   = useLoginGate();
  const { presets, loading } = usePresets();

  const [activeCat, setActiveCat] = useState(0);
  const [sheet, setSheet]         = useState<ClientPreset | null>(null);

  const cat = CATEGORIES[activeCat];

  const visible = (presets ?? []).filter((p) => matchCategory(p, cat));

  const handleUse = (p: ClientPreset) => {
    setSheet(null);
    if (!requireLogin("AI Preset Studio")) return;
    navigate(`/studio/${p.id}`);
  };

  return (
    <>
      <section style={{ paddingBottom: 4 }}>
        {/* ── Section header ── */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "20px 16px 12px",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{
              width: 28, height: 28, borderRadius: 8,
              background: "linear-gradient(135deg,#a855f7,#ec4899)",
              display: "grid", placeItems: "center",
            }}>
              <Wand2 style={{ width: 14, height: 14, color: "#fff" }} />
            </div>
            <div>
              <h2 style={{ fontSize: 16, fontWeight: 800, color: "#fff", lineHeight: 1.1 }}>
                AI Preset Studio
              </h2>
              <p style={{ fontSize: 10.5, color: "rgba(255,255,255,0.38)", letterSpacing: "0.02em" }}>
                1-tap generation templates
              </p>
            </div>
          </div>
          <motion.button
            whileTap={{ scale: 0.92 }}
            onClick={() => {
              if (!requireLogin("AI Preset Studio")) return;
              navigate("/studio");
            }}
            style={{
              display: "flex", alignItems: "center", gap: 3,
              background: "none", border: "none", cursor: "pointer",
              fontSize: 12, fontWeight: 600, color: "#a855f7",
            }}
          >
            Explore all
            <ArrowRight style={{ width: 13, height: 13 }} />
          </motion.button>
        </div>

        {/* ── Category chips — horizontal scroll ── */}
        <div style={{
          display: "flex", gap: 8, overflowX: "auto", padding: "0 16px 12px",
          scrollbarWidth: "none",
        }}
          className="hide-scrollbar"
        >
          {CATEGORIES.map((c, i) => {
            const active = i === activeCat;
            return (
              <motion.button
                key={c.label}
                whileTap={{ scale: 0.93 }}
                onClick={() => setActiveCat(i)}
                style={{
                  flexShrink: 0,
                  display: "flex", alignItems: "center", gap: 5,
                  padding: "6px 13px",
                  borderRadius: 20,
                  border: active ? "none" : "1px solid rgba(255,255,255,0.1)",
                  background: active ? c.gradient : "rgba(255,255,255,0.05)",
                  cursor: "pointer",
                  fontSize: 12, fontWeight: active ? 700 : 500,
                  color: active ? "#fff" : "rgba(255,255,255,0.5)",
                  transition: "all 0.18s ease",
                  boxShadow: active ? `0 2px 12px ${c.accent}55` : "none",
                }}
              >
                <span style={{ fontSize: 13 }}>{c.emoji}</span>
                {c.label}
              </motion.button>
            );
          })}
        </div>

        {/* ── Preset cards — horizontal scroll ── */}
        {loading ? (
          /* Skeleton row */
          <div style={{ display: "flex", gap: 10, padding: "4px 16px 16px", overflowX: "hidden" }}>
            {[1, 2, 3].map((k) => (
              <div key={k} style={{
                width: 130, height: 170, flexShrink: 0, borderRadius: 16,
                background: "rgba(255,255,255,0.06)",
              }}
                className="shimmer"
              />
            ))}
          </div>
        ) : visible.length === 0 ? (
          <div style={{ padding: "12px 16px 16px", textAlign: "center" }}>
            <p style={{ fontSize: 13, color: "rgba(255,255,255,0.3)" }}>No presets yet in this category.</p>
          </div>
        ) : (
          <div
            style={{ display: "flex", gap: 10, padding: "4px 16px 16px", overflowX: "auto" }}
            className="hide-scrollbar"
          >
            {visible.map((p) => (
              <PresetCard
                key={p.id}
                preset={p}
                catGradient={cat.gradient}
                onTap={() => setSheet(p)}
              />
            ))}

            {/* "View all in category" tail card */}
            <motion.button
              whileTap={{ scale: 0.94 }}
              onClick={() => {
                if (!requireLogin("AI Preset Studio")) return;
                navigate("/studio");
              }}
              style={{
                width: 80, height: 170, flexShrink: 0, borderRadius: 16,
                background: "rgba(255,255,255,0.04)",
                border: "1px dashed rgba(255,255,255,0.12)",
                display: "flex", flexDirection: "column",
                alignItems: "center", justifyContent: "center", gap: 8,
                cursor: "pointer",
              }}
            >
              <div style={{
                width: 34, height: 34, borderRadius: "50%",
                background: "rgba(168,85,247,0.15)",
                display: "grid", placeItems: "center",
              }}>
                <ArrowRight style={{ width: 16, height: 16, color: "#a855f7" }} />
              </div>
              <span style={{ fontSize: 10, fontWeight: 600, color: "rgba(255,255,255,0.35)", textAlign: "center" }}>
                View all
              </span>
            </motion.button>
          </div>
        )}

        {/* ── Divider ── */}
        <div style={{ height: 1, margin: "0 16px 8px", background: "rgba(255,255,255,0.06)" }} />
      </section>

      {/* ── Preview sheet (portal-less — stacked inside scroll parent) ── */}
      <PresetSheet
        preset={sheet}
        catGradient={cat.gradient}
        isAuthenticated={isAuthenticated}
        onClose={() => setSheet(null)}
        onUse={handleUse}
      />
    </>
  );
}
