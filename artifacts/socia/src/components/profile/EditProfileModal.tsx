/**
 * EditProfileModal.tsx — Full-screen slide-up edit modal.
 *
 * Sections:
 *   Photos · Basic Info · Contact Info · Social Links
 *   Work & Education · Personal Info · Location · Privacy
 *
 * New in this version:
 *   - Location: Nominatim autocomplete (city/province/country/lat/lng)
 *   - Social links: real-time URL validation (red = invalid, green = valid)
 *   - Save disabled while any social URL is invalid
 *   - Facebook-quality card layout, professional icons, no emojis
 */
import { useState, useRef, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X, Check, Camera, Globe, Calendar,
  Briefcase, GraduationCap, Mail, Phone,
  User, MapPin, Heart, Shield, AlertCircle,
} from "lucide-react";
import { uploadAvatar, upsertProfile, isSupabaseReady, supabase } from "@/lib/supabase";
import { uploadCoverPhoto } from "@/lib/postsClient";
import { useAppStore } from "@/lib/store";
import type { User as StoreUser, PrivacySettings } from "@/lib/store";
import { LocationSearch, type LocationData } from "./LocationSearch";
import { SocialLinkInput, validateSocialUrl, type SocialPlatform } from "./SocialLinkInput";

/* ─────────────────────────────────────────────────────────────────────
   Inline SVG social brand icons (not available in lucide)
───────────────────────────────────────────────────────────────────── */
function FbIcon()  { return <svg viewBox="0 0 24 24" fill="currentColor" style={{ width: 14, height: 14 }}><path d="M18 2h-3a5 5 0 00-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 011-1h3z"/></svg>; }
function IgIcon()  { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 14, height: 14 }}><rect x="2" y="2" width="20" height="20" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor"/></svg>; }
function TtIcon()  { return <svg viewBox="0 0 24 24" fill="currentColor" style={{ width: 14, height: 14 }}><path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.28 6.28 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V8.69a8.18 8.18 0 004.77 1.53V6.77a4.85 4.85 0 01-1-.08z"/></svg>; }
function XIcon()   { return <svg viewBox="0 0 24 24" fill="currentColor" style={{ width: 14, height: 14 }}><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.741l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>; }
function YtIcon()  { return <svg viewBox="0 0 24 24" fill="currentColor" style={{ width: 14, height: 14 }}><path d="M22.54 6.42a2.78 2.78 0 00-1.95-1.96C18.88 4 12 4 12 4s-6.88 0-8.59.46a2.78 2.78 0 00-1.95 1.96A29 29 0 001 12a29 29 0 00.46 5.58 2.78 2.78 0 001.95 1.96C5.12 20 12 20 12 20s6.88 0 8.59-.46a2.78 2.78 0 001.95-1.96A29 29 0 0023 12a29 29 0 00-.46-5.58zM9.75 15.02V8.98L15.5 12l-5.75 3.02z"/></svg>; }
function LiIcon()  { return <svg viewBox="0 0 24 24" fill="currentColor" style={{ width: 14, height: 14 }}><path d="M16 8a6 6 0 016 6v7h-4v-7a2 2 0 00-2-2 2 2 0 00-2 2v7h-4v-7a6 6 0 016-6zM2 9h4v12H2z"/><circle cx="4" cy="4" r="2"/></svg>; }

/* ── Option lists ────────────────────────────────────────────────── */
const GENDER_OPTIONS       = ["Prefer not to say", "Male", "Female", "Non-binary", "Other"];
const RELATIONSHIP_OPTIONS = ["Prefer not to say", "Single", "In a relationship", "Engaged", "Married", "It's complicated", "Open relationship", "Widowed"];
const POST_VISIBILITY      = ["Everyone", "Followers only", "Only me"];
const MESSAGE_PERM         = ["Everyone", "Followers only", "No one"];

function defaultPrivacy(): PrivacySettings {
  return {
    postsVisibility:  "Everyone",
    whoCanMessage:    "Everyone",
    showLocation:     true,
    showBirthday:     false,
    showRelationship: true,
    showGender:       false,
    showContact:      true,
  };
}

/* ── Props ───────────────────────────────────────────────────────── */
interface Props {
  open:            boolean;
  onClose:         () => void;
  onSaved:         (updates: Partial<StoreUser>, newCoverUrl: string | null) => void;
  initialCoverUrl: string | null;
}

/* ── Validity map type ───────────────────────────────────────────── */
type ValidityMap = Record<SocialPlatform, boolean | null>;

/* ══════════════════════════════════════════════════════════════════
   EditProfileModal
══════════════════════════════════════════════════════════════════ */
export function EditProfileModal({ open, onClose, onSaved, initialCoverUrl }: Props) {
  const user    = useAppStore((s) => s.user);
  const setUser = useAppStore((s) => s.setUser);

  /* ── Basic info ─────────────────────────────────────────────── */
  const [name,   setName]   = useState(user?.name   ?? "");
  const [handle, setHandle] = useState(user?.handle ?? "");
  const [bio,    setBio]    = useState(user?.bio    ?? "");

  /* ── Social links ───────────────────────────────────────────── */
  const [website,   setWebsite]   = useState((user as any)?.website         ?? "");
  const [facebook,  setFacebook]  = useState(user?.social?.facebook         ?? "");
  const [instagram, setInstagram] = useState(user?.social?.instagram        ?? "");
  const [tiktok,    setTiktok]    = useState(user?.social?.tiktok           ?? "");
  const [socialX,   setSocialX]   = useState(user?.social?.x                ?? "");
  const [youtube,   setYoutube]   = useState(user?.social?.youtube          ?? "");
  const [linkedin,  setLinkedin]  = useState(user?.social?.linkedin         ?? "");

  /* ── Social link validity (null = empty/ok, true = valid, false = invalid) */
  const [socialValid, setSocialValid] = useState<ValidityMap>(() => ({
    website:   validateSocialUrl("website",   (user as any)?.website         ?? ""),
    facebook:  validateSocialUrl("facebook",  user?.social?.facebook         ?? ""),
    instagram: validateSocialUrl("instagram", user?.social?.instagram        ?? ""),
    tiktok:    validateSocialUrl("tiktok",    user?.social?.tiktok           ?? ""),
    x:         validateSocialUrl("x",         user?.social?.x                ?? ""),
    youtube:   validateSocialUrl("youtube",   user?.social?.youtube          ?? ""),
    linkedin:  validateSocialUrl("linkedin",  user?.social?.linkedin         ?? ""),
  }));

  const hasInvalidLinks = useMemo(
    () => Object.values(socialValid).some((v) => v === false),
    [socialValid],
  );

  const updateSocialValid = useCallback((platform: SocialPlatform, valid: boolean | null) => {
    setSocialValid((prev) => ({ ...prev, [platform]: valid }));
  }, []);

  /* ── Location ───────────────────────────────────────────────── */
  const [locationData, setLocationData] = useState<LocationData>({
    displayName: (user as any)?.location          ?? "",
    city:        (user as any)?.location_city     ?? "",
    province:    (user as any)?.location_province ?? "",
    country:     (user as any)?.location_country  ?? "",
    lat:         (user as any)?.location_lat      ?? null,
    lng:         (user as any)?.location_lng      ?? null,
  });

  /* ── Personal ───────────────────────────────────────────────── */
  const [birthday,     setBirthday]     = useState((user as any)?.birthday           ?? "");
  const [gender,       setGender]       = useState((user as any)?.gender             ?? "Prefer not to say");
  const [relationship, setRelationship] = useState((user as any)?.relationshipStatus ?? "Prefer not to say");

  /* ── Work & Education ───────────────────────────────────────── */
  const [work,      setWork]      = useState((user as any)?.work         ?? "");
  const [workPrev,  setWorkPrev]  = useState((user as any)?.workPrevious ?? "");
  const [school,    setSchool]    = useState((user as any)?.school       ?? "");
  const [college,   setCollege]   = useState((user as any)?.college      ?? "");
  const [education, setEducation] = useState((user as any)?.education    ?? "");

  /* ── Contact (public) ───────────────────────────────────────── */
  const [publicEmail, setPublicEmail] = useState((user as any)?.public_email ?? "");
  const [publicPhone, setPublicPhone] = useState((user as any)?.public_phone ?? "");

  /* ── Privacy ────────────────────────────────────────────────── */
  const [privacy, setPrivacy] = useState<PrivacySettings>(() => {
    const stored = (user as any)?.privacySettings;
    return stored ? { ...defaultPrivacy(), ...stored } : defaultPrivacy();
  });

  /* ── Avatar / cover ─────────────────────────────────────────── */
  const [avatarSrc,       setAvatarSrc]       = useState<string | null>(user?.avatar ?? null);
  const [coverSrc,        setCoverSrc]        = useState<string | null>(initialCoverUrl);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [coverUploading,  setCoverUploading]  = useState(false);
  const avatarRef = useRef<HTMLInputElement>(null);
  const coverRef  = useRef<HTMLInputElement>(null);

  /* ── Save state ─────────────────────────────────────────────── */
  const [saving, setSaving] = useState(false);
  const [saved,  setSaved]  = useState(false);
  const [error,  setError]  = useState("");

  /* ─────────────────────────────────────────────────────────────
     Handlers
  ───────────────────────────────────────────────────────────── */
  const handleAvatarPick = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setAvatarUploading(true); setError("");
    try {
      const url = await uploadAvatar(file, user.id);
      setAvatarSrc(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Avatar upload failed");
    } finally {
      setAvatarUploading(false);
      if (avatarRef.current) avatarRef.current.value = "";
    }
  }, [user]);

  const handleCoverPick = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setCoverUploading(true); setError("");
    try {
      const url = await uploadCoverPhoto(file, user.id);
      setCoverSrc(url);
      await supabase.from("users").update({ cover_photo_url: url }).eq("id", user.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Cover upload failed");
    } finally {
      setCoverUploading(false);
      if (coverRef.current) coverRef.current.value = "";
    }
  }, [user]);

  const removeCover = useCallback(async () => {
    if (!user) return;
    setCoverSrc(null);
    try { await supabase.from("users").update({ cover_photo_url: null }).eq("id", user.id); } catch { /* ok */ }
  }, [user]);

  const handleSave = useCallback(async () => {
    if (!user || saving || hasInvalidLinks) return;
    setSaving(true); setError("");

    const cleanHandle = handle.trim().replace(/^@/, "") || user.handle;
    const updates: Partial<StoreUser> = {
      ...user,
      name:              name.trim() || user.name,
      handle:            cleanHandle,
      bio:               bio.trim(),
      avatar:            avatarSrc ?? user.avatar,
      website:           website.trim(),
      location:          locationData.displayName.trim(),
      gender,
      birthday:          birthday || undefined,
      relationshipStatus: relationship,
      work:              work.trim(),
      workPrevious:      workPrev.trim(),
      school:            school.trim(),
      college:           college.trim(),
      education:         education.trim(),
      public_email:      publicEmail.trim(),
      public_phone:      publicPhone.trim(),
      social: {
        facebook:  facebook.trim(),
        instagram: instagram.trim(),
        tiktok:    tiktok.trim(),
        x:         socialX.trim(),
        youtube:   youtube.trim(),
        linkedin:  linkedin.trim(),
      },
      privacySettings: privacy,
    };

    /* Extend with new location fields (not in StoreUser type yet) */
    (updates as any).location_city     = locationData.city.trim();
    (updates as any).location_province = locationData.province.trim();
    (updates as any).location_country  = locationData.country.trim();
    (updates as any).location_lat      = locationData.lat;
    (updates as any).location_lng      = locationData.lng;

    /* Optimistic store update */
    setUser(updates as StoreUser);

    if (isSupabaseReady) {
      try {
        await upsertProfile(user.id, {
          name:                updates.name,
          username:            cleanHandle,
          bio:                 updates.bio,
          avatar_url:          updates.avatar,
          website:             website.trim(),
          location:            locationData.displayName.trim(),
          location_city:       locationData.city.trim(),
          location_province:   locationData.province.trim(),
          location_country:    locationData.country.trim(),
          location_lat:        locationData.lat as any,
          location_lng:        locationData.lng as any,
          gender,
          birthday:            birthday || null,
          relationship_status: relationship,
          work:                work.trim(),
          education:           education.trim(),
          social_facebook:     facebook.trim(),
          social_instagram:    instagram.trim(),
          social_tiktok:       tiktok.trim(),
          social_x:            socialX.trim(),
          social_youtube:      youtube.trim(),
          social_linkedin:     linkedin.trim(),
          privacy_settings:    privacy as Record<string, boolean | string>,
          work_previous:       workPrev.trim(),
          school:              school.trim(),
          college:             college.trim(),
          public_email:        publicEmail.trim(),
          public_phone:        publicPhone.trim(),
        } as any);
      } catch (err) {
        console.warn("[EditProfileModal] save error:", err);
      }
    }

    setSaving(false); setSaved(true);
    setTimeout(() => {
      setSaved(false);
      onSaved(updates, coverSrc);
      onClose();
    }, 700);
  }, [
    user, saving, hasInvalidLinks, name, handle, bio, avatarSrc,
    website, locationData, gender, birthday, relationship,
    work, workPrev, school, college, education,
    facebook, instagram, tiktok, socialX, youtube, linkedin,
    privacy, coverSrc, publicEmail, publicPhone,
    setUser, onSaved, onClose,
  ]);

  if (!user) return null;
  const initials = (user.name || "?").charAt(0).toUpperCase();

  const saveDisabled = saving || hasInvalidLinks;

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] bg-black/75"
            onClick={onClose}
          />

          {/* Sheet */}
          <motion.div
            initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 340, damping: 38 }}
            className="fixed inset-x-0 bottom-0 z-[60] overflow-y-auto hide-scrollbar"
            style={{
              maxHeight:   "96dvh",
              background:  "#08080f",
              borderTop:   "1px solid rgba(255,255,255,0.07)",
              borderRadius: "24px 24px 0 0",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Pull handle */}
            <div className="flex justify-center pt-3 pb-1.5">
              <div className="h-[3px] w-9 rounded-full" style={{ background: "rgba(255,255,255,0.14)" }} />
            </div>

            {/* ── Sticky header ── */}
            <div
              className="sticky top-0 z-10 flex items-center justify-between px-4 py-2.5"
              style={{
                background:    "rgba(8,8,15,0.96)",
                backdropFilter: "blur(20px)",
                borderBottom:  "1px solid rgba(255,255,255,0.06)",
              }}
            >
              <motion.button
                type="button" whileTap={{ scale: 0.9 }} onClick={onClose}
                className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-semibold"
                style={{ color: "rgba(255,255,255,0.5)", background: "rgba(255,255,255,0.07)" }}
              >
                <X style={{ width: 12, height: 12 }} /> Cancel
              </motion.button>

              <span className="text-[14px] font-bold" style={{ color: "hsl(var(--foreground))" }}>
                Edit Profile
              </span>

              <motion.button
                type="button" whileTap={{ scale: 0.92 }} onClick={handleSave}
                disabled={saveDisabled}
                className="flex items-center gap-1.5 rounded-full px-4 py-1.5 text-[12px] font-bold text-white transition-opacity"
                style={{
                  background: saved
                    ? "#16a34a"
                    : hasInvalidLinks
                    ? "rgba(239,68,68,0.35)"
                    : "linear-gradient(135deg,var(--accent-primary),var(--accent-secondary))",
                  opacity: saveDisabled && !hasInvalidLinks ? 0.55 : 1,
                }}
              >
                {saving
                  ? <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  : saved
                  ? <Check style={{ width: 12, height: 12 }} />
                  : hasInvalidLinks
                  ? <AlertCircle style={{ width: 12, height: 12 }} />
                  : <Check style={{ width: 12, height: 12 }} />}
                {saved ? "Saved!" : saving ? "Saving…" : hasInvalidLinks ? "Fix links" : "Save"}
              </motion.button>
            </div>

            {/* ── Body ── */}
            <div className="px-4 pb-24 space-y-4 pt-5">

              {/* Error banner */}
              {error && (
                <div className="rounded-[12px] px-4 py-2.5 text-[12px] text-red-400 flex items-center gap-2"
                  style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)" }}>
                  <AlertCircle style={{ width: 14, height: 14, flexShrink: 0 }} /> {error}
                </div>
              )}

              {/* Invalid links banner */}
              {hasInvalidLinks && (
                <div className="rounded-[12px] px-4 py-2.5 text-[12px] flex items-center gap-2"
                  style={{ background: "rgba(239,68,68,0.07)", border: "1px solid rgba(239,68,68,0.18)", color: "#fca5a5" }}>
                  <AlertCircle style={{ width: 14, height: 14, flexShrink: 0, color: "#ef4444" }} />
                  One or more social links have invalid URLs. Fix them to save.
                </div>
              )}

              {/* ════════════════════════════════════════════════
                  SECTION: Photos
              ════════════════════════════════════════════════ */}
              <SectionCard icon={<Camera style={{ width: 14, height: 14 }} />} title="Photos">
                {/* Cover photo */}
                <div
                  className="relative w-full rounded-[14px] overflow-hidden cursor-pointer"
                  style={{ height: 112, background: "rgba(255,255,255,0.04)", border: "1px dashed rgba(255,255,255,0.12)" }}
                  onClick={() => coverRef.current?.click()}
                >
                  {coverSrc ? (
                    <img src={coverSrc} alt="cover" className="absolute inset-0 w-full h-full object-cover" />
                  ) : (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 opacity-40">
                      <Camera style={{ width: 20, height: 20, color: "white" }} />
                      <span className="text-[11px] text-white font-medium">Add cover photo</span>
                    </div>
                  )}
                  {coverSrc && (
                    <div className="absolute inset-0 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.38)" }}>
                      {coverUploading
                        ? <span className="h-6 w-6 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                        : <Camera style={{ width: 20, height: 20, color: "white" }} />}
                    </div>
                  )}
                </div>

                {coverSrc && (
                  <motion.button type="button" whileTap={{ scale: 0.93 }} onClick={removeCover}
                    className="text-[11px] font-semibold" style={{ color: "#f87171" }}>
                    Remove cover photo
                  </motion.button>
                )}

                {/* Avatar row */}
                <div className="flex items-center gap-4 pt-1">
                  <div
                    className="relative cursor-pointer flex-shrink-0"
                    onClick={() => avatarRef.current?.click()}
                  >
                    <div className="h-[70px] w-[70px] overflow-hidden rounded-full"
                      style={{ border: "2px solid rgba(168,85,247,0.4)" }}>
                      {avatarSrc ? (
                        <img src={avatarSrc} alt="avatar"
                          className={"h-full w-full object-cover " + (avatarUploading ? "opacity-50" : "")} />
                      ) : (
                        <div className="h-full w-full bg-gradient-to-br from-purple-600 via-pink-500 to-blue-600 grid place-items-center text-xl font-bold text-white">
                          {avatarUploading
                            ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                            : initials}
                        </div>
                      )}
                    </div>
                    <div
                      className="absolute -bottom-0.5 -right-0.5 grid h-6 w-6 place-items-center rounded-full text-white"
                      style={{
                        background: "linear-gradient(135deg,var(--accent-primary),var(--accent-secondary))",
                        border: "2px solid #08080f",
                      }}
                    >
                      <Camera style={{ width: 11, height: 11 }} />
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-bold truncate" style={{ color: "hsl(var(--foreground))" }}>
                      {name || user.name}
                    </p>
                    <p className="text-[11px]" style={{ color: "rgba(255,255,255,0.4)" }}>@{handle || user.handle}</p>
                    <button
                      type="button"
                      onClick={() => avatarRef.current?.click()}
                      className="mt-1 text-[11px] font-semibold"
                      style={{ color: "var(--accent-primary)" }}
                    >
                      Change avatar
                    </button>
                  </div>
                </div>

                <input ref={avatarRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarPick} />
                <input ref={coverRef}  type="file" accept="image/*" className="hidden" onChange={handleCoverPick} />
              </SectionCard>

              {/* ════════════════════════════════════════════════
                  SECTION: Basic Info
              ════════════════════════════════════════════════ */}
              <SectionCard icon={<User style={{ width: 14, height: 14 }} />} title="Basic Info">
                <FieldLabel label="Display Name">
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Your display name"
                    className="app-input w-full rounded-[12px] px-4 py-2.5 text-[14px] font-semibold focus:outline-none"
                    style={{ color: "hsl(var(--foreground))" }}
                  />
                </FieldLabel>

                <FieldLabel label="Username">
                  <div className="app-input flex items-center rounded-[12px] overflow-hidden">
                    <span className="pl-4 text-sm select-none" style={{ color: "rgba(255,255,255,0.35)" }}>@</span>
                    <input
                      value={handle}
                      onChange={(e) => setHandle(e.target.value.replace(/^@/, ""))}
                      placeholder="username"
                      className="flex-1 bg-transparent px-2 py-2.5 text-[14px] focus:outline-none"
                      style={{ color: "hsl(var(--foreground))" }}
                      autoCapitalize="none"
                      autoCorrect="off"
                    />
                  </div>
                </FieldLabel>

                <FieldLabel label={`Bio (${bio.length}/280)`}>
                  <textarea
                    value={bio}
                    onChange={(e) => setBio(e.target.value.slice(0, 280))}
                    placeholder="Tell the world about yourself…"
                    rows={3}
                    className="app-input w-full rounded-[12px] px-4 py-2.5 text-[13px] focus:outline-none resize-none"
                    style={{ color: "hsl(var(--foreground))" }}
                  />
                </FieldLabel>
              </SectionCard>

              {/* ════════════════════════════════════════════════
                  SECTION: Contact Info
              ════════════════════════════════════════════════ */}
              <SectionCard icon={<Mail style={{ width: 14, height: 14 }} />} title="Contact Info">
                <p className="text-[11px] pb-1" style={{ color: "rgba(255,255,255,0.28)" }}>
                  These fields are shown publicly on your profile. Leave empty to hide.
                </p>

                <FieldLabel label="Public Email">
                  <div className="app-input flex items-center rounded-[12px] overflow-hidden">
                    <span className="pl-3.5 flex-shrink-0" style={{ color: "rgba(255,255,255,0.30)" }}>
                      <Mail style={{ width: 14, height: 14 }} />
                    </span>
                    <input
                      type="email"
                      value={publicEmail}
                      onChange={(e) => setPublicEmail(e.target.value)}
                      placeholder="hello@yourdomain.com"
                      className="flex-1 bg-transparent px-3 py-2.5 text-[13.5px] focus:outline-none"
                      style={{ color: "hsl(var(--foreground))" }}
                    />
                  </div>
                </FieldLabel>

                <FieldLabel label="Public Phone">
                  <div className="app-input flex items-center rounded-[12px] overflow-hidden">
                    <span className="pl-3.5 flex-shrink-0" style={{ color: "rgba(255,255,255,0.30)" }}>
                      <Phone style={{ width: 14, height: 14 }} />
                    </span>
                    <input
                      type="tel"
                      value={publicPhone}
                      onChange={(e) => setPublicPhone(e.target.value)}
                      placeholder="+63 912 345 6789"
                      className="flex-1 bg-transparent px-3 py-2.5 text-[13.5px] focus:outline-none"
                      style={{ color: "hsl(var(--foreground))" }}
                    />
                  </div>
                </FieldLabel>
              </SectionCard>

              {/* ════════════════════════════════════════════════
                  SECTION: Social Links
              ════════════════════════════════════════════════ */}
              <SectionCard icon={<Globe style={{ width: 14, height: 14 }} />} title="Social Links">
                <p className="text-[11px] pb-0.5" style={{ color: "rgba(255,255,255,0.28)" }}>
                  Enter full URLs only (e.g. https://facebook.com/yourprofile). Empty fields are allowed.
                </p>

                <SocialLinkInput
                  platform="website"
                  icon={<Globe style={{ width: 14, height: 14 }} />}
                  label="Website"
                  value={website}
                  onChange={setWebsite}
                  onValidChange={updateSocialValid}
                />
                <SocialLinkInput
                  platform="facebook"
                  icon={<FbIcon />}
                  label="Facebook"
                  value={facebook}
                  onChange={setFacebook}
                  onValidChange={updateSocialValid}
                />
                <SocialLinkInput
                  platform="instagram"
                  icon={<IgIcon />}
                  label="Instagram"
                  value={instagram}
                  onChange={setInstagram}
                  onValidChange={updateSocialValid}
                />
                <SocialLinkInput
                  platform="tiktok"
                  icon={<TtIcon />}
                  label="TikTok"
                  value={tiktok}
                  onChange={setTiktok}
                  onValidChange={updateSocialValid}
                />
                <SocialLinkInput
                  platform="x"
                  icon={<XIcon />}
                  label="X / Twitter"
                  value={socialX}
                  onChange={setSocialX}
                  onValidChange={updateSocialValid}
                />
                <SocialLinkInput
                  platform="youtube"
                  icon={<YtIcon />}
                  label="YouTube"
                  value={youtube}
                  onChange={setYoutube}
                  onValidChange={updateSocialValid}
                />
                <SocialLinkInput
                  platform="linkedin"
                  icon={<LiIcon />}
                  label="LinkedIn"
                  value={linkedin}
                  onChange={setLinkedin}
                  onValidChange={updateSocialValid}
                />
              </SectionCard>

              {/* ════════════════════════════════════════════════
                  SECTION: Work & Education
              ════════════════════════════════════════════════ */}
              <SectionCard icon={<Briefcase style={{ width: 14, height: 14 }} />} title="Work & Education">
                <FieldLabel label="Current Work / Occupation">
                  <div className="app-input flex items-center rounded-[12px] overflow-hidden">
                    <span className="pl-3.5 flex-shrink-0" style={{ color: "rgba(255,255,255,0.30)" }}>
                      <Briefcase style={{ width: 14, height: 14 }} />
                    </span>
                    <input
                      value={work}
                      onChange={(e) => setWork(e.target.value)}
                      placeholder="Job title or company"
                      className="flex-1 bg-transparent px-3 py-2.5 text-[13.5px] focus:outline-none"
                      style={{ color: "hsl(var(--foreground))" }}
                    />
                  </div>
                </FieldLabel>

                <FieldLabel label="Previous Work">
                  <div className="app-input flex items-center rounded-[12px] overflow-hidden">
                    <span className="pl-3.5 flex-shrink-0" style={{ color: "rgba(255,255,255,0.30)" }}>
                      <Briefcase style={{ width: 14, height: 14 }} />
                    </span>
                    <input
                      value={workPrev}
                      onChange={(e) => setWorkPrev(e.target.value)}
                      placeholder="Previous employer or role"
                      className="flex-1 bg-transparent px-3 py-2.5 text-[13.5px] focus:outline-none"
                      style={{ color: "hsl(var(--foreground))" }}
                    />
                  </div>
                </FieldLabel>

                <FieldLabel label="College / University">
                  <div className="app-input flex items-center rounded-[12px] overflow-hidden">
                    <span className="pl-3.5 flex-shrink-0" style={{ color: "rgba(255,255,255,0.30)" }}>
                      <GraduationCap style={{ width: 14, height: 14 }} />
                    </span>
                    <input
                      value={college}
                      onChange={(e) => setCollege(e.target.value)}
                      placeholder="College or university name"
                      className="flex-1 bg-transparent px-3 py-2.5 text-[13.5px] focus:outline-none"
                      style={{ color: "hsl(var(--foreground))" }}
                    />
                  </div>
                </FieldLabel>

                <FieldLabel label="School">
                  <div className="app-input flex items-center rounded-[12px] overflow-hidden">
                    <span className="pl-3.5 flex-shrink-0" style={{ color: "rgba(255,255,255,0.30)" }}>
                      <GraduationCap style={{ width: 14, height: 14 }} />
                    </span>
                    <input
                      value={school}
                      onChange={(e) => setSchool(e.target.value)}
                      placeholder="High school or secondary school"
                      className="flex-1 bg-transparent px-3 py-2.5 text-[13.5px] focus:outline-none"
                      style={{ color: "hsl(var(--foreground))" }}
                    />
                  </div>
                </FieldLabel>

                <FieldLabel label="Other Education">
                  <div className="app-input flex items-center rounded-[12px] overflow-hidden">
                    <span className="pl-3.5 flex-shrink-0" style={{ color: "rgba(255,255,255,0.30)" }}>
                      <GraduationCap style={{ width: 14, height: 14 }} />
                    </span>
                    <input
                      value={education}
                      onChange={(e) => setEducation(e.target.value)}
                      placeholder="Courses, certifications, other"
                      className="flex-1 bg-transparent px-3 py-2.5 text-[13.5px] focus:outline-none"
                      style={{ color: "hsl(var(--foreground))" }}
                    />
                  </div>
                </FieldLabel>
              </SectionCard>

              {/* ════════════════════════════════════════════════
                  SECTION: Personal Info
              ════════════════════════════════════════════════ */}
              <SectionCard icon={<Heart style={{ width: 14, height: 14 }} />} title="Personal Info">
                <FieldLabel label="Birthday">
                  <div className="app-input flex items-center rounded-[12px] overflow-hidden">
                    <span className="pl-3.5 flex-shrink-0" style={{ color: "rgba(255,255,255,0.30)" }}>
                      <Calendar style={{ width: 14, height: 14 }} />
                    </span>
                    <input
                      type="date"
                      value={birthday}
                      onChange={(e) => setBirthday(e.target.value)}
                      className="flex-1 bg-transparent px-3 py-2.5 text-[13.5px] focus:outline-none"
                      style={{ color: "hsl(var(--foreground))" }}
                    />
                  </div>
                </FieldLabel>

                <FieldLabel label="Gender">
                  <div className="flex flex-wrap gap-2">
                    {GENDER_OPTIONS.map((g) => (
                      <ChipBtn key={g} active={gender === g} onClick={() => setGender(g)} color="purple">{g}</ChipBtn>
                    ))}
                  </div>
                </FieldLabel>

                <FieldLabel label="Relationship Status">
                  <div className="flex flex-wrap gap-2">
                    {RELATIONSHIP_OPTIONS.map((r) => (
                      <ChipBtn key={r} active={relationship === r} onClick={() => setRelationship(r)} color="pink">{r}</ChipBtn>
                    ))}
                  </div>
                </FieldLabel>
              </SectionCard>

              {/* ════════════════════════════════════════════════
                  SECTION: Location
              ════════════════════════════════════════════════ */}
              <SectionCard icon={<MapPin style={{ width: 14, height: 14 }} />} title="Location">
                <p className="text-[11px] pb-1" style={{ color: "rgba(255,255,255,0.28)" }}>
                  Select from the dropdown to save your exact location. Typing only does not save.
                </p>
                <LocationSearch value={locationData} onChange={setLocationData} />
              </SectionCard>

              {/* ════════════════════════════════════════════════
                  SECTION: Privacy
              ════════════════════════════════════════════════ */}
              <SectionCard icon={<Shield style={{ width: 14, height: 14 }} />} title="Privacy">
                <FieldLabel label="Posts visible to">
                  <div className="flex gap-2">
                    {POST_VISIBILITY.map((v) => (
                      <motion.button
                        key={v} type="button" whileTap={{ scale: 0.93 }}
                        onClick={() => setPrivacy((p) => ({ ...p, postsVisibility: v }))}
                        className="flex-1 rounded-[11px] py-2.5 text-[11px] font-semibold text-center transition-all"
                        style={{
                          background: privacy.postsVisibility === v ? "rgba(168,85,247,0.18)" : "rgba(255,255,255,0.04)",
                          border:     privacy.postsVisibility === v ? "1px solid rgba(168,85,247,0.5)" : "1px solid rgba(255,255,255,0.07)",
                          color:      privacy.postsVisibility === v ? "#a855f7" : "rgba(255,255,255,0.38)",
                        }}
                      >{v}</motion.button>
                    ))}
                  </div>
                </FieldLabel>

                <FieldLabel label="Who can message me">
                  <div className="flex gap-2">
                    {MESSAGE_PERM.map((v) => (
                      <motion.button
                        key={v} type="button" whileTap={{ scale: 0.93 }}
                        onClick={() => setPrivacy((p) => ({ ...p, whoCanMessage: v }))}
                        className="flex-1 rounded-[11px] py-2.5 text-[11px] font-semibold text-center transition-all"
                        style={{
                          background: privacy.whoCanMessage === v ? "rgba(59,130,246,0.18)" : "rgba(255,255,255,0.04)",
                          border:     privacy.whoCanMessage === v ? "1px solid rgba(59,130,246,0.5)" : "1px solid rgba(255,255,255,0.07)",
                          color:      privacy.whoCanMessage === v ? "#60a5fa" : "rgba(255,255,255,0.38)",
                        }}
                      >{v}</motion.button>
                    ))}
                  </div>
                </FieldLabel>

                <div className="rounded-[14px] overflow-hidden divide-y divide-white/5"
                  style={{ border: "1px solid rgba(255,255,255,0.07)" }}>
                  <PrivacyToggle label="Show location on profile"   value={privacy.showLocation    ?? true}  onChange={(v) => setPrivacy((p) => ({ ...p, showLocation: v }))} />
                  <PrivacyToggle label="Show birthday on profile"   value={privacy.showBirthday    ?? false} onChange={(v) => setPrivacy((p) => ({ ...p, showBirthday: v }))} />
                  <PrivacyToggle label="Show relationship status"   value={privacy.showRelationship ?? true}  onChange={(v) => setPrivacy((p) => ({ ...p, showRelationship: v }))} />
                  <PrivacyToggle label="Show gender on profile"     value={privacy.showGender      ?? false} onChange={(v) => setPrivacy((p) => ({ ...p, showGender: v }))} />
                  <PrivacyToggle label="Show contact info publicly" value={privacy.showContact     ?? true}  onChange={(v) => setPrivacy((p) => ({ ...p, showContact: v }))} />
                </div>
              </SectionCard>

            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

/* ─────────────────────────────────────────────────────────────────
   Sub-components
───────────────────────────────────────────────────────────────── */

function SectionCard({
  icon, title, children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="rounded-[18px] overflow-hidden"
      style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.07)" }}
    >
      {/* Section header */}
      <div
        className="flex items-center gap-2.5 px-4 py-3"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.055)" }}
      >
        <span style={{ color: "#a855f7" }}>{icon}</span>
        <span
          className="text-[10.5px] font-black uppercase tracking-[0.17em]"
          style={{ color: "rgba(168,85,247,0.8)" }}
        >
          {title}
        </span>
      </div>
      {/* Section body */}
      <div className="px-4 py-4 space-y-3.5">
        {children}
      </div>
    </div>
  );
}

function FieldLabel({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-[11px] font-semibold" style={{ color: "rgba(255,255,255,0.42)" }}>
        {label}
      </label>
      {children}
    </div>
  );
}

function ChipBtn({
  active, onClick, color, children,
}: {
  active: boolean; onClick: () => void; color: "purple" | "pink"; children: React.ReactNode;
}) {
  const a = color === "purple"
    ? { bg: "rgba(168,85,247,0.18)", border: "rgba(168,85,247,0.5)", text: "#a855f7" }
    : { bg: "rgba(236,72,153,0.18)", border: "rgba(236,72,153,0.5)", text: "#ec4899" };

  return (
    <motion.button
      type="button" whileTap={{ scale: 0.93 }} onClick={onClick}
      className="rounded-full px-3 py-1.5 text-[11.5px] font-semibold transition-all"
      style={{
        background: active ? a.bg  : "rgba(255,255,255,0.05)",
        border:     active ? `1px solid ${a.border}` : "1px solid rgba(255,255,255,0.09)",
        color:      active ? a.text : "rgba(255,255,255,0.42)",
      }}
    >
      {children}
    </motion.button>
  );
}

function PrivacyToggle({
  label, value, onChange,
}: {
  label: string; value: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <div
      className="flex items-center justify-between px-4 py-3.5 transition-colors"
      style={{ background: "transparent" }}
    >
      <span className="text-[13px] font-medium" style={{ color: "hsl(var(--foreground))" }}>
        {label}
      </span>
      <motion.button
        type="button" whileTap={{ scale: 0.88 }}
        onClick={() => onChange(!value)}
        className="relative flex-shrink-0 h-[26px] w-[46px] rounded-full transition-colors"
        style={{
          background: value
            ? "linear-gradient(135deg,var(--accent-primary),var(--accent-secondary))"
            : "rgba(255,255,255,0.12)",
        }}
        aria-checked={value}
        role="switch"
      >
        <motion.span
          className="absolute top-[3px] h-5 w-5 rounded-full bg-white shadow-sm"
          animate={{ left: value ? "calc(100% - 23px)" : "3px" }}
          transition={{ type: "spring", stiffness: 500, damping: 40 }}
        />
      </motion.button>
    </div>
  );
}
