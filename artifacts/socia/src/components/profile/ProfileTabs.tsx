/**
 * ProfileTabs.tsx — X (Twitter) style profile content tabs.
 *
 * Tabs: Posts | Replies | Media | Likes | Saved (own only)
 * Animated blue underline, sticky tab bar, swipe support.
 */
import React, { useState, useCallback, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { fetchUserPosts, fetchSavedFeed, type SocialPost } from "@/lib/postsClient";
import type { SupporterTier } from "@/components/profile/FoundingSupporterBadge";
import { FeedCard } from "@/components/feed/FeedCard";

export type ProfileTabId = "posts" | "replies" | "media" | "likes" | "saved";

interface TabDef { id: ProfileTabId; label: string }

function buildTabs(isOwnProfile: boolean): TabDef[] {
  const base: TabDef[] = [
    { id: "posts",   label: "Posts"   },
    { id: "replies", label: "Replies" },
    { id: "media",   label: "Media"   },
    { id: "likes",   label: "Likes"   },
  ];
  if (isOwnProfile) base.push({ id: "saved", label: "Saved" });
  return base;
}

const PAGE = 20;

interface UserProfileData {
  created_at?: string;
  is_verified?: boolean;
  is_owner?: boolean;
  subscription_status?: string;
  name?: string;
  followers?: number;
}

interface Props {
  userId: string;
  viewerId?: string | null;
  isOwnProfile?: boolean;
  isEditing?: boolean;
  userProfile?: UserProfileData;
  supporterTier?: SupporterTier | null;
  defaultTab?: ProfileTabId;
  prependPost?: SocialPost | null;
}

function filterPosts(posts: SocialPost[], tab: ProfileTabId): SocialPost[] {
  switch (tab) {
    case "media":
      return posts.filter(p =>
        (p.media?.length ?? 0) > 0
      );
    case "replies":
      // replies = posts that have a parent post (reply_to_id set)
      return posts.filter(p => !!(p as any).reply_to_id);
    default:
      return posts;
  }
}

export function ProfileTabs({
  userId,
  viewerId,
  isOwnProfile = false,
  isEditing = false,
  userProfile,
  supporterTier,
  defaultTab = "posts",
  prependPost,
}: Props) {
  const TABS = buildTabs(isOwnProfile);
  const [activeTab, setActiveTab] = useState<ProfileTabId>(defaultTab);
  const tabBarRef = useRef<HTMLDivElement>(null);

  /* ── Touch swipe ─────────────────────────────────────────────────── */
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const swipeAxis = useRef<"h" | "v" | null>(null);

  function onTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    swipeAxis.current = null;
  }
  function onTouchMove(e: React.TouchEvent) {
    if (swipeAxis.current) return;
    const dx = Math.abs(e.touches[0].clientX - touchStartX.current);
    const dy = Math.abs(e.touches[0].clientY - touchStartY.current);
    if (dx > 6 || dy > 6) swipeAxis.current = dx > dy ? "h" : "v";
  }
  function onTouchEnd(e: React.TouchEvent) {
    if (swipeAxis.current === "v") return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    const dy = Math.abs(e.changedTouches[0].clientY - touchStartY.current);
    if (Math.abs(dx) < 55 || dy > Math.abs(dx) * 0.75) return;
    const ids = TABS.map(t => t.id);
    const idx = ids.indexOf(activeTab);
    if (dx < 0 && idx < ids.length - 1) handleTabChange(ids[idx + 1]);
    if (dx > 0 && idx > 0) handleTabChange(ids[idx - 1]);
  }

  /* ── Data ────────────────────────────────────────────────────────── */
  const [allPosts,     setAllPosts]     = useState<SocialPost[]>([]);
  const [likedPosts,   setLikedPosts]   = useState<SocialPost[]>([]);
  const [savedPosts,   setSavedPosts]   = useState<SocialPost[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [hasMore,      setHasMore]      = useState(true);
  const [loadingMore,  setLoadingMore]  = useState(false);
  const offsetRef = useRef(0);
  const fetchedOnce = useRef(false);

  const loadInitial = useCallback(async () => {
    setLoading(true);
    try {
      const postsRes = await fetchUserPosts(userId, { limit: PAGE, offset: 0, viewerId: viewerId ?? undefined });
      setAllPosts(postsRes);
      setHasMore(postsRes.length === PAGE);
      offsetRef.current = postsRes.length;

      if (isOwnProfile) {
        fetchSavedFeed({ limit: 30 }).then(setSavedPosts).catch(() => {});
      }
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [userId, viewerId, isOwnProfile]);

  useEffect(() => {
    if (fetchedOnce.current) return;
    fetchedOnce.current = true;
    loadInitial();
  }, [loadInitial]);

  useEffect(() => {
    if (!prependPost) return;
    setAllPosts(prev => {
      if (prev.some(p => p.id === prependPost.id)) return prev;
      return [prependPost, ...prev];
    });
    setActiveTab("posts");
  }, [prependPost]);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const posts = await fetchUserPosts(userId, {
        limit: PAGE,
        offset: offsetRef.current,
        viewerId: viewerId ?? undefined,
      });
      setAllPosts(prev => [...prev, ...posts]);
      setHasMore(posts.length === PAGE);
      offsetRef.current += posts.length;
    } catch { /* ignore */ }
    finally { setLoadingMore(false); }
  }, [userId, viewerId, loadingMore, hasMore]);

  const handleTabChange = useCallback((id: ProfileTabId) => {
    setActiveTab(id);
    const bar = tabBarRef.current;
    if (!bar) return;
    const btn = bar.querySelector(`[data-tab="${id}"]`) as HTMLElement | null;
    if (btn) btn.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  }, []);

  /* Derived posts for current tab */
  const displayedPosts: SocialPost[] = (() => {
    switch (activeTab) {
      case "likes": return likedPosts;
      case "saved": return savedPosts;
      default:      return filterPosts(allPosts, activeTab);
    }
  })();

  const showLoadMore = activeTab === "posts" || activeTab === "replies" || activeTab === "media";

  return (
    <div
      className="transition-opacity duration-200"
      style={isEditing ? { pointerEvents: "none", opacity: 0.25 } : {}}
    >
      {/* ── Tab bar ─────────────────────────────────────────────────── */}
      <div
        ref={tabBarRef}
        className="sticky top-0 z-20 overflow-x-auto hide-scrollbar"
        style={{
          background: "#000",
          borderBottom: "1px solid rgba(255,255,255,0.08)",
        }}
      >
        <div className="flex min-w-max">
          {TABS.map(tab => (
            <XTabButton
              key={tab.id}
              id={tab.id}
              label={tab.label}
              active={activeTab === tab.id}
              onClick={() => handleTabChange(tab.id)}
              tabCount={TABS.length}
            />
          ))}
        </div>
      </div>

      {/* ── Tab content ─────────────────────────────────────────────── */}
      <div
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.16 }}
          >
            <XTabContent
              posts={displayedPosts}
              loading={loading}
              hasMore={showLoadMore ? hasMore : false}
              loadingMore={loadingMore}
              onLoadMore={loadMore}
              tab={activeTab}
            />
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

/* ── Tab button ─────────────────────────────────────────────────────── */
function XTabButton({
  id, label, active, onClick, tabCount,
}: {
  id: string; label: string; active: boolean; onClick: () => void; tabCount: number;
}) {
  // Each tab takes equal width on viewport
  const minW = `${Math.floor(100 / tabCount)}vw`;

  return (
    <motion.button
      data-tab={id}
      whileTap={{ scale: 0.94 }}
      onClick={onClick}
      className="relative flex items-center justify-center"
      style={{
        minWidth: minW,
        height: 48,
        fontSize: 15,
        fontWeight: active ? 700 : 400,
        color: active ? "#E7E9EA" : "#71767B",
        background: "transparent",
        border: "none",
        outline: "none",
        cursor: "pointer",
        whiteSpace: "nowrap",
        padding: "0 4px",
      }}
    >
      {label}

      {active && (
        <motion.span
          layoutId="xTabUnderline"
          className="absolute bottom-0 left-1/2 -translate-x-1/2"
          style={{
            width: "80%",
            height: 3,
            background: "#1D9BF0",
            borderRadius: "2px 2px 0 0",
          }}
          transition={{ type: "spring", stiffness: 500, damping: 40 }}
        />
      )}
    </motion.button>
  );
}

/* ── Tab content wrapper ────────────────────────────────────────────── */
function XTabContent({
  posts, loading, hasMore, loadingMore, onLoadMore, tab,
}: {
  posts: SocialPost[];
  loading: boolean;
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
  tab: ProfileTabId;
}) {
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasMore) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting && hasMore && !loadingMore) onLoadMore(); },
      { threshold: 0.1 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [hasMore, loadingMore, onLoadMore]);

  if (loading) {
    return (
      <div>
        {[...Array(4)].map((_, i) => (
          <div key={i} style={{ borderBottom: "1px solid rgba(255,255,255,0.08)", padding: "12px 16px" }}>
            <div className="flex gap-3">
              <div className="shimmer rounded-full flex-shrink-0" style={{ width: 40, height: 40 }} />
              <div className="flex-1 space-y-2">
                <div className="shimmer rounded" style={{ height: 13, width: "55%" }} />
                <div className="shimmer rounded" style={{ height: 13, width: "85%" }} />
                <div className="shimmer rounded" style={{ height: 13, width: "70%" }} />
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (posts.length === 0) {
    const msgs: Record<ProfileTabId, [string, string]> = {
      posts:   ["No posts yet",   "When they post, it'll show up here."],
      replies: ["No replies yet", "Replies to other posts will appear here."],
      media:   ["No media yet",   "Photos and videos will appear here."],
      likes:   ["No likes yet",   "Posts they've liked will show here."],
      saved:   ["Nothing saved",  "Posts you bookmark will appear here."],
    };
    const [title, sub] = msgs[tab];
    return (
      <div
        className="flex flex-col items-center justify-center text-center"
        style={{ padding: "60px 32px" }}
      >
        <p style={{ fontSize: 20, fontWeight: 800, color: "#E7E9EA", marginBottom: 8 }}>{title}</p>
        <p style={{ fontSize: 14, color: "#71767B", maxWidth: 240 }}>{sub}</p>
      </div>
    );
  }

  /* Media tab — 3-column grid (like X) */
  if (tab === "media") {
    return (
      <div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 2,
          }}
        >
          {posts.map(post => {
            const m = post.media?.[0];
            if (!m) return null;
            return (
              <div
                key={post.id}
                style={{ aspectRatio: "1/1", background: "#111", overflow: "hidden", position: "relative" }}
              >
                {m.type === "video" ? (
                  <video
                    src={m.url}
                    className="h-full w-full object-cover"
                    muted playsInline preload="metadata"
                  />
                ) : (
                  <img
                    src={m.url}
                    alt=""
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                )}
              </div>
            );
          })}
        </div>
        {(hasMore || loadingMore) && (
          <div ref={sentinelRef} className="flex justify-center py-6">
            {loadingMore && <Spinner />}
          </div>
        )}
      </div>
    );
  }

  /* Feed layout (Posts, Replies, Likes, Saved) */
  return (
    <div>
      {posts.map((post, i) => (
        <FeedCard key={post.id} post={post} index={i} />
      ))}
      {(hasMore || loadingMore) && (
        <div ref={sentinelRef} className="flex justify-center py-6">
          {loadingMore && <Spinner />}
        </div>
      )}
      {!hasMore && posts.length > 0 && (
        <p
          className="text-center py-8"
          style={{ fontSize: 13, color: "rgba(255,255,255,0.2)" }}
        >
          You've reached the end
        </p>
      )}
    </div>
  );
}

function Spinner() {
  return (
    <div
      className="animate-spin rounded-full border-2"
      style={{ width: 20, height: 20, borderColor: "rgba(255,255,255,0.15)", borderTopColor: "#1D9BF0" }}
    />
  );
}
