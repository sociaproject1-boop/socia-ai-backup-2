/**
 * EditProfileModal.tsx — Premium enterprise-grade profile editor.
 *
 * Sections:
 *   Photos · Basic Info · Professional · Contact · Social Links
 *   Identity · Status · Work & Education · Personal Info
 *   Location · Profile Insights · Privacy
 *
 * Key improvements:
 *   - Location uses portal-based LocationPickerModal (never clipped)
 *   - Smart email validation with domain suggestions
 *   - Smart phone validation with country flag selector
 *   - Professional headline + interest chips + skill tags
 *   - Identity: languages, timezone, pronunciation name
 *   - Mood status + emoji
 *   - Per-field visibility privacy controls
 *   - Inline field errors + shake animation + floating toast
 *   - Profile completion bar
 *   - Profile insights
 */
import { useState, useRef, useCallback, useMemo, useEffect } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  X, Check, Camera, Globe, Calendar,
  Briefcase, GraduationCap, Mail, Phone,
  User, MapPin, Heart, Shield, AlertCircle,
  Smile, Languages, Clock, Star, TrendingUp,
  Eye, Tag, ChevronDown, Sparkles, BarChart2,
  UserCheck, Link2, Plus,
} from "lucide-react";
import { uploadAvatar, upsertProfile, isSupabaseReady, supabase } from "@/lib/supabase";
import { uploadCoverPhoto } from "@/lib/postsClient";
import { useAppStore } from "@/lib/store";
import type { User as StoreUser, PrivacySettings } from "@/lib/store";
import { LocationPickerModal } from "./LocationPickerModal";
import type { LocationData } from "./LocationSearch";
import { SocialLinkInput, validateSocialUrl, type SocialPlatform } from "./SocialLinkInput";
import { EmailInput, validateEmail } from "./EmailInput";
import { PhoneInput } from "./PhoneInput";

/* ─── Shake keyframe injected once ────────────────────────────────── */
if (typeof document !== "undefined" && !document.getElementById("socia-shake-style")) {
  const s = document.createElement("style");
  s.id = "socia-shake-style";
  s.textContent = `
    @keyframes fieldShake {
      0%,100% { transform: translateX(0); }
      20%     { transform: translateX(-6px); }
      40%     { transform: translateX(6px); }
      60%     { transform: translateX(-4px); }
      80%     { transform: translateX(4px); }
    }
  `;
  document.head.appendChild(s);
}

/* ─── Inline SVG brand icons ───────────────────────────────────────── */
function FbIcon()  { return <svg viewBox="0 0 24 24" fill="currentColor" style={{ width: 14, height: 14 }}><path d="M18 2h-3a5 5 0 00-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 011-1h3z"/></svg>; }
function IgIcon()  { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 14, height: 14 }}><rect x="2" y="2" width="20" height="20" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor"/></svg>; }
function TtIcon()  { return <svg viewBox="0 0 24 24" fill="currentColor" style={{ width: 14, height: 14 }}><path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.28 6.28 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V8.69a8.18 8.18 0 004.77 1.53V6.77a4.85 4.85 0 01-1-.08z"/></svg>; }
function XIcon()   { return <svg viewBox="0 0 24 24" fill="currentColor" style={{ width: 14, height: 14 }}><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.741l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>; }
function YtIcon()  { return <svg viewBox="0 0 24 24" fill="currentColor" style={{ width: 14, height: 14 }}><path d="M22.54 6.42a2.78 2.78 0 00-1.95-1.96C18.88 4 12 4 12 4s-6.88 0-8.59.46a2.78 2.78 0 00-1.95 1.96A29 29 0 001 12a29 29 0 00.46 5.58 2.78 2.78 0 001.95 1.96C5.12 20 12 20 12 20s6.88 0 8.59-.46a2.78 2.78 0 001.95-1.96A29 29 0 0023 12a29 29 0 00-.46-5.58zM9.75 15.02V8.98L15.5 12l-5.75 3.02z"/></svg>; }
function LiIcon()  { return <svg viewBox="0 0 24 24" fill="currentColor" style={{ width: 14, height: 14 }}><path d="M16 8a6 6 0 016 6v7h-4v-7a2 2 0 00-2-2 2 2 0 00-2 2v7h-4v-7a6 6 0 016-6zM2 9h4v12H2z"/><circle cx="4" cy="4" r="2"/></svg>; }
function ThIcon()  { return <svg viewBox="0 0 24 24" fill="currentColor" style={{ width: 14, height: 14 }}><path d="M12.186 24h-.007c-3.581-.024-6.334-1.205-8.184-3.509C2.35 18.44 1.5 15.586 1.472 12.01v-.017c.028-3.579.879-6.43 2.525-8.482C5.845 1.205 8.6.024 12.18 0h.014c2.746.02 5.043.92 6.827 2.675 1.095 1.068 1.9 2.338 2.39 3.775l-2.401.617c-.356-1.08-.917-2.032-1.667-2.758-1.24-1.213-2.964-1.847-5.132-1.86-2.906.02-5.01.955-6.253 2.78-1.167 1.71-1.764 4.17-1.783 7.314.019 3.147.616 5.61 1.783 7.322 1.242 1.824 3.347 2.76 6.253 2.778 2.498-.016 4.342-.637 5.472-1.845.75-.809 1.227-1.896 1.416-3.235l2.4.617c-.303 1.77-1.056 3.219-2.237 4.3-1.684 1.526-4.037 2.343-6.874 2.343z"/></svg>; }

/* ─── Option lists ─────────────────────────────────────────────────── */
const GENDER_OPTIONS       = ["Prefer not to say", "Male", "Female", "Non-binary", "Other"];
const RELATIONSHIP_OPTIONS = ["Prefer not to say", "Single", "In a relationship", "Engaged", "Married", "It's complicated", "Open relationship", "Widowed"];
const POST_VISIBILITY      = ["Everyone", "Followers only", "Only me"];
const MESSAGE_PERM         = ["Everyone", "Followers only", "No one"];
const FIELD_VISIBILITY     = ["Public", "Followers", "Private"] as const;
type FieldVis = typeof FIELD_VISIBILITY[number];

/* ─── Interests ────────────────────────────────────────────────────── */
const INTEREST_OPTIONS = [
  "Technology","AI","Gaming","Business","Travel","Fashion","Music",
  "Sports","Art","Food","Health","Fitness","Photography","Film & TV",
  "Books","Science","Finance","Cooking","Lifestyle","Beauty","Education",
];

/* ─── Languages ────────────────────────────────────────────────────── */
const LANGUAGE_OPTIONS = [
  "English","Filipino / Tagalog","Cebuano","Ilocano","Hiligaynon",
  "Spanish","Chinese (Mandarin)","Japanese","Korean","Arabic",
  "French","German","Portuguese","Italian","Hindi","Malay","Indonesian",
];

/* ─── Timezones ────────────────────────────────────────────────────── */
const TIMEZONE_OPTIONS = [
  { label: "Philippines (UTC+8)",      value: "Asia/Manila"          },
  { label: "Singapore (UTC+8)",        value: "Asia/Singapore"       },
  { label: "Japan (UTC+9)",            value: "Asia/Tokyo"           },
  { label: "South Korea (UTC+9)",      value: "Asia/Seoul"           },
  { label: "Australia Sydney (UTC+11)",value: "Australia/Sydney"     },
  { label: "UAE (UTC+4)",              value: "Asia/Dubai"           },
  { label: "UK (UTC+0)",               value: "Europe/London"        },
  { label: "Central Europe (UTC+1)",   value: "Europe/Paris"         },
  { label: "US Eastern (UTC-5)",       value: "America/New_York"     },
  { label: "US Pacific (UTC-8)",       value: "America/Los_Angeles"  },
  { label: "Brazil (UTC-3)",           value: "America/Sao_Paulo"    },
  { label: "New Zealand (UTC+13)",     value: "Pacific/Auckland"     },
];

/* ─── Mood emojis ──────────────────────────────────────────────────── */
const MOOD_EMOJIS = ["😊","🔥","💪","🎯","✨","😎","🚀","❤️","🙏","💡","🎉","🌟","😴","🤔","🎨","🏆"];

/* ─── Helpers ──────────────────────────────────────────────────────── */
function defaultPrivacy(): PrivacySettings & Record<string, unknown> {
  return {
    postsVisibility:    "Everyone",
    whoCanMessage:      "Everyone",
    showLocation:       true,
    showBirthday:       false,
    showRelationship:   true,
    showGender:         false,
    showContact:        true,
    emailVisibility:    "Public" as FieldVis,
    phoneVisibility:    "Followers" as FieldVis,
    birthdayVisibility: "Followers" as FieldVis,
    locationVisibility: "Public" as FieldVis,
    genderVisibility:   "Followers" as FieldVis,
    relStatusVisibility:"Public" as FieldVis,
    socialLinksVis:     "Public" as FieldVis,
  };
}

/* ─── Props ────────────────────────────────────────────────────────── */
interface Props {
  open:            boolean;
  onClose:         () => void;
  onSaved:         (updates: Partial<StoreUser>, newCoverUrl: string | null) => void;
  initialCoverUrl: string | null;
}

type ValidityMap = Record<SocialPlatform, boolean | null>;

/* ══════════════════════════════════════════════════════════════════════
   EditProfileModal
══════════════════════════════════════════════════════════════════════ */
export function EditProfileModal({ open, onClose, onSaved, initialCoverUrl }: Props) {
  const user    = useAppStore((s) => s.user);
  const setUser = useAppStore((s) => s.setUser);

  /* ── Basic ─────────────────────────────────────────────────────── */
  const [name,   setName]   = useState(user?.name   ?? "");
  const [handle, setHandle] = useState(user?.handle ?? "");
  const [bio,    setBio]    = useState(user?.bio    ?? "");

  /* ── Professional ──────────────────────────────────────────────── */
  const [headline,  setHeadline]  = useState((user as any)?.headline   ?? "");
  const [interests, setInterests] = useState<string[]>(() => {
    try { return JSON.parse((user as any)?.interests ?? "[]") || []; } catch { return []; }
  });
  const [skills, setSkills]       = useState<string[]>(() => {
    try { return JSON.parse((user as any)?.skills ?? "[]") || []; } catch { return []; }
  });
  const [skillInput, setSkillInput] = useState("");

  /* ── Identity ──────────────────────────────────────────────────── */
  const [languages, setLanguages] = useState<string[]>(() => {
    try { return JSON.parse((user as any)?.languages ?? "[]") || []; } catch { return []; }
  });
  const [timezone,      setTimezone]      = useState((user as any)?.timezone      ?? "");
  const [pronunciation, setPronunciation] = useState((user as any)?.pronunciation ?? "");

  /* ── Status ────────────────────────────────────────────────────── */
  const [moodEmoji,  setMoodEmoji]  = useState((user as any)?.mood_emoji  ?? "");
  const [moodStatus, setMoodStatus] = useState((user as any)?.mood_status ?? "");
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  /* ── Social links ──────────────────────────────────────────────── */
  const [website,   setWebsite]   = useState((user as any)?.website         ?? "");
  const [facebook,  setFacebook]  = useState(user?.social?.facebook         ?? "");
  const [instagram, setInstagram] = useState(user?.social?.instagram        ?? "");
  const [tiktok,    setTiktok]    = useState(user?.social?.tiktok           ?? "");
  const [socialX,   setSocialX]   = useState(user?.social?.x                ?? "");
  const [youtube,   setYoutube]   = useState(user?.social?.youtube          ?? "");
  const [linkedin,  setLinkedin]  = useState(user?.social?.linkedin         ?? "");

  const [socialValid, setSocialValid] = useState<ValidityMap>(() => ({
    website:   validateSocialUrl("website",   (user as any)?.website         ?? ""),
    facebook:  validateSocialUrl("facebook",  user?.social?.facebook         ?? ""),
    instagram: validateSocialUrl("instagram", user?.social?.instagram        ?? ""),
    tiktok:    validateSocialUrl("tiktok",    user?.social?.tiktok           ?? ""),
    x:         validateSocialUrl("x",         user?.social?.x                ?? ""),
    youtube:   validateSocialUrl("youtube",   user?.social?.youtube          ?? ""),
    linkedin:  validateSocialUrl("linkedin",  user?.social?.linkedin         ?? ""),
    threads:   validateSocialUrl("threads",   (user as any)?.social?.threads ?? ""),
  }));

  const hasInvalidLinks = useMemo(
    () => Object.values(socialValid).some((v) => v === false),
    [socialValid],
  );
  const updateSocialValid = useCallback((platform: SocialPlatform, valid: boolean | null) => {
    setSocialValid((prev) => ({ ...prev, [platform]: valid }));
  }, []);

  /* ── Location ──────────────────────────────────────────────────── */
  const [locationData, setLocationData] = useState<LocationData>({
    displayName: (user as any)?.location          ?? "",
    city:        (user as any)?.location_city     ?? "",
    province:    (user as any)?.location_province ?? "",
    country:     (user as any)?.location_country  ?? "",
    lat:         (user as any)?.location_lat      ?? null,
    lng:         (user as any)?.location_lng      ?? null,
  });
  const [locationPickerOpen, setLocationPickerOpen] = useState(false);

  /* ── Personal ──────────────────────────────────────────────────── */
  const [birthday,     setBirthday]     = useState((user as any)?.birthday           ?? "");
  const [gender,       setGender]       = useState((user as any)?.gender             ?? "Prefer not to say");
  const [relationship, setRelationship] = useState((user as any)?.relationshipStatus ?? "Prefer not to say");

  /* ── Work & Education ──────────────────────────────────────────── */
  const [work,      setWork]      = useState((user as any)?.work         ?? "");
  const [workPrev,  setWorkPrev]  = useState((user as any)?.workPrevious ?? "");
  const [school,    setSchool]    = useState((user as any)?.school       ?? "");
  const [college,   setCollege]   = useState((user as any)?.college      ?? "");
  const [education, setEducation] = useState((user as any)?.education    ?? "");

  /* ── Contact ───────────────────────────────────────────────────── */
  const [publicEmail, setPublicEmail] = useState((user as any)?.public_email ?? "");
  const [publicPhone, setPublicPhone] = useState((user as any)?.public_phone ?? "");
  const [emailValid,  setEmailValid]  = useState<boolean>(() => {
    const v = (user as any)?.public_email ?? "";
    if (!v) return true;
    return validateEmail(v).valid;
  });
  const [phoneValid,  setPhoneValid]  = useState(true);

  /* ── Privacy ───────────────────────────────────────────────────── */
  const [privacy, setPrivacy] = useState<PrivacySettings & Record<string, unknown>>(() => {
    const stored = (user as any)?.privacySettings;
    return stored ? { ...defaultPrivacy(), ...stored } : defaultPrivacy();
  });

  /* ── Avatar / Cover ────────────────────────────────────────────── */
  const [avatarSrc,       setAvatarSrc]       = useState<string | null>(user?.avatar ?? null);
  const [coverSrc,        setCoverSrc]        = useState<string | null>(initialCoverUrl);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [coverUploading,  setCoverUploading]  = useState(false);
  const avatarRef = useRef<HTMLInputElement>(null);
  const coverRef  = useRef<HTMLInputElement>(null);

  /* ── Save state ────────────────────────────────────────────────── */
  const [saving, setSaving] = useState(false);
  const [saved,  setSaved]  = useState(false);
  const [error,  setError]  = useState("");

  /* ── Shake / toast ─────────────────────────────────────────────── */
  const [shakingFields, setShakingFields] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<{ msg: string; type: "error" | "success" } | null>(null);

  const triggerShake = useCallback((field: string) => {
    setShakingFields((prev) => new Set([...prev, field]));
    setTimeout(() => setShakingFields((prev) => { const n = new Set(prev); n.delete(field); return n; }), 600);
  }, []);

  const showToast = useCallback((msg: string, type: "error" | "success" = "error") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }, []);

  /* ── Scroll to first error ─────────────────────────────────────── */
  const emailRef   = useRef<HTMLDivElement>(null);
  const phoneRef   = useRef<HTMLDivElement>(null);
  const socialRef  = useRef<HTMLDivElement>(null);

  /* Body scroll lock */
  useEffect(() => {
    if (open) document.body.style.overflow = "hidden";
    else document.body.style.overflow = "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  /* ── Handlers ──────────────────────────────────────────────────── */
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

    /* Validate */
    let hasError = false;
    if (publicEmail.trim() && !emailValid) {
      triggerShake("email");
      emailRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      showToast("Fix the email address before saving");
      hasError = true;
    }
    if (publicPhone.trim() && !phoneValid) {
      triggerShake("phone");
      if (!hasError) phoneRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      showToast("Fix the phone number before saving");
      hasError = true;
    }
    if (hasInvalidLinks) {
      if (!hasError) socialRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      showToast("Fix the invalid social links before saving");
      hasError = true;
    }
    if (hasError) return;

    setSaving(true); setError("");

    const cleanHandle = handle.trim().replace(/^@/, "") || user.handle;
    const updates: Partial<StoreUser> = {
      ...user,
      name:               name.trim() || user.name,
      handle:             cleanHandle,
      bio:                bio.trim(),
      avatar:             avatarSrc ?? user.avatar,
      website:            website.trim(),
      location:           locationData.displayName.trim(),
      gender,
      birthday:           birthday || undefined,
      relationshipStatus: relationship,
      work:               work.trim(),
      workPrevious:       workPrev.trim(),
      school:             school.trim(),
      college:            college.trim(),
      education:          education.trim(),
      public_email:       publicEmail.trim(),
      public_phone:       publicPhone.trim(),
      social: {
        facebook:  facebook.trim(),
        instagram: instagram.trim(),
        tiktok:    tiktok.trim(),
        x:         socialX.trim(),
        youtube:   youtube.trim(),
        linkedin:  linkedin.trim(),
      },
      privacySettings: privacy as PrivacySettings,
    };

    /* Extended location */
    (updates as any).location_city     = locationData.city.trim();
    (updates as any).location_province = locationData.province.trim();
    (updates as any).location_country  = locationData.country.trim();
    (updates as any).location_lat      = locationData.lat;
    (updates as any).location_lng      = locationData.lng;

    /* Extended profile fields */
    (updates as any).headline          = headline.trim();
    (updates as any).interests         = JSON.stringify(interests);
    (updates as any).skills            = JSON.stringify(skills);
    (updates as any).languages         = JSON.stringify(languages);
    (updates as any).timezone          = timezone;
    (updates as any).pronunciation     = pronunciation.trim();
    (updates as any).mood_emoji        = moodEmoji;
    (updates as any).mood_status       = moodStatus.trim();

    setUser(updates as StoreUser);

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
          /* New fields (graceful — may not exist yet until migration 55 is run) */
          headline:            headline.trim(),
          interests:           interests,
          skills:              skills,
          languages:           languages,
          timezone:            timezone,
          pronunciation:       pronunciation.trim(),
          mood_emoji:          moodEmoji,
          mood_status:         moodStatus.trim(),
        } as any);
      } catch (err) {
        console.warn("[EditProfileModal] save error:", err);
      }

    setSaving(false); setSaved(true);
    setTimeout(() => {
      setSaved(false);
      onSaved(updates, coverSrc);
      onClose();
    }, 700);
  }, [
    user, saving, publicEmail, emailValid, publicPhone, phoneValid, hasInvalidLinks,
    name, handle, bio, avatarSrc, website, locationData, gender, birthday, relationship,
    work, workPrev, school, college, education,
    facebook, instagram, tiktok, socialX, youtube, linkedin,
    privacy, coverSrc, headline, interests, skills, languages, timezone, pronunciation,
    moodEmoji, moodStatus,
    triggerShake, showToast, setUser, onSaved, onClose,
  ]);

  /* ── Skill tag helpers ─────────────────────────────────────────── */
  const addSkill = useCallback(() => {
    const t = skillInput.trim();
    if (t && !skills.includes(t) && skills.length < 15) {
      setSkills((prev) => [...prev, t]);
      setSkillInput("");
    }
  }, [skillInput, skills]);

  const removeSkill = useCallback((s: string) => {
    setSkills((prev) => prev.filter((x) => x !== s));
  }, []);

  const toggleInterest = useCallback((label: string) => {
    setInterests((prev) =>
      prev.includes(label) ? prev.filter((x) => x !== label) : prev.length < 10 ? [...prev, label] : prev,
    );
  }, []);

  const toggleLanguage = useCallback((lang: string) => {
    setLanguages((prev) =>
      prev.includes(lang) ? prev.filter((x) => x !== lang) : [...prev, lang],
    );
  }, []);

  /* Profile stats */
  const profileViews  = (user as any)?.profile_views  ?? 0;
  const linkClicks    = (user as any)?.link_clicks     ?? 0;
  const followerCount = user?.followers ?? 0;

  if (!user) return null;
  const initials = (user.name || "?").charAt(0).toUpperCase();
  const saveDisabled = saving;

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
              maxHeight:    "96dvh",
              background:   "#08080f",
              borderTop:    "1px solid rgba(255,255,255,0.07)",
              borderRadius: "24px 24px 0 0",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Floating Toast */}
            <AnimatePresence>
              {toast && (
                <motion.div
                  initial={{ opacity: 0, y: -16, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -10, scale: 0.95 }}
                  className="fixed left-1/2 top-6 z-[9999] flex items-center gap-2.5 rounded-full px-4 py-2.5 text-[13px] font-semibold shadow-xl"
                  style={{
                    transform: "translateX(-50%)",
                    background: toast.type === "error" ? "#1a0505" : "#051a09",
                    border: toast.type === "error" ? "1px solid rgba(239,68,68,0.4)" : "1px solid rgba(34,197,94,0.4)",
                    color: toast.type === "error" ? "#fca5a5" : "#86efac",
                    backdropFilter: "blur(20px)",
                  }}
                >
                  {toast.type === "error"
                    ? <AlertCircle style={{ width: 14, height: 14, color: "#ef4444", flexShrink: 0 }} />
                    : <Check style={{ width: 14, height: 14, color: "#22c55e", flexShrink: 0 }} />}
                  {toast.msg}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Pull handle */}
            <div className="flex justify-center pt-3 pb-1.5">
              <div className="h-[3px] w-9 rounded-full" style={{ background: "rgba(255,255,255,0.14)" }} />
            </div>

            {/* ── Sticky header ── */}
            <div
              className="sticky top-0 z-20 flex items-center justify-between px-4 py-2.5"
              style={{
                background:    "rgba(8,8,15,0.96)",
                backdropFilter:"blur(20px)",
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
                className="flex items-center gap-1.5 rounded-full px-4 py-1.5 text-[12px] font-bold text-white"
                style={{
                  background: saved
                    ? "#16a34a"
                    : "linear-gradient(135deg,var(--accent-primary),var(--accent-secondary))",
                  opacity: saveDisabled ? 0.55 : 1,
                  transition: "opacity 0.15s",
                }}
              >
                {saving
                  ? <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  : saved
                  ? <Check style={{ width: 12, height: 12 }} />
                  : <Check style={{ width: 12, height: 12 }} />}
                {saved ? "Saved!" : saving ? "Saving…" : "Save"}
              </motion.button>
            </div>

            {/* ── Body ── */}
            <div className="px-4 pb-28 space-y-4 pt-5">

              {/* Upload error banner */}
              {error && (
                <div className="rounded-[12px] px-4 py-2.5 text-[12px] text-red-400 flex items-center gap-2"
                  style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)" }}>
                  <AlertCircle style={{ width: 14, height: 14, flexShrink: 0 }} /> {error}
                </div>
              )}

              {/* ═══════════════════════════════════════════════
                  SECTION: Photos
              ═══════════════════════════════════════════════ */}
              <SectionCard icon={<Camera style={{ width: 14, height: 14 }} />} title="Photos">
                {/* Cover */}
                <div
                  className="relative w-full cursor-pointer rounded-[14px]"
                  style={{ height: 112, background: "rgba(255,255,255,0.04)", border: "1px dashed rgba(255,255,255,0.12)", overflow: "hidden" }}
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
                  <div className="relative cursor-pointer flex-shrink-0" onClick={() => avatarRef.current?.click()}>
                    <div className="h-[70px] w-[70px] rounded-full overflow-hidden" style={{ border: "2px solid rgba(168,85,247,0.4)" }}>
                      {avatarSrc ? (
                        <img src={avatarSrc} alt="avatar"
                          className={"h-full w-full object-cover " + (avatarUploading ? "opacity-50" : "")} />
                      ) : (
                        <div className="h-full w-full bg-[#2F3336] grid place-items-center text-xl font-bold text-white">
                          {avatarUploading
                            ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                            : initials}
                        </div>
                      )}
                    </div>
                    <div className="absolute -bottom-0.5 -right-0.5 grid h-6 w-6 place-items-center rounded-full text-white"
                      style={{ background: "linear-gradient(135deg,var(--accent-primary),var(--accent-secondary))", border: "2px solid #08080f" }}>
                      <Camera style={{ width: 11, height: 11 }} />
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-bold truncate" style={{ color: "hsl(var(--foreground))" }}>
                      {name || user.name}
                    </p>
                    <p className="text-[11px]" style={{ color: "rgba(255,255,255,0.4)" }}>@{handle || user.handle}</p>
                    <button type="button" onClick={() => avatarRef.current?.click()}
                      className="mt-1 text-[11px] font-semibold" style={{ color: "var(--accent-primary)" }}>
                      Change avatar
                    </button>
                  </div>
                </div>

                <input ref={avatarRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarPick} />
                <input ref={coverRef}  type="file" accept="image/*" className="hidden" onChange={handleCoverPick} />
              </SectionCard>

              {/* ═══════════════════════════════════════════════
                  SECTION: Basic Info
              ═══════════════════════════════════════════════ */}
              <SectionCard icon={<User style={{ width: 14, height: 14 }} />} title="Basic Info">
                <FieldLabel label="Display Name">
                  <input
                    value={name} onChange={(e) => setName(e.target.value)}
                    placeholder="Your display name"
                    className="app-input w-full rounded-[12px] px-4 py-2.5 text-[14px] font-semibold focus:outline-none"
                    style={{ color: "hsl(var(--foreground))" }}
                  />
                </FieldLabel>

                <FieldLabel label="Username">
                  <div className="app-input flex items-center rounded-[12px] overflow-hidden">
                    <span className="pl-4 text-sm select-none" style={{ color: "rgba(255,255,255,0.35)" }}>@</span>
                    <input
                      value={handle} onChange={(e) => setHandle(e.target.value.replace(/^@/, ""))}
                      placeholder="username"
                      className="flex-1 bg-transparent px-2 py-2.5 text-[14px] focus:outline-none"
                      style={{ color: "hsl(var(--foreground))" }}
                      autoCapitalize="none" autoCorrect="off"
                    />
                  </div>
                </FieldLabel>

                <FieldLabel label={`Bio (${bio.length}/280)`}>
                  <textarea
                    value={bio} onChange={(e) => setBio(e.target.value.slice(0, 280))}
                    placeholder="Tell the world about yourself…"
                    rows={3}
                    className="app-input w-full rounded-[12px] px-4 py-2.5 text-[13px] focus:outline-none resize-none"
                    style={{ color: "hsl(var(--foreground))" }}
                  />
                </FieldLabel>
              </SectionCard>

              {/* ═══════════════════════════════════════════════
                  SECTION: Professional
              ═══════════════════════════════════════════════ */}
              <SectionCard icon={<Sparkles style={{ width: 14, height: 14 }} />} title="Professional">
                <FieldLabel label="Professional Headline">
                  <div className="app-input flex items-center rounded-[12px] overflow-hidden">
                    <span className="pl-3.5 flex-shrink-0" style={{ color: "rgba(255,255,255,0.30)" }}>
                      <Star style={{ width: 14, height: 14 }} />
                    </span>
                    <input
                      value={headline}
                      onChange={(e) => setHeadline(e.target.value.slice(0, 80))}
                      placeholder="e.g. Founder of SOCIA · Content Creator"
                      className="flex-1 bg-transparent px-3 py-2.5 text-[13.5px] focus:outline-none"
                      style={{ color: "hsl(var(--foreground))" }}
                    />
                  </div>
                  <p className="text-[10px] mt-1" style={{ color: "rgba(255,255,255,0.25)" }}>
                    {headline.length}/80 · Shown on your profile header
                  </p>
                </FieldLabel>

                <FieldLabel label={`Interests (${interests.length}/10 selected)`}>
                  <div className="flex flex-wrap gap-2 pt-0.5">
                    {INTEREST_OPTIONS.map((label) => (
                      <motion.button
                        key={label} type="button" whileTap={{ scale: 0.93 }}
                        onClick={() => toggleInterest(label)}
                        className="rounded-full px-3 py-1.5 text-[11.5px] font-semibold transition-all"
                        style={{
                          background: interests.includes(label) ? "rgba(168,85,247,0.2)"    : "rgba(255,255,255,0.05)",
                          border:     interests.includes(label) ? "1px solid rgba(168,85,247,0.6)" : "1px solid rgba(255,255,255,0.09)",
                          color:      interests.includes(label) ? "#c084fc"                 : "rgba(255,255,255,0.45)",
                        }}
                      >
                        {interests.includes(label) && "✓ "}{label}
                      </motion.button>
                    ))}
                  </div>
                </FieldLabel>

                <FieldLabel label={`Skills (${skills.length}/15)`}>
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {skills.map((s) => (
                      <span key={s}
                        className="flex items-center gap-1 rounded-full px-2.5 py-1 text-[11.5px] font-semibold"
                        style={{ background: "rgba(59,130,246,0.15)", color: "#60a5fa", border: "1px solid rgba(59,130,246,0.3)" }}>
                        <Tag style={{ width: 9, height: 9 }} />
                        {s}
                        <button type="button" onClick={() => removeSkill(s)}
                          className="ml-0.5 opacity-60 hover:opacity-100 transition-opacity">
                          <X style={{ width: 9, height: 9 }} />
                        </button>
                      </span>
                    ))}
                  </div>
                  <div className="app-input flex items-center rounded-[12px] overflow-hidden gap-1">
                    <span className="pl-3.5 flex-shrink-0" style={{ color: "rgba(255,255,255,0.30)" }}>
                      <Tag style={{ width: 14, height: 14 }} />
                    </span>
                    <input
                      value={skillInput}
                      onChange={(e) => setSkillInput(e.target.value.slice(0, 30))}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addSkill(); } }}
                      placeholder="Type a skill and press Enter"
                      className="flex-1 bg-transparent px-2 py-2.5 text-[13.5px] focus:outline-none min-w-0"
                      style={{ color: "hsl(var(--foreground))" }}
                    />
                    <button type="button" onClick={addSkill}
                      className="mr-2.5 flex-shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold"
                      style={{ background: "rgba(59,130,246,0.2)", color: "#60a5fa" }}>
                      Add
                    </button>
                  </div>
                </FieldLabel>
              </SectionCard>

              {/* ═══════════════════════════════════════════════
                  SECTION: Contact Info
              ═══════════════════════════════════════════════ */}
              <SectionCard icon={<Mail style={{ width: 14, height: 14 }} />} title="Contact Info">
                <p className="text-[11px] pb-1" style={{ color: "rgba(255,255,255,0.28)" }}>
                  These fields are shown on your profile based on your privacy settings.
                </p>

                <div ref={emailRef}>
                  <EmailInput
                    value={publicEmail}
                    onChange={setPublicEmail}
                    onValid={setEmailValid}
                    shake={shakingFields.has("email")}
                  />
                </div>

                <div ref={phoneRef}>
                  <PhoneInput
                    value={publicPhone}
                    onChange={setPublicPhone}
                    onValid={setPhoneValid}
                    shake={shakingFields.has("phone")}
                  />
                </div>
              </SectionCard>

              {/* ═══════════════════════════════════════════════
                  SECTION: Social Links
              ═══════════════════════════════════════════════ */}
              <SectionCard icon={<Globe style={{ width: 14, height: 14 }} />} title="Social Links">
                <p className="text-[11px] pb-0.5" style={{ color: "rgba(255,255,255,0.28)" }}>
                  Enter full URLs or just @handles — auto-converted on save.
                </p>
                <div ref={socialRef} className="space-y-3">
                  <SocialLinkInput platform="website"   icon={<Globe style={{ width: 14, height: 14 }} />}  label="Website"     value={website}   onChange={setWebsite}   onValidChange={updateSocialValid} />
                  <SocialLinkInput platform="facebook"  icon={<FbIcon />}   label="Facebook"    value={facebook}  onChange={setFacebook}  onValidChange={updateSocialValid} />
                  <SocialLinkInput platform="instagram" icon={<IgIcon />}   label="Instagram"   value={instagram} onChange={setInstagram} onValidChange={updateSocialValid} />
                  <SocialLinkInput platform="tiktok"    icon={<TtIcon />}   label="TikTok"      value={tiktok}    onChange={setTiktok}    onValidChange={updateSocialValid} />
                  <SocialLinkInput platform="x"         icon={<XIcon />}    label="X / Twitter" value={socialX}   onChange={setSocialX}   onValidChange={updateSocialValid} />
                  <SocialLinkInput platform="youtube"   icon={<YtIcon />}   label="YouTube"     value={youtube}   onChange={setYoutube}   onValidChange={updateSocialValid} />
                  <SocialLinkInput platform="linkedin"  icon={<LiIcon />}   label="LinkedIn"    value={linkedin}  onChange={setLinkedin}  onValidChange={updateSocialValid} />
                </div>
              </SectionCard>

              {/* ═══════════════════════════════════════════════
                  SECTION: Identity
              ═══════════════════════════════════════════════ */}
              <SectionCard icon={<Languages style={{ width: 14, height: 14 }} />} title="Identity">
                <FieldLabel label={`Languages I speak (${languages.length} selected)`}>
                  <div className="flex flex-wrap gap-2 pt-0.5">
                    {LANGUAGE_OPTIONS.map((lang) => (
                      <motion.button
                        key={lang} type="button" whileTap={{ scale: 0.93 }}
                        onClick={() => toggleLanguage(lang)}
                        className="rounded-full px-3 py-1.5 text-[11.5px] font-semibold transition-all"
                        style={{
                          background: languages.includes(lang) ? "rgba(6,214,160,0.15)"    : "rgba(255,255,255,0.05)",
                          border:     languages.includes(lang) ? "1px solid rgba(6,214,160,0.5)" : "1px solid rgba(255,255,255,0.09)",
                          color:      languages.includes(lang) ? "#06d6a0"                 : "rgba(255,255,255,0.45)",
                        }}
                      >
                        {lang}
                      </motion.button>
                    ))}
                  </div>
                </FieldLabel>

                <FieldLabel label="Timezone">
                  <div className="app-input flex items-center rounded-[12px] overflow-hidden">
                    <span className="pl-3.5 flex-shrink-0" style={{ color: "rgba(255,255,255,0.30)" }}>
                      <Clock style={{ width: 14, height: 14 }} />
                    </span>
                    <select
                      value={timezone}
                      onChange={(e) => setTimezone(e.target.value)}
                      className="flex-1 bg-transparent px-3 py-2.5 text-[13.5px] focus:outline-none appearance-none cursor-pointer"
                      style={{ color: timezone ? "hsl(var(--foreground))" : "rgba(255,255,255,0.35)" }}
                    >
                      <option value="" style={{ background: "#111118" }}>Select timezone</option>
                      {TIMEZONE_OPTIONS.map((tz) => (
                        <option key={tz.value} value={tz.value} style={{ background: "#111118" }}>{tz.label}</option>
                      ))}
                    </select>
                    <ChevronDown style={{ width: 14, height: 14, color: "rgba(255,255,255,0.25)", marginRight: 12, flexShrink: 0 }} />
                  </div>
                </FieldLabel>

                <FieldLabel label="Name Pronunciation">
                  <div className="app-input flex items-center rounded-[12px] overflow-hidden">
                    <span className="pl-3.5 flex-shrink-0" style={{ color: "rgba(255,255,255,0.30)" }}>
                      <User style={{ width: 14, height: 14 }} />
                    </span>
                    <input
                      value={pronunciation}
                      onChange={(e) => setPronunciation(e.target.value.slice(0, 80))}
                      placeholder="e.g. AL-lan  ·  al-BAS-en"
                      className="flex-1 bg-transparent px-3 py-2.5 text-[13.5px] focus:outline-none"
                      style={{ color: "hsl(var(--foreground))" }}
                    />
                  </div>
                </FieldLabel>
              </SectionCard>

              {/* ═══════════════════════════════════════════════
                  SECTION: Status
              ═══════════════════════════════════════════════ */}
              <SectionCard icon={<Smile style={{ width: 14, height: 14 }} />} title="Status &amp; Mood">
                <FieldLabel label="Mood Emoji">
                  <div className="flex items-center gap-3">
                    <motion.button
                      type="button" whileTap={{ scale: 0.9 }}
                      onClick={() => setShowEmojiPicker((v) => !v)}
                      className="flex-shrink-0 h-11 w-11 grid place-items-center rounded-[12px] text-2xl"
                      style={{
                        background: "rgba(255,255,255,0.06)",
                        border: moodEmoji ? "1px solid rgba(168,85,247,0.4)" : "1px solid rgba(255,255,255,0.09)",
                      }}
                    >
                      {moodEmoji || "😊"}
                    </motion.button>
                    <AnimatePresence>
                      {showEmojiPicker && (
                        <motion.div
                          initial={{ opacity: 0, scale: 0.92, y: 8 }}
                          animate={{ opacity: 1, scale: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 0.92 }}
                          className="flex flex-wrap gap-1.5 p-3 rounded-[14px]"
                          style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}
                        >
                          {MOOD_EMOJIS.map((e) => (
                            <button key={e} type="button"
                              onClick={() => { setMoodEmoji(e); setShowEmojiPicker(false); }}
                              className="text-xl h-9 w-9 grid place-items-center rounded-[10px] transition-all active:scale-90"
                              style={{ background: moodEmoji === e ? "rgba(168,85,247,0.2)" : "transparent" }}>
                              {e}
                            </button>
                          ))}
                        </motion.div>
                      )}
                    </AnimatePresence>
                    {moodEmoji && (
                      <button type="button" onClick={() => setMoodEmoji("")}
                        className="text-[11px]" style={{ color: "rgba(255,255,255,0.3)" }}>
                        Clear
                      </button>
                    )}
                  </div>
                </FieldLabel>

                <FieldLabel label={`Status (${moodStatus.length}/60)`}>
                  <div className="app-input flex items-center rounded-[12px] overflow-hidden">
                    <span className="pl-3.5 flex-shrink-0 text-lg leading-none flex-shrink-0">
                      {moodEmoji || "✨"}
                    </span>
                    <input
                      value={moodStatus}
                      onChange={(e) => setMoodStatus(e.target.value.slice(0, 60))}
                      placeholder="What's on your mind? (e.g. Building something great)"
                      className="flex-1 bg-transparent px-3 py-2.5 text-[13.5px] focus:outline-none"
                      style={{ color: "hsl(var(--foreground))" }}
                    />
                  </div>
                </FieldLabel>
              </SectionCard>

              {/* ═══════════════════════════════════════════════
                  SECTION: Work & Education
              ═══════════════════════════════════════════════ */}
              <SectionCard icon={<Briefcase style={{ width: 14, height: 14 }} />} title="Work &amp; Education">
                {[
                  { label: "Current Work / Occupation", value: work,      setter: setWork,      icon: <Briefcase style={{ width: 14, height: 14 }} />, placeholder: "Job title or company" },
                  { label: "Previous Work",             value: workPrev,  setter: setWorkPrev,  icon: <Briefcase style={{ width: 14, height: 14 }} />, placeholder: "Previous employer or role" },
                  { label: "College / University",      value: college,   setter: setCollege,   icon: <GraduationCap style={{ width: 14, height: 14 }} />, placeholder: "College or university" },
                  { label: "School",                    value: school,    setter: setSchool,    icon: <GraduationCap style={{ width: 14, height: 14 }} />, placeholder: "High school name" },
                  { label: "Other Education",           value: education, setter: setEducation, icon: <GraduationCap style={{ width: 14, height: 14 }} />, placeholder: "Courses, certifications, other" },
                ].map(({ label, value, setter, icon, placeholder }) => (
                  <FieldLabel key={label} label={label}>
                    <div className="app-input flex items-center rounded-[12px] overflow-hidden">
                      <span className="pl-3.5 flex-shrink-0" style={{ color: "rgba(255,255,255,0.30)" }}>{icon}</span>
                      <input value={value} onChange={(e) => setter(e.target.value)} placeholder={placeholder}
                        className="flex-1 bg-transparent px-3 py-2.5 text-[13.5px] focus:outline-none"
                        style={{ color: "hsl(var(--foreground))" }} />
                    </div>
                  </FieldLabel>
                ))}
              </SectionCard>

              {/* ═══════════════════════════════════════════════
                  SECTION: Personal Info
              ═══════════════════════════════════════════════ */}
              <SectionCard icon={<Heart style={{ width: 14, height: 14 }} />} title="Personal Info">
                <FieldLabel label="Birthday">
                  <div className="app-input flex items-center rounded-[12px] overflow-hidden">
                    <span className="pl-3.5 flex-shrink-0" style={{ color: "rgba(255,255,255,0.30)" }}>
                      <Calendar style={{ width: 14, height: 14 }} />
                    </span>
                    <input type="date" value={birthday} onChange={(e) => setBirthday(e.target.value)}
                      className="flex-1 bg-transparent px-3 py-2.5 text-[13.5px] focus:outline-none"
                      style={{ color: "hsl(var(--foreground))" }} />
                  </div>
                </FieldLabel>

                <FieldLabel label="Gender">
                  <div className="flex flex-wrap gap-2">
                    {GENDER_OPTIONS.map((g) => (
                      <ChipBtn key={g} active={gender === g} onClick={() => setGender(g)} color="blue">{g}</ChipBtn>
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

              {/* ═══════════════════════════════════════════════
                  SECTION: Location  (portal-based, never clipped)
              ═══════════════════════════════════════════════ */}
              <SectionCard icon={<MapPin style={{ width: 14, height: 14 }} />} title="Location">
                {/* Selected preview */}
                {locationData.displayName ? (
                  <div className="flex items-center gap-3 rounded-[13px] px-3.5 py-3"
                    style={{ background: "rgba(168,85,247,0.09)", border: "1px solid rgba(168,85,247,0.25)" }}>
                    <MapPin style={{ width: 14, height: 14, color: "#1D9BF0", flexShrink: 0 }} />
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-semibold truncate" style={{ color: "#1D9BF0" }}>
                        {locationData.displayName}
                      </p>
                      <div className="flex gap-1.5 flex-wrap mt-0.5">
                        {locationData.city && <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: "rgba(168,85,247,0.15)", color: "rgba(192,132,252,0.9)" }}>{locationData.city}</span>}
                        {locationData.province && <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: "rgba(59,130,246,0.12)", color: "#93c5fd" }}>{locationData.province}</span>}
                        {locationData.country && <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: "rgba(6,214,160,0.1)", color: "#6ee7b7" }}>{locationData.country}</span>}
                      </div>
                    </div>
                    <motion.button type="button" whileTap={{ scale: 0.9 }}
                      onClick={() => setLocationPickerOpen(true)}
                      className="flex-shrink-0 rounded-full px-2.5 py-1.5 text-[11px] font-semibold"
                      style={{ background: "rgba(168,85,247,0.2)", color: "#1D9BF0" }}>
                      Change
                    </motion.button>
                  </div>
                ) : (
                  <motion.button
                    type="button" whileTap={{ scale: 0.98 }}
                    onClick={() => setLocationPickerOpen(true)}
                    className="w-full flex items-center gap-3 rounded-[13px] px-3.5 py-3.5"
                    style={{ background: "rgba(255,255,255,0.04)", border: "1px dashed rgba(255,255,255,0.12)" }}
                  >
                    <MapPin style={{ width: 16, height: 16, color: "rgba(255,255,255,0.3)" }} />
                    <div className="text-left">
                      <p className="text-[13px] font-semibold" style={{ color: "rgba(255,255,255,0.5)" }}>
                        Add your location
                      </p>
                      <p className="text-[11px]" style={{ color: "rgba(255,255,255,0.28)" }}>
                        City, province, country · GPS supported
                      </p>
                    </div>
                    <Plus style={{ width: 15, height: 15, color: "rgba(255,255,255,0.2)", marginLeft: "auto" }} />
                  </motion.button>
                )}

                {locationData.displayName && (
                  <button type="button" onClick={() => setLocationData({ displayName:"",city:"",province:"",country:"",lat:null,lng:null })}
                    className="text-[11px] font-semibold mt-0.5" style={{ color: "#f87171" }}>
                    Clear location
                  </button>
                )}
              </SectionCard>

              {/* ═══════════════════════════════════════════════
                  SECTION: Profile Insights
              ═══════════════════════════════════════════════ */}
              <SectionCard icon={<BarChart2 style={{ width: 14, height: 14 }} />} title="Profile Insights">
                <div className="grid grid-cols-2 gap-2.5">
                  {[
                    { icon: <Eye style={{ width: 16, height: 16 }} />,         label: "Profile Views",    value: profileViews,  color: "#1D9BF0" },
                    { icon: <Link2 style={{ width: 16, height: 16 }} />,        label: "Link Clicks",      value: linkClicks,    color: "#3b82f6" },
                    { icon: <UserCheck style={{ width: 16, height: 16 }} />,    label: "Followers",        value: followerCount, color: "#06d6a0" },
                    { icon: <TrendingUp style={{ width: 16, height: 16 }} />,   label: "Engagement Score", value: followerCount > 0 ? Math.min(100, Math.round((followerCount * 3 + (profileViews || 0)) / 10)) : 0, color: "#f59e0b", suffix: "%" },
                  ].map(({ icon, label, value, color, suffix }) => (
                    <div key={label} className="rounded-[14px] px-3.5 py-3 flex items-center gap-3"
                      style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                      <div className="grid h-9 w-9 place-items-center rounded-[10px] flex-shrink-0"
                        style={{ background: `${color}18`, color }}>
                        {icon}
                      </div>
                      <div>
                        <p className="text-[18px] font-black" style={{ color: "hsl(var(--foreground))" }}>
                          {value.toLocaleString()}{suffix}
                        </p>
                        <p className="text-[10px]" style={{ color: "rgba(255,255,255,0.35)" }}>{label}</p>
                      </div>
                    </div>
                  ))}
                </div>
                <p className="text-[10px] text-center mt-1" style={{ color: "rgba(255,255,255,0.2)" }}>
                  Stats update daily · Visible only to you
                </p>
              </SectionCard>

              {/* ═══════════════════════════════════════════════
                  SECTION: Advanced Privacy
              ═══════════════════════════════════════════════ */}
              <SectionCard icon={<Shield style={{ width: 14, height: 14 }} />} title="Privacy">
                <FieldLabel label="Posts visible to">
                  <div className="flex gap-2">
                    {POST_VISIBILITY.map((v) => (
                      <motion.button key={v} type="button" whileTap={{ scale: 0.93 }}
                        onClick={() => setPrivacy((p) => ({ ...p, postsVisibility: v }))}
                        className="flex-1 rounded-[11px] py-2.5 text-[11px] font-semibold text-center"
                        style={{
                          background: privacy.postsVisibility === v ? "rgba(168,85,247,0.18)" : "rgba(255,255,255,0.04)",
                          border:     privacy.postsVisibility === v ? "1px solid rgba(168,85,247,0.5)" : "1px solid rgba(255,255,255,0.07)",
                          color:      privacy.postsVisibility === v ? "#1D9BF0" : "rgba(255,255,255,0.38)",
                        }}
                      >{v}</motion.button>
                    ))}
                  </div>
                </FieldLabel>

                <FieldLabel label="Who can message me">
                  <div className="flex gap-2">
                    {MESSAGE_PERM.map((v) => (
                      <motion.button key={v} type="button" whileTap={{ scale: 0.93 }}
                        onClick={() => setPrivacy((p) => ({ ...p, whoCanMessage: v }))}
                        className="flex-1 rounded-[11px] py-2.5 text-[11px] font-semibold text-center"
                        style={{
                          background: privacy.whoCanMessage === v ? "rgba(59,130,246,0.18)" : "rgba(255,255,255,0.04)",
                          border:     privacy.whoCanMessage === v ? "1px solid rgba(59,130,246,0.5)" : "1px solid rgba(255,255,255,0.07)",
                          color:      privacy.whoCanMessage === v ? "#60a5fa" : "rgba(255,255,255,0.38)",
                        }}
                      >{v}</motion.button>
                    ))}
                  </div>
                </FieldLabel>

                {/* Per-field visibility */}
                <p className="text-[10.5px] font-black uppercase tracking-wider pt-1"
                  style={{ color: "rgba(255,255,255,0.25)" }}>
                  Field Visibility
                </p>
                <div className="rounded-[14px] divide-y divide-white/5"
                  style={{ border: "1px solid rgba(255,255,255,0.07)" }}>
                  {([
                    ["emailVisibility",    "Email address"],
                    ["phoneVisibility",    "Phone number"],
                    ["birthdayVisibility", "Birthday"],
                    ["locationVisibility", "Location"],
                    ["genderVisibility",   "Gender"],
                    ["relStatusVisibility","Relationship status"],
                    ["socialLinksVis",     "Social links"],
                  ] as [string, string][]).map(([key, label]) => (
                    <VisibilityRow
                      key={key}
                      label={label}
                      value={(privacy[key] as FieldVis) ?? "Public"}
                      onChange={(v) => setPrivacy((p) => ({ ...p, [key]: v }))}
                    />
                  ))}
                </div>
              </SectionCard>

            </div>
          </motion.div>

          {/* Portal-based location picker (NEVER clipped) */}
          <LocationPickerModal
            open={locationPickerOpen}
            value={locationData}
            onChange={(loc) => setLocationData(loc)}
            onClose={() => setLocationPickerOpen(false)}
          />
        </>
      )}
    </AnimatePresence>
  );
}

/* ─────────────────────────────────────────────────────────────────────
   Sub-components
───────────────────────────────────────────────────────────────────── */
function SectionCard({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-[18px]"
      style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.07)" }}>
      <div className="flex items-center gap-2.5 px-4 py-3"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.055)" }}>
        <span style={{ color: "#1D9BF0" }}>{icon}</span>
        <span className="text-[10.5px] font-black uppercase tracking-[0.17em]"
          style={{ color: "rgba(168,85,247,0.8)" }}
          dangerouslySetInnerHTML={{ __html: title }} />
      </div>
      <div className="px-4 py-4 space-y-3.5">{children}</div>
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

function ChipBtn({ active, onClick, color, children }: {
  active: boolean; onClick: () => void; color: "blue" | "blue"; children: React.ReactNode;
}) {
  const a = color === "blue"
    ? { bg: "rgba(29,155,240,0.15)", border: "rgba(29,155,240,0.4)", text: "#1D9BF0" }
    : { bg: "rgba(29,155,240,0.15)", border: "rgba(29,155,240,0.4)", text: "#1D9BF0" };
  return (
    <motion.button type="button" whileTap={{ scale: 0.93 }} onClick={onClick}
      className="rounded-full px-3 py-1.5 text-[11.5px] font-semibold transition-all"
      style={{
        background: active ? a.bg  : "rgba(255,255,255,0.05)",
        border:     active ? `1px solid ${a.border}` : "1px solid rgba(255,255,255,0.09)",
        color:      active ? a.text : "rgba(255,255,255,0.42)",
      }}>
      {children}
    </motion.button>
  );
}

function VisibilityRow({ label, value, onChange }: {
  label: string; value: FieldVis; onChange: (v: FieldVis) => void;
}) {
  return (
    <div className="flex items-center justify-between px-4 py-3 gap-3">
      <span className="text-[12.5px] font-medium flex-1" style={{ color: "hsl(var(--foreground))" }}>
        {label}
      </span>
      <div className="flex gap-1 flex-shrink-0">
        {FIELD_VISIBILITY.map((v) => (
          <button key={v} type="button"
            onClick={() => onChange(v)}
            className="rounded-full px-2.5 py-1 text-[10.5px] font-semibold transition-all"
            style={{
              background: value === v ? (v === "Public" ? "rgba(6,214,160,0.2)" : v === "Followers" ? "rgba(59,130,246,0.2)" : "rgba(239,68,68,0.2)") : "rgba(255,255,255,0.05)",
              color:      value === v ? (v === "Public" ? "#06d6a0" : v === "Followers" ? "#60a5fa" : "#f87171") : "rgba(255,255,255,0.3)",
              border:     value === v ? (v === "Public" ? "1px solid rgba(6,214,160,0.4)" : v === "Followers" ? "1px solid rgba(59,130,246,0.4)" : "1px solid rgba(239,68,68,0.4)") : "1px solid rgba(255,255,255,0.06)",
            }}
          >{v}</button>
        ))}
      </div>
    </div>
  );
}
