/**
 * UserProfile.tsx — View another user's public profile.
 * X (Twitter) style layout via XProfileHeader + ProfileTabs.
 * All backend logic preserved: follow/unfollow, pulses, realtime, stars.
 */
import { useEffect, useState, useCallback } from "react";
import { useRoute, useLocation } from "wouter";
import { useUserPulses, usePulseSocket } from "@/lib/usePulse";
import { openPulseViewer } from "@/components/pulse/PulseViewer";
import type { PulseFeedGroup } from "@/lib/pulseClient";
import SendStarsModal from "@/components/stars/SendStarsModal";
import { supabase, fetchProfile, type DbUser } from "@/lib/supabase";
import { useAuth } from "@/lib/authContext";
import { getSupporterTier } from "@/components/profile/FoundingSupporterBadge";
import { usePresenceStatus } from "@/lib/usePresence";
import { fetchUserPosts, type SocialPost } from "@/lib/postsClient";
import { ProfileTabs } from "@/components/profile/ProfileTabs";
import { XProfileHeader } from "@/components/profile/XProfileHeader";

export default function UserProfile() {
  const [, params]       = useRoute("/profile/:id");
  const userId           = params?.id ?? "";
  const [, navigate]     = useLocation();
  const { supabaseUser } = useAuth();

  const [profile,       setProfile]       = useState<DbUser | null>(null);
  const [loading,       setLoading]       = useState(true);
  const [followed,      setFollowed]      = useState(false);
  const [followWorking, setFollowWorking] = useState(false);
  const [starsOpen,     setStarsOpen]     = useState(false);
  const [postCount,     setPostCount]     = useState<number | null>(null);

  /* ── Pulse ── */
  const { hasActivePulse, pulses: viewedUserPulses } = useUserPulses(userId || undefined);
  usePulseSocket();

  const sessionUid = supabaseUser?.id ?? null;

  /* ── Presence ── */
  const presenceStatus = usePresenceStatus(userId);

  /* ── Fetch profile + follow state ── */
  const fetchCounts = async () => {
    const { data, error } = await supabase
      .from("users").select("followers, following").eq("id", userId).maybeSingle() as any;
    if (error) return;
    if (data) setProfile(p => p ? { ...p, followers: (data as any).followers ?? 0, following: (data as any).following ?? 0 } : p);
  };

  useEffect(() => {
    if (!userId) return;
    setProfile(null); setFollowed(false); setLoading(true);
    const requestedFor = userId;
    let cancelled = false;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const uid = session?.user?.id;
      const [profileData, followRes] = await Promise.all([
        fetchProfile(requestedFor),
        uid
          ? supabase.from("follows").select("*").eq("follower_id", uid).eq("following_id", requestedFor).maybeSingle() as any
          : Promise.resolve({ data: null, error: null }),
      ]);
      if (cancelled) return;
      setProfile(profileData ?? null);
      setFollowed(!!((followRes as any).data));
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [userId, sessionUid]);

  /* ── Post count ── */
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    (async () => {
      const { count } = await supabase
        .from("posts")
        .select("*", { count: "exact", head: true })
        .eq("author_id", userId) as any;
      if (!cancelled && count !== null) setPostCount(count);
    })();
    return () => { cancelled = true; };
  }, [userId]);

  /* ── Realtime live updates to user row ── */
  useEffect(() => {
    if (!userId) return;
    const ch = supabase
      .channel(`profile:${userId}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "users", filter: `id=eq.${userId}` },
        (payload) => setProfile(p => p ? { ...p, ...(payload.new as DbUser) } : p),
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [userId]);

  /* ── Follow / Unfollow ── */
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

  /* ── Redirect own profile ── */
  if (!userId || userId === supabaseUser?.id) { navigate("/profile"); return null; }

  /* ── Loading skeleton ── */
  if (loading) {
    return (
      <div className="app-bg flex h-full flex-col" style={{ background: "#000" }}>
        {/* Top bar skeleton */}
        <div className="flex items-center gap-3 px-3" style={{ paddingTop: "calc(env(safe-area-inset-top,0px) + 10px)", paddingBottom: 10 }}>
          <div className="shimmer rounded-full" style={{ width: 34, height: 34 }} />
          <div className="flex-1">
            <div className="shimmer rounded" style={{ height: 14, width: "40%", marginBottom: 6 }} />
            <div className="shimmer rounded" style={{ height: 11, width: "25%" }} />
          </div>
        </div>
        {/* Cover skeleton */}
        <div className="shimmer" style={{ width: "100%", height: 150 }} />
        {/* Avatar row */}
        <div className="px-3 flex items-end gap-3" style={{ marginTop: -38 }}>
          <div className="shimmer rounded-full flex-shrink-0" style={{ width: 76, height: 76 }} />
        </div>
        {/* Info skeleton */}
        <div className="px-4 mt-3 space-y-2">
          <div className="shimmer rounded" style={{ height: 18, width: "45%" }} />
          <div className="shimmer rounded" style={{ height: 13, width: "30%" }} />
          <div className="shimmer rounded" style={{ height: 13, width: "70%" }} />
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="app-bg flex h-full flex-col" style={{ background: "#000" }}>
        <div className="flex items-center gap-3 px-3"
          style={{ paddingTop: "calc(env(safe-area-inset-top,0px) + 10px)", paddingBottom: 10 }}>
          <button onClick={() => history.length > 1 ? history.back() : navigate("/")}
            style={{ width: 34, height: 34, display: "grid", placeItems: "center", color: "#fff", background: "none", border: "none" }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 20, height: 20 }}>
              <path d="M19 12H5M12 19l-7-7 7-7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
        <div className="flex flex-1 items-center justify-center" style={{ color: "rgba(255,255,255,0.4)", fontSize: 14 }}>
          User not found
        </div>
      </div>
    );
  }

  const isOwner       = !!profile.is_owner;
  const isVerified    = !!profile.is_verified;
  const supporterTier = getSupporterTier(profile as unknown as Record<string, unknown>);

  return (
    <div className="app-bg h-full overflow-y-auto hide-scrollbar scroll-native pb-28" style={{ background: "#000" }}>
      {/* ════════════════════ X-STYLE HEADER ════════════════════ */}
      <XProfileHeader
        coverUrl={profile.cover_photo_url ?? null}
        avatarUrl={profile.avatar_url ?? null}
        name={profile.name || profile.username || "User"}
        handle={profile.username || profile.name || "user"}
        bio={profile.bio}
        website={profile.website}
        location={profile.location}
        joinedAt={profile.created_at}
        followers={profile.followers ?? 0}
        following={profile.following ?? 0}
        postCount={postCount}
        isVerified={isVerified}
        isOwner={isOwner}
        supporterTier={supporterTier}
        hasActivePulse={hasActivePulse}
        isOwnProfile={false}
        followed={followed}
        followWorking={followWorking}
        onFollow={handleFollow}
        onMessage={() => navigate(`/messages/${userId}`)}
        onSubscribe={profile.subscription_status ? undefined : undefined}
        onMorePress={() => {/* future: report/block sheet */}}
        onFollowersClick={() => navigate(`/followers/${userId}`)}
        onFollowingClick={() => navigate(`/following/${userId}`)}
        onSearch={() => navigate("/search")}
        onAvatarClick={() =>
          hasActivePulse
            ? openPulseViewer(
                [{
                  user: { id: profile.id, name: profile.name, username: profile.username, avatar_url: profile.avatar_url ?? null },
                  pulses: viewedUserPulses,
                  has_unviewed: viewedUserPulses.some(p => !p.is_viewed),
                } satisfies PulseFeedGroup],
                0, 0,
              )
            : undefined
        }
      />

      {/* ════════════════════ PROFILE TABS ════════════════════ */}
      <ProfileTabs
        userId={userId}
        viewerId={sessionUid}
        isOwnProfile={false}
        userProfile={{
          created_at:          profile.created_at,
          is_verified:         profile.is_verified,
          is_owner:            profile.is_owner,
          subscription_status: (profile as any).subscription_status,
          name:                profile.name ?? undefined,
          followers:           profile.followers ?? 0,
        }}
        supporterTier={supporterTier}
        defaultTab="posts"
      />

      {/* ════════════════════ SEND STARS MODAL ════════════════════ */}
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
