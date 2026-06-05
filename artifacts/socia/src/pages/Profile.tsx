import { useEffect, useRef, useState } from "react";
import { useAppStore } from "@/lib/store";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  Settings, Heart, Bookmark, Grid3x3, Copy, ArrowUpRight, Camera,
  Check, X, Facebook, Instagram, Music2, Shield, ChevronRight, ImagePlus, Trash2,
} from "lucide-react";
import { PostThumbnail } from "@/components/feed/PostThumbnail";
import { supabase, uploadAvatar, upsertProfile, isSupabaseReady } from "@/lib/supabase";
import { fetchUserPosts, fetchSavedFeed, type SocialPost } from "@/lib/postsClient";
import { NameBadges, OnlineDot } from "@/components/Badges";
import { usePresenceStatus } from "@/lib/usePresence";
import {
  FounderHero, VerifiedFounderBadge, MiniWaveform,
} from "@/components/profile/FounderHero";
import { uploadCoverPhoto } from "@/lib/postsClient";

type Tab = "creations" | "saved" | "liked";

/* ══════════════════════════════════════════════════════════════════════════
   Admin command center card definitions — matches IMAGE 2
══════════════════════════════════════════════════════════════════════════ */
interface AdminCardDef {
  iconPath: string;
  label:    string;
  sub:      string;
  status:   string;
  dot:      string;
  wave:     boolean;
  waveColor: string;
  href:     string | null;
}
const ADMIN_CARDS: AdminCardDef[] = [
  {
    iconPath:  "M12 2L3 7v10l9 5 9-5V7L12 2zM12 12L5.5 8.5M12 12v9M12 12l6.5-3.5",
    label:    "Admin Panel",
    sub:      "Manage users, bans, payments\n& system settings",
    status:   "ACTIVE",
    dot:      "#22c55e",
    wave:     false,
    waveColor: "#22c55e",
    href:     "/admin",
  },
  {
    iconPath:  "M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18",
    label:    "AI Engine Monitor",
    sub:      "Live engine performance\n& system resources",
    status:   "ONLINE",
    dot:      "#22c55e",
    wave:     true,
    waveColor: "#22c55e",
    href:     "/admin/ai-monitor",
  },
  {
    iconPath:  "M22 12h-4l-3 9L9 3 6 12H2",
    label:    "Render Queue",
    sub:      "Active & queued\ncinematic jobs",
    status:   "LIVE",
    dot:      "#a855f7",
    wave:     true,
    waveColor: "#a855f7",
    href:     "/admin/render-queue",
  },
  {
    iconPath:  "M12 2a10 10 0 100 20A10 10 0 0012 2zM2 12h4M18 12h4M12 2v4M12 18v4",
    label:    "System Status",
    sub:      "API • Database • Storage\n• CDN • Security",
    status:   "ALL SYSTEMS GO",
    dot:      "#22c55e",
    wave:     false,
    waveColor: "#22c55e",
    href:     "/admin/system-status",
  },
  {
    iconPath:  "M3 10h18M7 15h1m4 0h1M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z",
    label:    "Payment Monitor",
    sub:      "PayMongo health & checkout\nmaintenance controls",
    status:   "LIVE",
    dot:      "#34d399",
    wave:     true,
    waveColor: "#34d399",
    href:     "/owner/payments",
  },
  {
    iconPath:  "M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 7h10v10H7V7z",
    label:    "AI Command Center",
    sub:      "Providers • balances • spend\n• generation metrics",
    status:   "MONITORING",
    dot:      "#a855f7",
    wave:     true,
    waveColor: "#a855f7",
    href:     "/owner/ai",
  },
];

/* ══════════════════════════════════════════════════════════════════════════
   AdminCard — 2-column grid card matching IMAGE 2
══════════════════════════════════════════════════════════════════════════ */
function AdminCard({ card, navigate }: { card: AdminCardDef; navigate: (to: string) => void }) {
  return (
    <motion.button
      whileTap={{ scale: 0.96 }}
      onClick={() => card.href && navigate(card.href)}
      className="flex flex-col text-left rounded-[18px] p-3.5"
      style={{
        background:  "#0a0a0a",
        border:      "1px solid rgba(251,191,36,0.22)",
        minHeight:   134,
        gap:         6,
      }}
    >
      {/* Icon + Chevron */}
      <div className="flex items-start justify-between">
        <div
          className="grid place-items-center rounded-[13px]"
          style={{
            width: 42, height: 42,
            background: "linear-gradient(135deg, rgba(245,158,11,0.2), rgba(245,158,11,0.06))",
            border: "1px solid rgba(251,191,36,0.3)",
          }}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="#fbbf24" strokeWidth="1.8"
            strokeLinecap="round" strokeLinejoin="round" style={{ width: 18, height: 18 }}>
            <path d={card.iconPath} />
          </svg>
        </div>
        {card.href && <ChevronRight style={{ width: 13, height: 13, color: "rgba(251,191,36,0.38)", marginTop: 4 }} />}
      </div>

      {/* Title */}
      <p style={{ fontSize: 12.5, fontWeight: 700, color: "#f3f4f6", lineHeight: 1.25 }}>{card.label}</p>

      {/* Subtitle */}
      <p style={{ fontSize: 10, color: "#6b7280", lineHeight: 1.45, flex: 1, whiteSpace: "pre-line" }}>{card.sub}</p>

      {/* Status row */}
      <div className="flex items-center justify-between mt-1">
        <div className="flex items-center gap-1.5">
          <motion.div
            animate={{ scale: [1, 1.6, 1], opacity: [1, 0.4, 1] }}
            transition={{ duration: 1.6, repeat: Infinity }}
            style={{ width: 6, height: 6, borderRadius: "50%", background: card.dot, flexShrink: 0 }}
          />
          <span style={{ fontSize: 8.5, fontWeight: 900, color: card.dot, letterSpacing: "0.07em" }}>
            {card.status}
          </span>
        </div>
        {card.wave && <MiniWaveform active color={card.waveColor} />}
      </div>
    </motion.button>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   Profile page
══════════════════════════════════════════════════════════════════════════ */
export default function Profile() {
  const user            = useAppStore((s) => s.user);
  const setUser         = useAppStore((s) => s.setUser);
  const posts           = useAppStore((s) => s.posts);
  const savedPostIds    = useAppStore((s) => s.savedPostIds);
  const savedPrompts    = useAppStore((s) => s.savedPrompts);
  const setActivePrompt = useAppStore((s) => s.setActivePrompt);
  const followedUserIds = useAppStore((s) => s.followedUserIds);
  const [, navigate]    = useLocation();
  const [tab, setTab]   = useState<Tab>("creations");

  const [isEditing,    setIsEditing]    = useState(false);
  const [editName,     setEditName]     = useState(user?.name   ?? "");
  const [editHandle,   setEditHandle]   = useState(user?.handle ?? "");
  const [editBio,      setEditBio]      = useState(user?.bio    ?? "");
  const [editFb,       setEditFb]       = useState(user?.social?.facebook  ?? "");
  const [editIg,       setEditIg]       = useState(user?.social?.instagram ?? "");
  const [editTt,       setEditTt]       = useState(user?.social?.tiktok    ?? "");
  const [editAvatar,   setEditAvatar]   = useState<string | null>(null);
  const [uploading,    setUploading]    = useState(false);
  const [uploadError,  setUploadError]  = useState<string>("");
  const [avatarBroken, setAvatarBroken] = useState(false);
  const [saveStatus,   setSaveStatus]   = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [saveError,    setSaveError]    = useState<string>("");
  const [liveFollowers, setLiveFollowers] = useState<number | null>(null);
  const [liveFollowing, setLiveFollowing] = useState<number | null>(null);
  const fileRef      = useRef<HTMLInputElement>(null);
  const coverFileRef = useRef<HTMLInputElement>(null);

  /* ── Cover photo state ──────────────────────────────────────────────── */
  const [coverPhotoUrl,  setCoverPhotoUrl]  = useState<string | null>(null);
  const [coverUploading, setCoverUploading] = useState(false);
  const [coverError,     setCoverError]     = useState<string>("");

  const isAdminProfile = user?.isOwner === true;

  /* ── Realtime presence status (replaces stale user.isOnline from store) ── */
  const presenceStatus = usePresenceStatus(user?.id ?? null);

  /* ── Load cover photo from Supabase on mount ────────────────────────── */
  useEffect(() => {
    if (!user?.id || !isAdminProfile) return;
    (async () => {
      try {
        const { data } = await supabase
          .from("users")
          .select("cover_photo_url")
          .eq("id", user.id)
          .maybeSingle();
        if (data?.cover_photo_url) setCoverPhotoUrl(data.cover_photo_url);
      } catch { /* ignore */ }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  /* ── Cover photo upload ─────────────────────────────────────────────── */
  const handleCoverPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setCoverUploading(true); setCoverError("");
    try {
      const url = await uploadCoverPhoto(file, user.id);
      setCoverPhotoUrl(url);
      /* Persist to users table */
      await supabase.from("users").update({ cover_photo_url: url }).eq("id", user.id);
    } catch (err) {
      setCoverError(err instanceof Error ? err.message : "Cover upload failed");
    } finally {
      setCoverUploading(false);
      if (coverFileRef.current) coverFileRef.current.value = "";
    }
  };

  const deleteCoverPhoto = async () => {
    if (!user) return;
    setCoverPhotoUrl(null);
    try { await supabase.from("users").update({ cover_photo_url: null }).eq("id", user.id); } catch { /* ok */ }
  };

  /* ── Real posts from backend ────────────────────────────────────────── */
  const [realMyPosts,    setRealMyPosts]    = useState<SocialPost[]>([]);
  const [realSavedPosts, setRealSavedPosts] = useState<SocialPost[]>([]);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    fetchUserPosts(user.id, { limit: 30, viewerId: user.id })
      .then((p) => { if (!cancelled) setRealMyPosts(p); })
      .catch(() => {});
    fetchSavedFeed({ limit: 30 })
      .then((p) => { if (!cancelled) setRealSavedPosts(p); })
      .catch(() => {});
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  /* ── Live follower / following counts ──────────────────────────────── */
  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    (async () => {
      const [flrs, flng] = await Promise.all([
        supabase.from("follows").select("*", { count: "exact", head: true }).eq("following_id", user.id),
        supabase.from("follows").select("*", { count: "exact", head: true }).eq("follower_id",  user.id),
      ]);
      if (cancelled) return;
      if (!flrs.error) setLiveFollowers(flrs.count ?? 0);
      if (!flng.error) setLiveFollowing(flng.count ?? 0);
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, followedUserIds.length]);

  if (!user) return null;

  const myPosts    = posts.filter((p) => p.authorId === user.id).slice(0, 9);
  const savedPosts = posts.filter((p) => savedPostIds.includes(p.id));
  const liked      = posts.filter((p) => p.hasLiked);
  const avatarSrc  = editAvatar || user.avatar;
  const initials   = (user.name || "?").charAt(0).toUpperCase();
  const showAvatar = Boolean(avatarSrc) && !avatarBroken;

  const handleAvatarPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true); setUploadError("");
    try {
      const url = await uploadAvatar(file, user.id);
      setEditAvatar(url); setAvatarBroken(false);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const saveProfile = async () => {
    const previous = user;
    const updated  = {
      ...user,
      name:   editName.trim()                     || user.name,
      handle: editHandle.trim().replace(/^@/, "") || user.handle,
      bio:    editBio.trim(),
      avatar: editAvatar ?? user.avatar,
      social: { facebook: editFb.trim(), instagram: editIg.trim(), tiktok: editTt.trim() },
    };
    setSaveStatus("saving"); setSaveError("");
    setUser(updated); setIsEditing(false); setEditAvatar(null);
    if (!isSupabaseReady) { setSaveStatus("saved"); setTimeout(() => setSaveStatus("idle"), 2500); return; }
    try {
      let didTimeout = false;
      const timedOut = new Promise<{ error: string | null }>((r) =>
        setTimeout(() => { didTimeout = true; r({ error: null }); }, 8_000),
      );
      const { error } = await Promise.race([
        upsertProfile(updated.id, { name: updated.name, username: updated.handle, avatar_url: updated.avatar, bio: updated.bio }),
        timedOut,
      ]);
      if (!error && !didTimeout) {
        supabase.from("users").update({
          social_facebook:  updated.social?.facebook  ?? "",
          social_instagram: updated.social?.instagram ?? "",
          social_tiktok:    updated.social?.tiktok    ?? "",
          updated_at: new Date().toISOString(),
        }).eq("id", updated.id).then(({ error: e }) => { if (e) console.warn("[Profile] social:", e.message); });
      }
      if      (didTimeout) setSaveStatus("saved");
      else if (error)      { setUser(previous); setSaveError(error); setSaveStatus("error"); }
      else                 setSaveStatus("saved");
    } catch { setSaveStatus("saved"); }
    finally  { setTimeout(() => setSaveStatus("idle"), 5000); }
  };

  const cancelEdit = () => {
    setIsEditing(false);
    setEditName(user.name); setEditHandle(user.handle); setEditBio(user.bio ?? "");
    setEditFb(user.social?.facebook ?? ""); setEditIg(user.social?.instagram ?? "");
    setEditTt(user.social?.tiktok   ?? ""); setEditAvatar(null);
  };

  return (
    <div className="app-bg pb-28 hide-scrollbar overflow-y-auto h-full scroll-native">

      {/* ── Save toast ─────────────────────────────────────────────────── */}
      <AnimatePresence>
        {saveStatus !== "idle" && (
          <motion.div
            initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }}
            className="fixed left-1/2 top-14 z-50 -translate-x-1/2 px-4 py-2 rounded-full text-xs font-semibold text-white shadow-lg"
            style={{
              background: saveStatus === "saved" ? "linear-gradient(135deg,var(--accent-primary),var(--accent-secondary))"
                : saveStatus === "error" ? "rgba(239,68,68,0.9)" : "#0a0a0a",
            }}
          >
            {saveStatus === "saving" && "Saving…"}
            {saveStatus === "saved"  && "✓ Profile saved"}
            {saveStatus === "error"  && `Save failed${saveError ? `: ${saveError}` : ""}`}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ══════════════════════════════════════════════════════════════
          FOUNDER / ADMIN LAYOUT
      ══════════════════════════════════════════════════════════════ */}
      {isAdminProfile ? (
        <>
          {/* Cinematic hero with avatar inside */}
          <div className="relative">
            <FounderHero
              avatarUrl={showAvatar ? avatarSrc : null}
              initials={initials}
              isOnline={presenceStatus === "online"}
              isEditing={isEditing}
              onAvatarClick={() => fileRef.current?.click()}
              uploading={uploading}
              coverPhotoUrl={coverPhotoUrl}
              onCoverClick={isEditing ? () => coverFileRef.current?.click() : undefined}
              coverUploading={coverUploading}
            />

            {/* Settings / save buttons — overlaid top-right on hero */}
            <div className="absolute top-0 right-3 flex gap-2"
              style={{ paddingTop: `calc(env(safe-area-inset-top, 0px) + 10px)` }}>
              {isEditing ? (
                <>
                  <motion.button whileTap={{ scale: 0.88 }} onClick={cancelEdit}
                    className="grid h-9 w-9 place-items-center rounded-full text-white"
                    style={{ background: "rgba(0,0,0,0.65)", border: "1px solid rgba(255,255,255,0.15)" }}>
                    <X style={{ width: 15, height: 15 }} />
                  </motion.button>
                  <motion.button whileTap={{ scale: 0.88 }} onClick={saveProfile}
                    className="grid h-9 w-9 place-items-center rounded-full text-white"
                    style={{ background: "linear-gradient(135deg,var(--accent-primary),var(--accent-secondary))" }}>
                    <Check style={{ width: 15, height: 15 }} />
                  </motion.button>
                </>
              ) : (
                <motion.button whileTap={{ scale: 0.88 }} onClick={() => navigate("/profile/settings")}
                  className="grid h-9 w-9 place-items-center rounded-full text-white"
                  style={{ background: "rgba(0,0,0,0.65)", border: "1px solid rgba(255,255,255,0.15)" }}>
                  <Settings style={{ width: 15, height: 15 }} />
                </motion.button>
              )}
            </div>

            {/* Cover photo controls — top-left when NOT editing (upload / delete) */}
            {!isEditing && isAdminProfile && (
              <div className="absolute top-0 left-3 flex gap-2"
                style={{ paddingTop: `calc(env(safe-area-inset-top, 0px) + 10px)` }}>
                <motion.button whileTap={{ scale: 0.88 }}
                  onClick={() => coverFileRef.current?.click()}
                  disabled={coverUploading}
                  title="Change cover photo"
                  className="grid h-9 w-9 place-items-center rounded-full text-white disabled:opacity-50"
                  style={{ background: "rgba(0,0,0,0.65)", border: "1px solid rgba(255,255,255,0.15)" }}>
                  {coverUploading
                    ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                    : <ImagePlus style={{ width: 15, height: 15 }} />}
                </motion.button>
                {coverPhotoUrl && (
                  <motion.button whileTap={{ scale: 0.88 }}
                    onClick={deleteCoverPhoto}
                    title="Remove cover photo"
                    className="grid h-9 w-9 place-items-center rounded-full text-white"
                    style={{ background: "rgba(180,20,20,0.75)", border: "1px solid rgba(255,100,100,0.3)" }}>
                    <Trash2 style={{ width: 14, height: 14 }} />
                  </motion.button>
                )}
              </div>
            )}

            {/* Upload errors */}
            {(uploadError || coverError) && (
              <p className="absolute bottom-2 left-0 right-0 text-center text-[11px] text-red-400 font-medium">
                {uploadError || coverError}
              </p>
            )}
          </div>

          {/* ── Centered founder identity below hero ────────────── */}
          <div className="px-5 pt-4 text-center">

            {/* Name row: [verified] Name [KING] */}
            <div className="flex items-center justify-center gap-2 flex-wrap">
              <VerifiedFounderBadge />
              <h2 style={{
                fontSize: 26, fontWeight: 900, color: "#ffffff",
                letterSpacing: "-0.01em", lineHeight: 1.1, margin: 0,
              }}>
                {user.name}
              </h2>
              {/* KingBadge removed — founder identity lives in VerifiedFounderBadge */}
            </div>

            {/* Founder • Socia */}
            <motion.div
              className="flex items-center justify-center gap-1.5 mt-2"
              animate={{ opacity: [0.85, 1, 0.85] }}
              transition={{ duration: 3, repeat: Infinity }}
            >
              {/* Crown mini */}
              <svg viewBox="0 0 18 14" style={{ width: 13, height: 10 }}>
                <path d="M1 12 L3 4 L7 8 L9 1 L11 8 L15 4 L17 12 Z" fill="#fbbf24" />
                <rect x="1" y="11" width="16" height="2.5" rx="1" fill="#fbbf24" />
              </svg>
              <span style={{
                fontSize: 12, fontWeight: 900, letterSpacing: "0.18em",
                textTransform: "uppercase", color: "#fbbf24",
              }}>
                Founder • Socia
              </span>
            </motion.div>

            {/* Bio (editing) */}
            {isEditing && (
              <div className="mt-3 space-y-2 text-left">
                <input value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="Display name"
                  className="app-input w-full rounded-[14px] px-4 py-2.5 text-[17px] font-bold focus:outline-none" />
                <div className="app-input flex items-center rounded-[14px] overflow-hidden">
                  <span className="pl-4 text-sm app-text-muted">@</span>
                  <input value={editHandle} onChange={(e) => setEditHandle(e.target.value.replace(/^@/, ""))}
                    placeholder="username" className="flex-1 bg-transparent px-2 py-2.5 text-sm app-text focus:outline-none" />
                </div>
                <textarea value={editBio} onChange={(e) => setEditBio(e.target.value.slice(0, 280))}
                  placeholder="Bio (max 280 characters)" rows={3}
                  className="app-input w-full rounded-[14px] px-4 py-2.5 text-[13px] app-text focus:outline-none resize-none" />
                <SocialInput icon={Facebook}  value={editFb} onChange={setEditFb} placeholder="Facebook URL or username" />
                <SocialInput icon={Instagram} value={editIg} onChange={setEditIg} placeholder="Instagram handle" />
                <SocialInput icon={Music2}    value={editTt} onChange={setEditTt} placeholder="TikTok handle" />
              </div>
            )}

            {/* Bio display */}
            {!isEditing && user.bio && (
              <p className="mt-2 text-[13px] leading-relaxed app-text-muted max-w-sm mx-auto whitespace-pre-line">{user.bio}</p>
            )}

            {/* Social links — centered */}
            {!isEditing && (
              <SocialLinkRow
                facebook={user.social?.facebook}
                instagram={user.social?.instagram}
                tiktok={user.social?.tiktok}
                centered
              />
            )}

            {/* Stats row */}
            <div
              className="mt-4 flex items-center overflow-hidden rounded-[18px]"
              style={{ border: "1px solid rgba(251,191,36,0.15)", background: "rgba(251,191,36,0.025)" }}
            >
              <StatBtn label="Creations" value={myPosts.length} />
              <div className="my-3 w-px self-stretch" style={{ background: "rgba(251,191,36,0.12)" }} />
              <StatBtn label="Followers" value={liveFollowers ?? user.followers} onClick={() => navigate(`/followers/${user.id}`)} />
              <div className="my-3 w-px self-stretch" style={{ background: "rgba(251,191,36,0.12)" }} />
              <StatBtn label="Following" value={liveFollowing ?? user.following} onClick={() => navigate(`/following/${user.id}`)} />
            </div>

            {/* Edit profile button */}
            {!isEditing && (
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={() => {
                  setEditName(user.name); setEditHandle(user.handle); setEditBio(user.bio ?? "");
                  setEditFb(user.social?.facebook ?? ""); setEditIg(user.social?.instagram ?? "");
                  setEditTt(user.social?.tiktok   ?? ""); setIsEditing(true);
                }}
                className="mt-3 w-full rounded-[14px] py-2.5 text-[13px] font-semibold tracking-wide app-surface app-text"
              >
                Edit Profile
              </motion.button>
            )}

            {/* ── Admin Command Center ──────────────────────────── */}
            {!isEditing && (
              <div className="mt-6">
                {/* Section header */}
                <div className="flex items-center justify-center gap-2 mb-3">
                  <svg viewBox="0 0 18 14" style={{ width: 12, height: 9 }}>
                    <path d="M1 12 L3 4 L7 8 L9 1 L11 8 L15 4 L17 12 Z" fill="#fbbf24" />
                    <rect x="1" y="11" width="16" height="2.5" rx="1" fill="#fbbf24" />
                  </svg>
                  <span style={{
                    fontSize: 10.5, fontWeight: 900, letterSpacing: "0.18em",
                    textTransform: "uppercase", color: "#fbbf24",
                  }}>
                    Admin Command Center
                  </span>
                </div>

                {/* 2-column grid */}
                <div className="grid grid-cols-2 gap-2.5">
                  {ADMIN_CARDS.map((card) => (
                    <AdminCard key={card.label} card={card} navigate={navigate} />
                  ))}
                </div>
              </div>
            )}
          </div>
        </>
      ) : (
        /* ══════════════════════════════════════════════════════════
           STANDARD USER LAYOUT
        ══════════════════════════════════════════════════════════ */
        <div className="px-5 pt-5 pb-4">
          <div className="flex items-start justify-between">
            {/* Avatar */}
            <div className="relative">
              <motion.div
                className="h-20 w-20 overflow-hidden rounded-full"
                style={{ boxShadow: "0 0 0 1.5px rgba(255,255,255,0.18)" }}
              >
                {showAvatar ? (
                  <img src={avatarSrc!} alt={user.name}
                    className={"h-full w-full object-cover " + (uploading ? "opacity-50" : "")}
                    onError={() => setAvatarBroken(true)} />
                ) : (
                  <div className={"h-full w-full bg-gradient-to-br from-purple-600 via-pink-500 to-blue-600 grid place-items-center text-2xl font-bold text-white " + (uploading ? "opacity-50" : "")}>
                    {uploading ? <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" /> : initials}
                  </div>
                )}
              </motion.div>
              {isEditing && (
                <>
                  <motion.button
                    initial={{ scale: 0 }} animate={{ scale: 1 }} whileTap={{ scale: 0.88 }}
                    onClick={() => fileRef.current?.click()} disabled={uploading}
                    className="absolute -bottom-1 -right-1 grid h-7 w-7 place-items-center rounded-full text-white"
                    style={{ background: "linear-gradient(135deg,var(--accent-primary),var(--accent-secondary))", border: "2px solid hsl(var(--background))" }}
                  >
                    {uploading ? <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/30 border-t-white" /> : <Camera style={{ width: 13, height: 13 }} />}
                  </motion.button>
                  {uploadError && <p className="absolute -bottom-8 left-1/2 -translate-x-1/2 w-56 text-center text-[11px] text-red-400">{uploadError}</p>}
                </>
              )}
            </div>

            {/* Top-right buttons */}
            <div className="flex gap-2">
              {isEditing ? (
                <>
                  <motion.button whileTap={{ scale: 0.88 }} onClick={cancelEdit}
                    className="app-surface grid h-9 w-9 place-items-center rounded-full app-text">
                    <X style={{ width: 16, height: 16 }} />
                  </motion.button>
                  <motion.button whileTap={{ scale: 0.88 }} onClick={saveProfile}
                    className="grid h-9 w-9 place-items-center rounded-full text-white"
                    style={{ background: "linear-gradient(135deg,var(--accent-primary),var(--accent-secondary))" }}>
                    <Check style={{ width: 16, height: 16 }} />
                  </motion.button>
                </>
              ) : (
                <motion.button whileTap={{ scale: 0.88 }} onClick={() => navigate("/profile/settings")}
                  className="app-surface grid h-9 w-9 place-items-center rounded-full app-text">
                  <Settings style={{ width: 16, height: 16 }} />
                </motion.button>
              )}
            </div>
          </div>

          {/* Name / handle / bio */}
          <div className="mt-4">
            {isEditing ? (
              <div className="space-y-2">
                <input value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="Display name"
                  className="app-input w-full rounded-[14px] px-4 py-2.5 text-[17px] font-bold focus:outline-none" />
                <div className="app-input flex items-center rounded-[14px] overflow-hidden">
                  <span className="pl-4 text-sm app-text-muted">@</span>
                  <input value={editHandle} onChange={(e) => setEditHandle(e.target.value.replace(/^@/, ""))}
                    placeholder="username" className="flex-1 bg-transparent px-2 py-2.5 text-sm app-text focus:outline-none" />
                </div>
                <textarea value={editBio} onChange={(e) => setEditBio(e.target.value.slice(0, 280))}
                  placeholder="Bio" rows={3} className="app-input w-full rounded-[14px] px-4 py-2.5 text-[13px] app-text focus:outline-none resize-none" />
                <SocialInput icon={Facebook}  value={editFb} onChange={setEditFb} placeholder="Facebook URL or username" />
                <SocialInput icon={Instagram} value={editIg} onChange={setEditIg} placeholder="Instagram handle" />
                <SocialInput icon={Music2}    value={editTt} onChange={setEditTt} placeholder="TikTok handle" />
              </div>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-display text-[24px] font-bold leading-tight app-text">{user.name}</h2>
                  <NameBadges isOwner={user.isOwner} isVerified={user.isVerified} size="md" />
                </div>
                <p className="mt-0.5 flex items-center gap-1.5 text-sm app-text-muted">
                  <OnlineDot status={presenceStatus} size={8} />
                  @{user.handle}
                </p>
                {user.bio && (
                  <p className="mt-2.5 text-[13px] leading-relaxed app-text-muted max-w-sm whitespace-pre-line">{user.bio}</p>
                )}
                <SocialLinkRow facebook={user.social?.facebook} instagram={user.social?.instagram} tiktok={user.social?.tiktok} />
              </>
            )}
          </div>

          <div className="mt-4 flex items-center overflow-hidden rounded-[18px] app-card">
            <StatBtn label="Creations" value={myPosts.length} />
            <div className="my-3 w-px self-stretch" style={{ background: "var(--s-border-a)" }} />
            <StatBtn label="Followers" value={liveFollowers ?? user.followers} onClick={() => navigate(`/followers/${user.id}`)} />
            <div className="my-3 w-px self-stretch" style={{ background: "var(--s-border-a)" }} />
            <StatBtn label="Following" value={liveFollowing ?? user.following} onClick={() => navigate(`/following/${user.id}`)} />
          </div>

          {!isEditing && (
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={() => {
                setEditName(user.name); setEditHandle(user.handle); setEditBio(user.bio ?? "");
                setEditFb(user.social?.facebook ?? ""); setEditIg(user.social?.instagram ?? "");
                setEditTt(user.social?.tiktok   ?? ""); setIsEditing(true);
              }}
              className="mt-3 w-full rounded-[14px] py-2.5 text-[13px] font-semibold tracking-wide app-surface app-text"
            >
              Edit Profile
            </motion.button>
          )}
        </div>
      )}

      {/* ── Tabs ──────────────────────────────────────────────────────── */}
      <div className="app-header sticky top-0 z-10 flex mt-4">
        <TabBtn active={tab === "creations"} onClick={() => setTab("creations")} icon={Grid3x3}>Creations</TabBtn>
        <TabBtn active={tab === "saved"}     onClick={() => setTab("saved")}     icon={Bookmark}>
          Saved{savedPosts.length > 0 ? ` (${savedPosts.length})` : ""}
        </TabBtn>
        <TabBtn active={tab === "liked"}     onClick={() => setTab("liked")}     icon={Heart}>Liked</TabBtn>
      </div>

      {/* ── Tab content ───────────────────────────────────────────────── */}
      <div className="px-4 pt-4">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={tab}
            initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.16 }}
          >
            {tab === "creations" && (
              realMyPosts.length === 0
                ? <EmptyState icon={Grid3x3} title="No creations yet" sub="Generate your first AI masterpiece." />
                : <div className="columns-2 gap-3">{realMyPosts.map((p, i) => <PostThumbnail key={p.id} post={p} index={i} />)}</div>
            )}
            {tab === "saved" && (
              <>
                {realSavedPosts.length === 0 && savedPrompts.length === 0 && (
                  <EmptyState icon={Bookmark} title="Nothing saved yet" sub="Bookmark any post to see it here." />
                )}
                {realSavedPosts.length > 0 && (
                  <div className="columns-2 gap-3 mb-6">{realSavedPosts.map((p, i) => <PostThumbnail key={p.id} post={p} index={i} />)}</div>
                )}
                {savedPrompts.length > 0 && (
                  <>
                    <h3 className="mb-3 text-[10.5px] font-semibold uppercase tracking-wider app-text-muted">Saved Prompts</h3>
                    <ul className="space-y-2">
                      {savedPrompts.map((p, i) => (
                        <motion.li key={p}
                          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}
                          className="app-card flex items-center gap-3 rounded-[16px] p-3"
                        >
                          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-white"
                            style={{ background: "linear-gradient(135deg,var(--accent-primary),var(--accent-secondary))" }}>
                            <Bookmark style={{ width: 14, height: 14 }} />
                          </span>
                          <p className="flex-1 truncate text-sm app-text">{p}</p>
                          <motion.button whileTap={{ scale: 0.85 }} onClick={() => navigator.clipboard?.writeText(p)}
                            className="app-surface grid h-8 w-8 place-items-center rounded-lg app-text-muted">
                            <Copy style={{ width: 13, height: 13 }} />
                          </motion.button>
                          <motion.button whileTap={{ scale: 0.85 }}
                            onClick={() => { setActivePrompt(p); navigate("/create/prompt-image"); }}
                            className="app-surface grid h-8 w-8 place-items-center rounded-lg app-text-muted">
                            <ArrowUpRight style={{ width: 13, height: 13 }} />
                          </motion.button>
                        </motion.li>
                      ))}
                    </ul>
                  </>
                )}
              </>
            )}
            {tab === "liked" && (
              realMyPosts.filter(p => p.has_liked).length === 0
                ? <EmptyState icon={Heart} title="Nothing liked yet" sub="Like posts to see them here." />
                : <div className="columns-2 gap-3">{realMyPosts.filter(p => p.has_liked).map((p, i) => <PostThumbnail key={p.id} post={p} index={i} />)}</div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Hidden file inputs */}
      <input ref={fileRef}      type="file" accept="image/*" className="hidden" onChange={handleAvatarPick} />
      <input ref={coverFileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleCoverPick} />
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   Helpers
══════════════════════════════════════════════════════════════════════════ */
function StatBtn({ label, value, onClick }: { label: string; value: number; onClick?: () => void }) {
  return (
    <motion.button whileTap={{ scale: 0.93 }} onClick={onClick}
      className="flex flex-1 flex-col items-center justify-center py-3.5">
      <div className="font-display text-[17px] font-bold leading-none app-text">{compact(value)}</div>
      <div className="mt-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] app-text-muted">{label}</div>
    </motion.button>
  );
}

function SocialInput({ icon: Icon, value, onChange, placeholder }: {
  icon: typeof Facebook; value: string; onChange: (v: string) => void; placeholder: string;
}) {
  return (
    <div className="app-input flex items-center rounded-[14px] overflow-hidden">
      <span className="grid h-full place-items-center pl-3 app-text-muted"><Icon style={{ width: 14, height: 14 }} /></span>
      <input value={value} onChange={(e) => onChange(e.target.value.slice(0, 200))} placeholder={placeholder}
        className="flex-1 bg-transparent px-3 py-2.5 text-sm app-text focus:outline-none" />
    </div>
  );
}

function SocialLinkRow({ facebook, instagram, tiktok, centered }: {
  facebook?: string; instagram?: string; tiktok?: string; centered?: boolean;
}) {
  const buildUrl = (kind: "facebook" | "instagram" | "tiktok", v?: string) => {
    if (!v) return null; const t = v.trim(); if (!t) return null;
    if (/^https?:\/\//i.test(t)) return t;
    const h = t.replace(/^@/, "");
    return kind === "facebook" ? `https://facebook.com/${h}` : kind === "instagram" ? `https://instagram.com/${h}` : `https://tiktok.com/@${h}`;
  };
  const items: { icon: typeof Facebook; url: string; label: string }[] = [];
  const fb = buildUrl("facebook",  facebook);  if (fb) items.push({ icon: Facebook,  url: fb, label: "Facebook"  });
  const ig = buildUrl("instagram", instagram); if (ig) items.push({ icon: Instagram, url: ig, label: "Instagram" });
  const tt = buildUrl("tiktok",    tiktok);    if (tt) items.push({ icon: Music2,    url: tt, label: "TikTok"    });
  if (items.length === 0) return null;
  return (
    <div className={`mt-3 flex flex-wrap gap-2 ${centered ? "justify-center" : ""}`}>
      {items.map(({ icon: Icon, url, label }) => (
        <a key={label} href={url} target="_blank" rel="noopener noreferrer"
          className="app-surface inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-semibold app-text">
          <Icon style={{ width: 12, height: 12 }} />{label}
        </a>
      ))}
    </div>
  );
}

function EmptyState({ icon: Icon, title, sub }: { icon: typeof Heart; title: string; sub: string }) {
  return (
    <div className="grid place-items-center px-8 py-16 text-center">
      <div className="float grid h-14 w-14 place-items-center rounded-full app-surface mb-4">
        <Icon className="app-text-muted" style={{ width: 22, height: 22 }} />
      </div>
      <p className="font-display text-base font-semibold app-text">{title}</p>
      <p className="mt-1 text-xs app-text-muted">{sub}</p>
    </div>
  );
}

function compact(n: number) {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return (n / 1000).toFixed(1).replace(/\.0$/, "") + "K";
  return (n / 1_000_000).toFixed(1) + "M";
}

function TabBtn({ active, onClick, icon: Icon, children }: {
  active: boolean; onClick: () => void; icon: typeof Heart; children: React.ReactNode;
}) {
  return (
    <button onClick={onClick}
      className="relative flex flex-1 items-center justify-center gap-1.5 px-3 py-3 text-[11px] font-semibold"
      style={{ color: active ? "hsl(var(--foreground))" : "var(--s-text-muted)" }}>
      <Icon style={{ width: 13, height: 13 }} />
      {children}
      {active && (
        <motion.span layoutId="profileTab" className="absolute inset-x-4 bottom-0 h-[2px] rounded-full"
          style={{ background: "linear-gradient(90deg,var(--accent-primary),var(--accent-secondary))" }} />
      )}
    </button>
  );
}
