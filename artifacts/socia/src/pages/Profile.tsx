import { useEffect, useRef, useState } from "react";
import { useAppStore } from "@/lib/store";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  Settings, Heart, Bookmark, Grid3x3, Copy, ArrowUpRight, Camera,
  Check, X, Facebook, Instagram, Music2,
  Shield, Server, Activity, Layers, ChevronRight,
} from "lucide-react";

import { FeedCard } from "@/components/feed/FeedCard";
import { supabase, uploadAvatar, upsertProfile, isSupabaseReady } from "@/lib/supabase";
import { NameBadges, OnlineDot } from "@/components/Badges";
import { FounderHero, SuperKingBadge } from "@/components/profile/FounderHero";

type Tab = "creations" | "saved" | "liked";

/* ══════════════════════════════════════════════════════════════════════════
   Admin action cards config
══════════════════════════════════════════════════════════════════════════ */
const ADMIN_ACTIONS = [
  { icon: Shield,   label: "Admin Panel",       sub: "Manage users, bans & payments",    href: "/admin",              live: false },
  { icon: Server,   label: "AI Engine Monitor", sub: "Live render engine status",         href: "/create/multi-frame", live: true  },
  { icon: Activity, label: "Render Queue",       sub: "Active & queued cinematic jobs",   href: "/create/multi-frame", live: true  },
  { icon: Layers,   label: "System Status",      sub: "API · DB · Storage · CDN",        href: null,                  live: true  },
] as const;

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
  const fileRef = useRef<HTMLInputElement>(null);

  const isAdminProfile = user?.isOwner === true;

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
      setEditAvatar(url);
      setAvatarBroken(false);
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
      name:   editName.trim()                    || user.name,
      handle: editHandle.trim().replace(/^@/, "") || user.handle,
      bio:    editBio.trim(),
      avatar: editAvatar ?? user.avatar,
      social: { facebook: editFb.trim(), instagram: editIg.trim(), tiktok: editTt.trim() },
    };
    setSaveStatus("saving"); setSaveError("");
    setUser(updated); setIsEditing(false); setEditAvatar(null);
    if (!isSupabaseReady) { setSaveStatus("saved"); setTimeout(() => setSaveStatus("idle"), 2500); return; }
    const TIMEOUT_MS = 8_000;
    try {
      let didTimeout = false;
      const timedOut = new Promise<{ error: string | null }>((resolve) =>
        setTimeout(() => { didTimeout = true; resolve({ error: null }); }, TIMEOUT_MS),
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
          updated_at:       new Date().toISOString(),
        }).eq("id", updated.id).then(({ error: e }) => {
          if (e) console.warn("[Profile] social links not saved:", e.message);
        });
      }
      if      (didTimeout) { setSaveStatus("saved"); }
      else if (error)      { setUser(previous); setSaveError(error); setSaveStatus("error"); }
      else                 { setSaveStatus("saved"); }
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
              background: saveStatus === "saved" ? "linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))"
                : saveStatus === "error" ? "rgba(239,68,68,0.9)" : "#0a0a0a",
            }}
          >
            {saveStatus === "saving" && "Saving…"}
            {saveStatus === "saved"  && "✓ Profile saved"}
            {saveStatus === "error"  && (saveError ? `Save failed: ${saveError}` : "Save failed — check connection")}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Founder cinematic hero — admin only ────────────────────────── */}
      {isAdminProfile && <FounderHero />}

      {/* ── Profile header ─────────────────────────────────────────────── */}
      <div className={`px-5 pb-6 ${isAdminProfile ? "pt-2" : "pt-5"}`}>
        <div className="flex items-start justify-between">
          {/* Avatar */}
          <div className="relative">
            <motion.div
              animate={isAdminProfile ? {
                boxShadow: [
                  "0 0 0 2px #f59e0b, 0 0 14px 4px rgba(245,158,11,0.38)",
                  "0 0 0 2.5px #fbbf24, 0 0 28px 8px rgba(251,191,36,0.62)",
                  "0 0 0 2px #f59e0b, 0 0 14px 4px rgba(245,158,11,0.38)",
                ],
              } : {}}
              transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut" }}
              className="h-20 w-20 overflow-hidden rounded-full"
              style={!isAdminProfile ? { boxShadow: "0 0 0 1.5px rgba(255,255,255,0.18)" } : {}}
            >
              {showAvatar ? (
                <img
                  src={avatarSrc!} alt={user.name}
                  className={"h-full w-full object-cover " + (uploading ? "opacity-50" : "")}
                  onError={() => { setAvatarBroken(true); if (isEditing) setUploadError("Image failed — try another file."); }}
                />
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
                  style={{ background: "linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))", border: "2px solid hsl(var(--background))" }}
                >
                  {uploading ? <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/30 border-t-white" /> : <Camera style={{ width: 13, height: 13 }} />}
                </motion.button>
                {uploadError && (
                  <p className="absolute -bottom-8 left-1/2 -translate-x-1/2 w-56 text-center text-[11px] text-red-400 font-medium">{uploadError}</p>
                )}
              </>
            )}
          </div>

          {/* Top-right actions */}
          <div className="flex gap-2">
            {isEditing ? (
              <>
                <motion.button whileTap={{ scale: 0.88 }} onClick={cancelEdit}
                  className="app-surface grid h-9 w-9 place-items-center rounded-full app-text">
                  <X style={{ width: 16, height: 16 }} />
                </motion.button>
                <motion.button whileTap={{ scale: 0.88 }} onClick={saveProfile}
                  className="grid h-9 w-9 place-items-center rounded-full text-white"
                  style={{ background: "linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))" }}>
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
            </div>
          ) : (
            <>
              {/* Name row + badges */}
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-display text-[24px] font-bold leading-tight app-text">{user.name}</h2>
                <NameBadges isOwner={user.isOwner} isVerified={user.isVerified} size="md" />
              </div>

              {/* Founder title — admin only */}
              {isAdminProfile && (
                <motion.div
                  initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }}
                  className="mt-1 flex items-center gap-2"
                >
                  <SuperKingBadge />
                  <motion.span
                    animate={{
                      backgroundPosition: ["0% 50%", "100% 50%", "0% 50%"],
                    }}
                    transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
                    style={{
                      fontSize: 11.5, fontWeight: 800, letterSpacing: "0.1em",
                      textTransform: "uppercase",
                      background: "linear-gradient(90deg, #d97706, #fbbf24, #f59e0b, #fbbf24, #d97706)",
                      backgroundSize: "200% auto",
                      WebkitBackgroundClip: "text",
                      WebkitTextFillColor: "transparent",
                    }}
                  >
                    Founder · Socia
                  </motion.span>
                </motion.div>
              )}

              {/* Online status — enhanced for admin, standard for others */}
              {isAdminProfile ? (
                <div className="mt-2 flex items-center gap-2">
                  <div className="relative" style={{ width: 10, height: 10 }}>
                    {user.isOnline && (
                      <motion.div
                        animate={{ scale: [1, 2.4, 1], opacity: [0.7, 0, 0.7] }}
                        transition={{ duration: 1.6, repeat: Infinity }}
                        style={{
                          position: "absolute", inset: -2, borderRadius: "50%",
                          background: "rgba(34,197,94,0.5)",
                        }}
                      />
                    )}
                    <div style={{
                      width: 10, height: 10, borderRadius: "50%",
                      background: user.isOnline ? "#22c55e" : "#6b7280",
                      position: "relative",
                    }} />
                  </div>
                  <span style={{
                    fontSize: 11, fontWeight: 800, letterSpacing: "0.09em",
                    textTransform: "uppercase",
                    color: user.isOnline ? "#22c55e" : "#6b7280",
                  }}>
                    {user.isOnline ? "Live · Online Now" : "Offline"}
                  </span>
                </div>
              ) : (
                <p className="mt-0.5 flex items-center gap-1.5 text-sm app-text-muted">
                  <OnlineDot online={Boolean(user.isOnline)} size={8} />
                  @{user.handle}
                </p>
              )}

              {user.bio && (
                <p className="mt-2.5 text-[13px] leading-relaxed app-text-muted max-w-sm whitespace-pre-line">{user.bio}</p>
              )}
              <SocialLinkRow facebook={user.social?.facebook} instagram={user.social?.instagram} tiktok={user.social?.tiktok} />
            </>
          )}

          {isEditing && (
            <div className="mt-2 space-y-2">
              <textarea value={editBio} onChange={(e) => setEditBio(e.target.value.slice(0, 280))}
                placeholder="Bio (max 280 characters)" rows={3}
                className="app-input w-full rounded-[14px] px-4 py-2.5 text-[13px] app-text focus:outline-none resize-none" />
              <SocialInput icon={Facebook}  value={editFb} onChange={setEditFb} placeholder="Facebook URL or username" />
              <SocialInput icon={Instagram} value={editIg} onChange={setEditIg} placeholder="Instagram handle" />
              <SocialInput icon={Music2}    value={editTt} onChange={setEditTt} placeholder="TikTok handle" />
            </div>
          )}
        </div>

        {/* Stats row */}
        <div
          className="mt-4 flex items-center overflow-hidden rounded-[18px] app-card"
          style={isAdminProfile ? { border: "1px solid rgba(251,191,36,0.15)" } : {}}
        >
          <StatBtn label="Creations" value={myPosts.length} />
          <div className="my-3 w-px self-stretch" style={{ background: "var(--s-border-a)" }} />
          <StatBtn label="Followers" value={liveFollowers ?? user.followers} onClick={() => navigate(`/followers/${user.id}`)} />
          <div className="my-3 w-px self-stretch" style={{ background: "var(--s-border-a)" }} />
          <StatBtn label="Following" value={liveFollowing ?? user.following} onClick={() => navigate(`/following/${user.id}`)} />
        </div>

        {/* Edit Profile button */}
        {!isEditing && (
          <div className="mt-3">
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={() => {
                setEditName(user.name); setEditHandle(user.handle); setEditBio(user.bio ?? "");
                setEditFb(user.social?.facebook ?? ""); setEditIg(user.social?.instagram ?? "");
                setEditTt(user.social?.tiktok   ?? ""); setIsEditing(true);
              }}
              className="w-full rounded-[14px] py-2.5 text-[13px] font-semibold tracking-wide app-surface app-text"
            >
              Edit Profile
            </motion.button>
          </div>
        )}

        {/* ── Admin Quick Actions ─────────────────────────────────────── */}
        {isAdminProfile && !isEditing && (
          <motion.div
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.14, duration: 0.22 }}
            className="mt-5"
          >
            {/* Section header */}
            <div className="flex items-center gap-3 mb-3">
              <div className="h-px flex-1"
                style={{ background: "linear-gradient(90deg, transparent, rgba(251,191,36,0.38), transparent)" }} />
              <span style={{ fontSize: 9.5, fontWeight: 900, letterSpacing: "0.2em", color: "#fbbf24", textTransform: "uppercase" }}>
                Admin Control
              </span>
              <div className="h-px flex-1"
                style={{ background: "linear-gradient(90deg, transparent, rgba(251,191,36,0.38), transparent)" }} />
            </div>

            {/* Cards container with animated glow border */}
            <motion.div
              animate={{
                boxShadow: [
                  "0 0 0 1px rgba(251,191,36,0.1), 0 4px 24px -4px rgba(251,191,36,0.1)",
                  "0 0 0 1px rgba(251,191,36,0.3), 0 8px 32px -4px rgba(251,191,36,0.25)",
                  "0 0 0 1px rgba(251,191,36,0.1), 0 4px 24px -4px rgba(251,191,36,0.1)",
                ],
              }}
              transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut" }}
              className="overflow-hidden rounded-[22px]"
              style={{ border: "1px solid rgba(251,191,36,0.14)", background: "rgba(251,191,36,0.025)" }}
            >
              {ADMIN_ACTIONS.map((item, i) => {
                const Icon = item.icon;
                return (
                  <div key={item.label}>
                    {i > 0 && <div style={{ height: 1, background: "rgba(251,191,36,0.08)", margin: "0 16px" }} />}
                    <motion.button
                      whileTap={{ scale: 0.985 }}
                      onClick={() => item.href && navigate(item.href)}
                      className="flex w-full items-center gap-3.5 px-4 py-3.5 text-left"
                    >
                      {/* Icon with optional live dot */}
                      <div className="relative shrink-0">
                        <div
                          className="grid h-10 w-10 place-items-center rounded-[14px]"
                          style={{
                            background: "linear-gradient(135deg, rgba(245,158,11,0.18), rgba(245,158,11,0.07))",
                            border: "1px solid rgba(251,191,36,0.22)",
                          }}
                        >
                          <Icon style={{ width: 16, height: 16, color: "#fbbf24" }} />
                        </div>
                        {item.live && (
                          <>
                            <motion.div
                              animate={{ scale: [1, 2, 1], opacity: [0.6, 0, 0.6] }}
                              transition={{ duration: 1.8, repeat: Infinity }}
                              className="absolute -top-0.5 -right-0.5 h-3.5 w-3.5 rounded-full"
                              style={{ background: "rgba(34,197,94,0.4)" }}
                            />
                            <div className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full"
                              style={{ background: "#22c55e", border: "1.5px solid #000" }} />
                          </>
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <p style={{ fontSize: 13.5, fontWeight: 650, color: "#f3f4f6", lineHeight: 1.3 }}>{item.label}</p>
                        <p style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>{item.sub}</p>
                      </div>

                      {item.href && (
                        <ChevronRight style={{ width: 14, height: 14, color: "rgba(251,191,36,0.38)", flexShrink: 0 }} />
                      )}
                    </motion.button>
                  </div>
                );
              })}
            </motion.div>
          </motion.div>
        )}
      </div>

      {/* ── Tabs ──────────────────────────────────────────────────────── */}
      <div className="app-header sticky top-0 z-10 flex">
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
              myPosts.length === 0
                ? <EmptyState icon={Grid3x3} title="No creations yet" sub="Generate your first AI masterpiece." />
                : <div className="columns-2 gap-3">{myPosts.map((p, i) => <FeedCard key={p.id} post={p} index={i} />)}</div>
            )}

            {tab === "saved" && (
              <>
                {savedPosts.length === 0 && savedPrompts.length === 0 && (
                  <EmptyState icon={Bookmark} title="Nothing saved yet" sub="Bookmark any post to see it here." />
                )}
                {savedPosts.length > 0 && (
                  <div className="columns-2 gap-3 mb-6">{savedPosts.map((p, i) => <FeedCard key={p.id} post={p} index={i} />)}</div>
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
                            style={{ background: "linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))" }}>
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
              liked.length === 0
                ? <EmptyState icon={Heart} title="Nothing liked yet" sub="Double-tap any creation to heart it." />
                : <div className="columns-2 gap-3">{liked.map((p, i) => <FeedCard key={p.id} post={p} index={i} />)}</div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Hidden avatar file input */}
      <input ref={fileRef} type="file" accept="image/*" className="hidden" data-testid="avatar-file-input" onChange={handleAvatarPick} />
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   Helper components
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

function SocialLinkRow({ facebook, instagram, tiktok }: { facebook?: string; instagram?: string; tiktok?: string }) {
  const buildUrl = (kind: "facebook" | "instagram" | "tiktok", v?: string) => {
    if (!v) return null; const t = v.trim(); if (!t) return null;
    if (/^https?:\/\//i.test(t)) return t;
    const handle = t.replace(/^@/, "");
    return kind === "facebook" ? `https://facebook.com/${handle}` : kind === "instagram" ? `https://instagram.com/${handle}` : `https://tiktok.com/@${handle}`;
  };
  const items: { icon: typeof Facebook; url: string; label: string }[] = [];
  const fb = buildUrl("facebook",  facebook);  if (fb) items.push({ icon: Facebook,  url: fb, label: "Facebook"  });
  const ig = buildUrl("instagram", instagram); if (ig) items.push({ icon: Instagram, url: ig, label: "Instagram" });
  const tt = buildUrl("tiktok",    tiktok);    if (tt) items.push({ icon: Music2,    url: tt, label: "TikTok"    });
  if (items.length === 0) return null;
  return (
    <div className="mt-3 flex flex-wrap gap-2">
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
          style={{ background: "linear-gradient(90deg, var(--accent-primary), var(--accent-secondary))" }} />
      )}
    </button>
  );
}
