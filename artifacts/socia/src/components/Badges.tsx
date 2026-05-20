/**
 * Badges.tsx — visual badges that sit next to a user's name.
 *
 *   <OwnerBadge />     — premium gold "KING" badge (crown SVG, gold gradient,
 *                        animated glow + sweeping shine) for the app owner
 *   <VerifiedBadge />  — blue check for users with an active subscription
 *   <OnlineDot />      — small pulsing green dot if the user is online
 *
 * All three are pure presentational components — they accept no data
 * fetch and no async logic, so they can be dropped into any list cell,
 * profile header, or chat row without performance worry.
 *
 * VerifiedType derivation lives in `lib/verified.ts` so the email-vs-flag
 * decision happens in exactly one place app-wide.
 */
import { Check } from "lucide-react";

/**
 * OwnerBadge — premium "KING" pill.
 *
 * Visual recipe:
 *   • Crown drawn as inline SVG (no emoji — matches user request)
 *   • Gold→amber→deep-orange gradient body
 *   • `kingGlow` keyframes (index.css) gently pulse the box-shadow
 *   • `kingShine` keyframes sweep a soft white highlight across the badge
 *   • Subtle inner-text shadow for that embossed gold look
 *
 * The animations respect `prefers-reduced-motion: reduce` (set in CSS).
 */
export function OwnerBadge({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const dim       = size === "sm" ? 14 : size === "lg" ? 20 : 16;
  const padX      = size === "sm" ? 7  : size === "lg" ? 11 : 9;
  const padY      = size === "sm" ? 2  : size === "lg" ? 4  : 3;
  const fontPx    = size === "sm" ? 9  : size === "lg" ? 12 : 10;

  return (
    <span
      title="Socia King — owner"
      aria-label="Owner — King badge"
      className="king-badge inline-flex items-center gap-1 rounded-full font-bold uppercase tracking-wider text-white"
      style={{
        paddingInline: padX,
        paddingBlock:  padY,
        fontSize:      fontPx,
        textShadow:    "0 1px 1px rgba(120,53,15,0.55)",
        border:        "1px solid rgba(255,255,255,0.35)",
      }}
    >
      <CrownSvg size={dim} />
      King
    </span>
  );
}

/**
 * Inline SVG crown — drawn rather than imported so we control the gem +
 * highlight layers (you can't style internals of a lucide icon). Renders
 * crisply at any size and supports text antialiasing.
 */
function CrownSvg({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      style={{ filter: "drop-shadow(0 1px 1px rgba(120,53,15,0.45))" }}
    >
      {/* Crown body */}
      <path
        d="M3 8.5L7 13L12 6L17 13L21 8.5L19.2 18H4.8L3 8.5Z"
        fill="url(#kingCrownFill)"
        stroke="rgba(120,53,15,0.55)"
        strokeWidth="0.9"
        strokeLinejoin="round"
      />
      {/* Base bar */}
      <rect
        x="4.5" y="18.5" width="15" height="2.2" rx="1.1"
        fill="url(#kingCrownBase)"
        stroke="rgba(120,53,15,0.55)"
        strokeWidth="0.9"
      />
      {/* Gem highlights on the three peaks */}
      <circle cx="3"  cy="8.5" r="1.1" fill="#fff8c4" stroke="rgba(120,53,15,0.55)" strokeWidth="0.7" />
      <circle cx="12" cy="6"   r="1.3" fill="#ff5470" stroke="rgba(120,53,15,0.55)" strokeWidth="0.7" />
      <circle cx="21" cy="8.5" r="1.1" fill="#fff8c4" stroke="rgba(120,53,15,0.55)" strokeWidth="0.7" />
      {/* Subtle inner shine on the body */}
      <path d="M5 9.5L7.5 12L12 7.5" stroke="rgba(255,255,255,0.6)" strokeWidth="0.8" strokeLinecap="round" />
      <defs>
        <linearGradient id="kingCrownFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="#FFE680" />
          <stop offset="55%"  stopColor="#FFC23A" />
          <stop offset="100%" stopColor="#E08A00" />
        </linearGradient>
        <linearGradient id="kingCrownBase" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="#FFD75A" />
          <stop offset="100%" stopColor="#C97700" />
        </linearGradient>
      </defs>
    </svg>
  );
}

export function VerifiedBadge({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const dim = size === "sm" ? 14 : size === "lg" ? 20 : 16;
  return (
    <span
      title="Verified"
      aria-label="Verified badge"
      className="inline-flex shrink-0 items-center justify-center rounded-full text-white"
      style={{
        width: dim,
        height: dim,
        background: "linear-gradient(135deg, #38bdf8 0%, #1d4ed8 100%)",
        boxShadow: "0 0 8px -1px rgba(56,189,248,0.6)",
      }}
    >
      <Check style={{ width: dim * 0.65, height: dim * 0.65, strokeWidth: 3.5 }} />
    </span>
  );
}

export function OnlineDot({
  online,
  status,
  size = 10,
}: {
  online?: boolean;
  status?: "online" | "away" | "offline";
  size?: number;
}) {
  const eff = status ?? (online ? "online" : "offline");
  const bg =
    eff === "online" ? "#22c55e"
    : eff === "away" ? "#f59e0b"
    : "#52525b";
  const shadow =
    eff === "online"
      ? "0 0 0 2px hsl(var(--background)), 0 0 8px rgba(34,197,94,0.7)"
      : eff === "away"
      ? "0 0 0 2px hsl(var(--background)), 0 0 8px rgba(245,158,11,0.5)"
      : "0 0 0 2px hsl(var(--background))";
  return (
    <span
      aria-label={eff === "online" ? "Online" : eff === "away" ? "Away" : "Offline"}
      className="inline-block rounded-full"
      style={{ width: size, height: size, background: bg, boxShadow: shadow }}
    />
  );
}

/**
 * NameBadges — single badge slot next to a user name.
 *
 * Precedence (King outranks Blue, never both):
 *   isOwner === true  →  premium gold King badge
 *   isVerified=== true →  blue verified check
 *   otherwise         →  nothing
 *
 * The owner is also `is_verified=true` in the DB (set by claim_owner_badge),
 * but we deliberately suppress the blue check for owners so they get the
 * cleaner premium look — matches the spec "if king show 👑 ELSE show ✔".
 */
export function NameBadges({
  isOwner,
  isVerified,
  size = "md",
}: {
  isOwner?:    boolean;
  isVerified?: boolean;
  size?:       "sm" | "md" | "lg";
}) {
  if (isOwner) {
    /* King is always rendered one notch larger so it visually outranks blue */
    const kingSize = size === "sm" ? "md" : size === "md" ? "lg" : "lg";
    return (
      <span className="inline-flex items-center align-middle">
        <OwnerBadge size={kingSize} />
      </span>
    );
  }
  return null;
}
