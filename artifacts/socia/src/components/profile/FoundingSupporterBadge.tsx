/**
 * FoundingSupporterBadge.tsx
 *
 * Socia's "Prism Seal" — an original collectible badge system.
 *
 * NOT a checkmark. NOT a crown. NOT a star. NOT a shield.
 * Designed to be unlike anything on Facebook, TikTok, X, Instagram,
 * YouTube, Discord, or Reddit.
 *
 * Visual language: luxury watch bezel × gaming "Founder Edition" × holographic
 * membership card. An octagonal metallic frame enclosing a 4-armed crystal
 * prism mark — the "Prism Seal" — exclusive to Socia founding supporters.
 *
 * Tiers (collectible evolution):
 *   1 — Founding Supporter       Silver / Violet
 *   2 — Gold Founding Supporter  Gold / Amber
 *   3 — Elite Founding Supporter Platinum / Cyan
 *   4 — Legendary Founding       Black Chrome / Holographic
 */

import { useId } from "react";
import { motion } from "framer-motion";

export type SupporterTier = 1 | 2 | 3 | 4;

export const TIER_NAMES: Record<SupporterTier, string> = {
  1: "Founding Supporter",
  2: "Gold Founding Supporter",
  3: "Elite Founding Supporter",
  4: "Legendary Founding Supporter",
};

export const TIER_SHORT: Record<SupporterTier, string> = {
  1: "Founding",
  2: "Gold",
  3: "Elite",
  4: "Legendary",
};

/* ── Derive tier from any profile-like object ────────────────────── */
export function getSupporterTier(
  profile: Record<string, unknown> | null | undefined,
): SupporterTier | null {
  if (!profile) return null;
  const raw = profile["supporter_tier"];
  if (typeof raw === "number" && raw >= 1 && raw <= 4) return raw as SupporterTier;
  if (profile["is_owner"] === true || profile["isOwner"] === true) return 4;
  return null;
}

/* ── Per-tier color system ────────────────────────────────────────── */
interface Spec {
  bg1:      string;
  bg2:      string;
  bevel1:   string;
  bevel2:   string;
  mark:     string;
  shimmer:  string;
  glow:     string;
  ring:     string;
  holo?:    boolean;
}

const SPECS: Record<SupporterTier, Spec> = {
  1: {
    bg1:    "#a855f7",
    bg2:    "#1e1b4b",
    bevel1: "#e2e8f0",
    bevel2: "#475569",
    mark:   "#ffffff",
    shimmer:"rgba(255,255,255,0.30)",
    glow:   "rgba(168,85,247,0.42)",
    ring:   "linear-gradient(135deg,#a855f7 0%,#6366f1 50%,#ec4899 100%)",
  },
  2: {
    bg1:    "#fbbf24",
    bg2:    "#78350f",
    bevel1: "#fef9c3",
    bevel2: "#92400e",
    mark:   "#451a03",
    shimmer:"rgba(254,243,199,0.42)",
    glow:   "rgba(251,191,36,0.55)",
    ring:   "linear-gradient(135deg,#fef08a 0%,#f59e0b 50%,#92400e 100%)",
  },
  3: {
    bg1:    "#38bdf8",
    bg2:    "#0c4a6e",
    bevel1: "#f0f9ff",
    bevel2: "#0369a1",
    mark:   "#ffffff",
    shimmer:"rgba(224,242,254,0.38)",
    glow:   "rgba(56,189,248,0.48)",
    ring:   "linear-gradient(135deg,#bae6fd 0%,#38bdf8 50%,#0369a1 100%)",
  },
  4: {
    bg1:    "#3b0764",
    bg2:    "#0a0a14",
    bevel1: "#fde68a",
    bevel2: "#78350f",
    mark:   "#fbbf24",
    shimmer:"rgba(251,191,36,0.38)",
    glow:   "rgba(168,85,247,0.70)",
    ring:   "conic-gradient(from 0deg,#a855f7,#3b82f6,#ec4899,#fbbf24,#a855f7)",
    holo:   true,
  },
};

/* Flat-top octagon vertex strings (center 12,12) */
const OCT_OUTER = "22.6,7.6 16.4,1.4 7.6,1.4 1.4,7.6 1.4,16.4 7.6,22.6 16.4,22.6 22.6,16.4";
const OCT_BODY  = "21.2,8.2 15.8,2.8 8.2,2.8 2.8,8.2 2.8,15.8 8.2,21.2 15.8,21.2 21.2,15.8";

/* 4-armed crystal "Prism Seal" inner mark */
const PRISM = "12,6 13.5,10.5 18,12 13.5,13.5 12,18 10.5,13.5 6,12 10.5,10.5";

/* ── Badge component ─────────────────────────────────────────────── */
export function FoundingSupporterBadge({
  tier = 1,
  size = 20,
  showGlow = true,
}: {
  tier?: SupporterTier;
  size?: number;
  showGlow?: boolean;
}) {
  const raw = useId();
  const uid = raw.replace(/[^a-z0-9]/gi, "x");
  const s   = SPECS[tier];

  return (
    <motion.span
      title={TIER_NAMES[tier]}
      aria-label={TIER_NAMES[tier]}
      style={{ display: "inline-flex", flexShrink: 0, width: size, height: size }}
      {...(showGlow && {
        animate: {
          filter: [
            `drop-shadow(0 0 ${Math.round(size * 0.14)}px ${s.glow})`,
            `drop-shadow(0 0 ${Math.round(size * 0.30)}px ${s.glow})`,
            `drop-shadow(0 0 ${Math.round(size * 0.14)}px ${s.glow})`,
          ],
        },
        transition: { duration: 3.8, repeat: Infinity, ease: "easeInOut" },
      })}
    >
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" overflow="visible">
        <defs>
          {/* Badge body fill — radial gradient from top-left warmth */}
          <radialGradient id={`${uid}bg`} cx="36%" cy="28%" r="74%">
            <stop offset="0%"   stopColor={s.bg1} />
            <stop offset="100%" stopColor={s.bg2} />
          </radialGradient>

          {/* Metallic bevel ring */}
          <linearGradient id={`${uid}bv`} x1="15%" y1="0%" x2="85%" y2="100%">
            <stop offset="0%"   stopColor={s.bevel1} />
            <stop offset="40%"  stopColor={s.bevel1} stopOpacity="0.75" />
            <stop offset="60%"  stopColor={s.bevel2} stopOpacity="0.75" />
            <stop offset="100%" stopColor={s.bevel2} />
          </linearGradient>

          {/* Glass highlight — top-left radial bloom */}
          <radialGradient id={`${uid}gl`} cx="30%" cy="20%" r="55%">
            <stop offset="0%"   stopColor="rgba(255,255,255,0.60)" />
            <stop offset="100%" stopColor="rgba(255,255,255,0)"    />
          </radialGradient>

          {/* Shimmer stripe — diagonal light sweep */}
          <linearGradient id={`${uid}sh`} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%"   stopColor="rgba(255,255,255,0)" />
            <stop offset="42%"  stopColor={s.shimmer}           />
            <stop offset="58%"  stopColor={s.shimmer}           />
            <stop offset="100%" stopColor="rgba(255,255,255,0)" />
          </linearGradient>

          {/* Tier 4 holographic stroke gradient */}
          {tier === 4 && (
            <linearGradient id={`${uid}hl`} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%"   stopColor="#a855f7" />
              <stop offset="25%"  stopColor="#3b82f6" />
              <stop offset="50%"  stopColor="#ec4899" />
              <stop offset="75%"  stopColor="#fbbf24" />
              <stop offset="100%" stopColor="#a855f7" />
            </linearGradient>
          )}

          {/* Clip region = badge body octagon */}
          <clipPath id={`${uid}cl`}>
            <polygon points={OCT_BODY} />
          </clipPath>
        </defs>

        {/* ── Layer 1: Outer metallic bevel octagon ─────────────────── */}
        <polygon points={OCT_OUTER} fill={`url(#${uid}bv)`} />

        {/* ── Layer 2: Badge body ────────────────────────────────────── */}
        <polygon points={OCT_BODY} fill={`url(#${uid}bg)`} />

        {/* ── Layer 3: Inner depth ring (subtle white edge highlight) ── */}
        <polygon
          points={OCT_BODY}
          fill="none"
          stroke="rgba(255,255,255,0.18)"
          strokeWidth="0.7"
        />

        {/* ── Layer 4: The Prism Seal — 4-armed crystal mark ─────────── */}
        <polygon points={PRISM} fill={s.mark} opacity="0.93" />

        {/* Tier 2+: Center jewel (fills the intersection, pops the mark) */}
        {tier >= 2 && (
          <circle cx="12" cy="12" r="1.8" fill={s.mark} opacity="0.97" />
        )}

        {/* Tier 3+: Intercardinal accent dots — compass rose accent */}
        {tier >= 3 && (
          <g fill={s.mark} opacity="0.68">
            <circle cx="12"   cy="7.3"  r="0.72" />
            <circle cx="16.7" cy="12"   r="0.72" />
            <circle cx="12"   cy="16.7" r="0.72" />
            <circle cx="7.3"  cy="12"   r="0.72" />
          </g>
        )}

        {/* Tier 4: Holographic inner ring + corner constellation gems */}
        {tier === 4 && (
          <>
            <polygon
              points={OCT_BODY}
              fill="none"
              stroke={`url(#${uid}hl)`}
              strokeWidth="1.4"
              opacity="0.55"
            />
            {/* Corner gems at octagon vertices */}
            <circle cx="21.2" cy="8.2"  r="0.9" fill="#fbbf24" opacity="0.92" />
            <circle cx="15.8" cy="2.8"  r="0.9" fill="#ec4899" opacity="0.92" />
            <circle cx="8.2"  cy="2.8"  r="0.9" fill="#a855f7" opacity="0.92" />
            <circle cx="2.8"  cy="8.2"  r="0.9" fill="#3b82f6" opacity="0.92" />
            <circle cx="2.8"  cy="15.8" r="0.9" fill="#fbbf24" opacity="0.92" />
            <circle cx="8.2"  cy="21.2" r="0.9" fill="#ec4899" opacity="0.92" />
            <circle cx="15.8" cy="21.2" r="0.9" fill="#a855f7" opacity="0.92" />
            <circle cx="21.2" cy="15.8" r="0.9" fill="#3b82f6" opacity="0.92" />
          </>
        )}

        {/* ── Layer 5: Glass bloom (clipped) ────────────────────────── */}
        <ellipse
          cx="9.5" cy="8"
          rx="5.5"  ry="4.2"
          fill={`url(#${uid}gl)`}
          clipPath={`url(#${uid}cl)`}
        />

        {/* ── Layer 6: Shimmer sweep (CSS animation, pauses between sweeps) */}
        <rect
          x="-20" y="0" width="10" height="24"
          fill={`url(#${uid}sh)`}
          clipPath={`url(#${uid}cl)`}
          className="prism-seal-shimmer"
          style={{ transformOrigin: "12px 12px", transform: "rotate(20deg)" }}
        />
      </svg>
    </motion.span>
  );
}

/* ── Supporter profile avatar ring ───────────────────────────────── */
export function SupporterProfileRing({
  tier,
  size = 88,
  children,
}: {
  tier?: SupporterTier | null;
  size?: number;
  children: React.ReactNode;
}) {
  if (!tier) return <>{children}</>;

  const s = SPECS[tier];

  return (
    <div
      className={tier === 4 ? "legendary-ring" : undefined}
      style={{
        padding: 3,
        borderRadius: "50%",
        background: s.ring,
        flexShrink: 0,
        width:  size + 6,
        height: size + 6,
      }}
    >
      {children}
    </div>
  );
}

/* ── Inline tier label pill (for profile pages) ─────────────────── */
export function SupporterLabel({ tier }: { tier: SupporterTier }) {
  const colors: Record<SupporterTier, { bg: string; text: string; border: string }> = {
    1: { bg: "rgba(168,85,247,0.12)",   text: "#c084fc", border: "rgba(168,85,247,0.28)" },
    2: { bg: "rgba(251,191,36,0.12)",   text: "#fbbf24", border: "rgba(251,191,36,0.28)" },
    3: { bg: "rgba(56,189,248,0.12)",   text: "#38bdf8", border: "rgba(56,189,248,0.28)" },
    4: { bg: "rgba(251,191,36,0.08)",   text: "#fde68a", border: "rgba(251,191,36,0.35)" },
  };
  const c = colors[tier];
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wide"
      style={{ background: c.bg, color: c.text, border: `1px solid ${c.border}` }}
    >
      <FoundingSupporterBadge tier={tier} size={11} showGlow={false} />
      {TIER_SHORT[tier]}
    </span>
  );
}
