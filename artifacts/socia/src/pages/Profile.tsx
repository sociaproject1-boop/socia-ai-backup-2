import { useEffect, useRef, useState, useCallback } from "react";
import { useAppStore } from "@/lib/store";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  Settings, Heart, Bookmark, Grid3x3, Copy, ArrowUpRight,
  ChevronRight, Feather, MapPin, Globe, Briefcase, GraduationCap,
  Facebook, Instagram, Music2,
} from "lucide-react";
import { ProfileDetailsPanel } from "@/components/profile/ProfileDetailsPanel";
import type { ProfilePanelData } from "@/components/profile/ProfileDetailsPanel";
import { supabase, isSupabaseReady } from "@/lib/supabase";
import { fetchUserPosts, fetchSavedFeed, type SocialPost } from "@/lib/postsClient";
import { NameBadges, OnlineDot } from "@/components/Badges";
import { ProfileTabs } from "@/components/profile/ProfileTabs";
import { MutualConnections } from "@/components/profile/MutualConnections";
import { MomentsComposer } from "@/components/profile/MomentsComposer";
import {
  FoundingSupporterBadge, SupporterProfileRing, SupporterLabel, getSupporterTier,
} from "@/components/profile/FoundingSupporterBadge";
import { usePresenceStatus } from "@/lib/usePresence";
import {
  FounderHero, VerifiedFounderBadge, MiniWaveform,
} from "@/components/profile/FounderHero";
import { EditProfileModal } from "@/components/profile/EditProfileModal";
import { ProfileCompleteness } from "@/components/profile/ProfileCompleteness";
import type { User } from "@/lib/store";

type Tab = "creations" | "saved" | "liked";

/* ══════════════════════════════════════════════════════════════════════════
   Admin command center card definitions
══════════════════════════════════════════════════════════════════════════ */
interface AdminCardDef {
  iconPath: string; label: string; sub: string;
  status: string; dot: string; wave: boolean; waveColor: string; href: string | null;
}
const ADMIN_CARDS: AdminCardDef[] = [
  { iconPath: "M12 2L3 7v10l9 5 9-5V7L12 2zM12 12L5.5 8.5M12 12v9M12 12l6.5-3.5", label: "Admin Panel", sub: "Manage users, bans, payments\n& system settings", status: "ACTIVE", dot: "#22c55e", wave: false, waveColor: "#22c55e", href: "/admin" },
  { iconPath: "M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18", label: "AI Engine Monitor", sub: "Live engine performance\n& system resources", status: "ONLINE", dot: "#22c55e", wave: true, waveColor: "#22c55e", href: "/admin/ai-monitor" },
  { iconPath: "M22 12h-4l-3 9L9 3 6 12H2", label: "Render Queue", sub: "Active & queued\ncinematic jobs", status: "LIVE", dot: "#a855f7", wave: true, waveColor: "#a855f7", href: "/admin/render-queue" },
  { iconPath: "M12 2a10 10 0 100 20A10 10 0 0012 2zM2 12h4M18 12h4M12 2v4M12 18v4", label: "System Status", sub: "API • Database • Storage\n• CDN • Security", status: "ALL SYSTEMS GO", dot: "#22c55e", wave: false, waveColor: "#22c55e", href: "/admin/system-status" },
  { iconPath: "M3 10h18M7 15h1m4 0h1M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z", label: "Payment Monitor", sub: "PayMongo health & checkout\nmaintenance controls", status: "LIVE", dot: "#34d399", wave: true, waveColor: "#34d399", href: "/owner/payments" },
  { iconPath: "M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 7h10v10H7V7z", label: "AI Command Center", sub: "Providers • balances • spend\n• generation metrics", status: "MONITORING", dot: "#a855f7", wave: true, waveColor: "#a855f7", href: "/owner/ai" },
];

function AdminCard({ card, navigate }: { card: AdminCardDef; navigate: (to: string) => void }) {
  return (
    <motion.button whileTap={{ scale: 0.96 }} onClick={() => card.href && navigate(card.href)}
      className="flex flex-col text-left rounded-[18px] p-3.5"
      style={{ background: "#0a0a0a", border: "1px solid rgba(251,191,36,0.22)", minHeight: 134, gap: 6 }}>
      <div className="flex items-start justify-between">
        <div className="grid place-items-center rounded-[13px]"
          style={{ width: 42, height: 42, background: "linear-gradient(135deg,rgba(245,158,11,0.2),rgba(245,158,11,0.06))", border: "1px solid rgba(251,191,36,0.3)" }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="#fbbf24" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ width: 18, height: 18 }}>
            <path d={card.iconPath} />
          </svg>
        </div>
        {card.href && <ChevronRight style={{ width: 13, height: 13, color: "rgba(251,191,36,0.38)", marginTop: 4 }} />}
      </div>
      <p style={{ fontSize: 12.5, fontWeight: 700, color: "#f3f4f6", lineHeight: 1.25 }}>{card.label}</p>
      <p style={{ fontSize: 10, color: "#6b7280", lineHeight: 1.45, flex: 1, whiteSpace: "pre-line" }}>{card.sub}</p>
      <div className="flex items-center justify-between mt-1">
        <div className="flex items-center gap-1.5">
          <motion.div animate={{ scale: [1, 1.6, 1], opacity: [1, 0.4, 1] }} transition={{ duration: 1.6, repeat: Infinity }}
            style={{ width: 6, height: 6, borderRadius: "50%", background: card.dot, flexShrink: 0 }} />
          <span style={{ fontSize: 8.5, fontWeight: 900, color: card.dot, letterSpacing: "0.07em" }}>{card.status}</span>
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
  const posts           = useAppStore((s) => s.posts);
  const savedPostIds    = useAppStore((s) => s.savedPostIds);
  const followedUserIds = useAppStore((s) => s.followedUserIds);
  const setActivePrompt = useAppStore((s) => s.setActivePrompt);
  const [, navigate]    = useLocation();
  const [tab, setTab]   = useState<Tab>("creations");

  const [composerOpen,  setComposerOpen]  = useState(false);
  const [freshMoment,   setFreshMoment]   = useState<SocialPost | null>(null);
  const [editModalOpen, setEditModalOpen] = useState(false);

  /* ── Avatar display (broken image fallback) ─────────────────────────── */
  const [avatarBroken, setAvatarBroken] = useState(false);

  /* ── Cover photo ────────────────────────────────────────────────────── */
  const [coverPhotoUrl, setCoverPhotoUrl] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);

  const isAdminProfile = user?.isOwner === true;
  const supporterTier  = getSupporterTier(user as unknown as Record<string, unknown>);

  /* ── Realtime presence ───────────────────────────────────────────────── */
  const presenceStatus = usePresenceStatus(user?.id ?? null);

  /* ── Load cover photo from Supabase on mount ────────────────────────── */
  useEffect(() => {
    if (!user?.id) return;
    (async () => {
      try {
        const { data } = await supabase
          .from("users").select("cover_photo_url").eq("id", user.id).maybeSingle();
        if (data?.cover_photo_url) setCoverPhotoUrl(data.cover_photo_url);
      } catch { /* ignore */ }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  /* ── Real posts from backend ────────────────────────────────────────── */
  const POSTS_PAGE = 20;
  const [realMyPosts,        setRealMyPosts]        = useState<SocialPost[]>([]);
  const [realSavedPosts,     setRealSavedPosts]     = useState<SocialPost[]>([]);
  const [liveCreationsCount, setLiveCreationsCount] = useState<number | null>(null);
  const [creationsLoading,   setCreationsLoading]   = useState(true);
  const [postsOffset,        setPostsOffset]        = useState(0);
  const [hasMorePosts,       setHasMorePosts]       = useState(false);
  const [loadingMorePosts,   setLoadingMorePosts]   = useState(false);
  const profileSentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    setCreationsLoading(true);
    setRealMyPosts([]);
    setPostsOffset(0);
    setHasMorePosts(false);
    fetchUserPosts(user.id, { limit: POSTS_PAGE + 1, offset: 0, viewerId: user.id })
      .then((p) => {
        if (!cancelled) {
          const more = p.length > POSTS_PAGE;
          setRealMyPosts(more ? p.slice(0, POSTS_PAGE) : p);
          setHasMorePosts(more);
          setPostsOffset(POSTS_PAGE);
          setCreationsLoading(false);
        }
      })
      .catch(() => { if (!cancelled) setCreationsLoading(false); });
    fetchSavedFeed({ limit: 30 })
      .then((p) => { if (!cancelled) setRealSavedPosts(p); })
      .catch(() => {});
    (async () => {
      const { count } = await supabase.from("posts").select("*", { count: "exact", head: true }).eq("author_id", user.id);
      if (!cancelled && count !== null) setLiveCreationsCount(count);
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const loadMorePosts = useCallback(async () => {
    if (!user?.id || loadingMorePosts || !hasMorePosts) return;
    setLoadingMorePosts(true);
    try {
      const p = await fetchUserPosts(user.id, { limit: POSTS_PAGE + 1, offset: postsOffset, viewerId: user.id });
      const more = p.length > POSTS_PAGE;
      setRealMyPosts((prev) => [...prev, ...(more ? p.slice(0, POSTS_PAGE) : p)]);
      setHasMorePosts(more);
      setPostsOffset((prev) => prev + POSTS_PAGE);
    } catch { /* ok */ }
    finally { setLoadingMorePosts(false); }
  }, [user?.id, loadingMorePosts, hasMorePosts, postsOffset]);

  useEffect(() => {
    const sentinel = profileSentinelRef.current;
    if (!sentinel || !hasMorePosts) return;
    const observer = new IntersectionObserver(
      (entries) => { if (entries[0].isIntersecting) loadMorePosts(); }, { threshold: 0.1 },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMorePosts, loadMorePosts]);

  /* ── Live follower / following counts ──────────────────────────────── */
  const [liveFollowers, setLiveFollowers] = useState<number | null>(null);
  const [liveFollowing, setLiveFollowing] = useState<number | null>(null);

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

  /* ── Modal save callback ────────────────────────────────────────────── */
  const handleModalSaved = useCallback((_updates: Partial<User>, newCoverUrl: string | null) => {
    if (newCoverUrl !== undefined) setCoverPhotoUrl(newCoverUrl);
  }, []);

  if (!user) return null;

  const myPosts    = posts.filter((p) => p.authorId === user.id).slice(0, 9);
  const savedPosts = posts.filter((p) => savedPostIds.includes(p.id));
  const liked      = posts.filter((p) => p.hasLiked);
  const avatarSrc  = user.avatar;
  const initials   = (user.name || "?").charAt(0).toUpperCase();
  const showAvatar = Boolean(avatarSrc) && !avatarBroken;

  /* ── Extended profile fields ─────────────────────────────────────────── */
  const privacy        = user.privacySettings;
  const showLocation   = Boolean(user.location   && (privacy?.showLocation   !== false));
  const showBirthday   = Boolean(user.birthday   && (privacy?.showBirthday   === true));
  const showRelStatus  = Boolean(user.relationshipStatus && user.relationshipStatus !== "Prefer not to say" && (privacy?.showRelationship !== false));

  return (
    <div
      ref={scrollRef}
      className="app-bg pb-28 hide-scrollbar h-full overflow-y-auto scroll-native"
    >
      {/* ══════════════════════════════════════════════════════════════
          FOUNDER / ADMIN LAYOUT
      ══════════════════════════════════════════════════════════════ */}
      {isAdminProfile ? (
        <>
          <div className="relative">
            <FounderHero
              avatarUrl={showAvatar ? avatarSrc : null}
              initials={initials}
              isOnline={presenceStatus === "online"}
              isEditing={false}
              onAvatarClick={undefined}
              uploading={false}
              coverPhotoUrl={coverPhotoUrl}
              onCoverClick={undefined}
              coverUploading={false}
            />

            {/* Settings button — top-right */}
            <div className="absolute top-0 right-3 flex gap-2 z-30"
              style={{ paddingTop: `calc(env(safe-area-inset-top,0px) + 10px)` }}>
              <motion.button whileTap={{ scale: 0.88 }} onClick={() => navigate("/profile/settings")}
                className="grid h-9 w-9 place-items-center rounded-full text-white"
                style={{ background: "rgba(0,0,0,0.65)", border: "1px solid rgba(255,255,255,0.15)" }}>
                <Settings style={{ width: 15, height: 15 }} />
              </motion.button>
            </div>
          </div>

          {/* ── Centered founder identity ────────────────────────── */}
          <div className="px-5 pt-4 text-center">
            <div className="flex items-center justify-center gap-2 flex-wrap">
              <VerifiedFounderBadge />
              <h2 style={{ fontSize: 26, fontWeight: 900, color: "#ffffff", letterSpacing: "-0.01em", lineHeight: 1.1 }}>
                {user.name}
              </h2>
            </div>

            <motion.div className="flex items-center justify-center gap-1.5 mt-2"
              animate={{ opacity: [0.85, 1, 0.85] }} transition={{ duration: 3, repeat: Infinity }}>
              <svg viewBox="0 0 18 14" style={{ width: 13, height: 10 }}>
                <path d="M1 12 L3 4 L7 8 L9 1 L11 8 L15 4 L17 12 Z" fill="#fbbf24" />
                <rect x="1" y="11" width="16" height="2.5" rx="1" fill="#fbbf24" />
              </svg>
              <span style={{ fontSize: 12, fontWeight: 900, letterSpacing: "0.18em", textTransform: "uppercase", color: "#fbbf24" }}>
                Founder • Socia
              </span>
            </motion.div>

            {/* Bio */}
            {user.bio && (
              <p className="mt-2 text-[13px] leading-relaxed app-text-muted max-w-sm mx-auto whitespace-pre-line">{user.bio}</p>
            )}

            {/* Extended info chips */}
            <ExtendedInfoRow user={user} showLocation={showLocation} showBirthday={showBirthday} showRelStatus={showRelStatus} centered />

            {/* Social links */}
            <SocialLinkRow user={user} centered />

            {/* Stats */}
            <div className="mt-4 flex items-center overflow-hidden rounded-[18px]"
              style={{ border: "1px solid rgba(251,191,36,0.15)", background: "rgba(251,191,36,0.025)" }}>
              <StatBtn label="Creations" value={myPosts.length} />
              <div className="my-3 w-px self-stretch" style={{ background: "rgba(251,191,36,0.12)" }} />
              <StatBtn label="Followers" value={liveFollowers ?? user.followers} onClick={() => navigate(`/followers/${user.id}`)} />
              <div className="my-3 w-px self-stretch" style={{ background: "rgba(251,191,36,0.12)" }} />
              <StatBtn label="Following" value={liveFollowing ?? user.following} onClick={() => navigate(`/following/${user.id}`)} />
            </div>

            {/* Edit Profile button */}
            <motion.button whileTap={{ scale: 0.97 }} onClick={() => setEditModalOpen(true)}
              className="mt-3 w-full rounded-[14px] py-2.5 text-[13px] font-semibold tracking-wide app-surface app-text">
              Edit Profile
            </motion.button>

            {/* Admin Command Center */}
            <div className="mt-6">
              <div className="flex items-center justify-center gap-2 mb-3">
                <svg viewBox="0 0 18 14" style={{ width: 12, height: 9 }}>
                  <path d="M1 12 L3 4 L7 8 L9 1 L11 8 L15 4 L17 12 Z" fill="#fbbf24" />
                  <rect x="1" y="11" width="16" height="2.5" rx="1" fill="#fbbf24" />
                </svg>
                <span style={{ fontSize: 10.5, fontWeight: 900, letterSpacing: "0.18em", textTransform: "uppercase", color: "#fbbf24" }}>
                  Admin Command Center
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                {ADMIN_CARDS.map((card) => (
                  <AdminCard key={card.label} card={card} navigate={navigate} />
                ))}
              </div>
            </div>
          </div>
        </>
      ) : (
        /* ══════════════════════════════════════════════════════════════
           STANDARD USER LAYOUT — Facebook-style cover
        ══════════════════════════════════════════════════════════════ */
        <>
          {/* Cover photo */}
          <div className="relative overflow-hidden" style={{ height: 200 }}>
            {coverPhotoUrl ? (
              <img src={coverPhotoUrl} alt="cover"
                className="absolute inset-0 w-full h-full object-cover object-center" />
            ) : (
              <div className="absolute inset-0"
                style={{ background: "linear-gradient(160deg,#0d0b1a 0%,#1a0e2e 45%,#0a0c18 100%)" }} />
            )}

            {/* Settings button */}
            <div className="absolute top-0 right-3 flex gap-2 z-10"
              style={{ paddingTop: `calc(env(safe-area-inset-top,0px) + 10px)` }}>
              <motion.button whileTap={{ scale: 0.88 }} onClick={() => navigate("/profile/settings")}
                className="grid h-9 w-9 place-items-center rounded-full text-white"
                style={{ background: "rgba(0,0,0,0.65)", border: "1px solid rgba(255,255,255,0.15)" }}>
                <Settings style={{ width: 15, height: 15 }} />
              </motion.button>
            </div>

            {/* Bottom gradient */}
            <div className="absolute bottom-0 left-0 right-0 pointer-events-none"
              style={{ height: 64, background: "linear-gradient(to bottom,transparent,rgba(0,0,0,0.6))" }} />
          </div>

          {/* Avatar + identity (overlapping cover) */}
          <div className="px-4 pb-4" style={{ marginTop: -44 }}>
            <div className="flex items-end justify-between">
              <div className="relative">
                <SupporterProfileRing tier={supporterTier} size={88}>
                  <div className="h-[88px] w-[88px] overflow-hidden rounded-full"
                    style={{ border: "3px solid #000", boxShadow: "0 2px 16px rgba(0,0,0,0.6)" }}>
                    {showAvatar ? (
                      <img src={avatarSrc!} alt={user.name}
                        className="h-full w-full object-cover"
                        onError={() => setAvatarBroken(true)} />
                    ) : (
                      <div className="h-full w-full bg-gradient-to-br from-purple-600 via-pink-500 to-blue-600 grid place-items-center text-2xl font-bold text-white">
                        {initials}
                      </div>
                    )}
                  </div>
                </SupporterProfileRing>
              </div>
            </div>

            {/* Name / handle / bio */}
            <div className="mt-4">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-display text-[24px] font-bold leading-tight app-text">{user.name}</h2>
                {user.isOwner && <NameBadges isOwner={user.isOwner} isVerified={user.isVerified} size="md" />}
                {supporterTier && !user.isOwner && (
                  <FoundingSupporterBadge tier={supporterTier} size={22} />
                )}
              </div>
              {supporterTier && !user.isOwner && (
                <div className="mt-1"><SupporterLabel tier={supporterTier} /></div>
              )}
              <p className="mt-0.5 flex items-center gap-1.5 text-sm app-text-muted">
                <OnlineDot status={presenceStatus} size={8} />
                @{user.handle}
              </p>
              {user.bio && (
                <p className="mt-2.5 text-[13px] leading-relaxed app-text-muted max-w-sm whitespace-pre-line">{user.bio}</p>
              )}

              {/* Extended info chips */}
              <ExtendedInfoRow user={user} showLocation={showLocation} showBirthday={showBirthday} showRelStatus={showRelStatus} />

              {/* Social links */}
              <SocialLinkRow user={user} />
            </div>

            {/* Stats */}
            <div className="mt-4 flex items-center overflow-hidden rounded-[18px] app-card">
              <StatBtn label="Creations" value={liveCreationsCount ?? realMyPosts.length} />
              <div className="my-3 w-px self-stretch" style={{ background: "var(--s-border-a)" }} />
              <StatBtn label="Followers" value={liveFollowers ?? user.followers} onClick={() => navigate(`/followers/${user.id}`)} />
              <div className="my-3 w-px self-stretch" style={{ background: "var(--s-border-a)" }} />
              <StatBtn label="Following" value={liveFollowing ?? user.following} onClick={() => navigate(`/following/${user.id}`)} />
            </div>

            {/* Edit Profile + Studio buttons */}
            <div className="mt-3 flex gap-2">
              <motion.button whileTap={{ scale: 0.97 }} onClick={() => setEditModalOpen(true)}
                className="flex-1 rounded-[14px] py-2.5 text-[13px] font-semibold tracking-wide app-surface app-text">
                Edit Profile
              </motion.button>
              <motion.button whileTap={{ scale: 0.97 }} onClick={() => navigate("/creator/dashboard")}
                className="flex items-center gap-1.5 rounded-[14px] px-4 py-2.5 text-[13px] font-semibold"
                style={{ background: "linear-gradient(135deg,rgba(168,85,247,0.15),rgba(236,72,153,0.15))", border: "1px solid rgba(168,85,247,0.3)", color: "#a855f7" }}>
                <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-3.5 w-3.5">
                  <path d="M2 12h12M2 8l4-4 3 3 5-5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Studio
              </motion.button>
            </div>
          </div>

          {/* Profile Completeness bar */}
          <ProfileCompleteness user={user} onEdit={() => setEditModalOpen(true)} />

          {/* Facebook-style Details Panel */}
          <div className="mt-4">
            <ProfileDetailsPanel
              profile={{
                id:                   user.id,
                name:                 user.name,
                username:             user.handle,
                avatar_url:           user.avatar ?? undefined,
                followers:            liveFollowers ?? user.followers,
                following:            liveFollowing ?? user.following,
                location:             user.location,
                birthday:             user.birthday,
                gender:               user.gender,
                relationship_status:  user.relationshipStatus,
                work:                 user.work,
                work_previous:        user.workPrevious,
                education:            user.education,
                school:               (user as any).school,
                college:              (user as any).college,
                website:              user.website,
                social_facebook:      user.social?.facebook,
                social_instagram:     user.social?.instagram,
                social_tiktok:        user.social?.tiktok,
                social_x:             user.social?.x,
                social_youtube:       user.social?.youtube,
                social_linkedin:      user.social?.linkedin,
                created_at:           (user as any).created_at,
                privacy_settings:     user.privacySettings as Record<string, boolean | string>,
              } satisfies ProfilePanelData}
              isOwnProfile
              viewerId={user.id}
              onEditOpen={() => setEditModalOpen(true)}
            />
          </div>
        </>
      )}

      {/* ── Write a Moment button ── */}
      <motion.button
        whileTap={{ scale: 0.97 }}
        onClick={() => setComposerOpen(true)}
        className="mx-4 mt-4 flex w-[calc(100%-2rem)] items-center gap-3 rounded-[18px] px-4 py-3 text-left"
        style={{ background: "rgba(255,255,255,0.028)", border: "1px solid rgba(255,255,255,0.055)" }}
      >
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full"
          style={{ background: "linear-gradient(135deg,rgba(168,85,247,0.22),rgba(236,72,153,0.12))", border: "1px solid rgba(168,85,247,0.28)" }}>
          <Feather className="h-3.5 w-3.5 text-purple-400" />
        </span>
        <span className="flex-1 text-[13px] text-white/30">Write a Moment…</span>
        <span className="text-[10px] font-mono text-white/15">⌘E</span>
      </motion.button>

      {/* ── Socia Profile Tabs ── */}
      <div className="mt-4">
        <ProfileTabs
          userId={user.id}
          viewerId={user.id}
          isEditing={editModalOpen}
          userProfile={{
            created_at:          (user as any)?.created_at,
            is_verified:         user?.isVerified,
            is_owner:            user?.isOwner,
            subscription_status: (user as any)?.subscription_status,
            name:                user?.name,
            followers:           liveFollowers ?? user?.followers ?? 0,
          }}
          supporterTier={supporterTier}
          prependPost={freshMoment}
        />
      </div>

      {/* ── Moments Composer ── */}
      <MomentsComposer
        open={composerOpen}
        onClose={() => setComposerOpen(false)}
        onPosted={(post) => { setFreshMoment(post); setComposerOpen(false); }}
      />

      {/* ── Edit Profile Modal ── */}
      <EditProfileModal
        open={editModalOpen}
        onClose={() => setEditModalOpen(false)}
        onSaved={handleModalSaved}
        initialCoverUrl={coverPhotoUrl}
      />
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   Extended info row — location, birthday, relationship, work, education
══════════════════════════════════════════════════════════════════════════ */
function ExtendedInfoRow({ user, showLocation, showBirthday, showRelStatus, centered }: {
  user: User; showLocation: boolean; showBirthday: boolean; showRelStatus: boolean; centered?: boolean;
}) {
  const items: { icon: React.ReactNode; text: string; link?: string }[] = [];

  if (showLocation && user.location) {
    items.push({ icon: <MapPin style={{ width: 11, height: 11 }} />, text: user.location });
  }
  if (user.work) {
    items.push({ icon: <Briefcase style={{ width: 11, height: 11 }} />, text: user.work });
  }
  if (user.education) {
    items.push({ icon: <GraduationCap style={{ width: 11, height: 11 }} />, text: user.education });
  }
  if (user.website) {
    const url = /^https?:\/\//i.test(user.website) ? user.website : `https://${user.website}`;
    const display = user.website.replace(/^https?:\/\/(www\.)?/i, "").replace(/\/$/, "");
    items.push({ icon: <Globe style={{ width: 11, height: 11 }} />, text: display, link: url });
  }
  if (showBirthday && user.birthday) {
    const d = new Date(user.birthday);
    items.push({ icon: <span style={{ fontSize: 11 }}>🎂</span>, text: d.toLocaleDateString(undefined, { month: "long", day: "numeric" }) });
  }
  if (showRelStatus && user.relationshipStatus) {
    items.push({ icon: <span style={{ fontSize: 11 }}>💜</span>, text: user.relationshipStatus });
  }

  if (items.length === 0) return null;

  return (
    <div className={`mt-3 flex flex-wrap gap-x-3 gap-y-1.5 ${centered ? "justify-center" : ""}`}>
      {items.map(({ icon, text, link }) =>
        link ? (
          <a key={text} href={link} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1 text-[12px] font-medium"
            style={{ color: "#a855f7" }}>
            <span className="text-purple-400">{icon}</span>
            <span>{text}</span>
          </a>
        ) : (
          <span key={text} className="flex items-center gap-1 text-[12px] app-text-muted">
            <span className="text-purple-400">{icon}</span>
            <span>{text}</span>
          </span>
        )
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   Social link row — all 6 networks
══════════════════════════════════════════════════════════════════════════ */
function SocialLinkRow({ user, centered }: { user: User; centered?: boolean }) {
  const s = user.social;

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
      default:          return `https://${h}`;
    }
  }

  const links: { label: string; url: string; icon: React.ReactNode }[] = [];
  const fb = buildUrl("facebook",  s?.facebook);  if (fb) links.push({ label: "Facebook",  url: fb, icon: <Facebook  style={{ width: 11, height: 11 }} /> });
  const ig = buildUrl("instagram", s?.instagram); if (ig) links.push({ label: "Instagram", url: ig, icon: <Instagram style={{ width: 11, height: 11 }} /> });
  const tt = buildUrl("tiktok",    s?.tiktok);    if (tt) links.push({ label: "TikTok",    url: tt, icon: <Music2    style={{ width: 11, height: 11 }} /> });
  const xv = buildUrl("x",         s?.x);         if (xv) links.push({ label: "X",         url: xv, icon: <span style={{ fontSize: 10, fontWeight: 900, lineHeight: 1 }}>𝕏</span> });
  const yt = buildUrl("youtube",   s?.youtube);   if (yt) links.push({ label: "YouTube",   url: yt, icon: <span style={{ fontSize: 10 }}>▶</span> });
  const li = buildUrl("linkedin",  s?.linkedin);  if (li) links.push({ label: "LinkedIn",  url: li, icon: <span style={{ fontSize: 10, fontWeight: 900 }}>in</span> });

  if (links.length === 0) return null;

  return (
    <div className={`mt-3 flex flex-wrap gap-2 ${centered ? "justify-center" : ""}`}>
      {links.map(({ label, url, icon }) => (
        <a key={label} href={url} target="_blank" rel="noopener noreferrer"
          className="app-surface inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-semibold app-text">
          {icon}{label}
        </a>
      ))}
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

function compact(n: number) {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return (n / 1000).toFixed(1).replace(/\.0$/, "") + "K";
  return (n / 1_000_000).toFixed(1) + "M";
}

/* Keep legacy TabBtn for any import side-effects */
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
