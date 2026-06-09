/**
 * AboutSection.tsx — collapsible "About" accordion replacing the
 * heavy Facebook-style ProfileDetailsPanel cards.
 *
 * Shows a single tappable header row. When expanded it reveals:
 *   • Join date
 *   • Location / Work / Education / Website
 *   • Contact info (public email & phone — privacy-gated)
 *   • Social links
 *
 * All data is read from the same ProfilePanelData interface used
 * by the old ProfileDetailsPanel so no API changes are needed.
 */
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronDown, MapPin, Briefcase, GraduationCap,
  Globe, Calendar, Mail, Phone, Pencil,
} from "lucide-react";
import type { ProfilePanelData } from "./ProfileDetailsPanel";

/* ── Tiny social-icon components (same as ProfileDetailsPanel) ─────────── */
function FbIcon()  { return <svg viewBox="0 0 24 24" fill="currentColor" style={{width:13,height:13}}><path d="M18 2h-3a5 5 0 00-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 011-1h3z"/></svg>; }
function IgIcon()  { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{width:13,height:13}}><rect x="2" y="2" width="20" height="20" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor"/></svg>; }
function TtIcon()  { return <svg viewBox="0 0 24 24" fill="currentColor" style={{width:13,height:13}}><path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.28 6.28 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V8.69a8.18 8.18 0 004.77 1.53V6.77a4.85 4.85 0 01-1-.08z"/></svg>; }
function XIcon()   { return <svg viewBox="0 0 24 24" fill="currentColor" style={{width:12,height:12}}><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.741l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>; }
function YtIcon()  { return <svg viewBox="0 0 24 24" fill="currentColor" style={{width:13,height:13}}><path d="M22.54 6.42a2.78 2.78 0 00-1.95-1.96C18.88 4 12 4 12 4s-6.88 0-8.59.46a2.78 2.78 0 00-1.95 1.96A29 29 0 001 12a29 29 0 00.46 5.58 2.78 2.78 0 001.95 1.96C5.12 20 12 20 12 20s6.88 0 8.59-.46a2.78 2.78 0 001.95-1.96A29 29 0 0023 12a29 29 0 00-.46-5.58zM9.75 15.02V8.98L15.5 12l-5.75 3.02z"/></svg>; }
function LiIcon()  { return <svg viewBox="0 0 24 24" fill="currentColor" style={{width:13,height:13}}><path d="M16 8a6 6 0 016 6v7h-4v-7a2 2 0 00-2-2 2 2 0 00-2 2v7h-4v-7a6 6 0 016-6zM2 9h4v12H2z"/><circle cx="4" cy="4" r="2"/></svg>; }

function buildSocialUrl(kind: string, val?: string): string | null {
  if (!val?.trim()) return null;
  const t = val.trim();
  if (/^https?:\/\//i.test(t)) return t;
  const h = t.replace(/^@/, "");
  switch (kind) {
    case "facebook":  return `https://facebook.com/${h}`;
    case "instagram": return `https://instagram.com/${h}`;
    case "tiktok":    return `https://tiktok.com/@${h}`;
    case "x":         return `https://x.com/${h}`;
    case "youtube":   return `https://youtube.com/@${h}`;
    case "linkedin":  return `https://linkedin.com/in/${h}`;
    default:          return `https://${h}`;
  }
}

/* ── Row item ───────────────────────────────────────────────────────────── */
function InfoRow({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "5px 0" }}>
      <span style={{ width: 16, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", paddingTop: 1, color: "rgba(168,85,247,0.7)" }}>
        {icon}
      </span>
      <span style={{ fontSize: 13, color: "rgba(255,255,255,0.65)", lineHeight: 1.45, flex: 1, minWidth: 0 }}>
        {children}
      </span>
    </div>
  );
}

/* ── Section label ──────────────────────────────────────────────────────── */
function SubLabel({ children }: { children: string }) {
  return (
    <p style={{
      fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase",
      color: "rgba(255,255,255,0.28)", marginBottom: 6, marginTop: 14,
    }}>
      {children}
    </p>
  );
}

/* ── Main export ────────────────────────────────────────────────────────── */
interface Props {
  profile:      ProfilePanelData;
  isOwnProfile: boolean;
  onEditOpen?:  () => void;
}

export function AboutSection({ profile, isOwnProfile, onEditOpen }: Props) {
  const [open, setOpen] = useState(false);

  const priv = profile.privacy_settings ?? {};
  const showLocation  = Boolean(profile.location  && (isOwnProfile || priv["showLocation"]  !== false));
  const showBirthday  = Boolean(profile.birthday  && (isOwnProfile || priv["showBirthday"]  === true));
  const showContact   = Boolean(
    (profile.public_email || profile.public_phone) &&
    (isOwnProfile || priv["showContact"] !== false)
  );

  /* Social links */
  const socials: { key: string; icon: React.ReactNode; label: string; url: string | null }[] = [
    { key: "facebook",  icon: <FbIcon />, label: "Facebook",  url: buildSocialUrl("facebook",  profile.social_facebook)  },
    { key: "instagram", icon: <IgIcon />, label: "Instagram", url: buildSocialUrl("instagram", profile.social_instagram) },
    { key: "tiktok",    icon: <TtIcon />, label: "TikTok",    url: buildSocialUrl("tiktok",    profile.social_tiktok)    },
    { key: "x",         icon: <XIcon />, label: "X",         url: buildSocialUrl("x",         profile.social_x)         },
    { key: "youtube",   icon: <YtIcon />, label: "YouTube",   url: buildSocialUrl("youtube",   profile.social_youtube)   },
    { key: "linkedin",  icon: <LiIcon />, label: "LinkedIn",  url: buildSocialUrl("linkedin",  profile.social_linkedin)  },
  ].filter((s) => s.url !== null);

  /* Join date */
  const joinDate = profile.created_at
    ? new Date(profile.created_at).toLocaleDateString(undefined, { month: "long", year: "numeric" })
    : null;

  const hasAnyContent = showLocation || profile.work || profile.education || profile.website
    || showBirthday || showContact || socials.length > 0 || joinDate;

  if (!hasAnyContent && !isOwnProfile) return null;

  return (
    <div style={{
      margin: "8px 16px 0",
      borderRadius: 16,
      overflow: "hidden",
      border: "1px solid rgba(255,255,255,0.07)",
      background: "rgba(255,255,255,0.025)",
    }}>
      {/* Header row — always visible */}
      <motion.button
        whileTap={{ scale: 0.98 }}
        onClick={() => setOpen((o) => !o)}
        style={{
          width: "100%", display: "flex", alignItems: "center",
          justifyContent: "space-between", padding: "13px 16px",
          background: "none", border: "none", cursor: "pointer",
        }}
      >
        <span style={{ fontSize: 14.5, fontWeight: 700, color: "#fff" }}>About</span>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {isOwnProfile && onEditOpen && (
            <motion.span
              whileTap={{ scale: 0.88 }}
              onClick={(e) => { e.stopPropagation(); onEditOpen(); }}
              style={{
                display: "grid", placeItems: "center",
                width: 26, height: 26, borderRadius: "50%",
                background: "rgba(255,255,255,0.07)", cursor: "pointer",
              }}
            >
              <Pencil style={{ width: 11, height: 11, color: "rgba(255,255,255,0.5)" }} />
            </motion.span>
          )}
          <motion.span
            animate={{ rotate: open ? 180 : 0 }}
            transition={{ type: "spring", stiffness: 400, damping: 28 }}
            style={{ display: "flex" }}
          >
            <ChevronDown style={{ width: 16, height: 16, color: "rgba(255,255,255,0.4)" }} />
          </motion.span>
        </div>
      </motion.button>

      {/* Expandable body */}
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="about-body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: "spring", stiffness: 400, damping: 40 }}
            style={{ overflow: "hidden" }}
          >
            <div style={{ padding: "0 16px 16px", borderTop: "1px solid rgba(255,255,255,0.06)" }}>

              {/* Personal info */}
              {(showLocation || profile.work || profile.education || profile.website || showBirthday) && (
                <>
                  <SubLabel>Info</SubLabel>
                  {joinDate && (
                    <InfoRow icon={<Calendar style={{ width: 13, height: 13 }} />}>
                      Joined {joinDate}
                    </InfoRow>
                  )}
                  {showLocation && profile.location && (
                    <InfoRow icon={<MapPin style={{ width: 13, height: 13 }} />}>
                      {profile.location}
                    </InfoRow>
                  )}
                  {profile.work && (
                    <InfoRow icon={<Briefcase style={{ width: 13, height: 13 }} />}>
                      {profile.work}
                      {profile.work_previous ? <span style={{ color: "rgba(255,255,255,0.38)" }}> · Previously {profile.work_previous}</span> : null}
                    </InfoRow>
                  )}
                  {profile.education && (
                    <InfoRow icon={<GraduationCap style={{ width: 13, height: 13 }} />}>
                      {profile.education}
                      {profile.college ? <span style={{ color: "rgba(255,255,255,0.38)" }}> · {profile.college}</span> : null}
                    </InfoRow>
                  )}
                  {profile.website && (() => {
                    const url = /^https?:\/\//i.test(profile.website) ? profile.website : `https://${profile.website}`;
                    const display = profile.website.replace(/^https?:\/\/(www\.)?/i, "").replace(/\/$/, "");
                    return (
                      <InfoRow icon={<Globe style={{ width: 13, height: 13 }} />}>
                        <a href={url} target="_blank" rel="noopener noreferrer"
                          style={{ color: "#a855f7", textDecoration: "none" }}>{display}</a>
                      </InfoRow>
                    );
                  })()}
                  {showBirthday && profile.birthday && (() => {
                    const d = new Date(profile.birthday);
                    const label = d.toLocaleDateString(undefined, { month: "long", day: "numeric" });
                    return <InfoRow icon={<span style={{ fontSize: 12 }}>🎂</span>}>{label}</InfoRow>;
                  })()}
                </>
              )}

              {/* Contact */}
              {showContact && (
                <>
                  <SubLabel>Contact</SubLabel>
                  {profile.public_email && (
                    <InfoRow icon={<Mail style={{ width: 13, height: 13 }} />}>
                      <a href={`mailto:${profile.public_email}`} style={{ color: "#a855f7", textDecoration: "none" }}>
                        {profile.public_email}
                      </a>
                    </InfoRow>
                  )}
                  {profile.public_phone && (
                    <InfoRow icon={<Phone style={{ width: 13, height: 13 }} />}>
                      <a href={`tel:${profile.public_phone}`} style={{ color: "#a855f7", textDecoration: "none" }}>
                        {profile.public_phone}
                      </a>
                    </InfoRow>
                  )}
                </>
              )}

              {/* Social links */}
              {socials.length > 0 && (
                <>
                  <SubLabel>Social</SubLabel>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 2 }}>
                    {socials.map(({ key, icon, label, url }) => (
                      <a key={key} href={url!} target="_blank" rel="noopener noreferrer"
                        style={{
                          display: "inline-flex", alignItems: "center", gap: 5,
                          padding: "5px 10px", borderRadius: 8, fontSize: 12, fontWeight: 600,
                          background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.09)",
                          color: "rgba(255,255,255,0.7)", textDecoration: "none",
                        }}
                      >
                        <span style={{ color: "rgba(168,85,247,0.8)" }}>{icon}</span>
                        {label}
                      </a>
                    ))}
                  </div>
                </>
              )}

              {/* Empty state for own profile */}
              {isOwnProfile && !hasAnyContent && (
                <div style={{ padding: "8px 0", textAlign: "center" }}>
                  <p style={{ fontSize: 12.5, color: "rgba(255,255,255,0.3)", marginBottom: 8 }}>
                    Add your info so people can find you.
                  </p>
                  <motion.button
                    whileTap={{ scale: 0.95 }}
                    onClick={onEditOpen}
                    style={{
                      padding: "6px 16px", borderRadius: 8, border: "none",
                      background: "rgba(168,85,247,0.15)", color: "#a855f7",
                      fontSize: 12.5, fontWeight: 600, cursor: "pointer",
                    }}
                  >
                    Edit Profile
                  </motion.button>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
