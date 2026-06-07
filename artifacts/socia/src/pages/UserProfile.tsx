/**
 * UserProfile.tsx — view another user's public profile.
 * Owner (is_owner=true) accounts get the full cinematic IMAGE-2 founder treatment.
 * Normal accounts get the standard layout.
 */
import { useEffect, useRef, useState, useCallback } from "react";
import { useRoute, useLocation } from "wouter";
import { motion } from "framer-motion";
import { ArrowLeft, MessageCircle, UserPlus, UserCheck, Facebook, Instagram, Music2, Star } from "lucide-react";
import { ProfileDetailsPanel } from "@/components/profile/ProfileDetailsPanel";
import type { ProfilePanelData } from "@/components/profile/ProfileDetailsPanel";
import { useUserPulses, usePulseSocket } from "@/lib/usePulse";
import { openPulseViewer } from "@/components/pulse/PulseViewer";
import type { PulseFeedGroup } from "@/lib/pulseClient";
import SendStarsModal from "@/components/stars/SendStarsModal";
import { supabase } from "@/lib/supabase";
import type { DbUser } from "@/lib/supabase";
import { useAuth } from "@/lib/authContext";
import { NameBadges, OnlineDot } from "@/components/Badges";
import {
  FoundingSupporterBadge, SupporterProfileRing, SupporterLabel, getSupporterTier,
} from "@/components/profile/FoundingSupporterBadge";
import { usePresenceStatus } from "@/lib/usePresence";
import { FounderHero, VerifiedFounderBadge } from "@/components/profile/FounderHero";
import { fetchUserPosts, type SocialPost } from "@/lib/postsClient";
import { ProfileTabs } from "@/components/profile/ProfileTabs";
import { MutualConnections } from "@/components/profile/MutualConnections";

function compact(n: number) {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return (n / 1000).toFixed(1).replace(/\.0$/, "") + "K";
  return (n / 1_000_000).toFixed(1) + "M";
}

export default function UserProfile() {
  const [, params]   = useRoute("/profile/:id");
  const userId       = params?.id ?? "";
  const [, navigate] = useLocation();
  const { supabaseUser } = useAuth();

  const [profile,       setProfile]       = useState<DbUser | null>(null);
  const [loading,       setLoading]       = useState(true);
  const [followed,      setFollowed]      = useState(false);
  const [followWorking, setFollowWorking] = useState(false);
  const [userPosts,     setUserPosts]     = useState<SocialPost[]>([]);
  const [starsOpen,     setStarsOpen]     = useState(false);

  /* ── Pulse ───────────────────────────────────────────────────────────── */
  const { hasActivePulse, pulses: viewedUserPulses } = useUserPulses(userId || undefined);
  usePulseSocket();

  const fetchCounts = async () => {
    const { data, error } = await supabase
      .from("users").select("followers, following").eq("id", userId).maybeSingle();
    if (error) { console.error("[Follow] re-fetch:", error.message); return; }
    if (data) setProfile((p) => p ? { ...p, followers: data.followers ?? 0, following: data.following ?? 0 } : p);
  };

  const sessionUid = supabaseUser?.id ?? null;

  /* ── Realtime presence status (replaces stale profile.is_online from DB) ── */
  const presenceStatus = usePresenceStatus(userId);

  useEffect(() => {
    if (!userId) return;
    setProfile(null); setFollowed(false); setLoading(true);
    const requestedFor = userId;
    let cancelled = false;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const uid = session?.user?.id;
      const [profileRes, followRes, followersRes, followingRes] = await Promise.all([
        supabase.from("users").select("*").eq("id", requestedFor).maybeSingle(),
        uid
          ? supabase.from("follows").select("*").eq("follower_id", uid).eq("following_id", requestedFor).maybeSingle()
          : Promise.resolve({ data: null, error: null }),
        supabase.from("follows").select("*", { count: "exact", head: true }).eq("following_id", requestedFor),
        supabase.from("follows").select("*", { count: "exact", head: true }).eq("follower_id",  requestedFor),
      ]);
      if (cancelled) return;
      const base = profileRes.data as DbUser | null;
      const counts = { followers: followersRes.count ?? 0, following: followingRes.count ?? 0 };
      setProfile(base ? { ...base, ...counts } : null);
      setFollowed(!!(followRes.data));
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [userId, sessionUid]);

  /* ── Fetch user's real posts (paginated) ───────────────────────────── */
  const UP_PAGE = 20;
  const [postsOffset,      setPostsOffset]      = useState(0);
  const [hasMorePosts,     setHasMorePosts]     = useState(false);
  const [loadingMorePosts, setLoadingMorePosts] = useState(false);
  const upSentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    setUserPosts([]);
    setPostsOffset(0);
    setHasMorePosts(false);
    fetchUserPosts(userId, { limit: UP_PAGE + 1, offset: 0, viewerId: supabaseUser?.id })
      .then((p) => {
        if (!cancelled) {
          const more = p.length > UP_PAGE;
          setUserPosts(more ? p.slice(0, UP_PAGE) : p);
          setHasMorePosts(more);
          setPostsOffset(UP_PAGE);
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [userId, supabaseUser?.id]);

  const loadMoreUserPosts = useCallback(async () => {
    if (!userId || loadingMorePosts || !hasMorePosts) return;
    setLoadingMorePosts(true);
    try {
      const p = await fetchUserPosts(userId, { limit: UP_PAGE + 1, offset: postsOffset, viewerId: supabaseUser?.id });
      const more = p.length > UP_PAGE;
      setUserPosts((prev) => [...prev, ...(more ? p.slice(0, UP_PAGE) : p)]);
      setHasMorePosts(more);
      setPostsOffset((prev) => prev + UP_PAGE);
    } catch { /* ok */ }
    finally { setLoadingMorePosts(false); }
  }, [userId, supabaseUser?.id, loadingMorePosts, hasMorePosts, postsOffset]);

  useEffect(() => {
    const sentinel = upSentinelRef.current;
    if (!sentinel || !hasMorePosts) return;
    const observer = new IntersectionObserver(
      (entries) => { if (entries[0].isIntersecting) loadMoreUserPosts(); },
      { threshold: 0.1 },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMorePosts, loadMoreUserPosts]);

  /* Realtime: live updates to this user's row */
  useEffect(() => {
    if (!userId) return;
    const ch = supabase
      .channel(`profile:${userId}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "users", filter: `id=eq.${userId}` },
        (payload) => setProfile((p) => p ? { ...p, ...(payload.new as DbUser) } : p),
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [userId]);

  const handleFollow = async () => {
    if (followWorking) return;
    const { data: { session } } = await supabase.auth.getSession();
    const uid = session?.user?.id;
    if (!uid) return;
    setFollowWorking(true);
    try {
      if (followed) {
        const { error } = await supabase.rpc("unfollow_user", { target_id: userId });
        if (!error) setFollowed(false);
      } else {
        const { error } = await supabase.rpc("follow_user", { target_id: userId });
        if (!error) setFollowed(true);
      }
      await fetchCounts();
    } catch (e) { console.error("[Follow]", e); }
    finally { setFollowWorking(false); }
  };

  if (!userId || userId === supabaseUser?.id) { navigate("/profile"); return null; }

  if (loading) {
    return (
      <div className="app-bg flex h-full flex-col">
        <div className="flex items-center gap-3 border-b border-white/[0.04] bg-[#000000] px-4"
          style={{ paddingTop: `calc(env(safe-area-inset-top,0px) + 12px)`, paddingBottom: 12 }}>
          <button onClick={() => history.length > 1 ? history.back() : navigate("/")}
            className="card-premium grid h-9 w-9 place-items-center rounded-full text-white">
            <ArrowLeft className="h-4 w-4" />
          </button>
        </div>
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6">
          <div className="h-20 w-20 rounded-full shimmer" />
          <div className="h-5 w-32 rounded shimmer" />
          <div className="h-3.5 w-24 rounded shimmer" />
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="app-bg flex h-full flex-col">
        <div className="flex items-center gap-3 border-b border-white/[0.04] bg-[#000000] px-4"
          style={{ paddingTop: `calc(env(safe-area-inset-top,0px) + 12px)`, paddingBottom: 12 }}>
          <button onClick={() => history.length > 1 ? history.back() : navigate("/")}
            className="card-premium grid h-9 w-9 place-items-center rounded-full text-white">
            <ArrowLeft className="h-4 w-4" />
          </button>
        </div>
        <div className="flex flex-1 items-center justify-center text-sm text-white/40">User not found</div>
      </div>
    );
  }

  const isOwner       = !!profile.is_owner;
  const supporterTier = getSupporterTier(profile as unknown as Record<string, unknown>);
  const avatarSrc     = profile.avatar_url;
  const initials      = (profile.name || "?").charAt(0).toUpperCase();

  /* ── Follow + Message + Stars action buttons ── */
  const isOwnProfile = !!sessionUid && sessionUid === userId;
  const ActionButtons = () => (
    <div className="flex gap-2">
      <motion.button
        type="button" whileTap={{ scale: 0.9 }}
        onClick={handleFollow} disabled={followWorking}
        className={
          "flex h-9 items-center gap-1.5 rounded-full px-4 text-xs font-semibold text-white disabled:opacity-60 " +
          (followed
            ? "border border-white/20 bg-white/[0.06]"
            : "bg-gradient-to-r from-purple-600 via-pink-500 to-blue-500 shadow-[0_4px_18px_-4px_rgba(236,72,153,0.45)]")
        }
      >
        {followed ? <><UserCheck className="h-3.5 w-3.5" /> Following</> : <><UserPlus className="h-3.5 w-3.5" /> Follow</>}
      </motion.button>
      <motion.button
        type="button" whileTap={{ scale: 0.9 }}
        onClick={() => navigate(`/messages/${userId}`)}
        className="card-premium flex h-9 items-center gap-1.5 rounded-full px-4 text-xs font-semibold text-white"
      >
        <MessageCircle className="h-3.5 w-3.5" /> Message
      </motion.button>
      {!isOwnProfile && sessionUid && (
        <motion.button
          type="button" whileTap={{ scale: 0.9 }}
          onClick={() => setStarsOpen(true)}
          className="flex h-9 items-center gap-1.5 rounded-full px-4 text-xs font-semibold text-white"
          style={{ background: "rgba(251,191,36,0.12)", border: "1.5px solid rgba(251,191,36,0.3)" }}
        >
          <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" /> Stars
        </motion.button>
      )}
    </div>
  );

  return (
    <div className="app-bg flex flex-col relative">

      {/* ══════════════════════════════════════════════════════════════
          FOUNDER / OWNER LAYOUT — matches IMAGE 2
      ══════════════════════════════════════════════════════════════ */}
      {isOwner ? (
        <>
          {/* Back button overlaid on hero */}
          <div className="absolute top-0 left-0 z-20 px-4"
            style={{ paddingTop: `calc(env(safe-area-inset-top,0px) + 12px)` }}>
            <button
              onClick={() => history.length > 1 ? history.back() : navigate("/")}
              className="grid h-9 w-9 place-items-center rounded-full text-white"
              style={{ background: "rgba(0,0,0,0.65)", border: "1px solid rgba(255,255,255,0.15)" }}
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
          </div>

          {/* Cinematic hero with avatar inside */}
          <FounderHero
            avatarUrl={avatarSrc}
            initials={initials}
            isOnline={presenceStatus === "online"}
            coverPhotoUrl={profile.cover_photo_url ?? null}
          />

          {/* Centered identity section */}
          <div className="px-5 pt-4 text-center pb-8">

            {/* Name row: [verified] Name */}
            <div className="flex items-center justify-center gap-2 flex-wrap">
              <VerifiedFounderBadge />
              <h2 style={{
                fontSize: 26, fontWeight: 900, color: "#ffffff",
                letterSpacing: "-0.01em", lineHeight: 1.1, margin: 0,
              }}>
                {profile.name || profile.username || "Unknown"}
              </h2>
            </div>

            {/* Founder • Socia */}
            <motion.div
              className="flex items-center justify-center gap-1.5 mt-2"
              animate={{ opacity: [0.85, 1, 0.85] }}
              transition={{ duration: 3, repeat: Infinity }}
            >
              <svg viewBox="0 0 18 14" style={{ width: 12, height: 9 }}>
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

            {/* Bio */}
            {profile.bio && (
              <p className="mt-2.5 text-[13px] leading-relaxed text-white/60 max-w-sm mx-auto whitespace-pre-line">{profile.bio}</p>
            )}

            {/* Social links centered */}
            <UserSocialLinks
              facebook={profile.social_facebook}
              instagram={profile.social_instagram}
              tiktok={profile.social_tiktok}
              centered
            />

            {/* Action buttons centered */}
            <div className="mt-4 flex justify-center">
              <ActionButtons />
            </div>

            {/* Stats */}
            <div
              className="mt-4 flex overflow-hidden rounded-[18px]"
              style={{ border: "1px solid rgba(251,191,36,0.15)", background: "rgba(251,191,36,0.025)" }}
            >
              <StatBox label="Followers" value={profile.followers ?? 0} onClick={() => navigate(`/followers/${userId}`)} />
              <div className="my-3 w-px self-stretch" style={{ background: "rgba(251,191,36,0.12)" }} />
              <StatBox label="Following" value={profile.following ?? 0} onClick={() => navigate(`/following/${userId}`)} />
            </div>

            {/* Facebook-style Details Panel — owner */}
            <div className="mt-4 -mx-5">
              <ProfileDetailsPanel
                profile={{
                  id:                   profile.id,
                  name:                 profile.name ?? undefined,
                  username:             profile.username ?? undefined,
                  avatar_url:           profile.avatar_url ?? undefined,
                  followers:            profile.followers ?? 0,
                  following:            profile.following ?? 0,
                  location:             profile.location,
                  birthday:             profile.birthday,
                  gender:               profile.gender,
                  relationship_status:  profile.relationship_status,
                  work:                 profile.work,
                  work_previous:        profile.work_previous,
                  education:            profile.education,
                  school:               profile.school,
                  college:              profile.college,
                  website:              profile.website,
                  social_facebook:      profile.social_facebook,
                  social_instagram:     profile.social_instagram,
                  social_tiktok:        profile.social_tiktok,
                  social_x:             profile.social_x,
                  social_youtube:       profile.social_youtube,
                  social_linkedin:      profile.social_linkedin,
                  created_at:           profile.created_at,
                  privacy_settings:     profile.privacy_settings,
                  public_email:         profile.public_email,
                  public_phone:         profile.public_phone,
                } satisfies ProfilePanelData}
                isOwnProfile={false}
                viewerId={sessionUid}
              />
            </div>

            {/* Socia Profile Tabs — owner layout */}
            <div className="mt-6 -mx-6">
              <MutualConnections profileUserId={userId} viewerId={sessionUid} />
              <ProfileTabs
                userId={userId}
                viewerId={sessionUid}
                userProfile={{
                  created_at:          (profile as any)?.created_at,
                  is_verified:         profile?.is_verified,
                  is_owner:            profile?.is_owner,
                  subscription_status: (profile as any)?.subscription_status,
                  name:                profile?.name ?? undefined,
                  followers:           profile?.followers ?? 0,
                }}
                supporterTier={supporterTier}
              />
            </div>
          </div>
        </>
      ) : (
        /* ══════════════════════════════════════════════════════════
           STANDARD USER LAYOUT — Facebook-style
        ══════════════════════════════════════════════════════════ */
        <>
          {/* ── Cover photo section ───────────────────────────────── */}
          <div className="relative overflow-hidden" style={{ height: 200 }}>
            {profile.cover_photo_url ? (
              <img
                src={profile.cover_photo_url}
                alt="cover"
                className="absolute inset-0 w-full h-full object-cover object-center"
                style={{ display: "block" }}
              />
            ) : (
              <div
                className="absolute inset-0"
                style={{ background: "linear-gradient(160deg, #0d0b1a 0%, #1a0e2e 45%, #0a0c18 100%)" }}
              />
            )}

            {/* Back button overlaid on cover */}
            <div className="absolute top-0 left-0 z-20 px-4"
              style={{ paddingTop: `calc(env(safe-area-inset-top,0px) + 12px)` }}>
              <button
                onClick={() => history.length > 1 ? history.back() : navigate("/")}
                className="grid h-9 w-9 place-items-center rounded-full text-white"
                style={{ background: "rgba(0,0,0,0.65)", border: "1px solid rgba(255,255,255,0.15)" }}
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
            </div>

            {/* Bottom gradient */}
            <div className="absolute bottom-0 left-0 right-0 pointer-events-none"
              style={{ height: 64, background: "linear-gradient(to bottom, transparent, rgba(0,0,0,0.6))" }} />
          </div>

          {/* ── Avatar + identity (overlapping cover by 44px) ────── */}
          <div className="px-4 pb-8" style={{ marginTop: -44 }}>

            {/* Avatar row */}
            <div className="flex items-end justify-between mb-3">
              <div
                className="relative cursor-pointer"
                onClick={() => hasActivePulse
                  ? openPulseViewer(
                      [{ user: { id: profile.id, name: profile.name, username: profile.username, avatar_url: profile.avatar_url ?? null }, pulses: viewedUserPulses, has_unviewed: viewedUserPulses.some(p => !p.is_viewed) } satisfies PulseFeedGroup],
                      0, 0
                    )
                  : undefined
                }
              >
                {hasActivePulse && (
                  <>
                    <div className="pulse-ring-anim absolute rounded-full pointer-events-none"
                      style={{ inset: -7, background: "conic-gradient(from 0deg,#ff006e,#8338ec,#3a86ff,#06d6a0,#ffbe0b,#ff006e)", zIndex: 0 }} />
                    <div className="absolute rounded-full pointer-events-none"
                      style={{ inset: -4, background: "#000", zIndex: 1 }} />
                  </>
                )}
                <div className="relative" style={{ zIndex: 2 }}>
                <SupporterProfileRing tier={supporterTier} size={88}>
                <div className="h-[88px] w-[88px] overflow-hidden rounded-full"
                  style={{ border: "3px solid #000", boxShadow: "0 2px 16px rgba(0,0,0,0.6)" }}>
                  {avatarSrc
                    ? <img src={avatarSrc} alt={profile.name ?? ""} loading="lazy" className="h-full w-full object-cover" />
                    : <div className="h-full w-full bg-gradient-to-br from-purple-600 via-pink-500 to-blue-600 grid place-items-center text-2xl font-bold text-white">{initials}</div>
                  }
                </div>
                </SupporterProfileRing>
                <div className="absolute bottom-0.5 right-0.5" style={{ zIndex: 3 }}>
                  <OnlineDot status={presenceStatus} size={14} />
                </div>
                </div>
              </div>
              <div className="relative z-10"><ActionButtons /></div>
            </div>

            {/* Name / username / bio */}
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-display text-[22px] font-bold leading-tight text-white">
                  {profile.name || profile.username || "Unknown"}
                </h2>
                {profile.is_owner && (
                  <NameBadges isOwner={profile.is_owner} isVerified={profile.is_verified} size="md" />
                )}
                {supporterTier && (
                  <FoundingSupporterBadge tier={supporterTier} size={22} />
                )}
              </div>
              {supporterTier && (
                <div className="mt-1"><SupporterLabel tier={supporterTier} /></div>
              )}
              {profile.username && (
                <p className="mt-0.5 flex items-center gap-1.5 text-sm text-white/50">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.1em]">
                    {presenceStatus === "online" ? "Online now" : presenceStatus === "away" ? "Away" : "Offline"}
                  </span>
                  · @{profile.username}
                </p>
              )}
              {profile.bio && (
                <p className="mt-2.5 text-[13px] leading-relaxed text-white/60 max-w-sm whitespace-pre-line">{profile.bio}</p>
              )}
              <UserSocialLinks
                facebook={profile.social_facebook}
                instagram={profile.social_instagram}
                tiktok={profile.social_tiktok}
              />
            </div>

            {/* Stats */}
            <div className="mt-5 flex overflow-hidden rounded-[18px] border border-white/[0.06] bg-white/[0.03]">
              <StatBox label="Followers" value={profile.followers ?? 0} onClick={() => navigate(`/followers/${userId}`)} />
              <div className="my-3 w-px self-stretch bg-white/[0.06]" />
              <StatBox label="Following" value={profile.following ?? 0} onClick={() => navigate(`/following/${userId}`)} />
            </div>

            {/* Facebook-style Details Panel */}
            <div className="mt-4 -mx-4">
              <ProfileDetailsPanel
                profile={{
                  id:                   profile.id,
                  name:                 profile.name ?? undefined,
                  username:             profile.username ?? undefined,
                  avatar_url:           profile.avatar_url ?? undefined,
                  followers:            profile.followers ?? 0,
                  following:            profile.following ?? 0,
                  location:             profile.location,
                  birthday:             profile.birthday,
                  gender:               profile.gender,
                  relationship_status:  profile.relationship_status,
                  work:                 profile.work,
                  work_previous:        profile.work_previous,
                  education:            profile.education,
                  school:               profile.school,
                  college:              profile.college,
                  website:              profile.website,
                  social_facebook:      profile.social_facebook,
                  social_instagram:     profile.social_instagram,
                  social_tiktok:        profile.social_tiktok,
                  social_x:             profile.social_x,
                  social_youtube:       profile.social_youtube,
                  social_linkedin:      profile.social_linkedin,
                  created_at:           profile.created_at,
                  privacy_settings:     profile.privacy_settings,
                  public_email:         profile.public_email,
                  public_phone:         profile.public_phone,
                } satisfies ProfilePanelData}
                isOwnProfile={false}
                viewerId={sessionUid}
              />
            </div>

            {/* Socia Profile Tabs — standard layout */}
            <div className="mt-6 -mx-4">
              <MutualConnections profileUserId={userId} viewerId={sessionUid} />
              <ProfileTabs
                userId={userId}
                viewerId={sessionUid}
                userProfile={{
                  created_at:          (profile as any)?.created_at,
                  is_verified:         profile?.is_verified,
                  is_owner:            profile?.is_owner,
                  subscription_status: (profile as any)?.subscription_status,
                  name:                profile?.name ?? undefined,
                  followers:           profile?.followers ?? 0,
                }}
                supporterTier={supporterTier}
              />
            </div>
          </div>
        </>
      )}

      {/* ── Send Stars Modal ─────────────────────────────────────────────── */}
      {starsOpen && profile && (
        <SendStarsModal
          creator={{
            id:         profile.id,
            name:       profile.name ?? null,
            username:   profile.username ?? null,
            avatar_url: profile.avatar_url ?? null,
          }}
          onClose={() => setStarsOpen(false)}
        />
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   Helpers
══════════════════════════════════════════════════════════════════════════ */
function StatBox({ label, value, onClick }: { label: string; value: number; onClick?: () => void }) {
  return (
    <button type="button" onClick={onClick}
      className="flex flex-1 flex-col items-center justify-center py-4 transition-colors hover:bg-white/[0.03]">
      <div className="font-display text-[17px] font-bold text-white">{compact(value)}</div>
      <div className="mt-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/40">{label}</div>
    </button>
  );
}

function UserSocialLinks({ facebook, instagram, tiktok, centered }: {
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
          className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-[11px] font-semibold text-white/80">
          <Icon className="h-3 w-3" />{label}
        </a>
      ))}
    </div>
  );
}
