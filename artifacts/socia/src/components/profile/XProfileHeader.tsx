/**
 * XProfileHeader.tsx — X (Twitter) identical profile header.
 *
 * Used by BOTH Profile.tsx (own) and UserProfile.tsx (others).
 * Covers: top bar, cover image, avatar, action buttons, identity section,
 * followers row. Tabs are handled separately by ProfileTabs.
 */
import { useState } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, Search, MoreHorizontal, MapPin, Globe, Calendar } from "lucide-react";
import { useLocation } from "wouter";
import type { SupporterTier } from "@/components/profile/FoundingSupporterBadge";
import { SupporterProfileRing } from "@/components/profile/FoundingSupporterBadge";
import { NameBadges } from "@/components/Badges";

/* ── Helpers ──────────────────────────────────────────────────────────── */
function compact(n: number) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
  return String(n);
}

function joinedLabel(isoStr?: string | null) {
  if (!isoStr) return null;
  const d = new Date(isoStr);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

/* ── Small circle icon button (···, 🔔, 🔍) ───────────────────────────── */
function CircleBtn({
  children, onClick, size = 34,
}: { children: React.ReactNode; onClick?: () => void; size?: number }) {
  return (
    <motion.button
      whileTap={{ scale: 0.88 }}
      onClick={onClick}
      className="grid place-items-center rounded-full text-white flex-shrink-0"
      style={{ width: size, height: size, border: "1px solid rgba(255,255,255,0.22)" }}
    >
      {children}
    </motion.button>
  );
}

/* ── Props ─────────────────────────────────────────────────────────────── */
export interface XProfileHeaderProps {
  /* identity */
  coverUrl?: string | null;
  avatarUrl?: string | null;
  name: string;
  handle: string;
  bio?: string | null;
  website?: string | null;
  location?: string | null;
  joinedAt?: string | null;
  followers: number;
  following: number;
  postCount?: number | null;
  isVerified?: boolean;
  isOwner?: boolean;
  supporterTier?: SupporterTier | null;
  hasActivePulse?: boolean;

  /* view mode */
  isOwnProfile: boolean;

  /* own-profile callbacks */
  onEditProfile?: () => void;
  onCreatorDash?: () => void;
  onSettings?: () => void;

  /* other-profile state */
  followed?: boolean;
  followWorking?: boolean;
  onFollow?: () => void;
  onMessage?: () => void;
  onSubscribe?: () => void;
  onMorePress?: () => void;
  onStars?: () => void;

  /* shared */
  onFollowersClick?: () => void;
  onFollowingClick?: () => void;
  onAvatarClick?: () => void;
  onSearch?: () => void;
}

export function XProfileHeader({
  coverUrl,
  avatarUrl,
  name,
  handle,
  bio,
  website,
  location,
  joinedAt,
  followers,
  following,
  postCount,
  isVerified,
  isOwner,
  supporterTier,
  hasActivePulse,
  isOwnProfile,
  onEditProfile,
  onCreatorDash,
  onSettings,
  followed,
  followWorking,
  onFollow,
  onMessage,
  onMorePress,
  onSubscribe,
  onFollowersClick,
  onFollowingClick,
  onAvatarClick,
  onSearch,
}: XProfileHeaderProps) {
  const [, navigate] = useLocation();
  const [avatarErr, setAvatarErr] = useState(false);
  const initials = (name || "?").charAt(0).toUpperCase();

  /* Derived */
  const websiteDisplay = website
    ? website.replace(/^https?:\/\/(www\.)?/i, "").replace(/\/$/, "")
    : null;
  const websiteUrl = website
    ? (/^https?:\/\//i.test(website) ? website : `https://${website}`)
    : null;
  const joined = joinedLabel(joinedAt);

  return (
    <div style={{ background: "#000" }}>
      {/* ════════════════════════════════════════════════
          TOP BAR
      ════════════════════════════════════════════════ */}
      <div
        className="flex items-center gap-3 px-3"
        style={{
          paddingTop: `calc(env(safe-area-inset-top, 0px) + 10px)`,
          paddingBottom: 10,
          background: "#000",
        }}
      >
        {/* Left: back (other) or empty (own) */}
        {!isOwnProfile ? (
          <motion.button
            whileTap={{ scale: 0.88 }}
            onClick={() => (history.length > 1 ? history.back() : navigate("/"))}
            className="grid place-items-center rounded-full text-white flex-shrink-0"
            style={{ width: 34, height: 34 }}
          >
            <ArrowLeft style={{ width: 20, height: 20 }} />
          </motion.button>
        ) : (
          <div style={{ width: 34, height: 34, flexShrink: 0 }} />
        )}

        {/* Center: name + post count */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span
              className="font-bold leading-tight truncate"
              style={{ fontSize: 17, color: "#E7E9EA" }}
            >
              {name}
            </span>
            {(isVerified || isOwner) && (
              <NameBadges isOwner={!!isOwner} isVerified={!!isVerified} size="sm" />
            )}
          </div>
          {postCount != null && (
            <p style={{ fontSize: 12, color: "#71767B", marginTop: 1 }}>
              {compact(postCount)} post{postCount !== 1 ? "s" : ""}
            </p>
          )}
        </div>

        {/* Right icons */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <motion.button
            whileTap={{ scale: 0.88 }}
            onClick={onSearch}
            className="grid place-items-center text-white"
            style={{ width: 34, height: 34 }}
          >
            <Search style={{ width: 19, height: 19 }} />
          </motion.button>
          <motion.button
            whileTap={{ scale: 0.88 }}
            onClick={isOwnProfile ? onSettings : onMorePress}
            className="grid place-items-center text-white"
            style={{ width: 34, height: 34 }}
          >
            <MoreHorizontal style={{ width: 21, height: 21 }} />
          </motion.button>
        </div>
      </div>

      {/* ════════════════════════════════════════════════
          COVER PHOTO — full bleed, no rounded corners
      ════════════════════════════════════════════════ */}
      <div className="relative w-full overflow-hidden" style={{ height: 150 }}>
        {coverUrl ? (
          <img
            src={coverUrl}
            alt="cover"
            className="absolute inset-0 h-full w-full object-cover object-center"
          />
        ) : (
          <div
            className="absolute inset-0"
            style={{
              background: "linear-gradient(160deg, #0d0b1a 0%, #1a0e2e 45%, #0a0c18 100%)",
            }}
          />
        )}
      </div>

      {/* ════════════════════════════════════════════════
          AVATAR ROW — avatar overlaps cover, action buttons right
      ════════════════════════════════════════════════ */}
      <div
        className="flex items-end justify-between px-3"
        style={{ marginTop: -38 }}
      >
        {/* Avatar */}
        <motion.div
          whileTap={{ scale: 0.96 }}
          className="relative cursor-pointer flex-shrink-0"
          onClick={onAvatarClick}
          style={{ zIndex: 10 }}
        >
          {/* Pulse ring */}
          {hasActivePulse && (
            <>
              <div
                className="pulse-ring-anim absolute rounded-full pointer-events-none"
                style={{
                  inset: -5,
                  background:
                    "conic-gradient(from 0deg,#ff006e,#8338ec,#3a86ff,#06d6a0,#ffbe0b,#ff006e)",
                  zIndex: 0,
                }}
              />
              <div
                className="absolute rounded-full pointer-events-none"
                style={{ inset: -2, background: "#000", zIndex: 1 }}
              />
            </>
          )}
          <div className="relative" style={{ zIndex: 2 }}>
            <SupporterProfileRing tier={supporterTier ?? null} size={76}>
              <div
                className="overflow-hidden rounded-full"
                style={{ width: 76, height: 76, border: "3px solid #000" }}
              >
                {avatarUrl && !avatarErr ? (
                  <img
                    src={avatarUrl}
                    alt={name}
                    className="h-full w-full object-cover"
                    onError={() => setAvatarErr(true)}
                  />
                ) : (
                  <div
                    className="h-full w-full grid place-items-center font-bold text-white"
                    style={{
                      fontSize: 26,
                      background: "linear-gradient(135deg,#1D9BF0,#6a5acd)",
                    }}
                  >
                    {initials}
                  </div>
                )}
              </div>
            </SupporterProfileRing>
          </div>
        </motion.div>

        {/* Action buttons */}
        <div className="flex items-center gap-2 pb-1.5">
          {isOwnProfile ? (
            /* ── Own profile buttons ── */
            <>
              {onCreatorDash && (
                <CircleBtn onClick={onCreatorDash}>
                  {/* chart/stats icon */}
                  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8"
                    strokeLinecap="round" strokeLinejoin="round" style={{ width: 16, height: 16 }}>
                    <path d="M2 14 L6 9 L10 12 L14 6 L18 4" />
                  </svg>
                </CircleBtn>
              )}
              <motion.button
                whileTap={{ scale: 0.95 }}
                onClick={onEditProfile}
                className="rounded-full px-4 font-bold text-white"
                style={{
                  height: 34,
                  fontSize: 14,
                  border: "1px solid rgba(255,255,255,0.3)",
                  background: "transparent",
                }}
              >
                Edit profile
              </motion.button>
            </>
          ) : (
            /* ── Other user buttons ── */
            <>
              {/* More */}
              <CircleBtn onClick={onMorePress}>
                <MoreHorizontal style={{ width: 17, height: 17 }} />
              </CircleBtn>

              {/* Message / DM icon */}
              {onMessage && (
                <CircleBtn onClick={onMessage}>
                  {/* envelope icon */}
                  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8"
                    strokeLinecap="round" strokeLinejoin="round" style={{ width: 16, height: 16 }}>
                    <rect x="2" y="4" width="16" height="12" rx="2" />
                    <path d="M2 7 L10 12 L18 7" />
                  </svg>
                </CircleBtn>
              )}

              {/* Follow / Following */}
              <motion.button
                whileTap={{ scale: 0.92 }}
                onClick={onFollow}
                disabled={followWorking}
                className="rounded-full px-4 font-bold text-white disabled:opacity-60"
                style={{
                  height: 34,
                  fontSize: 14,
                  background: followed
                    ? "transparent"
                    : "#1D9BF0",
                  border: followed
                    ? "1px solid rgba(255,255,255,0.28)"
                    : "none",
                }}
              >
                {followed ? "Following" : "Follow"}
              </motion.button>

              {/* Subscribe */}
              {onSubscribe && (
                <motion.button
                  whileTap={{ scale: 0.92 }}
                  onClick={onSubscribe}
                  className="rounded-full px-4 font-bold text-white"
                  style={{ height: 34, fontSize: 14, background: "#8B5CF6" }}
                >
                  Subscribe
                </motion.button>
              )}
            </>
          )}
        </div>
      </div>

      {/* ════════════════════════════════════════════════
          IDENTITY SECTION
      ════════════════════════════════════════════════ */}
      <div className="px-4 mt-3">
        {/* Display name + badges */}
        <div className="flex flex-wrap items-center gap-1.5">
          <h1
            className="font-bold leading-tight"
            style={{ fontSize: 20, color: "#E7E9EA" }}
          >
            {name}
          </h1>
          {(isVerified || isOwner) && (
            <NameBadges isOwner={!!isOwner} isVerified={!!isVerified} size="md" />
          )}
        </div>

        {/* @handle */}
        <p style={{ fontSize: 14, color: "#71767B", marginTop: 2 }}>
          @{handle}
        </p>

        {/* Bio */}
        {bio && (
          <p
            className="whitespace-pre-line"
            style={{ fontSize: 14, color: "#E7E9EA", marginTop: 10, lineHeight: 1.5 }}
          >
            {bio}
          </p>
        )}

        {/* Website + Joined row */}
        {(websiteDisplay || joined || location) && (
          <div
            className="flex flex-wrap items-center gap-x-4 gap-y-1"
            style={{ marginTop: 10 }}
          >
            {location && (
              <span className="flex items-center gap-1" style={{ color: "#71767B", fontSize: 13 }}>
                <MapPin style={{ width: 14, height: 14 }} />
                {location}
              </span>
            )}
            {websiteDisplay && websiteUrl && (
              <a
                href={websiteUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1"
                style={{ color: "#1D9BF0", fontSize: 13, textDecoration: "none" }}
              >
                <Globe style={{ width: 14, height: 14 }} />
                {websiteDisplay}
              </a>
            )}
            {joined && (
              <span className="flex items-center gap-1" style={{ color: "#71767B", fontSize: 13 }}>
                <Calendar style={{ width: 14, height: 14 }} />
                Joined {joined}
              </span>
            )}
          </div>
        )}

        {/* Following / Followers */}
        <div className="flex items-center gap-5" style={{ marginTop: 12 }}>
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={onFollowingClick}
            className="flex items-center gap-1"
            style={{ fontSize: 14 }}
          >
            <span className="font-bold" style={{ color: "#E7E9EA" }}>
              {compact(following)}
            </span>
            <span style={{ color: "#71767B" }}>Following</span>
          </motion.button>
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={onFollowersClick}
            className="flex items-center gap-1"
            style={{ fontSize: 14 }}
          >
            <span className="font-bold" style={{ color: "#E7E9EA" }}>
              {compact(followers)}
            </span>
            <span style={{ color: "#71767B" }}>Followers</span>
          </motion.button>
        </div>
      </div>

      {/* Bottom spacer before tabs */}
      <div style={{ height: 12 }} />
    </div>
  );
}
