/**
 * EditProfileModal.tsx — Full-screen slide-up edit modal.
 *
 * Sections: Photos · Basic Info · Social Links · Personal · Work & Education · Privacy
 *
 * All fields save to Supabase (if ready) via upsertProfile + social update,
 * with localStorage as an always-hot fallback.
 */
import { useState, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X, Check, Camera, Globe, MapPin, Calendar,
  Briefcase, GraduationCap,
} from "lucide-react";
import { uploadAvatar, upsertProfile, isSupabaseReady, supabase } from "@/lib/supabase";
import { uploadCoverPhoto } from "@/lib/postsClient";
import { useAppStore } from "@/lib/store";
import type { User, PrivacySettings } from "@/lib/store";

/* ── Inline SVG social icons not in lucide ─────────────────────────────── */
function FbIcon()  { return <svg viewBox="0 0 24 24" fill="currentColor" style={{width:14,height:14}}><path d="M18 2h-3a5 5 0 00-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 011-1h3z"/></svg>; }
function IgIcon()  { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{width:14,height:14}}><rect x="2" y="2" width="20" height="20" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor"/></svg>; }
function TtIcon()  { return <svg viewBox="0 0 24 24" fill="currentColor" style={{width:14,height:14}}><path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.28 6.28 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V8.69a8.18 8.18 0 004.77 1.53V6.77a4.85 4.85 0 01-1-.08z"/></svg>; }
function XIcon()   { return <svg viewBox="0 0 24 24" fill="currentColor" style={{width:14,height:14}}><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.741l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>; }
function YtIcon()  { return <svg viewBox="0 0 24 24" fill="currentColor" style={{width:14,height:14}}><path d="M22.54 6.42a2.78 2.78 0 00-1.95-1.96C18.88 4 12 4 12 4s-6.88 0-8.59.46a2.78 2.78 0 00-1.95 1.96A29 29 0 001 12a29 29 0 00.46 5.58 2.78 2.78 0 001.95 1.96C5.12 20 12 20 12 20s6.88 0 8.59-.46a2.78 2.78 0 001.95-1.96A29 29 0 0023 12a29 29 0 00-.46-5.58zM9.75 15.02V8.98L15.5 12l-5.75 3.02z"/></svg>; }
function LiIcon()  { return <svg viewBox="0 0 24 24" fill="currentColor" style={{width:14,height:14}}><path d="M16 8a6 6 0 016 6v7h-4v-7a2 2 0 00-2-2 2 2 0 00-2 2v7h-4v-7a6 6 0 016-6zM2 9h4v12H2z"/><circle cx="4" cy="4" r="2"/></svg>; }

/* ── Option lists ──────────────────────────────────────────────────────── */
const GENDER_OPTIONS       = ["Prefer not to say","Male","Female","Non-binary","Other"];
const RELATIONSHIP_OPTIONS = ["Prefer not to say","Single","In a relationship","Engaged","Married","It's complicated","Open relationship","Widowed"];
const POST_VISIBILITY      = ["Everyone","Followers only","Only me"];
const MESSAGE_PERM         = ["Everyone","Followers only","No one"];

function defaultPrivacy(): PrivacySettings {
  return { postsVisibility: "Everyone", whoCanMessage: "Everyone", showLocation: true, showBirthday: false, showRelationship: true };
}

/* ── Props ─────────────────────────────────────────────────────────────── */
interface Props {
  open:           boolean;
  onClose:        () => void;
  onSaved:        (updates: Partial<User>, newCoverUrl: string | null) => void;
  initialCoverUrl: string | null;
}

/* ══════════════════════════════════════════════════════════════════════════
   EditProfileModal
══════════════════════════════════════════════════════════════════════════ */
export function EditProfileModal({ open, onClose, onSaved, initialCoverUrl }: Props) {
  const user    = useAppStore((s) => s.user);
  const setUser = useAppStore((s) => s.setUser);

  /* ── Basic info ─────────────────────────────────────────────────────── */
  const [name,   setName]   = useState(user?.name   ?? "");
  const [handle, setHandle] = useState(user?.handle ?? "");
  const [bio,    setBio]    = useState(user?.bio    ?? "");

  /* ── Social links ───────────────────────────────────────────────────── */
  const [website,   setWebsite]   = useState((user as any)?.website          ?? "");
  const [facebook,  setFacebook]  = useState(user?.social?.facebook          ?? "");
  const [instagram, setInstagram] = useState(user?.social?.instagram         ?? "");
  const [tiktok,    setTiktok]    = useState(user?.social?.tiktok            ?? "");
  const [socialX,   setSocialX]   = useState(user?.social?.x                 ?? "");
  const [youtube,   setYoutube]   = useState(user?.social?.youtube           ?? "");
  const [linkedin,  setLinkedin]  = useState(user?.social?.linkedin          ?? "");

  /* ── Personal ───────────────────────────────────────────────────────── */
  const [location,     setLocation]     = useState((user as any)?.location          ?? "");
  const [birthday,     setBirthday]     = useState((user as any)?.birthday          ?? "");
  const [gender,       setGender]       = useState((user as any)?.gender            ?? "Prefer not to say");
  const [relationship, setRelationship] = useState((user as any)?.relationshipStatus ?? "Prefer not to say");

  /* ── Work & Education ───────────────────────────────────────────────── */
  const [work,      setWork]      = useState((user as any)?.work      ?? "");
  const [education, setEducation] = useState((user as any)?.education ?? "");

  /* ── Privacy ────────────────────────────────────────────────────────── */
  const [privacy, setPrivacy] = useState<PrivacySettings>(() => {
    const stored = (user as any)?.privacySettings;
    return stored ? { ...defaultPrivacy(), ...stored } : defaultPrivacy();
  });

  /* ── Avatar / cover ─────────────────────────────────────────────────── */
  const [avatarSrc,      setAvatarSrc]      = useState<string | null>(user?.avatar ?? null);
  const [coverSrc,       setCoverSrc]       = useState<string | null>(initialCoverUrl);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [coverUploading,  setCoverUploading]  = useState(false);
  const avatarRef = useRef<HTMLInputElement>(null);
  const coverRef  = useRef<HTMLInputElement>(null);

  /* ── Save state ─────────────────────────────────────────────────────── */
  const [saving, setSaving] = useState(false);
  const [saved,  setSaved]  = useState(false);
  const [error,  setError]  = useState("");

  /* ── Handlers ───────────────────────────────────────────────────────── */
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
    if (!user || saving) return;
    setSaving(true); setError("");

    const cleanHandle = handle.trim().replace(/^@/, "") || user.handle;
    const updates: Partial<User> = {
      ...user,
      name:              name.trim()  || user.name,
      handle:            cleanHandle,
      bio:               bio.trim(),
      avatar:            avatarSrc    ?? user.avatar,
      website:           website.trim(),
      location:          location.trim(),
      gender,
      birthday:          birthday || undefined,
      relationshipStatus: relationship,
      work:              work.trim(),
      education:         education.trim(),
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

    /* Optimistic update */
    setUser(updates as User);

    if (isSupabaseReady) {
      try {
        await upsertProfile(user.id, {
          name:                updates.name,
          username:            cleanHandle,
          bio:                 updates.bio,
          avatar_url:          updates.avatar,
          website:             website.trim(),
          location:            location.trim(),
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
    user, saving, name, handle, bio, avatarSrc, website, location, gender, birthday,
    relationship, work, education, facebook, instagram, tiktok, socialX, youtube, linkedin,
    privacy, coverSrc, setUser, onSaved, onClose,
  ]);

  if (!user) return null;
  const initials = (user.name || "?").charAt(0).toUpperCase();

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] bg-black/70"
            onClick={onClose}
          />

          {/* Sheet */}
          <motion.div
            initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 340, damping: 38 }}
            className="fixed inset-x-0 bottom-0 z-[60] overflow-y-auto hide-scrollbar rounded-t-[28px]"
            style={{
              maxHeight: "96dvh",
              background: "#0a0a0f",
              borderTop: "1px solid rgba(255,255,255,0.08)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Pull handle */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="h-1 w-10 rounded-full" style={{ background: "rgba(255,255,255,0.15)" }} />
            </div>

            {/* Header */}
            <div
              className="sticky top-0 z-10 flex items-center justify-between px-4 py-3"
              style={{
                background: "rgba(10,10,15,0.95)",
                backdropFilter: "blur(16px)",
                borderBottom: "1px solid rgba(255,255,255,0.06)",
              }}
            >
              <motion.button
                whileTap={{ scale: 0.9 }}
                onClick={onClose}
                className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-semibold app-text-muted"
                style={{ background: "rgba(255,255,255,0.07)" }}
              >
                <X style={{ width: 12, height: 12 }} /> Cancel
              </motion.button>

              <span className="text-[14px] font-bold app-text">Edit Profile</span>

              <motion.button
                whileTap={{ scale: 0.92 }}
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-1.5 rounded-full px-4 py-1.5 text-[12px] font-bold text-white disabled:opacity-60"
                style={{
                  background: saved
                    ? "rgba(34,197,94,0.85)"
                    : "linear-gradient(135deg,var(--accent-primary),var(--accent-secondary))",
                }}
              >
                {saving
                  ? <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  : <Check style={{ width: 12, height: 12 }} />}
                {saved ? "Saved!" : saving ? "Saving…" : "Save"}
              </motion.button>
            </div>

            {/* Body */}
            <div className="px-4 pb-20 space-y-7 pt-5">

              {/* Error banner */}
              {error && (
                <div className="rounded-[12px] px-4 py-2.5 text-[12px] text-red-400"
                  style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)" }}>
                  {error}
                </div>
              )}

              {/* ── PHOTOS ─────────────────────────────────────────────── */}
              <ModalSection label="Photos">
                {/* Cover photo area */}
                <div
                  className="relative w-full rounded-[18px] overflow-hidden cursor-pointer"
                  style={{ height: 118, background: "rgba(255,255,255,0.04)", border: "1px dashed rgba(255,255,255,0.13)" }}
                  onClick={() => coverRef.current?.click()}
                >
                  {coverSrc ? (
                    <img src={coverSrc} alt="cover" className="absolute inset-0 w-full h-full object-cover" />
                  ) : (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 opacity-40">
                      <Camera style={{ width: 22, height: 22 }} className="text-white" />
                      <span className="text-[11px] text-white font-medium">Add cover photo</span>
                    </div>
                  )}
                  {coverSrc && (
                    <div className="absolute inset-0 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.35)" }}>
                      {coverUploading
                        ? <span className="h-6 w-6 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                        : <Camera style={{ width: 22, height: 22 }} className="text-white" />}
                    </div>
                  )}
                </div>

                {coverSrc && (
                  <motion.button whileTap={{ scale: 0.93 }} onClick={removeCover}
                    className="text-[11px] text-red-400 font-semibold self-start">
                    Remove cover photo
                  </motion.button>
                )}

                {/* Avatar row */}
                <div className="flex items-center gap-4">
                  <div className="relative cursor-pointer flex-shrink-0" onClick={() => avatarRef.current?.click()}>
                    <div className="h-[72px] w-[72px] overflow-hidden rounded-full"
                      style={{ border: "2px solid rgba(168,85,247,0.45)" }}>
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
                        border: "2px solid #0a0a0f",
                      }}
                    >
                      <Camera style={{ width: 11, height: 11 }} />
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-bold app-text truncate">{name || user.name}</p>
                    <p className="text-[11px] app-text-muted">@{handle || user.handle}</p>
                    <button
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
              </ModalSection>

              {/* ── BASIC INFO ─────────────────────────────────────────── */}
              <ModalSection label="Basic Info">
                <ModalField label="Display Name">
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Your display name"
                    className="app-input w-full rounded-[13px] px-4 py-3 text-[14px] font-semibold app-text focus:outline-none"
                  />
                </ModalField>
                <ModalField label="Username">
                  <div className="app-input flex items-center rounded-[13px] overflow-hidden">
                    <span className="pl-4 text-sm app-text-muted select-none">@</span>
                    <input
                      value={handle}
                      onChange={(e) => setHandle(e.target.value.replace(/^@/, ""))}
                      placeholder="username"
                      className="flex-1 bg-transparent px-2 py-3 text-[14px] app-text focus:outline-none"
                    />
                  </div>
                </ModalField>
                <ModalField label={`Bio (${bio.length}/280)`}>
                  <textarea
                    value={bio}
                    onChange={(e) => setBio(e.target.value.slice(0, 280))}
                    placeholder="Tell the world about yourself…"
                    rows={3}
                    className="app-input w-full rounded-[13px] px-4 py-3 text-[13px] app-text focus:outline-none resize-none"
                  />
                </ModalField>
              </ModalSection>

              {/* ── SOCIAL LINKS ───────────────────────────────────────── */}
              <ModalSection label="Social Links">
                <SocialRow icon={<Globe style={{ width: 14, height: 14 }} />}  value={website}   onChange={setWebsite}   placeholder="Website URL" />
                <SocialRow icon={<FbIcon />}                                   value={facebook}  onChange={setFacebook}  placeholder="Facebook" />
                <SocialRow icon={<IgIcon />}                                   value={instagram} onChange={setInstagram} placeholder="Instagram handle" />
                <SocialRow icon={<TtIcon />}                                   value={tiktok}    onChange={setTiktok}    placeholder="TikTok handle" />
                <SocialRow icon={<XIcon />}                                    value={socialX}   onChange={setSocialX}   placeholder="X / Twitter handle" />
                <SocialRow icon={<YtIcon />}                                   value={youtube}   onChange={setYoutube}   placeholder="YouTube channel" />
                <SocialRow icon={<LiIcon />}                                   value={linkedin}  onChange={setLinkedin}  placeholder="LinkedIn profile" />
              </ModalSection>

              {/* ── PERSONAL ───────────────────────────────────────────── */}
              <ModalSection label="Personal">
                <ModalField label="Location">
                  <div className="app-input flex items-center rounded-[13px] overflow-hidden">
                    <span className="pl-4 flex-shrink-0 text-purple-400"><MapPin style={{ width: 14, height: 14 }} /></span>
                    <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="City, Country"
                      className="flex-1 bg-transparent px-3 py-3 text-[14px] app-text focus:outline-none" />
                  </div>
                </ModalField>
                <ModalField label="Birthday">
                  <div className="app-input flex items-center rounded-[13px] overflow-hidden">
                    <span className="pl-4 flex-shrink-0 text-purple-400"><Calendar style={{ width: 14, height: 14 }} /></span>
                    <input type="date" value={birthday} onChange={(e) => setBirthday(e.target.value)}
                      className="flex-1 bg-transparent px-3 py-3 text-[14px] app-text focus:outline-none" />
                  </div>
                </ModalField>
                <ModalField label="Gender">
                  <div className="flex flex-wrap gap-2">
                    {GENDER_OPTIONS.map((g) => (
                      <ChipBtn key={g} active={gender === g} onClick={() => setGender(g)} color="purple">{g}</ChipBtn>
                    ))}
                  </div>
                </ModalField>
                <ModalField label="Relationship Status">
                  <div className="flex flex-wrap gap-2">
                    {RELATIONSHIP_OPTIONS.map((r) => (
                      <ChipBtn key={r} active={relationship === r} onClick={() => setRelationship(r)} color="pink">{r}</ChipBtn>
                    ))}
                  </div>
                </ModalField>
              </ModalSection>

              {/* ── WORK & EDUCATION ───────────────────────────────────── */}
              <ModalSection label="Work & Education">
                <ModalField label="Occupation / Work">
                  <div className="app-input flex items-center rounded-[13px] overflow-hidden">
                    <span className="pl-4 flex-shrink-0 text-purple-400"><Briefcase style={{ width: 14, height: 14 }} /></span>
                    <input value={work} onChange={(e) => setWork(e.target.value)} placeholder="Job title or company"
                      className="flex-1 bg-transparent px-3 py-3 text-[14px] app-text focus:outline-none" />
                  </div>
                </ModalField>
                <ModalField label="Education">
                  <div className="app-input flex items-center rounded-[13px] overflow-hidden">
                    <span className="pl-4 flex-shrink-0 text-purple-400"><GraduationCap style={{ width: 14, height: 14 }} /></span>
                    <input value={education} onChange={(e) => setEducation(e.target.value)} placeholder="School or university"
                      className="flex-1 bg-transparent px-3 py-3 text-[14px] app-text focus:outline-none" />
                  </div>
                </ModalField>
              </ModalSection>

              {/* ── PRIVACY ────────────────────────────────────────────── */}
              <ModalSection label="Privacy">
                <ModalField label="Posts visible to">
                  <div className="flex gap-2">
                    {POST_VISIBILITY.map((v) => (
                      <motion.button
                        key={v} whileTap={{ scale: 0.93 }}
                        onClick={() => setPrivacy((p) => ({ ...p, postsVisibility: v }))}
                        className="flex-1 rounded-[12px] py-2.5 text-[11px] font-semibold text-center transition-all"
                        style={{
                          background: privacy.postsVisibility === v ? "linear-gradient(135deg,rgba(168,85,247,0.22),rgba(59,130,246,0.12))" : "rgba(255,255,255,0.04)",
                          border: privacy.postsVisibility === v ? "1px solid rgba(168,85,247,0.5)" : "1px solid rgba(255,255,255,0.08)",
                          color:  privacy.postsVisibility === v ? "#a855f7" : "rgba(255,255,255,0.4)",
                        }}
                      >{v}</motion.button>
                    ))}
                  </div>
                </ModalField>
                <ModalField label="Who can message me">
                  <div className="flex gap-2">
                    {MESSAGE_PERM.map((v) => (
                      <motion.button
                        key={v} whileTap={{ scale: 0.93 }}
                        onClick={() => setPrivacy((p) => ({ ...p, whoCanMessage: v }))}
                        className="flex-1 rounded-[12px] py-2.5 text-[11px] font-semibold text-center transition-all"
                        style={{
                          background: privacy.whoCanMessage === v ? "linear-gradient(135deg,rgba(59,130,246,0.22),rgba(168,85,247,0.12))" : "rgba(255,255,255,0.04)",
                          border: privacy.whoCanMessage === v ? "1px solid rgba(59,130,246,0.5)" : "1px solid rgba(255,255,255,0.08)",
                          color:  privacy.whoCanMessage === v ? "#60a5fa" : "rgba(255,255,255,0.4)",
                        }}
                      >{v}</motion.button>
                    ))}
                  </div>
                </ModalField>
                <div
                  className="rounded-[16px] overflow-hidden divide-y divide-white/5"
                  style={{ border: "1px solid rgba(255,255,255,0.07)" }}
                >
                  <PrivacyToggle label="Show location on profile"    value={privacy.showLocation    ?? true}  onChange={(v) => setPrivacy((p) => ({ ...p, showLocation: v }))} />
                  <PrivacyToggle label="Show birthday on profile"    value={privacy.showBirthday    ?? false} onChange={(v) => setPrivacy((p) => ({ ...p, showBirthday: v }))} />
                  <PrivacyToggle label="Show relationship status"    value={privacy.showRelationship ?? true}  onChange={(v) => setPrivacy((p) => ({ ...p, showRelationship: v }))} />
                </div>
              </ModalSection>

            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

/* ── Sub-components ──────────────────────────────────────────────────────── */

function ModalSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2.5">
        <span className="text-[10px] font-black uppercase tracking-[0.18em]"
          style={{ color: "rgba(168,85,247,0.65)" }}>
          {label}
        </span>
        <div className="flex-1 h-px" style={{ background: "rgba(168,85,247,0.12)" }} />
      </div>
      <div className="space-y-2.5">{children}</div>
    </div>
  );
}

function ModalField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-[11px] font-semibold app-text-muted">{label}</label>
      {children}
    </div>
  );
}

function SocialRow({ icon, value, onChange, placeholder }: {
  icon: React.ReactNode; value: string; onChange: (v: string) => void; placeholder: string;
}) {
  return (
    <div className="app-input flex items-center rounded-[13px] overflow-hidden">
      <span className="pl-4 flex-shrink-0 text-purple-400">{icon}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="flex-1 bg-transparent px-3 py-3 text-[13px] app-text focus:outline-none"
      />
    </div>
  );
}

function ChipBtn({ active, onClick, color, children }: {
  active: boolean; onClick: () => void; color: "purple" | "pink"; children: React.ReactNode;
}) {
  const accent = color === "purple" ? { a: "rgba(168,85,247,0.22)", b: "rgba(168,85,247,0.5)", c: "#a855f7" }
    : { a: "rgba(236,72,153,0.2)", b: "rgba(236,72,153,0.5)", c: "#ec4899" };
  return (
    <motion.button
      whileTap={{ scale: 0.93 }}
      onClick={onClick}
      className="rounded-full px-3 py-1.5 text-[11.5px] font-semibold transition-all"
      style={{
        background: active ? accent.a : "rgba(255,255,255,0.05)",
        border:     active ? `1px solid ${accent.b}` : "1px solid rgba(255,255,255,0.1)",
        color:      active ? accent.c : "rgba(255,255,255,0.45)",
      }}
    >
      {children}
    </motion.button>
  );
}

function PrivacyToggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!value)}
      className="flex items-center justify-between w-full px-4 py-3.5"
      style={{ background: "rgba(255,255,255,0.025)" }}
    >
      <span className="text-[13px] app-text">{label}</span>
      <div
        className="relative h-6 w-11 rounded-full transition-all duration-200 flex-shrink-0"
        style={{ background: value ? "linear-gradient(90deg,#a855f7,#ec4899)" : "rgba(255,255,255,0.12)" }}
      >
        <motion.div
          animate={{ x: value ? 22 : 2 }}
          transition={{ type: "spring", stiffness: 500, damping: 35 }}
          className="absolute top-1 h-4 w-4 rounded-full bg-white shadow-md"
        />
      </div>
    </button>
  );
}
