/**
 * ProfileDetailsPanel.tsx
 *
 * Facebook-style profile details sidebar rendered on both the own-profile
 * page and on any public UserProfile page.
 *
 * Sections:
 *  1. Personal Details — location, birthday, relationship, gender,
 *                        education, joined date, website
 *  2. Links            — website + 6 social networks
 *  3. Work & Education — current work, previous work, school, college
 *  4. Friends          — mutual-follow grid + count + "See all"
 *  5. (Followers/Following stats live in the existing StatBtn row)
 */
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import {
  Pencil, MapPin, Calendar, Heart, User as UserIcon,
  GraduationCap, Globe, Briefcase, School, Link as LinkIcon,
  Search, X, Mail, Phone, AtSign,
  Sparkles, Languages, Clock, Mic2, Star,
} from "lucide-react";
/* ── Social-icon SVGs ──────────────────────────────────────────────────── */
function FbIcon()  { return <svg viewBox="0 0 24 24" fill="currentColor" style={{width:14,height:14}}><path d="M18 2h-3a5 5 0 00-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 011-1h3z"/></svg>; }
function IgIcon()  { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{width:14,height:14}}><rect x="2" y="2" width="20" height="20" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor"/></svg>; }
function TtIcon()  { return <svg viewBox="0 0 24 24" fill="currentColor" style={{width:14,height:14}}><path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.28 6.28 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V8.69a8.18 8.18 0 004.77 1.53V6.77a4.85 4.85 0 01-1-.08z"/></svg>; }
function XIcon()   { return <svg viewBox="0 0 24 24" fill="currentColor" style={{width:13,height:13}}><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.741l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>; }
function YtIcon()  { return <svg viewBox="0 0 24 24" fill="currentColor" style={{width:14,height:14}}><path d="M22.54 6.42a2.78 2.78 0 00-1.95-1.96C18.88 4 12 4 12 4s-6.88 0-8.59.46a2.78 2.78 0 00-1.95 1.96A29 29 0 001 12a29 29 0 00.46 5.58 2.78 2.78 0 001.95 1.96C5.12 20 12 20 12 20s6.88 0 8.59-.46a2.78 2.78 0 001.95-1.96A29 29 0 0023 12a29 29 0 00-.46-5.58zM9.75 15.02V8.98L15.5 12l-5.75 3.02z"/></svg>; }
function LiIcon()  { return <svg viewBox="0 0 24 24" fill="currentColor" style={{width:14,height:14}}><path d="M16 8a6 6 0 016 6v7h-4v-7a2 2 0 00-2-2 2 2 0 00-2 2v7h-4v-7a6 6 0 016-6zM2 9h4v12H2z"/><circle cx="4" cy="4" r="2"/></svg>; }

/* ── Normalised shape (accepted from Profile.tsx User or UserProfile.tsx DbUser) */
export interface ProfilePanelData {
  id:                   string;
  name?:                string;
  username?:            string;
  avatar_url?:          string;
  followers?:           number;
  following?:           number;
  /* Personal */
  location?:            string;
  birthday?:            string | null;
  gender?:              string;
  relationship_status?: string;
  /* Work & Education */
  work?:                string;
  work_previous?:       string;
  education?:           string;
  school?:              string;
  college?:             string;
  /* Links */
  website?:             string;
  social_facebook?:     string;
  social_instagram?:    string;
  social_tiktok?:       string;
  social_x?:            string;
  social_youtube?:      string;
  social_linkedin?:     string;
  /* Contact */
  public_email?:        string;
  public_phone?:        string;
  /* Meta */
  created_at?:          string;
  privacy_settings?:    Record<string, boolean | string>;
  /* New extended profile fields */
  headline?:            string;
  pronunciation?:       string;
  interests?:           string;   /* JSON-encoded string[] */
  skills?:              string;   /* JSON-encoded string[] */
  languages?:           string;   /* JSON-encoded string[] */
  timezone?:            string;
  mood_emoji?:          string;
  mood_status?:         string;
}

interface Props {
  profile:       ProfilePanelData;
  isOwnProfile:  boolean;
  viewerId?:     string | null;
  onEditOpen?:   () => void;
}

/* ── Array parser — handles JSON strings and raw arrays ──────────────────── */
function parseArr(val?: string | null): string[] {
  if (!val) return [];
  if (Array.isArray(val)) return val as string[];
  try { const p = JSON.parse(val); return Array.isArray(p) ? p : []; } catch { return []; }
}

/* ══════════════════════════════════════════════════════════════════════════
   Main component
══════════════════════════════════════════════════════════════════════════ */
export function ProfileDetailsPanel({ profile, isOwnProfile, onEditOpen }: Props) {
  const [, navigate] = useLocation();

  /* ── Privacy helpers ─────────────────────────────────────────────────── */
  const priv = profile.privacy_settings ?? {};
  const showLocation   = Boolean(profile.location && (isOwnProfile || priv["showLocation"] !== false));
  const showBirthday   = Boolean(profile.birthday  && (isOwnProfile || priv["showBirthday"]  === true));
  const showRelStatus  = Boolean(
    profile.relationship_status &&
    profile.relationship_status !== "Prefer not to say" &&
    (isOwnProfile || priv["showRelationship"] !== false)
  );
  const showGender = Boolean(
    profile.gender && profile.gender !== "Prefer not to say" &&
    (isOwnProfile || priv["showGender"] === true)
  );
  const showContact = Boolean(
    profile.username || profile.public_email || profile.public_phone
  ) && (isOwnProfile || priv["showContact"] !== false);

  /* ── Social link builder ─────────────────────────────────────────────── */
  function buildUrl(kind: string, val?: string): string | null {
    if (!val) return null;
    const t = val.trim();
    if (!t) return null;
    if (/^https?:\/\//i.test(t)) return t;
    const h = t.replace(/^@/, "");
    switch (kind) {
      case "facebook":  return `https://facebook.com/${h}`;
      case "instagram": return `https://instagram.com/${h}`;
      case "tiktok":    return `https://tiktok.com/@${h}`;
      case "x":         return `https://x.com/${h}`;
      case "youtube":   return `https://youtube.com/@${h}`;
      case "linkedin":  return `https://linkedin.com/in/${h}`;
      case "website":   return /^https?:\/\//i.test(val) ? val : `https://${val}`;
      default:          return `https://${h}`;
    }
  }

  /* ── Parse new array fields ──────────────────────────────────────────── */
  const interestsList = parseArr(profile.interests);
  const skillsList    = parseArr(profile.skills);
  const languagesList = parseArr(profile.languages);

  /* ── Derived booleans ────────────────────────────────────────────────── */
  const hasPersonalDetails = showLocation || showBirthday || showRelStatus || showGender ||
    Boolean(profile.education || profile.school || profile.college) || Boolean(profile.created_at);
  const hasContactInfo = Boolean(
    profile.username || profile.public_email || profile.public_phone
  );
  const hasLinks = Boolean(
    profile.website || profile.social_facebook || profile.social_instagram ||
    profile.social_tiktok || profile.social_x || profile.social_youtube || profile.social_linkedin
  );
  const hasWork = Boolean(profile.work || profile.work_previous || profile.education || profile.school || profile.college);
  const hasHeadline   = Boolean(profile.headline?.trim());
  const hasMood       = Boolean(profile.mood_emoji?.trim() || profile.mood_status?.trim());
  const hasInterests  = interestsList.length > 0;
  const hasSkills     = skillsList.length > 0;
  const hasIdentity   = languagesList.length > 0 || Boolean(profile.timezone?.trim()) || Boolean(profile.pronunciation?.trim());

  const showAnySection = isOwnProfile || hasPersonalDetails || hasLinks || hasWork ||
    hasHeadline || hasMood || hasInterests || hasSkills || hasIdentity;
  if (!showAnySection) return null;

  /* ── Joined date ─────────────────────────────────────────────────────── */
  const joinedDate = profile.created_at
    ? new Date(profile.created_at).toLocaleDateString(undefined, { month: "long", year: "numeric" })
    : null;

  return (
    <div className="px-4 pb-4 space-y-4">

      {/* ═══════════════════════════════════════════════════════════════
          1. PERSONAL DETAILS
      ═══════════════════════════════════════════════════════════════ */}
      {(isOwnProfile || hasPersonalDetails) && (
        <SectionCard
          title="Personal details"
          onEdit={isOwnProfile ? onEditOpen : undefined}
        >
          {showLocation && (
            <DetailRow icon={<MapPin style={{width:15,height:15}} />} text={profile.location!} />
          )}
          {showBirthday && (
            <DetailRow
              icon={<span style={{fontSize:14}}>🎂</span>}
              text={new Date(profile.birthday!).toLocaleDateString(undefined, {month:"long",day:"numeric",year:"numeric"})}
            />
          )}
          {showRelStatus && (
            <DetailRow
              icon={<Heart style={{width:15,height:15}} />}
              text={profile.relationship_status!}
              locked={!isOwnProfile && priv["showRelationship"] !== false}
            />
          )}
          {showGender && (
            <DetailRow icon={<UserIcon style={{width:15,height:15}} />} text={profile.gender!} />
          )}
          {(profile.education || profile.school || profile.college) && (
            <DetailRow
              icon={<GraduationCap style={{width:15,height:15}} />}
              text={[profile.college || profile.education, profile.school].filter(Boolean).join(" · ")}
            />
          )}
          {joinedDate && (
            <DetailRow icon={<Calendar style={{width:15,height:15}} />} text={`Joined ${joinedDate}`} />
          )}
          {profile.website && (
            <DetailRow
              icon={<Globe style={{width:15,height:15}} />}
              text={profile.website.replace(/^https?:\/\/(www\.)?/i, "").replace(/\/$/, "")}
              href={buildUrl("website", profile.website) ?? undefined}
            />
          )}

          {/* Placeholder when no data and own profile */}
          {isOwnProfile && !showLocation && !showBirthday && !showRelStatus && !showGender &&
           !profile.education && !profile.school && !profile.college && !profile.website && (
            <button
              onClick={onEditOpen}
              className="w-full text-left text-[12px] py-1"
              style={{ color: "var(--accent-primary)" }}
            >
              + Add personal details
            </button>
          )}
        </SectionCard>
      )}

      {/* ═══════════════════════════════════════════════════════════════
          2. LINKS
      ═══════════════════════════════════════════════════════════════ */}
      {(isOwnProfile || hasLinks) && (
        <SectionCard title="Links" onEdit={isOwnProfile ? onEditOpen : undefined}>
          {(() => {
            const links: {icon: React.ReactNode; label: string; url: string}[] = [];
            const wb = buildUrl("website",  profile.website);       if (wb) links.push({ icon: <LinkIcon style={{width:14,height:14}}/>, label: profile.website!.replace(/^https?:\/\/(www\.)?/i,"").replace(/\/$/,""), url: wb });
            const fb = buildUrl("facebook", profile.social_facebook); if (fb) links.push({ icon: <FbIcon/>, label: profile.social_facebook!, url: fb });
            const ig = buildUrl("instagram",profile.social_instagram);if (ig) links.push({ icon: <IgIcon/>, label: profile.social_instagram!, url: ig });
            const tt = buildUrl("tiktok",   profile.social_tiktok);  if (tt) links.push({ icon: <TtIcon/>, label: profile.social_tiktok!, url: tt });
            const xv = buildUrl("x",        profile.social_x);       if (xv) links.push({ icon: <XIcon/>, label: profile.social_x!, url: xv });
            const yt = buildUrl("youtube",  profile.social_youtube);  if (yt) links.push({ icon: <YtIcon/>, label: profile.social_youtube!, url: yt });
            const li = buildUrl("linkedin", profile.social_linkedin); if (li) links.push({ icon: <LiIcon/>, label: profile.social_linkedin!, url: li });

            if (links.length === 0) {
              return isOwnProfile ? (
                <button onClick={onEditOpen} className="text-left text-[12px] py-1" style={{ color: "var(--accent-primary)" }}>
                  + Add links
                </button>
              ) : null;
            }
            return links.map(({ icon, label, url }) => (
              <a
                key={url}
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 py-1.5 group"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-full flex-shrink-0"
                  style={{ background: "rgba(168,85,247,0.12)", color: "#a855f7" }}>
                  {icon}
                </span>
                <span className="text-[13px] font-medium app-text-muted group-hover:text-purple-400 truncate transition-colors">
                  {label.replace(/^@/,"")}
                </span>
              </a>
            ));
          })()}
        </SectionCard>
      )}

      {/* ═══════════════════════════════════════════════════════════════
          3. WORK & EDUCATION
      ═══════════════════════════════════════════════════════════════ */}
      {(isOwnProfile || hasWork) && (
        <SectionCard title="Work & Education" onEdit={isOwnProfile ? onEditOpen : undefined}>
          {profile.work && (
            <WorkRow
              icon={<Briefcase style={{width:15,height:15}}/>}
              primary={profile.work}
              secondary="Current"
            />
          )}
          {profile.work_previous && (
            <WorkRow
              icon={<Briefcase style={{width:15,height:15}}/>}
              primary={profile.work_previous}
              secondary="Previous"
              muted
            />
          )}
          {profile.college && (
            <WorkRow
              icon={<GraduationCap style={{width:15,height:15}}/>}
              primary={profile.college}
              secondary="College / University"
            />
          )}
          {profile.school && (
            <WorkRow
              icon={<School style={{width:15,height:15}}/>}
              primary={profile.school}
              secondary="School"
            />
          )}
          {!profile.college && !profile.school && profile.education && (
            <WorkRow
              icon={<GraduationCap style={{width:15,height:15}}/>}
              primary={profile.education}
              secondary="Education"
            />
          )}
          {isOwnProfile && !profile.work && !profile.work_previous && !profile.education && !profile.school && !profile.college && (
            <button onClick={onEditOpen} className="text-left text-[12px] py-1" style={{ color: "var(--accent-primary)" }}>
              + Add work & education
            </button>
          )}
        </SectionCard>
      )}

      {/* ═══════════════════════════════════════════════════════════════
          4. CONTACT INFORMATION
      ═══════════════════════════════════════════════════════════════ */}
      {(isOwnProfile || (hasContactInfo && showContact)) && (
        <SectionCard
          title="Contact Information"
          onEdit={isOwnProfile ? onEditOpen : undefined}
        >
          {profile.username && (
            <DetailRow
              icon={<AtSign style={{width:15,height:15}} />}
              text={`@${profile.username}`}
            />
          )}
          {profile.public_email && (
            <DetailRow
              icon={<Mail style={{width:15,height:15}} />}
              text={profile.public_email}
              href={`mailto:${profile.public_email}`}
            />
          )}
          {profile.public_phone && (
            <DetailRow
              icon={<Phone style={{width:15,height:15}} />}
              text={profile.public_phone}
              href={`tel:${profile.public_phone}`}
            />
          )}
          {isOwnProfile && !profile.public_email && !profile.public_phone && (
            <button
              onClick={onEditOpen}
              className="w-full text-left text-[12px] py-1"
              style={{ color: "var(--accent-primary)" }}
            >
              + Add email or phone
            </button>
          )}
        </SectionCard>
      )}

      {/* ═══════════════════════════════════════════════════════════════
          5. PROFESSIONAL HEADLINE
      ═══════════════════════════════════════════════════════════════ */}
      {hasHeadline && (
        <SectionCard title="Professional Headline" onEdit={isOwnProfile ? onEditOpen : undefined}>
          <div className="flex items-start gap-3 py-0.5">
            <span className="flex-shrink-0 mt-0.5" style={{ color: "#a855f7" }}>
              <Briefcase style={{ width: 15, height: 15 }} />
            </span>
            <span className="text-[13px] app-text leading-relaxed">{profile.headline}</span>
          </div>
        </SectionCard>
      )}

      {/* ═══════════════════════════════════════════════════════════════
          6. MOOD & STATUS
      ═══════════════════════════════════════════════════════════════ */}
      {hasMood && (
        <SectionCard title="Mood" onEdit={isOwnProfile ? onEditOpen : undefined}>
          <div className="flex items-center gap-3 py-0.5">
            <span className="flex-shrink-0" style={{ color: "#a855f7" }}>
              <Sparkles style={{ width: 15, height: 15 }} />
            </span>
            <div className="flex flex-wrap items-center gap-2 min-w-0">
              {profile.mood_emoji && (
                <span style={{ fontSize: 20, lineHeight: 1 }}>{profile.mood_emoji}</span>
              )}
              {profile.mood_status?.trim() && (
                <span className="text-[13px] app-text">{profile.mood_status}</span>
              )}
            </div>
          </div>
        </SectionCard>
      )}

      {/* ═══════════════════════════════════════════════════════════════
          7. INTERESTS
      ═══════════════════════════════════════════════════════════════ */}
      {hasInterests && (
        <SectionCard title="Interests" onEdit={isOwnProfile ? onEditOpen : undefined}>
          <div className="flex items-center gap-2 mb-2 -mt-1">
            <Star style={{ width: 13, height: 13, color: "#a855f7" }} />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {interestsList.map((item) => (
              <span
                key={item}
                className="rounded-full px-3 py-1 text-[11px] font-semibold"
                style={{ background: "rgba(168,85,247,0.12)", color: "#c084fc", border: "1px solid rgba(168,85,247,0.25)" }}
              >
                {item}
              </span>
            ))}
          </div>
        </SectionCard>
      )}

      {/* ═══════════════════════════════════════════════════════════════
          8. SKILLS
      ═══════════════════════════════════════════════════════════════ */}
      {hasSkills && (
        <SectionCard title="Skills" onEdit={isOwnProfile ? onEditOpen : undefined}>
          <div className="flex flex-wrap gap-1.5">
            {skillsList.map((item) => (
              <span
                key={item}
                className="rounded-full px-3 py-1 text-[11px] font-semibold"
                style={{ background: "rgba(59,130,246,0.12)", color: "#93c5fd", border: "1px solid rgba(59,130,246,0.25)" }}
              >
                {item}
              </span>
            ))}
          </div>
        </SectionCard>
      )}

      {/* ═══════════════════════════════════════════════════════════════
          9. IDENTITY — Languages · Timezone · Name Pronunciation
      ═══════════════════════════════════════════════════════════════ */}
      {(isOwnProfile || hasIdentity) && (
        <SectionCard title="Identity" onEdit={isOwnProfile ? onEditOpen : undefined}>
          {languagesList.length > 0 && (
            <div className="flex items-start gap-3 py-0.5">
              <span className="flex-shrink-0 mt-0.5" style={{ color: "#a855f7" }}>
                <Languages style={{ width: 15, height: 15 }} />
              </span>
              <div className="flex flex-wrap gap-1.5 min-w-0">
                {languagesList.map((lang) => (
                  <span
                    key={lang}
                    className="rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
                    style={{ background: "rgba(6,214,160,0.1)", color: "#34d399", border: "1px solid rgba(6,214,160,0.25)" }}
                  >
                    {lang}
                  </span>
                ))}
              </div>
            </div>
          )}
          {profile.timezone?.trim() && (
            <DetailRow
              icon={<Clock style={{ width: 15, height: 15 }} />}
              text={profile.timezone}
            />
          )}
          {profile.pronunciation?.trim() && (
            <DetailRow
              icon={<Mic2 style={{ width: 15, height: 15 }} />}
              text={`Pronounced: ${profile.pronunciation}`}
            />
          )}
          {isOwnProfile && languagesList.length === 0 && !profile.timezone && !profile.pronunciation && (
            <button
              onClick={onEditOpen}
              className="w-full text-left text-[12px] py-1"
              style={{ color: "var(--accent-primary)" }}
            >
              + Add languages, timezone & pronunciation
            </button>
          )}
        </SectionCard>
      )}

    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   Sub-components
══════════════════════════════════════════════════════════════════════════ */
function SectionCard({
  title, children, onEdit, badge, action,
}: {
  title: string;
  children: React.ReactNode;
  onEdit?: () => void;
  badge?: string;
  action?: React.ReactNode;
}) {
  return (
    <div
      className="rounded-[18px] p-4 app-card"
      style={{ border: "1px solid var(--s-border-a)" }}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <h3 className="text-[15px] font-bold app-text">{title}</h3>
          {badge && (
            <span className="rounded-full px-2 py-0.5 text-[10px] font-bold app-text-muted"
              style={{ background: "rgba(255,255,255,0.06)" }}>
              {badge}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {action}
          {onEdit && (
            <motion.button
              whileTap={{ scale: 0.88 }}
              onClick={onEdit}
              className="grid h-7 w-7 place-items-center rounded-full app-surface"
              aria-label="Edit"
            >
              <Pencil style={{ width: 12, height: 12 }} className="app-text-muted" />
            </motion.button>
          )}
        </div>
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function DetailRow({ icon, text, href, locked }: {
  icon: React.ReactNode;
  text: string;
  href?: string;
  locked?: boolean;
}) {
  const inner = (
    <div className="flex items-center gap-3 py-0.5">
      <span className="flex-shrink-0" style={{ color: "#a855f7" }}>{icon}</span>
      <span className="text-[13px] app-text flex-1 leading-relaxed">{text}</span>
      {locked && <span style={{ fontSize: 12 }}>🔒</span>}
    </div>
  );
  if (href) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer"
        className="block hover:opacity-80 transition-opacity" style={{ color: "#a855f7" }}>
        {inner}
      </a>
    );
  }
  return <div>{inner}</div>;
}

function WorkRow({ icon, primary, secondary, muted }: {
  icon: React.ReactNode;
  primary: string;
  secondary: string;
  muted?: boolean;
}) {
  return (
    <div className="flex items-center gap-3 py-0.5">
      <span className="flex-shrink-0" style={{ color: muted ? "rgba(168,85,247,0.5)" : "#a855f7" }}>
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className={`text-[13px] font-semibold truncate ${muted ? "app-text-muted" : "app-text"}`}>
          {primary}
        </div>
        <div className="text-[11px] app-text-muted">{secondary}</div>
      </div>
    </div>
  );
}

/* ── Re-export Search icon for Friends page ── */
export { Search, X };
