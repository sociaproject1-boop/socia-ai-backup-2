/**
 * ProfileTabs.tsx — Socia profile content hub.
 *
 * Five tabs with unique Socia identity:
 *   Spotlight  — all content mixed
 *   Motion     — video only
 *   Gallery    — photos only
 *   Moments    — text posts only
 *   Milestones — achievement timeline
 *
 * Used by both Profile.tsx (self) and UserProfile.tsx (others).
 */
import { useState, useCallback, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutGrid, Video, ImageIcon, FileText, Award,
} from "lucide-react";
import { fetchUserPosts, type SocialPost } from "@/lib/postsClient";
import type { SupporterTier } from "@/components/profile/FoundingSupporterBadge";
import { ProfilePostGrid } from "./ProfilePostGrid";
import { MilestoneTimeline } from "./MilestoneTimeline";

export type ProfileTabId = "spotlight" | "motion" | "gallery" | "moments" | "milestones";

const TABS: { id: ProfileTabId; label: string; icon: typeof LayoutGrid }[] = [
  { id: "spotlight",  label: "Spotlight",  icon: LayoutGrid },
  { id: "motion",     label: "Motion",     icon: Video      },
  { id: "gallery",    label: "Gallery",    icon: ImageIcon  },
  { id: "moments",    label: "Moments",    icon: FileText   },
  { id: "milestones", label: "Milestones", icon: Award      },
];

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
  isEditing?: boolean;
  userProfile?: UserProfileData;
  supporterTier?: SupporterTier | null;
  defaultTab?: ProfileTabId;
  /** When a new text post is created externally, pass it here to prepend instantly. */
  prependPost?: SocialPost | null;
}

function filterByTab(posts: SocialPost[], tab: ProfileTabId): SocialPost[] {
  switch (tab) {
    case "motion":
      return posts.filter(p =>
        p.media?.some(m => m.type === "video") || p.type === "video"
      );
    case "gallery":
      return posts.filter(p =>
        (p.media?.length ?? 0) > 0 &&
        !p.media?.every(m => m.type === "video")
      );
    case "moments":
      return posts.filter(p => (p.media?.length ?? 0) === 0 && p.caption);
    case "spotlight":
    default:
      return posts;
  }
}

export function ProfileTabs({
  userId,
  viewerId,
  isEditing = false,
  userProfile,
  supporterTier,
  defaultTab = "spotlight",
  prependPost,
}: Props) {
  const [activeTab, setActiveTab] = useState<ProfileTabId>(defaultTab);

  /* All posts cache — fetch once, filter client-side per tab */
  const [allPosts, setAllPosts]         = useState<SocialPost[]>([]);
  const [loading, setLoading]           = useState(true);
  const [hasMore, setHasMore]           = useState(true);
  const [loadingMore, setLoadingMore]   = useState(false);
  const offsetRef = useRef(0);
  const fetchedOnce = useRef(false);

  const loadInitial = useCallback(async () => {
    setLoading(true);
    try {
      const posts = await fetchUserPosts(userId, { limit: PAGE, offset: 0, viewerId: viewerId ?? undefined });
      setAllPosts(posts);
      setHasMore(posts.length === PAGE);
      offsetRef.current = posts.length;
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [userId, viewerId]);

  useEffect(() => {
    if (fetchedOnce.current) return;
    fetchedOnce.current = true;
    loadInitial();
  }, [loadInitial]);

  /* Prepend a newly created post instantly, then switch to Moments tab */
  useEffect(() => {
    if (!prependPost) return;
    setAllPosts(prev => {
      if (prev.some(p => p.id === prependPost.id)) return prev;
      return [prependPost, ...prev];
    });
    setActiveTab("moments");
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
    } catch {
      /* ignore */
    } finally {
      setLoadingMore(false);
    }
  }, [userId, viewerId, loadingMore, hasMore]);

  const displayedPosts = activeTab === "milestones"
    ? []
    : filterByTab(allPosts, activeTab);

  return (
    <div
      className="transition-opacity duration-200"
      style={isEditing ? { pointerEvents: "none", opacity: 0.25 } : {}}
    >
      {/* ── Tab bar ─────────────────────────────────────────────────── */}
      <div
        className="app-header sticky top-0 z-20 overflow-x-auto hide-scrollbar"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}
      >
        <div className="flex min-w-max px-2 py-1 gap-0.5">
          {TABS.map(tab => (
            <TabPill
              key={tab.id}
              tab={tab}
              active={activeTab === tab.id}
              onClick={() => setActiveTab(tab.id)}
            />
          ))}
        </div>
      </div>

      {/* ── Tab content ─────────────────────────────────────────────── */}
      <div className="px-4 pt-4">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.18 }}
          >
            {activeTab === "milestones" ? (
              <MilestoneTimeline
                userProfile={userProfile}
                posts={allPosts}
                supporterTier={supporterTier}
              />
            ) : activeTab === "moments" ? (
              <ProfilePostGrid
                posts={displayedPosts}
                loading={loading}
                hasMore={hasMore}
                loadingMore={loadingMore}
                onLoadMore={loadMore}
                layout="feed"
                emptyTitle="No moments yet"
                emptySub="Text posts and updates will appear here."
                emptyIcon={<FileText className="h-7 w-7 text-purple-400" />}
              />
            ) : activeTab === "motion" ? (
              <ProfilePostGrid
                posts={displayedPosts}
                loading={loading}
                hasMore={hasMore}
                loadingMore={loadingMore}
                onLoadMore={loadMore}
                emptyTitle="No videos yet"
                emptySub="Video uploads and creations will appear here."
                emptyIcon={<Video className="h-7 w-7 text-purple-400" />}
              />
            ) : activeTab === "gallery" ? (
              <ProfilePostGrid
                posts={displayedPosts}
                loading={loading}
                hasMore={hasMore}
                loadingMore={loadingMore}
                onLoadMore={loadMore}
                emptyTitle="No photos yet"
                emptySub="Image uploads and AI creations will appear here."
                emptyIcon={<ImageIcon className="h-7 w-7 text-purple-400" />}
              />
            ) : (
              /* spotlight */
              <ProfilePostGrid
                posts={displayedPosts}
                loading={loading}
                hasMore={hasMore}
                loadingMore={loadingMore}
                onLoadMore={loadMore}
                emptyTitle="No content yet"
                emptySub="All creations will appear here once published."
                emptyIcon={<LayoutGrid className="h-7 w-7 text-purple-400" />}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

function TabPill({
  tab,
  active,
  onClick,
}: {
  tab: { id: ProfileTabId; label: string; icon: typeof LayoutGrid };
  active: boolean;
  onClick: () => void;
}) {
  const Icon = tab.icon;

  return (
    <motion.button
      whileTap={{ scale: 0.93 }}
      onClick={onClick}
      className="relative flex items-center gap-1.5 px-3 py-2.5 rounded-none text-[11.5px] font-semibold transition-colors"
      style={{ color: active ? "white" : "rgba(255,255,255,0.35)" }}
    >
      <Icon style={{ width: 12, height: 12, flexShrink: 0 }} />
      <span>{tab.label}</span>

      {/* Active underline */}
      {active && (
        <motion.span
          layoutId="sociaTabUnderline"
          className="absolute inset-x-0 bottom-0 h-[2px] rounded-full"
          style={{ background: "linear-gradient(90deg,#a855f7,#ec4899,#3b82f6)" }}
          transition={{ type: "spring", stiffness: 400, damping: 35 }}
        />
      )}
    </motion.button>
  );
}
