/**
 * Profile.tsx — Own user profile page, X (Twitter) style.
 * Uses XProfileHeader for the header section, ProfileTabs for content.
 * All backend logic (auth, posts, follows, supabase) preserved unchanged.
 */
import { useEffect, useState, useCallback } from "react";
import { useAppStore } from "@/lib/store";
import { useLocation } from "wouter";
import { useUserPulses, usePulseSocket } from "@/lib/usePulse";
import { openPulseViewer } from "@/components/pulse/PulseViewer";
import type { PulseFeedGroup } from "@/lib/pulseClient";
import { supabase } from "@/lib/supabase";
import { fetchSavedFeed, type SocialPost } from "@/lib/postsClient";
import { ProfileTabs } from "@/components/profile/ProfileTabs";
import { XProfileHeader } from "@/components/profile/XProfileHeader";
import { EditProfileModal } from "@/components/profile/EditProfileModal";
import { MomentsComposer } from "@/components/profile/MomentsComposer";
import { getSupporterTier } from "@/components/profile/FoundingSupporterBadge";
import { usePresenceStatus } from "@/lib/usePresence";
import type { User } from "@/lib/store";

export default function Profile() {
  const user            = useAppStore((s) => s.user);
  const followedUserIds = useAppStore((s) => s.followedUserIds);
  const [, navigate]    = useLocation();

  const [editModalOpen, setEditModalOpen]  = useState(false);
  const [composerOpen,  setComposerOpen]   = useState(false);
  const [freshMoment,   setFreshMoment]    = useState<SocialPost | null>(null);
  const [coverPhotoUrl, setCoverPhotoUrl]  = useState<string | null>(null);
  const [liveFollowers, setLiveFollowers]  = useState<number | null>(null);
  const [liveFollowing, setLiveFollowing]  = useState<number | null>(null);
  const [postCount,     setPostCount]      = useState<number | null>(null);

  /* ── Pulse ── */
  const { hasActivePulse, pulses: myPulses } = useUserPulses(user?.id);
  usePulseSocket();

  /* ── Presence ── */
  const presenceStatus = usePresenceStatus(user?.id ?? null);

  /* ── Load cover photo ── */
  useEffect(() => {
    if (!user?.id) return;
    (async () => {
      try {
        const res = await fetch(`/api/users/${user.id}`, { credentials: "include" });
        if (res.ok) {
          const data = await res.json();
          if (data?.cover_photo_url) setCoverPhotoUrl(data.cover_photo_url);
        }
      } catch { /* ignore */ }
    })();
  }, [user?.id]);

  /* ── Live follower/following counts ── */
  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("users")
        .select("followers, following")
        .eq("id", user.id)
        .maybeSingle() as any;
      if (cancelled || error || !data) return;
      const row = data as { followers: number | null; following: number | null };
      setLiveFollowers(row.followers ?? 0);
      setLiveFollowing(row.following ?? 0);
    })();
    return () => { cancelled = true; };
  }, [user?.id, followedUserIds.length]);

  /* ── Post count ── */
  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    (async () => {
      const { count } = await supabase
        .from("posts")
        .select("*", { count: "exact", head: true })
        .eq("author_id", user.id) as any;
      if (!cancelled && count !== null) setPostCount(count);
    })();
    return () => { cancelled = true; };
  }, [user?.id]);

  /* ── Modal save callback ── */
  const handleModalSaved = useCallback((_updates: Partial<User>, newCoverUrl: string | null) => {
    if (newCoverUrl !== undefined) setCoverPhotoUrl(newCoverUrl);
  }, []);

  if (!user) return null;

  const supporterTier = getSupporterTier(user as unknown as Record<string, unknown>);

  return (
    <div className="app-bg h-full overflow-y-auto hide-scrollbar scroll-native pb-28">
      {/* ════════════════════ X-STYLE HEADER ════════════════════ */}
      <XProfileHeader
        coverUrl={coverPhotoUrl}
        avatarUrl={user.avatar}
        name={user.name}
        handle={user.handle}
        bio={user.bio}
        website={user.website}
        location={user.location}
        joinedAt={(user as any).created_at}
        followers={liveFollowers ?? user.followers}
        following={liveFollowing ?? user.following}
        postCount={postCount}
        isVerified={user.isVerified}
        isOwner={user.isOwner}
        supporterTier={supporterTier}
        hasActivePulse={hasActivePulse}
        isOwnProfile
        onEditProfile={() => setEditModalOpen(true)}
        onCreatorDash={() => navigate("/creator/dashboard")}
        onSettings={() => navigate("/profile/settings")}
        onFollowersClick={() => navigate(`/followers/${user.id}`)}
        onFollowingClick={() => navigate(`/following/${user.id}`)}
        onSearch={() => navigate("/search")}
        onAvatarClick={() =>
          hasActivePulse
            ? openPulseViewer(
                [{ user: { id: user.id, name: user.name, username: user.handle, avatar_url: user.avatar ?? null }, pulses: myPulses, has_unviewed: myPulses.some(p => !p.is_viewed) } satisfies PulseFeedGroup],
                0, 0,
              )
            : setComposerOpen(true)
        }
      />

      {/* ════════════════════ PROFILE TABS ════════════════════ */}
      <ProfileTabs
        userId={user.id}
        viewerId={user.id}
        isOwnProfile
        isEditing={editModalOpen}
        userProfile={{
          created_at:          (user as any).created_at,
          is_verified:         user.isVerified,
          is_owner:            user.isOwner,
          subscription_status: (user as any).subscription_status,
          name:                user.name,
          followers:           liveFollowers ?? user.followers ?? 0,
        }}
        supporterTier={supporterTier}
        prependPost={freshMoment}
        defaultTab="posts"
      />

      {/* ════════════════════ MODALS ════════════════════ */}
      <MomentsComposer
        open={composerOpen}
        onClose={() => setComposerOpen(false)}
        onPosted={(post) => { setFreshMoment(post); setComposerOpen(false); }}
      />
      <EditProfileModal
        open={editModalOpen}
        onClose={() => setEditModalOpen(false)}
        onSaved={handleModalSaved}
        initialCoverUrl={coverPhotoUrl}
      />
    </div>
  );
}
